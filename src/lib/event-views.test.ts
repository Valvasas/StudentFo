import { beforeEach, describe, expect, it, vi } from 'vitest';

const recorded: { eventId: string; visitor: string }[] = [];
const buckets = new Map<string, number>();

vi.mock('@/lib/data', () => ({
  getEventRepository: async () => ({
    consumeRateLimit: async (bucket: string, limit: number) => {
      const used = (buckets.get(bucket) ?? 0) + 1;
      buckets.set(bucket, used);
      return used <= limit;
    },
    recordEventView: async (eventId: string, visitor: string) => {
      recorded.push({ eventId, visitor });
    },
  }),
}));

const { recordEventView } = await import('./event-views');

const headersFrom = (ip: string, userAgent: string) =>
  new Headers({ 'x-forwarded-for': ip, 'user-agent': userAgent });
const browser = (index: number) => `Mozilla/5.0 (Linux; Android 14; HP-${index}) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36`;

describe('recordEventView — penggelembungan pengunjung (ADR-093)', () => {
  beforeEach(() => {
    recorded.length = 0;
    buckets.clear();
  });

  it('satu IP yang berganti User-Agent tidak bisa mencetak lebih dari 30 pengunjung untuk satu acara per hari', async () => {
    for (let index = 0; index < 120; index += 1) await recordEventView('acara-a', headersFrom('203.0.113.7', browser(index)));
    expect(recorded.filter((row) => row.eventId === 'acara-a')).toHaveLength(30);
    expect(new Set(recorded.map((row) => row.visitor)).size).toBe(30);
  });

  it('batas dihitung per acara: IP yang sama tetap tercatat di acara lain', async () => {
    for (let index = 0; index < 40; index += 1) await recordEventView('acara-a', headersFrom('203.0.113.7', browser(index)));
    await recordEventView('acara-b', headersFrom('203.0.113.7', browser(1)));
    expect(recorded.filter((row) => row.eventId === 'acara-b')).toHaveLength(1);
  });

  it('banyak orang di balik IP bersama (CGNAT) tetap terhitung terpisah sampai batas', async () => {
    for (let index = 0; index < 5; index += 1) await recordEventView('acara-a', headersFrom('198.51.100.20', browser(index)));
    expect(new Set(recorded.map((row) => row.visitor)).size).toBe(5);
  });
});
