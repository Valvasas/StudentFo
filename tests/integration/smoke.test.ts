import { describe, expect, it } from 'vitest';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { actAs, createEvent } from './harness';

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
