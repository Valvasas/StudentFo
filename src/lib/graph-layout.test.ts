import { describe, expect, it } from 'vitest';
import {
  ALPHA_MIN,
  boundsOf,
  createSimulation,
  fitTransform,
  hitTest,
  placeLabels,
  settle,
  tick,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAround,
} from './graph-layout';
import type { NetworkGraph } from './network-graph';

function sampleGraph(people = 12): NetworkGraph {
  const nodes: NetworkGraph['nodes'][number][] = [{ id: 'me', kind: 'me', label: 'Aku', degree: people + 1, href: null, person: null }];
  const edges: NetworkGraph['edges'][number][] = [];
  nodes.push({ id: 'i:a', kind: 'interest', label: 'A', degree: people, href: null, person: null });
  edges.push({ source: 'me', target: 'i:a', kind: 'interest' });
  for (let index = 0; index < people; index += 1) {
    nodes.push({ id: `p:${index}`, kind: index % 2 ? 'connection' : 'suggestion', label: `P${index}`, degree: 2, href: null, person: null });
    if (index % 2) edges.push({ source: 'me', target: `p:${index}`, kind: 'connection' });
    edges.push({ source: `p:${index}`, target: 'i:a', kind: 'interest' });
  }
  nodes.push({ id: 'p:jauh', kind: 'suggestion', label: 'Jauh', degree: 1, href: null, person: null });
  nodes.push({ id: 'i:b', kind: 'interest', label: 'B', degree: 1, href: null, person: null });
  edges.push({ source: 'p:jauh', target: 'i:b', kind: 'interest' });
  return { nodes, edges, hiddenPeople: 0 };
}

const distance = (sim: ReturnType<typeof createSimulation>, a: string, b: string) => {
  const na = sim.nodes[sim.index.get(a)!]!;
  const nb = sim.nodes[sim.index.get(b)!]!;
  return Math.hypot(na.x - nb.x, na.y - nb.y);
};

describe('createSimulation + settle', () => {
  it('deterministik: graf yang sama selalu mendarat di posisi yang sama', () => {
    const a = createSimulation(sampleGraph());
    const b = createSimulation(sampleGraph());
    settle(a);
    settle(b);
    expect(a.nodes.map((node) => [node.x, node.y])).toEqual(b.nodes.map((node) => [node.x, node.y]));
  });

  it('mendingin sampai berhenti, tanpa NaN, dan "aku" tetap di pusat', () => {
    const sim = createSimulation(sampleGraph(40));
    settle(sim, 2000);
    expect(sim.alpha).toBeLessThan(ALPHA_MIN);
    expect(tick(sim)).toBe(false);
    expect(sim.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    const me = sim.nodes[sim.index.get('me')!]!;
    expect([me.x, me.y]).toEqual([0, 0]);
  });

  it('simpul yang tersambung berakhir lebih dekat daripada yang tidak', () => {
    const sim = createSimulation(sampleGraph());
    settle(sim);
    expect(distance(sim, 'p:1', 'i:a')).toBeLessThan(distance(sim, 'p:jauh', 'i:a'));
  });

  it('tidak ada dua simpul yang saling tumpuk setelah tenang', () => {
    const sim = createSimulation(sampleGraph(30));
    settle(sim, 1000);
    for (let i = 0; i < sim.nodes.length; i += 1) {
      for (let j = i + 1; j < sim.nodes.length; j += 1) {
        const a = sim.nodes[i]!;
        const b = sim.nodes[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan((a.radius + b.radius) * 0.8);
      }
    }
  });

  it('sisi ke simpul yang tidak ada diabaikan, bukan melempar', () => {
    const graph = sampleGraph(2);
    const sim = createSimulation({ ...graph, edges: [...graph.edges, { source: 'me', target: 'hantu', kind: 'connection' }] });
    expect(sim.links.length).toBe(graph.edges.length);
  });
});

describe('viewport', () => {
  it('fitTransform memuat seluruh simpul di dalam kanvas', () => {
    const sim = createSimulation(sampleGraph());
    settle(sim);
    const bounds = boundsOf(sim.nodes)!;
    const view = fitTransform(bounds, 800, 500, 40);
    expect(bounds.minX * view.k + view.x).toBeGreaterThanOrEqual(39.9);
    expect(bounds.maxX * view.k + view.x).toBeLessThanOrEqual(760.1);
    expect(bounds.minY * view.k + view.y).toBeGreaterThanOrEqual(39.9);
    expect(bounds.maxY * view.k + view.y).toBeLessThanOrEqual(460.1);
  });

  it('zoomAround menahan titik di bawah kursor & menghormati batas zoom', () => {
    const view = { x: 100, y: 50, k: 1 };
    const zoomed = zoomAround(view, 2, 300, 200);
    const worldBefore = [(300 - view.x) / view.k, (200 - view.y) / view.k];
    const worldAfter = [(300 - zoomed.x) / zoomed.k, (200 - zoomed.y) / zoomed.k];
    expect(worldAfter[0]).toBeCloseTo(worldBefore[0]!);
    expect(worldAfter[1]).toBeCloseTo(worldBefore[1]!);
    expect(zoomAround(view, 100, 0, 0).k).toBe(ZOOM_MAX);
    expect(zoomAround(view, 0.001, 0, 0).k).toBe(ZOOM_MIN);
  });

  it('hitTest memberi area sentuh minimal walau simpul kecil & peta diperkecil', () => {
    const sim = createSimulation(sampleGraph(2));
    settle(sim);
    const view = { x: 0, y: 0, k: 0.5 };
    const me = sim.nodes[sim.index.get('me')!]!;
    const screenX = me.x * view.k + view.x;
    const screenY = me.y * view.k + view.y;
    expect(hitTest(sim.nodes, view, screenX + 10, screenY, () => true, 14)).toBe(sim.index.get('me'));
    expect(hitTest(sim.nodes, view, screenX + 400, screenY + 400)).toBeNull();
    expect(hitTest(sim.nodes, view, screenX, screenY, (node) => node.id !== 'me')).not.toBe(sim.index.get('me'));
  });
});

describe('placeLabels', () => {
  const box = (id: string, x: number, priority: number, force = false) => ({ id, x, y: 0, width: 50, height: 12, priority, force });

  it('label berprioritas tinggi menang; yang bertabrakan dilewati; yang tidak bertabrakan tetap tampil', () => {
    const shown = placeLabels([box('rendah', 10, 1), box('tinggi', 0, 5), box('jauh', 200, 0)]);
    expect([...shown].sort()).toEqual(['jauh', 'tinggi']);
  });

  it('label yang dipaksa (disorot) selalu tampil walau bertabrakan', () => {
    const shown = placeLabels([box('tinggi', 0, 9), box('sorot', 5, 0, true)]);
    expect(shown.has('sorot')).toBe(true);
    expect(shown.has('tinggi')).toBe(false);
  });
});

describe('aspect', () => {
  it('kanvas lebar menghasilkan tata letak yang lebih lebar daripada kanvas persegi', () => {
    const square = createSimulation(sampleGraph(30));
    const wide = createSimulation(sampleGraph(30));
    wide.aspect = 2.2;
    settle(square, 800);
    settle(wide, 800);
    const ratio = (sim: typeof square) => {
      const b = boundsOf(sim.nodes)!;
      return (b.maxX - b.minX) / (b.maxY - b.minY);
    };
    expect(ratio(wide)).toBeGreaterThan(ratio(square));
  });
});
