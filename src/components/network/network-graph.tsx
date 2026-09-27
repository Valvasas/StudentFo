'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Crosshair, Maximize2, Minimize2, Minus, Plus, Search } from 'lucide-react';
import {
  boundsOf,
  createSimulation,
  fitTransform,
  hitTest,
  placeLabels,
  settle,
  tick,
  zoomAround,
  type LabelBox,
  type SimNode,
  type Simulation,
  type ViewTransform,
} from '@/lib/graph-layout';
import { normalizeText } from '@/lib/network';
import type { GraphNode, GraphNodeKind, NetworkGraph } from '@/lib/network-graph';
import { cn } from '@/lib/utils';
import { GraphDetail } from './graph-detail';
import { KIND_LABEL, NodeGlyph } from './node-glyph';

/**
 * "Peta koneksi" — graf ala Obsidian (ADR-040).
 *
 * Kanvas 2D, bukan SVG/DOM: 200 simpul + ratusan sisi yang bergerak tiap
 * frame akan memaksa layout & paint ratusan elemen DOM per frame. Kanvas
 * cukup satu bitmap. Harga yang dibayar: kanvas tidak terbaca pembaca layar,
 * jadi (1) kanvasnya punya navigasi keyboard + wilayah live sendiri, dan
 * (2) seluruh isi peta juga ada sebagai daftar biasa di halaman yang sama.
 *
 * Hemat daya: simulasi berhenti total setelah dingin, gambar ulang hanya
 * saat ada yang berubah, dan tidak ada frame sama sekali saat peta di luar
 * layar atau tab tidak aktif.
 */

type ToggleKind = Extract<GraphNodeKind, 'interest' | 'event' | 'suggestion'>;

const TOGGLES: readonly { kind: ToggleKind; label: string }[] = [
  { kind: 'interest', label: 'Minat' },
  { kind: 'event', label: 'Kegiatan' },
  { kind: 'suggestion', label: 'Saran' },
];

const LABEL_PRIORITY: Record<GraphNodeKind, number> = { me: 9, incoming: 8, connection: 7, outgoing: 6, suggestion: 5, event: 4, interest: 3 };

const KIND_ORDER: Record<GraphNodeKind, number> = { me: 0, incoming: 1, connection: 2, outgoing: 3, suggestion: 4, interest: 5, event: 6 };

interface Palette {
  ink: string;
  soft: string;
  muted: string;
  edge: string;
  bg: string;
  focus: string;
  font: string;
}

interface DragState {
  index: number | null;
  startX: number;
  startY: number;
  startView: ViewTransform;
  moved: boolean;
}

function readPalette(element: HTMLElement): Palette {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  return {
    ink: token('--color-text-primary', '#191919'),
    soft: token('--color-text-secondary', '#3f3f3c'),
    muted: token('--color-text-muted', '#5f5e5b'),
    edge: token('--color-border-strong', '#bdbdb8'),
    bg: token('--color-bg', '#ffffff'),
    focus: token('--focus-ring', '#191919'),
    font: getComputedStyle(element).fontFamily || 'system-ui, sans-serif',
  };
}

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export function NetworkGraphView({
  graph,
  returnTo,
  preview = false,
  summary,
}: {
  graph: NetworkGraph;
  returnTo: string;
  /** Peta contoh untuk tamu: tanpa panel, tanpa label orang. */
  preview?: boolean;
  /** Ringkasan untuk pembaca layar, mis. "5 koneksi, 2 ajakan masuk". */
  summary: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const viewRef = useRef<ViewTransform>({ x: 0, y: 0, k: 1 });
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const paletteRef = useRef<Palette | null>(null);
  const rafRef = useRef(0);
  const hoverRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; view: ViewTransform; cx: number; cy: number } | null>(null);
  const autoFitRef = useRef(true);
  const onScreenRef = useRef(true);
  const reducedMotionRef = useRef(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<ToggleKind>>(() => new Set());
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [wheelHint, setWheelHint] = useState(false);

  const nodesById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)!.add(edge.target);
      map.get(edge.target)!.add(edge.source);
    }
    return map;
  }, [graph]);
  const matches = useMemo(() => {
    const needle = normalizeText(query);
    if (!needle || preview) return null;
    return new Set(graph.nodes.filter((node) => normalizeText(node.label).includes(needle)).map((node) => node.id));
  }, [graph, query, preview]);

  // Nilai terbaru untuk fungsi gambar yang hidup di luar siklus render React.
  const stateRef = useRef({ selectedId, focusId, hidden, matches, neighbors, nodesById, preview });
  stateRef.current = { selectedId, focusId, hidden, matches, neighbors, nodesById, preview };

  const isVisible = useCallback((node: SimNode) => !stateRef.current.hidden.has(node.kind as ToggleKind), []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    const palette = paletteRef.current;
    if (!canvas || !sim || !palette) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const { width, height, dpr } = sizeRef.current;
    const view = viewRef.current;
    const state = stateRef.current;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);

    const hoverIndex = hoverRef.current;
    const hoverId = hoverIndex !== null ? sim.nodes[hoverIndex]?.id ?? null : null;
    const focus = hoverId ?? state.selectedId;
    const around = focus ? state.neighbors.get(focus) : undefined;
    const lit = (id: string) => !focus || id === focus || Boolean(around?.has(id));
    const matched = (id: string) => !state.matches || state.matches.has(id);
    const k = view.k;

    // Sisi dulu, supaya simpul selalu di atas garisnya.
    for (const link of sim.links) {
      const source = sim.nodes[link.source]!;
      const target = sim.nodes[link.target]!;
      if (!isVisible(source) || !isVisible(target)) continue;
      const touches = focus !== null && (source.id === focus || target.id === focus);
      const dimmed = (focus !== null && !touches) || (state.matches !== null && !(matched(source.id) && matched(target.id)));
      context.globalAlpha = touches ? 0.95 : dimmed ? 0.08 : 0.55;
      context.strokeStyle = touches ? palette.ink : palette.edge;
      context.lineWidth = (link.kind === 'connection' ? 1.7 : 1.1) / k;
      context.setLineDash(link.kind === 'pending' ? [5 / k, 4 / k] : []);
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    }
    context.setLineDash([]);

    for (const node of sim.nodes) {
      if (!isVisible(node)) continue;
      context.globalAlpha = lit(node.id) && matched(node.id) ? 1 : 0.16;
      drawNode(context, node, palette, k);
    }

    const selected = state.selectedId ? sim.nodes[sim.index.get(state.selectedId) ?? -1] : undefined;
    if (selected && isVisible(selected)) {
      context.globalAlpha = 1;
      context.strokeStyle = palette.ink;
      context.lineWidth = 2 / k;
      context.beginPath();
      context.arc(selected.x, selected.y, selected.radius + 5 / k + 2, 0, Math.PI * 2);
      context.stroke();
    }
    const focused = state.focusId ? sim.nodes[sim.index.get(state.focusId) ?? -1] : undefined;
    if (focused && isVisible(focused) && document.activeElement === canvas) {
      context.globalAlpha = 1;
      context.strokeStyle = palette.focus;
      context.lineWidth = 2 / k;
      context.setLineDash([3 / k, 3 / k]);
      context.beginPath();
      context.arc(focused.x, focused.y, focused.radius + 9 / k + 2, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }

    // Label memudar masuk seiring zoom (ciri Obsidian): saat jauh, hanya
    // "aku", simpul yang disorot & tetangganya, dan hasil pencarian.
    const zoomAlpha = Math.min(Math.max((k - 0.8) / 0.35, 0), 1);
    const fontSize = 11.5 / k;
    context.font = `500 ${fontSize}px ${palette.font}`;
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.lineJoin = 'round';
    const labels: { node: SimNode; text: string; alpha: number; box: LabelBox }[] = [];
    for (const node of sim.nodes) {
      if (!isVisible(node)) continue;
      const data = state.nodesById.get(node.id);
      if (!data?.label) continue;
      const emphasised = node.id === focus || Boolean(around?.has(node.id)) || (state.matches?.has(node.id) ?? false);
      // Nama ORANG yang paling penting dibaca; minat & kegiatan menyusul
      // saat diperbesar. Ajakan masuk selalu berlabel karena butuh tindakan.
      const always = node.kind === 'me' || node.kind === 'incoming' || node.kind === 'connection';
      const layerAlpha = node.kind === 'interest' || node.kind === 'event' ? Math.min(Math.max((k - 1.05) / 0.35, 0), 1) : zoomAlpha;
      const alpha = emphasised || always ? 1 : focus ? layerAlpha * 0.25 : layerAlpha;
      if (alpha <= 0.02) continue;
      const text = truncate(node.kind === 'interest' ? `#${data.label}` : data.label, 28);
      const y = node.y + node.radius + 4 / k;
      const width = context.measureText(text).width * k;
      labels.push({
        node,
        text,
        alpha,
        box: {
          id: node.id,
          x: node.x * k + view.x - width / 2,
          y: y * k + view.y,
          width,
          height: 14,
          priority: (node.id === focus ? 1000 : 0) + (emphasised ? 500 : 0) + LABEL_PRIORITY[node.kind] * 10 + node.degree,
          force: node.id === focus || node.kind === 'me',
        },
      });
    }
    const shown = placeLabels(labels.map((label) => label.box));
    for (const { node, text, alpha } of labels) {
      if (!shown.has(node.id)) continue;
      const y = node.y + node.radius + 4 / k;
      context.globalAlpha = alpha * (lit(node.id) && matched(node.id) ? 1 : 0.35);
      context.lineWidth = 3.5 / k;
      context.strokeStyle = palette.bg;
      context.strokeText(text, node.x, y);
      context.fillStyle = node.kind === 'interest' || node.kind === 'event' ? palette.muted : palette.ink;
      context.fillText(text, node.x, y);
    }
    context.globalAlpha = 1;
  }, [isVisible]);

  const frame = useCallback(() => {
    rafRef.current = 0;
    const sim = simRef.current;
    if (!sim) return;
    let moving = false;
    if (!reducedMotionRef.current) {
      moving = tick(sim);
      if (moving) moving = tick(sim);
    }
    if (autoFitRef.current) {
      const { width, height } = sizeRef.current;
      viewRef.current = fitTransform(boundsOf(sim.nodes, isVisible), width, height);
    }
    draw();
    if (moving && onScreenRef.current && !document.hidden) rafRef.current = requestAnimationFrame(frame);
  }, [draw, isVisible]);

  const schedule = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(frame);
  }, [frame]);

  const reheat = useCallback(
    (alpha: number) => {
      const sim = simRef.current;
      if (!sim) return;
      if (reducedMotionRef.current) settle(sim, 120);
      else sim.alpha = Math.max(sim.alpha, alpha);
      schedule();
    },
    [schedule],
  );

  // Simulasi baru setiap kali data graf berubah (mis. setelah menerima
  // ajakan). Posisi simpul lama dipertahankan supaya peta tidak "meledak"
  // ulang — hanya simpul baru yang mencari tempat.
  useEffect(() => {
    const previous = simRef.current;
    const sim = createSimulation(graph);
    let reused = 0;
    if (previous) {
      for (const node of sim.nodes) {
        const old = previous.nodes[previous.index.get(node.id) ?? -1];
        if (!old) continue;
        node.x = old.x;
        node.y = old.y;
        if (old.fx !== null && node.kind !== 'me') {
          node.fx = old.fx;
          node.fy = old.fy;
        }
        reused += 1;
      }
    }
    const { width, height } = sizeRef.current;
    if (width > 0 && height > 0) sim.aspect = width / height;
    simRef.current = sim;
    if (reused > sim.nodes.length / 2) sim.alpha = 0.3;
    else if (!reducedMotionRef.current) for (let count = 0; count < 40; count += 1) tick(sim);
    if (reducedMotionRef.current) settle(sim);
    setSelectedId((current) => (current && sim.index.has(current) ? current : null));
    schedule();
  }, [graph, schedule]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = motion.matches;
    paletteRef.current = readPalette(canvas);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const sim = simRef.current;
      if (sim && rect.height > 0 && Math.abs(sim.aspect - rect.width / rect.height) > 0.2) {
        sim.aspect = rect.width / rect.height;
        if (reducedMotionRef.current) settle(sim);
        else sim.alpha = Math.max(sim.alpha, 0.5);
        schedule();
      }
      if (autoFitRef.current && simRef.current) {
        viewRef.current = fitTransform(boundsOf(simRef.current.nodes, isVisible), rect.width, rect.height);
      }
      draw();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const intersection = new IntersectionObserver(([entry]) => {
      onScreenRef.current = entry?.isIntersecting ?? true;
      if (onScreenRef.current) schedule();
    });
    intersection.observe(container);

    const themeObserver = new MutationObserver(() => {
      paletteRef.current = readPalette(canvas);
      draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const onMotion = () => {
      reducedMotionRef.current = motion.matches;
    };
    const onVisibility = () => {
      if (!document.hidden) schedule();
    };
    motion.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', onVisibility);

    // Roda gulir hanya men-zoom dengan Ctrl/⌘ (atau cubit trackpad, yang
    // dikirim peramban sebagai wheel + ctrlKey). Tanpa itu, halaman yang
    // sedang digulir akan "tersangkut" di peta — pola yang sama dengan peta
    // tersemat di situs lain.
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) && !container.dataset.expanded) {
        setWheelHint(true);
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => setWheelHint(false), 1400);
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const scale = event.deltaMode === 1 ? 16 : 1;
      autoFitRef.current = false;
      viewRef.current = zoomAround(viewRef.current, Math.exp(-event.deltaY * scale * 0.0022), event.clientX - rect.left, event.clientY - rect.top);
      draw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      clearTimeout(hintTimerRef.current);
    };
  }, [draw, isVisible, schedule]);

  useEffect(() => {
    draw();
  }, [draw, selectedId, focusId, matches]);

  useEffect(() => {
    autoFitRef.current = true;
    reheat(0.25);
  }, [hidden, reheat]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const centerOn = useCallback(
    (id: string) => {
      const sim = simRef.current;
      const node = sim?.nodes[sim.index.get(id) ?? -1];
      if (!node) return;
      const { width, height } = sizeRef.current;
      const view = viewRef.current;
      const screenX = node.x * view.k + view.x;
      const screenY = node.y * view.k + view.y;
      const margin = 60;
      if (screenX > margin && screenX < width - margin && screenY > margin && screenY < height - margin) return;
      autoFitRef.current = false;
      viewRef.current = { k: view.k, x: width / 2 - node.x * view.k, y: height / 2 - node.y * view.k };
      draw();
    },
    [draw],
  );

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) {
        setFocusId(id);
        centerOn(id);
      }
    },
    [centerOn],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (!sim) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, view: viewRef.current, cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2 };
      dragRef.current = null;
      return;
    }
    const index = hitTest(sim.nodes, viewRef.current, point.x, point.y, isVisible, event.pointerType === 'touch' ? 22 : 12);
    dragRef.current = { index, startX: point.x, startY: point.y, startView: viewRef.current, moved: false };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (!sim) return;
    const point = localPoint(event);
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, point);

    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
      const cx = (a!.x + b!.x) / 2;
      const cy = (a!.y + b!.y) / 2;
      const zoomed = zoomAround(pinch.view, distance / pinch.distance, pinch.cx, pinch.cy);
      autoFitRef.current = false;
      viewRef.current = { ...zoomed, x: zoomed.x + cx - pinch.cx, y: zoomed.y + cy - pinch.cy };
      draw();
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      autoFitRef.current = false;
      if (drag.index !== null) {
        const node = sim.nodes[drag.index]!;
        const view = viewRef.current;
        node.fx = (point.x - view.x) / view.k;
        node.fy = (point.y - view.y) / view.k;
        node.x = node.fx;
        node.y = node.fy;
        if (reducedMotionRef.current) draw();
        else {
          sim.alphaTarget = 0.25;
          reheat(0.25);
        }
      } else {
        viewRef.current = { ...drag.startView, x: drag.startView.x + dx, y: drag.startView.y + dy };
        draw();
      }
      return;
    }

    if (event.pointerType === 'mouse') {
      const index = hitTest(sim.nodes, viewRef.current, point.x, point.y, isVisible);
      if (index !== hoverRef.current) {
        hoverRef.current = index;
        event.currentTarget.style.cursor = index !== null ? 'pointer' : 'grab';
        draw();
      }
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!sim || !drag || event.type === 'pointercancel') return;

    if (drag.index !== null) {
      const node = sim.nodes[drag.index]!;
      if (drag.moved && node.kind !== 'me') {
        node.fx = null;
        node.fy = null;
      }
      sim.alphaTarget = 0;
    }
    if (!drag.moved && !stateRef.current.preview) {
      select(drag.index !== null ? sim.nodes[drag.index]!.id : null);
    }
    schedule();
  };

  const onPointerLeave = () => {
    if (hoverRef.current !== null) {
      hoverRef.current = null;
      draw();
    }
  };

  const visibleOrder = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return [];
    return sim.nodes
      .filter(isVisible)
      .map((node) => node.id)
      .sort((a, b) => {
        const na = nodesById.get(a)!;
        const nb = nodesById.get(b)!;
        return KIND_ORDER[na.kind] - KIND_ORDER[nb.kind] || na.label.localeCompare(nb.label, 'id');
      });
  }, [isVisible, nodesById]);

  const zoomBy = (factor: number) => {
    const { width, height } = sizeRef.current;
    autoFitRef.current = false;
    viewRef.current = zoomAround(viewRef.current, factor, width / 2, height / 2);
    draw();
  };

  const fit = () => {
    autoFitRef.current = true;
    const sim = simRef.current;
    if (!sim) return;
    const { width, height } = sizeRef.current;
    viewRef.current = fitTransform(boundsOf(sim.nodes, isVisible), width, height);
    draw();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (preview) return;
    const order = visibleOrder();
    if (order.length === 0) return;
    const current = focusId ? order.indexOf(focusId) : -1;
    const move = (delta: number) => {
      const next = order[(current + delta + order.length) % order.length]!;
      setFocusId(next);
      centerOn(next);
    };
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        setFocusId(order[0]!);
        centerOn(order[0]!);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        select(focusId ?? order[0]!);
        break;
      case 'Escape':
        if (selectedId) setSelectedId(null);
        else if (expanded) setExpanded(false);
        break;
      case '+':
      case '=':
        zoomBy(1.25);
        break;
      case '-':
        zoomBy(0.8);
        break;
      case '0':
        fit();
        break;
    }
  };

  const selected = selectedId ? nodesById.get(selectedId) ?? null : null;
  const focusNode = focusId ? nodesById.get(focusId) : undefined;
  const announcement = focusNode
    ? `${focusNode.label || KIND_LABEL[focusNode.kind]} — ${KIND_LABEL[focusNode.kind]}, ${focusNode.degree} sambungan.`
    : '';
  const neighborNodes: GraphNode[] = selected
    ? [...(neighbors.get(selected.id) ?? [])].map((id) => nodesById.get(id)).filter((node): node is GraphNode => Boolean(node))
    : [];

  const controlClass =
    'flex size-11 items-center justify-center rounded-card border border-line bg-panel/90 text-ink backdrop-blur-sm transition-colors duration-150 ease-snap hover:bg-panel-nested';

  return (
    <div
      ref={containerRef}
      data-expanded={expanded ? 'true' : undefined}
      className={cn(
        'relative flex flex-col overflow-hidden border border-line bg-canvas',
        expanded ? 'fixed inset-0 z-[70] rounded-none' : 'rounded-[20px]',
      )}
    >
      <div className="relative min-h-0 flex-1 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px]">
        <canvas
          ref={canvasRef}
          role={preview ? 'img' : 'application'}
          aria-roledescription={preview ? undefined : 'peta koneksi'}
          aria-label={preview ? `Contoh peta koneksi: ${summary}` : `Peta koneksi: ${summary}`}
          aria-describedby={preview ? undefined : 'petunjuk-peta'}
          tabIndex={preview ? -1 : 0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={onPointerLeave}
          onKeyDown={onKeyDown}
          onFocus={() => draw()}
          onBlur={() => draw()}
          className={cn(
            'block w-full touch-none select-none outline-none [cursor:grab] focus-visible:shadow-[inset_0_0_0_2px_var(--focus-ring)]',
            expanded ? 'h-[calc(100dvh-0px)]' : preview ? 'h-[340px] sm:h-[420px]' : 'h-[min(64vh,560px)] min-h-[360px]',
          )}
        />
        <noscript>
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-muted">
            Peta koneksi butuh JavaScript. Semua koneksi dan saran tetap ada dalam daftar di halaman ini.
          </p>
        </noscript>

        {!preview && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
            <label className="pointer-events-auto relative flex min-w-0 flex-[1_1_200px] items-center sm:max-w-[260px]">
              <span className="sr-only">Cari di peta</span>
              <Search aria-hidden className="pointer-events-none absolute left-3 z-[1] size-4 text-ink-muted" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && matches && matches.size > 0) {
                    event.preventDefault();
                    const first = visibleOrder().find((id) => matches.has(id));
                    if (first) select(first);
                  }
                }}
                placeholder="Cari di peta…"
                className="h-11 w-full rounded-card border border-line bg-panel/90 pl-9 pr-3 text-base backdrop-blur-sm sm:text-sm focus-visible:border-brand"
              />
            </label>
            <LayerToggles hidden={hidden} onChange={setHidden} className="pointer-events-auto hidden sm:flex" />
          </div>
        )}

        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <button type="button" onClick={() => zoomBy(1.25)} className={controlClass} aria-label="Perbesar peta">
            <Plus aria-hidden className="size-4" />
          </button>
          <button type="button" onClick={() => zoomBy(0.8)} className={controlClass} aria-label="Perkecil peta">
            <Minus aria-hidden className="size-4" />
          </button>
          <button type="button" onClick={fit} className={controlClass} aria-label="Tampilkan seluruh peta">
            <Crosshair aria-hidden className="size-4" />
          </button>
          {!preview && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={controlClass}
              aria-label={expanded ? 'Kecilkan peta' : 'Perbesar peta ke layar penuh'}
              aria-pressed={expanded}
            >
              {expanded ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
            </button>
          )}
        </div>

        <p
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-max max-w-[80%] rounded-pill bg-inverse px-3.5 py-2 text-center text-[12.5px] text-on-inverse transition-opacity duration-200',
            wheelHint ? 'opacity-100' : 'opacity-0',
          )}
        >
          Tahan Ctrl (⌘ di Mac) sambil menggulir untuk zoom
        </p>

      </div>

      {/* Satu panel saja: melayang di atas peta mulai md, mengalir di bawah
          kanvas di ponsel supaya tidak menutupi peta yang sudah sempit. */}
      {!preview && selected && (
        <div className="border-t border-line p-3 md:absolute md:right-3 md:top-[68px] md:z-[2] md:max-h-[calc(100%-140px)] md:w-[300px] md:overflow-y-auto md:overscroll-contain md:border-t-0 md:p-0">
          <GraphDetail node={selected} neighbors={neighborNodes} returnTo={returnTo} onSelect={select} onClose={() => setSelectedId(null)} />
        </div>
      )}

      {!preview && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-[12.5px] text-ink-muted">
          {/* Di ponsel tombol lapisan pindah ke sini supaya tidak memakan baris kedua di atas kanvas. */}
          <LayerToggles hidden={hidden} onChange={setHidden} className="flex w-full sm:hidden" />
          <ul aria-label="Keterangan simbol" className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(['me', 'connection', 'incoming', 'outgoing', 'suggestion', 'interest', 'event'] as const).map((kind) => (
              <li key={kind} className="flex items-center gap-1.5">
                <NodeGlyph kind={kind} className="size-3" />
                {KIND_LABEL[kind]}
              </li>
            ))}
          </ul>
          <p id="petunjuk-peta" className="ml-auto hidden text-[12px] lg:block">
            Seret untuk menggeser · klik simpul untuk detail · panah & Enter di keyboard
          </p>
        </div>
      )}


      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function drawNode(context: CanvasRenderingContext2D, node: SimNode, palette: Palette, k: number): void {
  const { x, y, radius } = node;
  context.setLineDash([]);
  switch (node.kind) {
    case 'me':
      context.fillStyle = palette.ink;
      circle(context, x, y, radius);
      context.fill();
      context.strokeStyle = palette.ink;
      context.lineWidth = 1.5 / k;
      circle(context, x, y, radius + 4 / k + 1);
      context.stroke();
      return;
    case 'connection':
      context.fillStyle = palette.ink;
      circle(context, x, y, radius);
      context.fill();
      return;
    case 'incoming':
      context.fillStyle = palette.bg;
      context.strokeStyle = palette.ink;
      context.lineWidth = 2 / k;
      circle(context, x, y, radius);
      context.fill();
      context.stroke();
      context.fillStyle = palette.ink;
      circle(context, x, y, radius * 0.42);
      context.fill();
      return;
    case 'outgoing':
      context.fillStyle = palette.bg;
      context.strokeStyle = palette.muted;
      context.lineWidth = 1.6 / k;
      context.setLineDash([2.5 / k, 2 / k]);
      circle(context, x, y, radius);
      context.fill();
      context.stroke();
      context.setLineDash([]);
      return;
    case 'suggestion':
      context.fillStyle = palette.bg;
      context.strokeStyle = palette.edge;
      context.lineWidth = 1.6 / k;
      circle(context, x, y, radius);
      context.fill();
      context.stroke();
      return;
    case 'interest':
      context.fillStyle = palette.muted;
      circle(context, x, y, radius);
      context.fill();
      return;
    case 'event': {
      const size = radius * 0.92;
      context.fillStyle = palette.soft;
      context.beginPath();
      context.moveTo(x, y - size * 1.2);
      context.lineTo(x + size * 1.2, y);
      context.lineTo(x, y + size * 1.2);
      context.lineTo(x - size * 1.2, y);
      context.closePath();
      context.fill();
      return;
    }
  }
}

function circle(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
}

function LayerToggles({
  hidden,
  onChange,
  className,
}: {
  hidden: ReadonlySet<ToggleKind>;
  onChange: (update: (current: ReadonlySet<ToggleKind>) => ReadonlySet<ToggleKind>) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Lapisan peta" className={cn('gap-1 rounded-card border border-line bg-panel/90 p-1 backdrop-blur-sm', className)}>
      {TOGGLES.map((toggle) => {
        const on = !hidden.has(toggle.kind);
        return (
          <button
            key={toggle.kind}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange((current) => {
                const next = new Set(current);
                if (on) next.add(toggle.kind);
                else next.delete(toggle.kind);
                return next;
              })
            }
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-sm px-2.5 text-[12.5px] font-medium transition-colors duration-150 ease-snap sm:min-h-9 sm:flex-none',
              on ? 'bg-brand-soft text-ink' : 'text-ink-muted line-through decoration-1 hover:text-ink',
            )}
          >
            <NodeGlyph kind={toggle.kind} className="size-3" />
            {toggle.label}
          </button>
        );
      })}
    </div>
  );
}
