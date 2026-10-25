import { describe, expect, it } from 'vitest';
import { noCache, type CacheLayer } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { actAs, createEvent, sql } from './harness';

describe('harness', () => {
  it('anon membaca event APPROVED lewat PostgREST sungguhan, bukan PENDING', async () => {
    const approved = createEvent({ title: 'Smoke Approved' });
    const pending = createEvent({ title: 'Smoke Pending', status: 'PENDING' });
    actAs(null);
    const repo = new SupabaseEventRepository(noCache);
    expect(await repo.getEventBySlug(approved.slug)).toMatchObject({ id: approved.id });
    expect(await repo.getEventBySlug(pending.slug)).toBeNull();
  });
});

describe('checkHealth (GET /api/health)', () => {
  // Cache yang tidak pernah kedaluwarsa: kalau checkHealth lewat Data Cache,
  // panggilan kedua menjawab dari hasil pertama walau database sudah menolak.
  const foreverCache: CacheLayer = (fn) => {
    const memo = new Map<string, ReturnType<typeof fn>>();
    return (...args) => {
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key)!;
    };
  };

  it('menjangkau database setiap kali, bukan dari cache: database menolak → melempar 503', async () => {
    actAs(null);
    const repo = new SupabaseEventRepository(foreverCache);
    await expect(repo.checkHealth()).resolves.toBeUndefined();
    const categories = await repo.listCategories();

    sql('REVOKE SELECT ON public.categories FROM anon');
    try {
      await expect(repo.checkHealth()).rejects.toMatchObject({ code: 'UPSTREAM_FAILURE', httpStatus: 503 });
      // Pembanding: data publik yang di-cache tetap "sehat" — justru itu alasannya.
      expect(await repo.listCategories()).toEqual(categories);
    } finally {
      sql('GRANT SELECT ON public.categories TO anon');
    }
    await expect(repo.checkHealth()).resolves.toBeUndefined();
  });
});
