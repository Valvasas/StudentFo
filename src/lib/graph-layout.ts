import type { GraphEdgeKind, GraphNodeKind, NetworkGraph } from './network-graph';

/**
 * Simulasi gaya untuk "Peta koneksi" — cara kerja d3-force (pegas pada
 * sisi, tolakan antar simpul, gravitasi ke pusat, tabrakan, pendinginan
 * `alpha`) ditulis ulang secukupnya supaya tidak menambah dependency
 * (AGENTS.md: daftar dependency sengaja minim).
 *
 * Murni & deterministik: tidak ada Math.random, tidak ada DOM. Posisi awal
 * berbentuk cincin per jenis simpul, jadi graf yang sama selalu mendarat di
 * bentuk yang sama — pengguna yang kembali tidak melihat petanya "teracak".
 *
 * Kompleksitas: tolakan & tabrakan O(n²) per langkah. Dengan batas
 * GRAPH_LIMITS (~200 simpul) itu ±20 ribu pasangan per langkah; simulasi
 * mendingin sendiri (~300 langkah) lalu berhenti total, jadi peta yang diam
 * tidak memakan CPU sama sekali.
 */

export interface SimNode {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly radius: number;
  readonly charge: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Posisi terkunci saat diseret; null = bebas. */
  fx: number | null;
  fy: number | null;
  degree: number;
}

export interface SimLink {
  readonly source: number;
  readonly target: number;
  readonly kind: GraphEdgeKind;
  readonly distance: number;
  readonly strength: number;
  readonly bias: number;
}

export interface Simulation {
  readonly nodes: SimNode[];
  readonly links: SimLink[];
  readonly index: ReadonlyMap<string, number>;
  alpha: number;
  alphaTarget: number;
  /**
   * Lebar/tinggi kanvas. Gravitasi dibuat lebih lemah di sumbu yang lebih
   * panjang, jadi graf mengisi kanvas lebar di desktop dan kanvas tinggi di
   * ponsel — bukan gumpalan bulat kecil di tengah ruang kosong.
   */
  aspect: number;
}

export const ALPHA_MIN = 0.002;
const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / 300);
const VELOCITY_DECAY = 0.42;
const GRAVITY = 0.022;
const COLLIDE_PADDING = 14;
/** Tolakan tidak dihitung di atas jarak ini: simpul yang berjauhan tidak saling memengaruhi. */
const CHARGE_MAX_DISTANCE_SQ = 600 * 600;

const LINK_DISTANCE: Record<GraphEdgeKind, number> = {
  connection: 120,
  pending: 140,
  interest: 96,
  event: 104,
};

const RING: Record<GraphNodeKind, number> = {
  me: 0,
  connection: 120,
  incoming: 150,
  outgoing: 170,
  event: 210,
  interest: 250,
  suggestion: 320,
};

export function nodeRadius(kind: GraphNodeKind, degree: number): number {
  const grow = Math.sqrt(Math.max(degree, 1));
  switch (kind) {
    case 'me':
      return 13;
    case 'interest':
      return Math.min(5 + grow * 1.8, 14);
    case 'event':
      return Math.min(5 + grow * 1.4, 11);
    default:
      return Math.min(5.5 + grow * 1.2, 11);
  }
}

export function createSimulation(graph: NetworkGraph): Simulation {
  const byKind = new Map<GraphNodeKind, number>();
  const kindTotals = new Map<GraphNodeKind, number>();
  for (const node of graph.nodes) kindTotals.set(node.kind, (kindTotals.get(node.kind) ?? 0) + 1);

  // Sudut awal digeser per jenis supaya cincin yang berdekatan tidak menumpuk
  // simpulnya di garis yang sama.
  const kindOffset: Record<GraphNodeKind, number> = { me: 0, connection: 0, incoming: 0.9, outgoing: 1.7, event: 0.4, interest: 1.2, suggestion: 2.3 };
  const nodes: SimNode[] = graph.nodes.map((node) => {
    const order = byKind.get(node.kind) ?? 0;
    byKind.set(node.kind, order + 1);
    const total = kindTotals.get(node.kind) ?? 1;
    const angle = kindOffset[node.kind] + (order / total) * Math.PI * 2;
    const ring = RING[node.kind] + (order % 3) * 14;
    return {
      id: node.id,
      kind: node.kind,
      radius: nodeRadius(node.kind, node.degree),
      charge: node.kind === 'me' ? -700 : node.kind === 'interest' ? -380 : -420,
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring,
      vx: 0,
      vy: 0,
      fx: node.kind === 'me' ? 0 : null,
      fy: node.kind === 'me' ? 0 : null,
      degree: node.degree,
    };
  });
  const index = new Map(nodes.map((node, position) => [node.id, position]));

  const links: SimLink[] = [];
  for (const edge of graph.edges) {
    const source = index.get(edge.source);
    const target = index.get(edge.target);
    if (source === undefined || target === undefined) continue;
    const sourceDegree = Math.max(nodes[source]!.degree, 1);
    const targetDegree = Math.max(nodes[target]!.degree, 1);
    links.push({
      source,
      target,
      kind: edge.kind,
      distance: LINK_DISTANCE[edge.kind],
      // Kekuatan pegas 1/derajat terkecil (bawaan d3): simpul hub tidak
      // ditarik ke segala arah sampai bergetar.
      strength: 1 / Math.min(sourceDegree, targetDegree),
      bias: sourceDegree / (sourceDegree + targetDegree),
    });
  }

  return { nodes, links, index, alpha: 1, alphaTarget: 0, aspect: 1 };
}

/** Satu langkah simulasi. Mengembalikan `true` selama masih bergerak. */
export function tick(sim: Simulation): boolean {
  sim.alpha += (sim.alphaTarget - sim.alpha) * ALPHA_DECAY;
  const { alpha, nodes, links } = sim;

  for (const link of links) {
    const source = nodes[link.source]!;
    const target = nodes[link.target]!;
    let dx = target.x + target.vx - source.x - source.vx || 1e-6;
    let dy = target.y + target.vy - source.y - source.vy || 1e-6;
    let length = Math.sqrt(dx * dx + dy * dy);
    length = ((length - link.distance) / length) * alpha * link.strength;
    dx *= length;
    dy *= length;
    target.vx -= dx * link.bias;
    target.vy -= dy * link.bias;
    source.vx += dx * (1 - link.bias);
    source.vy += dy * (1 - link.bias);
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i]!;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j]!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (dx === 0 && dy === 0) {
        // Dua simpul di titik yang sama tidak punya arah tolakan; geser
        // secara deterministik berdasarkan indeksnya.
        dx = ((j - i) % 7) - 3 || 1;
        dy = ((i + j) % 5) - 2 || 1;
      }
      const distSq = dx * dx + dy * dy;
      if (distSq < CHARGE_MAX_DISTANCE_SQ) {
        const force = alpha / Math.max(distSq, 36);
        a.vx += dx * force * b.charge * 0.5;
        a.vy += dy * force * b.charge * 0.5;
        b.vx -= dx * force * a.charge * 0.5;
        b.vy -= dy * force * a.charge * 0.5;
      }
      const minDist = a.radius + b.radius + COLLIDE_PADDING;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 1;
        const push = ((minDist - dist) / dist) * 0.5;
        a.vx -= dx * push * 0.5;
        a.vy -= dy * push * 0.5;
        b.vx += dx * push * 0.5;
        b.vy += dy * push * 0.5;
      }
    }
  }

  const stretch = Math.pow(Math.min(Math.max(sim.aspect, 0.5), 2.5), 0.8);
  for (const node of nodes) {
    node.vx -= (node.x * GRAVITY * alpha) / stretch;
    node.vy -= node.y * GRAVITY * alpha * stretch;
    if (node.fx !== null && node.fy !== null) {
      node.x = node.fx;
      node.y = node.fy;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= 1 - VELOCITY_DECAY;
    node.vy *= 1 - VELOCITY_DECAY;
    node.x += node.vx;
    node.y += node.vy;
  }

  return sim.alpha >= ALPHA_MIN || sim.alphaTarget > 0;
}

/** Jalankan sampai dingin (atau `maxTicks`) tanpa animasi — dipakai untuk prefers-reduced-motion. */
export function settle(sim: Simulation, maxTicks = 320): void {
  for (let count = 0; count < maxTicks && tick(sim); count += 1);
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function boundsOf(nodes: readonly SimNode[], visible: (node: SimNode) => boolean = () => true): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    if (!visible(node)) continue;
    minX = Math.min(minX, node.x - node.radius);
    minY = Math.min(minY, node.y - node.radius);
    maxX = Math.max(maxX, node.x + node.radius);
    maxY = Math.max(maxY, node.y + node.radius);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

export interface ViewTransform {
  readonly x: number;
  readonly y: number;
  readonly k: number;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;

export const clampZoom = (k: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));

/** Transformasi yang memuat seluruh `bounds` di kanvas berukuran `width × height`, dengan tepi `padding` px. */
export function fitTransform(bounds: Bounds | null, width: number, height: number, padding = 48): ViewTransform {
  if (!bounds || width <= 0 || height <= 0) return { x: width / 2, y: height / 2, k: 1 };
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const k = clampZoom(Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY, 1.6));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return { x: width / 2 - centerX * k, y: height / 2 - centerY * k, k };
}

/** Perbesar/perkecil dengan titik `(px, py)` di layar tetap di tempatnya — perilaku zoom peta yang diharapkan. */
export function zoomAround(view: ViewTransform, factor: number, px: number, py: number): ViewTransform {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}

/** Simpul teratas di titik layar `(px, py)`, dengan area sentuh minimal `minHit` px (target sentuh di ponsel). */
export function hitTest(
  nodes: readonly SimNode[],
  view: ViewTransform,
  px: number,
  py: number,
  visible: (node: SimNode) => boolean = () => true,
  minHit = 14,
): number | null {
  const wx = (px - view.x) / view.k;
  const wy = (py - view.y) / view.k;
  let best: number | null = null;
  let bestDist = Infinity;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]!;
    if (!visible(node)) continue;
    const reach = Math.max(node.radius, minHit / view.k);
    const dist = Math.hypot(node.x - wx, node.y - wy);
    if (dist <= reach && dist < bestDist) {
      best = index;
      bestDist = dist;
    }
  }
  return best;
}

export interface LabelBox {
  readonly id: string;
  /** Kotak di koordinat LAYAR (px), bukan dunia: tabrakan label adalah soal keterbacaan di layar. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Lebih besar = ditempatkan lebih dulu. */
  readonly priority: number;
  /** Selalu tampil walau bertabrakan (simpul yang sedang disorot). */
  readonly force: boolean;
}

/**
 * Penempatan label rakus: urut prioritas, label yang akan menimpa label
 * yang sudah ditempatkan dilewati. Tanpa ini, simpul yang rapat di sekitar
 * "aku" menghasilkan tumpukan nama yang tidak terbaca satu pun. Label yang
 * dilewati tetap muncul saat simpulnya disorot atau peta diperbesar.
 * O(n²) atas label yang lolos saringan zoom — puluhan, bukan ratusan.
 */
export function placeLabels(boxes: readonly LabelBox[], gap = 2): Set<string> {
  const ordered = [...boxes].sort((a, b) => Number(b.force) - Number(a.force) || b.priority - a.priority);
  const placed: LabelBox[] = [];
  const shown = new Set<string>();
  for (const box of ordered) {
    const collides = placed.some(
      (other) =>
        box.x < other.x + other.width + gap &&
        box.x + box.width + gap > other.x &&
        box.y < other.y + other.height + gap &&
        box.y + box.height + gap > other.y,
    );
    if (collides && !box.force) continue;
    placed.push(box);
    shown.add(box.id);
  }
  return shown;
}
