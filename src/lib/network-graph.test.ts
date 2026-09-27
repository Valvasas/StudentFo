import { describe, expect, it } from 'vitest';
import type { Category, Connection, NetworkPerson, PeopleSuggestion } from '@/types/domain';
import { buildNetworkGraph, buildPreviewGraph, GRAPH_LIMITS, ME_NODE_ID, personNodeId } from './network-graph';
import type { NetworkViewer } from './network';

const categories: Category[] = [
  { id: 'c1', name: 'Teknologi & IT', slug: 'teknologi' },
  { id: 'c2', name: 'Desain & Kreatif', slug: 'desain' },
  { id: 'c3', name: 'Sains & Riset', slug: 'sains' },
];

const viewer: NetworkViewer = { id: 'me-id', fullName: 'Dinda', educationLevel: 'D4_S1', major: null, interests: ['teknologi'] };

const person = (userId: string, interests: string[] = []): NetworkPerson => ({
  userId,
  fullName: `Orang ${userId}`,
  headline: null,
  educationLevel: null,
  major: null,
  interests,
});

const connection = (userId: string, status: Connection['status'], direction: Connection['direction'], interests: string[] = []): Connection => ({
  id: `conn-${userId}`,
  person: person(userId, interests),
  status,
  direction,
  message: direction === 'incoming' ? 'Halo' : null,
  createdAt: '2026-09-20T00:00:00.000Z',
  respondedAt: status === 'ACCEPTED' ? '2026-09-21T00:00:00.000Z' : null,
});

const suggestion = (userId: string, interests: string[]): PeopleSuggestion => ({
  person: person(userId, interests),
  score: 3,
  sharedInterests: interests.filter((slug) => viewer.interests.includes(slug)),
  mutualCount: 0,
  sharedEvents: [],
  sameMajor: false,
  sameLevel: false,
});

const lomba = { id: 'e1', slug: 'lomba-a', title: 'Lomba A', eventType: 'LOMBA' as const };
const solo = { id: 'e2', slug: 'lomba-b', title: 'Lomba B', eventType: 'LOMBA' as const };

describe('buildNetworkGraph', () => {
  const graph = buildNetworkGraph({
    viewer,
    categories,
    connections: [connection('a', 'ACCEPTED', 'outgoing', ['desain']), connection('b', 'PENDING', 'incoming'), connection('c', 'PENDING', 'outgoing')],
    suggestions: [suggestion('s1', ['teknologi', 'tidak-dikenal']), suggestion('s2', [])],
    viewerEvents: [lomba],
    teamLinks: [
      { userId: 'a', teamId: 't1', event: lomba },
      { userId: 'c', teamId: 't2', event: solo },
      { userId: 'orang-luar', teamId: 't3', event: solo },
    ],
  });
  const node = (id: string) => graph.nodes.find((candidate) => candidate.id === id);
  const edge = (a: string, b: string) => graph.edges.find((candidate) => (candidate.source === a && candidate.target === b) || (candidate.source === b && candidate.target === a));

  it('pembaca di pusat, jenis simpul mengikuti status koneksi', () => {
    expect(node(ME_NODE_ID)?.kind).toBe('me');
    expect(node(personNodeId('a'))?.kind).toBe('connection');
    expect(node(personNodeId('b'))?.kind).toBe('incoming');
    expect(node(personNodeId('c'))?.kind).toBe('outgoing');
    expect(edge(ME_NODE_ID, personNodeId('a'))?.kind).toBe('connection');
    expect(edge(ME_NODE_ID, personNodeId('b'))?.kind).toBe('pending');
  });

  it('pesan pengantar hanya dibawa untuk ajakan masuk', () => {
    expect(node(personNodeId('b'))?.person?.message).toBe('Halo');
    expect(node(personNodeId('a'))?.person?.message).toBeNull();
  });

  it('saran tersambung lewat minat, tidak langsung ke pembaca; saran tanpa sambungan dibuang', () => {
    expect(edge(personNodeId('s1'), 'i:teknologi')?.kind).toBe('interest');
    expect(edge(ME_NODE_ID, personNodeId('s1'))).toBeUndefined();
    expect(node(personNodeId('s2'))).toBeUndefined();
  });

  it('kategori yang tidak dikenal tidak jadi simpul', () => {
    expect(node('i:tidak-dikenal')).toBeUndefined();
    expect(node('i:teknologi')?.href).toBe('/events?kategori=teknologi');
  });

  it('kegiatan hanya dari orang yang ada di peta', () => {
    expect(edge(ME_NODE_ID, 'e:e1')?.kind).toBe('event');
    expect(edge(personNodeId('a'), 'e:e1')?.kind).toBe('event');
    expect(node('e:e2')?.degree).toBe(1);
  });

  it('derajat dihitung dari sisi; tidak ada sisi ganda', () => {
    const keys = graph.edges.map((item) => [item.source, item.target].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(node(ME_NODE_ID)?.degree).toBe(graph.edges.filter((item) => item.source === ME_NODE_ID || item.target === ME_NODE_ID).length);
  });
});

describe('batas simpul', () => {
  it('memotong orang di GRAPH_LIMITS.people dan melaporkan sisanya', () => {
    const many = Array.from({ length: GRAPH_LIMITS.people + 7 }, (_, index) => connection(`x${index}`, 'ACCEPTED', 'outgoing'));
    const graph = buildNetworkGraph({ viewer, categories, connections: many, suggestions: [suggestion('s', ['teknologi'])], viewerEvents: [], teamLinks: [] });
    expect(graph.nodes.filter((item) => item.person).length).toBe(GRAPH_LIMITS.people);
    expect(graph.hiddenPeople).toBe(7);
  });

  it('kegiatan dengan sambungan terbanyak menang saat dipotong', () => {
    const events = Array.from({ length: GRAPH_LIMITS.events + 3 }, (_, index) => ({ id: `ev${index}`, slug: `ev${index}`, title: `Ev ${String(index).padStart(2, '0')}`, eventType: 'LOMBA' as const }));
    const popular = events[events.length - 1]!;
    const graph = buildNetworkGraph({
      viewer,
      categories,
      connections: [connection('a', 'ACCEPTED', 'outgoing'), connection('b', 'ACCEPTED', 'outgoing')],
      suggestions: [],
      viewerEvents: events,
      teamLinks: [
        { userId: 'a', teamId: 't', event: popular },
        { userId: 'b', teamId: 't', event: popular },
      ],
    });
    const eventNodes = graph.nodes.filter((item) => item.kind === 'event');
    expect(eventNodes).toHaveLength(GRAPH_LIMITS.events);
    expect(eventNodes.some((item) => item.id === `e:${popular.id}`)).toBe(true);
  });
});

describe('buildPreviewGraph', () => {
  it('tidak memuat satu pun nama orang', () => {
    const graph = buildPreviewGraph(categories);
    const people = graph.nodes.filter((item) => item.id.startsWith('anon:'));
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((item) => item.label === '' && item.person === null)).toBe(true);
    expect(graph.nodes.every((item) => item.degree > 0)).toBe(true);
  });
});
