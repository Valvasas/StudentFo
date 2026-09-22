import { beforeEach, describe, expect, it, vi } from 'vitest';

// `server-only` bukan paket npm sungguhan — Next.js meng-alias-nya secara
// internal lewat webpack (lihat CLAUDE.md). Di luar bundler Next itu, resolusi
// modul biasa akan gagal, jadi di sini di-stub supaya berkas yang diuji bisa
// diimpor langsung oleh Vitest.
vi.mock('server-only', () => ({}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({ from: mockFrom })),
  createSupabaseAdminClient: vi.fn(),
}));

const { SupabaseEventRepository } = await import('./supabase-repository');

/** Query builder palsu yang meniru API chainable supabase-js secukupnya. */
function chainable(result: { data: unknown[]; error: null; count: number | null }) {
  const builder: Record<string, unknown> = {};
  const methods = [
    'select', 'eq', 'textSearch', 'in', 'overlaps', 'or', 'gte', 'lte', 'order', 'range', 'limit', 'returns',
  ];
  for (const method of methods) {
    builder[method] = vi.fn(() => builder);
  }
  // Query builder supabase-js sungguhan bisa langsung di-`await`; `.returns()`
  // di kode produksi hanya menyempitkan tipe TypeScript dan mengembalikan
  // `this` — jadi builder ini juga harus thenable.
  (builder as { then?: unknown }).then = (resolve: (value: typeof result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

function dbRow(overrides: Record<string, unknown> & { id: string }) {
  return {
    slug: `slug-${overrides.id}`,
    title: `Judul ${overrides.id}`,
    organizer: 'Panitia Contoh',
    description: null,
    event_type: 'LOMBA',
    registration_link: 'https://a.id/daftar',
    source_url: 'https://a.id',
    education_levels: [],
    location: null,
    is_online: true,
    status: 'APPROVED',
    saved_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    primary_deadline_at: null,
    primary_deadline_label: null,
    category_slugs: [],
    ...overrides,
  };
}

describe('SupabaseEventRepository.listEvents — sort "relevance"', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('benar-benar memanggil rankEvents, bukan sekadar order by created_at (regresi bug §6)', async () => {
    const now = new Date('2026-02-10T00:00:00.000Z');
    // "baru-sepi" lebih baru (menang kalau cuma diurutkan created_at DESC).
    // "lama-viral" lebih tua tapi disimpan 100.000 kali — skoring cold-start
    // (0.6*recency + 0.4*popularitas log-scaled, §6) harus membalik urutan itu.
    const rows = [
      dbRow({ id: 'baru-sepi', created_at: now.toISOString(), saved_count: 0 }),
      dbRow({
        id: 'lama-viral',
        created_at: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
        saved_count: 100_000,
      }),
    ];
    mockFrom.mockReturnValue(chainable({ data: rows, error: null, count: rows.length }));

    const repo = new SupabaseEventRepository();
    const result = await repo.listEvents({ sort: 'relevance', page: 1, pageSize: 10 });

    expect(result.items.map((event) => event.id)).toEqual(['lama-viral', 'baru-sepi']);
  });

  it('mengambil kandidat lewat limit(), lalu paginasi di app — bukan range() langsung', async () => {
    const builder = chainable({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(builder);

    const repo = new SupabaseEventRepository();
    await repo.listEvents({ sort: 'relevance', page: 1, pageSize: 10 });

    // 500 harus sama dengan RANKING_CANDIDATE_LIMIT di supabase-repository.ts.
    expect(builder.limit).toHaveBeenCalledWith(500);
    expect(builder.range).not.toHaveBeenCalled();
  });

  it('membatasi totalPages ke jendela kandidat kalau total melebihi batas ranking', async () => {
    const rows = [dbRow({ id: 'satu' })];
    // total (600) > RANKING_CANDIDATE_LIMIT (500) -> totalPages tidak boleh
    // menjanjikan halaman di luar jendela yang benar-benar diberi skor.
    mockFrom.mockReturnValue(chainable({ data: rows, error: null, count: 600 }));

    const repo = new SupabaseEventRepository();
    const result = await repo.listEvents({ sort: 'relevance', page: 1, pageSize: 10 });

    expect(result.total).toBe(600);
    expect(result.totalPages).toBe(50); // ceil(500/10), bukan ceil(600/10)=60
  });
});

describe('SupabaseEventRepository.listEvents — sort "newest"/"deadline"', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("sort 'newest' tetap paginasi murni di database, tidak dibatasi kandidat", async () => {
    const builder = chainable({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(builder);

    const repo = new SupabaseEventRepository();
    await repo.listEvents({ sort: 'newest', page: 3, pageSize: 10 });

    expect(builder.range).toHaveBeenCalledWith(20, 29);
    expect(builder.limit).not.toHaveBeenCalled();
  });
});
