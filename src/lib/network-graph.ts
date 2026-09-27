import type { Category, Connection, NetworkEventRef, PeopleSuggestion, TeamLink } from '@/types/domain';
import { type NetworkViewer, personMeta, suggestionReasons } from './network';

/**
 * Bentuk data "Peta koneksi" (graf ala Obsidian, ADR-040).
 *
 * Dibangun di SERVER dari data yang memang boleh dilihat pembaca, lalu
 * dikirim ke pulau klien yang hanya menggambar. Konsekuensinya: tidak ada
 * data orang lain yang sampai ke peramban kecuali yang sudah tampil di
 * daftar halaman yang sama.
 *
 * Batas simpul menjaga dua hal sekaligus: ukuran payload RSC dan biaya
 * simulasi gaya di klien (O(n²) per langkah — 200 simpul ≈ 40 ribu pasangan,
 * masih jauh di bawah satu frame di ponsel kelas menengah).
 */

export type GraphNodeKind = 'me' | 'connection' | 'incoming' | 'outgoing' | 'suggestion' | 'interest' | 'event';
export type GraphEdgeKind = 'connection' | 'pending' | 'interest' | 'event';

export interface GraphPerson {
  readonly userId: string;
  readonly headline: string | null;
  readonly meta: string;
  readonly reasons: readonly string[];
  readonly connectionId: string | null;
  readonly message: string | null;
}

export interface GraphNode {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly label: string;
  readonly degree: number;
  /** Tujuan tautan simpul non-orang (kategori → daftar kegiatan, kegiatan → detail). */
  readonly href: string | null;
  readonly person: GraphPerson | null;
}

export interface GraphEdge {
  readonly source: string;
  readonly target: string;
  readonly kind: GraphEdgeKind;
}

export interface NetworkGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  /** Jumlah orang yang tidak digambar karena melewati batas. */
  readonly hiddenPeople: number;
}

export const GRAPH_LIMITS = {
  people: 150,
  suggestions: 16,
  events: 12,
  interestsPerPerson: 5,
} as const;

export interface GraphInput {
  readonly viewer: NetworkViewer;
  readonly connections: readonly Connection[];
  readonly suggestions: readonly PeopleSuggestion[];
  readonly categories: readonly Category[];
  /** Kegiatan yang disimpan/dilacak pembaca. */
  readonly viewerEvents: readonly NetworkEventRef[];
  readonly teamLinks: readonly TeamLink[];
}

export const ME_NODE_ID = 'me';
export const personNodeId = (userId: string) => `p:${userId}`;
const interestNodeId = (slug: string) => `i:${slug}`;
const eventNodeId = (eventId: string) => `e:${eventId}`;

interface MutableNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  href: string | null;
  person: GraphPerson | null;
}

export function buildNetworkGraph(input: GraphInput): NetworkGraph {
  const { viewer, categories } = input;
  const categoryName = (slug: string) => categories.find((category) => category.slug === slug)?.name ?? slug;
  const knownCategories = new Set(categories.map((category) => category.slug));

  const nodes = new Map<string, MutableNode>();
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (source: string, target: string, kind: GraphEdgeKind) => {
    const key = source < target ? `${source}|${target}` : `${target}|${source}`;
    if (source === target || edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, kind });
  };

  nodes.set(ME_NODE_ID, { id: ME_NODE_ID, kind: 'me', label: viewer.fullName, href: '/profile', person: null });

  // Urutan prioritas saat dipotong: yang sudah terhubung, lalu yang butuh
  // tindakan pembaca, lalu yang menunggu, baru saran.
  const byRecency = (a: Connection, b: Connection) =>
    (b.respondedAt ?? b.createdAt).localeCompare(a.respondedAt ?? a.createdAt);
  const accepted = input.connections.filter((c) => c.status === 'ACCEPTED').sort(byRecency);
  const incoming = input.connections.filter((c) => c.status === 'PENDING' && c.direction === 'incoming').sort(byRecency);
  const outgoing = input.connections.filter((c) => c.status === 'PENDING' && c.direction === 'outgoing').sort(byRecency);
  const orderedConnections = [...accepted, ...incoming, ...outgoing];

  const people: { nodeId: string; interests: readonly string[] }[] = [];
  let hiddenPeople = 0;

  for (const connection of orderedConnections) {
    if (people.length >= GRAPH_LIMITS.people) {
      hiddenPeople += 1;
      continue;
    }
    const nodeId = personNodeId(connection.person.userId);
    const kind: GraphNodeKind =
      connection.status === 'ACCEPTED' ? 'connection' : connection.direction === 'incoming' ? 'incoming' : 'outgoing';
    nodes.set(nodeId, {
      id: nodeId,
      kind,
      label: connection.person.fullName,
      href: null,
      person: {
        userId: connection.person.userId,
        headline: connection.person.headline,
        meta: personMeta(connection.person),
        reasons: [],
        connectionId: connection.id,
        message: connection.direction === 'incoming' ? connection.message : null,
      },
    });
    addEdge(ME_NODE_ID, nodeId, kind === 'connection' ? 'connection' : 'pending');
    people.push({ nodeId, interests: connection.person.interests });
  }

  for (const suggestion of input.suggestions.slice(0, GRAPH_LIMITS.suggestions)) {
    const nodeId = personNodeId(suggestion.person.userId);
    if (nodes.has(nodeId) || people.length >= GRAPH_LIMITS.people) continue;
    nodes.set(nodeId, {
      id: nodeId,
      kind: 'suggestion',
      label: suggestion.person.fullName,
      href: null,
      person: {
        userId: suggestion.person.userId,
        headline: suggestion.person.headline,
        meta: personMeta(suggestion.person),
        reasons: suggestionReasons(suggestion, categoryName),
        connectionId: null,
        message: null,
      },
    });
    people.push({ nodeId, interests: suggestion.person.interests });
  }

  const linkInterest = (nodeId: string, slug: string) => {
    if (!knownCategories.has(slug)) return;
    const id = interestNodeId(slug);
    if (!nodes.has(id)) {
      nodes.set(id, { id, kind: 'interest', label: categoryName(slug), href: `/events?kategori=${encodeURIComponent(slug)}`, person: null });
    }
    addEdge(nodeId, id, 'interest');
  };
  for (const slug of viewer.interests) linkInterest(ME_NODE_ID, slug);
  for (const person of people) {
    for (const slug of person.interests.slice(0, GRAPH_LIMITS.interestsPerPerson)) linkInterest(person.nodeId, slug);
  }

  // Kegiatan: hanya yang tersambung ke seseorang di peta. Yang paling banyak
  // disambungkan menang saat dipotong — simpul penghubung antar-kelompok
  // itulah yang membuat graf berguna, bukan kegiatan yang hanya milik satu orang.
  const eventLinks = new Map<string, { event: NetworkEventRef; members: Set<string> }>();
  const linkEvent = (nodeId: string, event: NetworkEventRef) => {
    const entry = eventLinks.get(event.id) ?? { event, members: new Set<string>() };
    entry.members.add(nodeId);
    eventLinks.set(event.id, entry);
  };
  for (const event of input.viewerEvents) linkEvent(ME_NODE_ID, event);
  for (const link of input.teamLinks) {
    const nodeId = link.userId === viewer.id ? ME_NODE_ID : personNodeId(link.userId);
    if (nodes.has(nodeId)) linkEvent(nodeId, link.event);
  }
  const chosenEvents = [...eventLinks.values()]
    .sort((a, b) => b.members.size - a.members.size || a.event.title.localeCompare(b.event.title, 'id'))
    .slice(0, GRAPH_LIMITS.events);
  for (const { event, members } of chosenEvents) {
    const id = eventNodeId(event.id);
    nodes.set(id, { id, kind: 'event', label: event.title, href: `/events/${event.slug}`, person: null });
    for (const member of members) addEdge(member, id, 'event');
  }

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  // Saran tanpa satu pun sambungan akan melayang sendirian di tepi peta dan
  // tidak menjelaskan apa-apa; ia tetap ada di daftar saran di bawah graf.
  const finalNodes: GraphNode[] = [];
  for (const node of nodes.values()) {
    const nodeDegree = degree.get(node.id) ?? 0;
    if (nodeDegree === 0 && node.kind !== 'me') continue;
    finalNodes.push({ ...node, degree: nodeDegree });
  }

  return { nodes: finalNodes, edges, hiddenPeople };
}

/**
 * Peta contoh untuk tamu: bentuknya sama, tanpa satu pun nama orang.
 * Deterministik (tanpa Math.random) supaya render server & klien identik.
 */
export function buildPreviewGraph(categories: readonly Category[]): NetworkGraph {
  const picked = categories.slice(0, 6);
  const nodes: GraphNode[] = [{ id: ME_NODE_ID, kind: 'me', label: 'Kamu', degree: 0, href: null, person: null }];
  const edges: GraphEdge[] = [];
  const kinds: GraphNodeKind[] = ['connection', 'connection', 'connection', 'incoming', 'suggestion', 'connection', 'suggestion', 'outgoing', 'connection', 'suggestion'];

  picked.forEach((category, index) => {
    nodes.push({ id: interestNodeId(category.slug), kind: 'interest', label: category.name, degree: 0, href: null, person: null });
    if (index < 2) edges.push({ source: ME_NODE_ID, target: interestNodeId(category.slug), kind: 'interest' });
  });
  kinds.forEach((kind, index) => {
    const id = `anon:${index}`;
    nodes.push({ id, kind, label: '', degree: 0, href: null, person: null });
    if (kind !== 'suggestion') edges.push({ source: ME_NODE_ID, target: id, kind: kind === 'connection' ? 'connection' : 'pending' });
    const first = picked[index % Math.max(picked.length, 1)];
    const second = picked[(index * 3 + 1) % Math.max(picked.length, 1)];
    if (first) edges.push({ source: id, target: interestNodeId(first.slug), kind: 'interest' });
    if (second && second !== first) edges.push({ source: id, target: interestNodeId(second.slug), kind: 'interest' });
  });

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return {
    nodes: nodes.map((node) => ({ ...node, degree: degree.get(node.id) ?? 0 })).filter((node) => node.degree > 0),
    edges,
    hiddenPeople: 0,
  };
}
