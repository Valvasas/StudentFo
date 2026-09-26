import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { actAs, sql } from './harness';

/**
 * Seberapa mahal listEvents pada katalog besar? Menjawab kapan skor relevansi
 * perlu pindah ke SQL (ADR-021) dan kapan `count: 'exact'` perlu diganti.
 * Default 5.000 event (selalu jalan, ringan). BENCH_SIZES="5000,20000,50000"
 * untuk kurva lengkap — hasilnya dicetak, lalu dicatat di ADR-035.
 */
const SIZES = (process.env.BENCH_SIZES ?? '5000').split(',').map(Number);
const repo = new SupabaseEventRepository(noCache);

/** Vitest menahan console.log uji yang lolos; hasil benchmark ditulis ke berkas bila diminta. */
function report(line: string): void {
  if (process.env.BENCH_OUT) appendFileSync(process.env.BENCH_OUT, `${line}\n`);
}

function seedCatalog(total: number): void {
  const existing = Number(sql(`SELECT count(*) FROM events WHERE title LIKE 'Skala %'`));
  if (existing >= total) return;
  sql(`
    WITH inserted AS (
      INSERT INTO events (title, organizer, description, event_type, registration_link, source_url,
                          status, reviewed_at, education_levels, created_at)
      SELECT 'Skala ' || (ARRAY['Lomba','Beasiswa','Magang','Workshop'])[1 + g % 4] || ' ' || g,
             'Penyelenggara ' || (g % 700),
             'Deskripsi kegiatan nomor ' || g || ' untuk mahasiswa dan pelajar Indonesia',
             (ARRAY['LOMBA','BEASISWA','MAGANG','WORKSHOP'])[1 + g % 4]::event_type,
             'https://daftar.example/' || g, 'https://sumber.example/' || g,
             'APPROVED', now(),
             ARRAY[(ARRAY['SMA_SMK','D4_S1','S2'])[1 + g % 3]]::education_level[],
             now() - (g % 90) * interval '1 day'
      FROM generate_series(${existing + 1}, ${total}) g
      RETURNING id, created_at
    ), deadlines AS (
      INSERT INTO event_deadlines (event_id, label, deadline_at, is_primary)
      SELECT id, 'registration', now() + ((hashtext(id::text) & 127) + 1) * interval '1 day', true FROM inserted
    )
    INSERT INTO event_categories (event_id, category_id)
    SELECT i.id, c.id FROM inserted i
    JOIN LATERAL (SELECT id FROM categories ORDER BY md5(i.id::text || slug) LIMIT 2) c ON true;
  `);
  sql('ANALYZE events; ANALYZE event_deadlines; ANALYZE event_categories;');
}

async function timed<T>(run: () => Promise<T>, repeat = 5): Promise<{ median: number; result: T }> {
  const samples: number[] = [];
  let result!: T;
  for (let i = 0; i < repeat; i += 1) {
    const started = performance.now();
    result = await run();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return { median: Math.round(samples[Math.floor(samples.length / 2)]!), result };
}

describe.each(SIZES)('listEvents pada %i event APPROVED', (size) => {
  it('relevansi (jendela 240 + skor di Node), terbaru, tenggat, pencarian, statistik', async () => {
    actAs(null);
    seedCatalog(size);
    const profile = { interests: ['teknologi', 'desain'], educationLevel: 'D4_S1' as const };

    const relevance = await timed(() => repo.listEvents({ sort: 'relevance', profile }));
    const newest = await timed(() => repo.listEvents({ sort: 'newest' }));
    const deadline = await timed(() => repo.listEvents({ sort: 'deadline', page: 20 }));
    const search = await timed(() => repo.listEvents({ search: 'beasiswa mahasiswa' }));
    const filtered = await timed(() => repo.listEvents({ types: ['LOMBA'], categories: ['teknologi'], levels: ['D4_S1'] }));
    const stats = await timed(() => repo.getStats());

    const result = {
      size,
      relevanceMs: relevance.median,
      newestMs: newest.median,
      deadlinePage20Ms: deadline.median,
      searchMs: search.median,
      filteredMs: filtered.median,
      statsMs: stats.median,
      total: newest.result.total,
    };
    report(`[bench-listing] ${JSON.stringify(result)}`);

    expect(newest.result.total).toBeGreaterThanOrEqual(size);
    expect(relevance.result.items).toHaveLength(12);
    // Batas longgar: regresi kasar (mis. N+1, jendela tanpa batas), bukan angka presisi.
    for (const ms of [result.relevanceMs, result.newestMs, result.searchMs, result.filteredMs]) {
      expect(ms).toBeLessThan(size >= 20_000 ? 5_000 : 2_000);
    }
  }, 300_000);
});

describe('biaya count exact vs planned (SQL langsung, 1 kueri listing tanpa filter)', () => {
  it('dicetak untuk ADR-035', () => {
    const exact = sql(`EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM events_listing WHERE status = 'APPROVED'
                       AND (primary_deadline_at >= now() OR primary_deadline_at IS NULL)`);
    const ms = (JSON.parse(exact) as [{ 'Execution Time': number }])[0]['Execution Time'];
    const rows = Number(sql(`SELECT count(*) FROM events WHERE status = 'APPROVED'`));
    report(`[bench-count] ${JSON.stringify({ approvedRows: rows, exactCountMs: Math.round(ms * 10) / 10 })}`);
    expect(ms).toBeGreaterThan(0);
  });
});
