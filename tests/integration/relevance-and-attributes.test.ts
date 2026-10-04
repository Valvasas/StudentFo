import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import { sortSummaries } from '@/lib/data/listing';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import type { EventSummary, SubmissionPayload, UserProfile } from '@/types/domain';
import { actAs, createEvent, createUser, sql } from './harness';

const repo = new SupabaseEventRepository(noCache);
const token = `zr${randomUUID().replace(/-/g, '').slice(0, 10)}`;
const bulk = `zb${randomUUID().replace(/-/g, '').slice(0, 10)}`;
const BULK_SIZE = 260;

/** Semua hasil pencarian, halaman demi halaman (maks. 48 per halaman). */
async function everything(search: string): Promise<EventSummary[]> {
  const items: EventSummary[] = [];
  for (let page = 1; ; page += 1) {
    const result = await repo.listEvents({ search, sort: 'newest', pageSize: 48, page });
    items.push(...result.items);
    if (page >= result.totalPages) return items;
  }
}

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

beforeAll(() => {
  actAs(null);
  // Variasi sengaja: kategori, jenjang, tenggat (termasuk tanpa tenggat & H-0),
  // umur, dan popularitas — supaya setiap komponen skor ikut menentukan urutan.
  const specs: [string, string[], string[], number | null, number, number][] = [
    ['Robot', ['teknologi'], ['D4_S1'], 20, 1, 5],
    ['Riset', ['sains'], ['S2'], 3, 2, 40],
    ['Desain', ['desain'], ['SMA_SMK', 'D4_S1'], 40, 3, 0],
    ['Tanpa Tenggat', ['teknologi'], [], null, 4, 12],
    ['Umum', ['sosial'], ['UMUM'], 9, 6, 300],
    ['Hari Ini', ['teknologi', 'sains'], ['D3'], 0, 10, 1],
    ['Lama', ['bisnis'], ['D4_S1'], 70, 45, 90],
  ];
  for (const [name, categories, levels, deadlineInDays, createdDaysAgo, saved] of specs) {
    const { id } = createEvent({ title: `Lomba ${name} ${token}`, categories, levels, deadlineInDays, createdDaysAgo });
    sql(`UPDATE events SET saved_count = ${saved} WHERE id = '${id}'`);
    // H-0 = 23.59 WIB hari ini, bukan "now() + 0 hari" yang sudah lewat
    // begitu query berikutnya berjalan (dan memang tersaring sebagai tutup).
    if (deadlineInDays === 0) {
      sql(`UPDATE event_deadlines SET deadline_at = ((now() AT TIME ZONE 'Asia/Jakarta')::date + time '23:59') AT TIME ZONE 'Asia/Jakarta'
           WHERE event_id = '${id}'`);
    }
  }

  // Katalog > jendela kandidat lama (240): dulu halaman 21+ diam-diam jatuh ke "terbaru".
  sql(`
    WITH inserted AS (
      INSERT INTO events (title, organizer, event_type, registration_link, source_url, status, reviewed_at, education_levels, created_at, saved_count)
      SELECT 'Massal ${bulk} ' || g, 'Penyelenggara Massal ' || g, 'LOMBA', 'https://daftar.example/m' || g, 'https://sumber.example/m' || g,
             'APPROVED', now(), CASE WHEN g % 3 = 0 THEN '{S2}'::education_level[] ELSE '{D4_S1}'::education_level[] END,
             now() - (g || ' hours')::interval, (g * 7) % 50
      FROM generate_series(1, ${BULK_SIZE}) AS g
      RETURNING id, title
    ), deadlines AS (
      INSERT INTO event_deadlines (event_id, label, deadline_at, is_primary)
      SELECT id, 'registration', now() + ((split_part(title, ' ', 3)::int % 60 + 1) || ' days')::interval, true FROM inserted
    )
    INSERT INTO event_categories (event_id, category_id)
    SELECT i.id, c.id FROM inserted i JOIN categories c
      ON c.slug = CASE WHEN split_part(i.title, ' ', 3)::int % 2 = 0 THEN 'teknologi' ELSE 'seni' END`);
});

beforeEach(() => actAs(null));

describe('list_personalized_events — paritas dengan rankEvents() (ADR-050)', () => {
  const profiles: [string, UserProfile | null][] = [
    ['personal: teknologi + D4/S1', { interests: ['teknologi'], educationLevel: 'D4_S1' }],
    ['personal: dua minat, satu kena', { interests: ['sains', 'olahraga'], educationLevel: 'S2' }],
    ['cold start: tamu', null],
    ['cold start: jenjang kosong', { interests: ['desain'], educationLevel: null }],
  ];

  it.each(profiles)('%s — urutan SQL = urutan Node atas data yang sama', async (_name, profile) => {
    const all = await everything(token);
    expect(all).toHaveLength(7);
    const expected = ids(sortSummaries(all, 'relevance', new Date(), profile));
    const actual = await repo.listEvents({ search: token, sort: 'relevance', profile, pageSize: 48 });
    expect(ids(actual.items)).toEqual(expected);
    expect(actual.total).toBe(7);
  });

  it('paginasi dalam benar: halaman 21 dari 260 kegiatan = potongan peringkat penuh, bukan "terbaru"', async () => {
    const profile: UserProfile = { interests: ['teknologi'], educationLevel: 'S2' };
    const all = await everything(bulk);
    expect(all).toHaveLength(BULK_SIZE);
    const expected = ids(sortSummaries(all, 'relevance', new Date(), profile));

    const page21 = await repo.listEvents({ search: bulk, sort: 'relevance', profile, pageSize: 12, page: 21 });
    expect(ids(page21.items)).toEqual(expected.slice(240, 252));
    expect(page21).toMatchObject({ total: BULK_SIZE, totalPages: 22 });

    const seen = new Set<string>();
    for (let page = 1; page <= 22; page += 1) {
      for (const id of ids((await repo.listEvents({ search: bulk, sort: 'relevance', profile, pageSize: 12, page })).items)) seen.add(id);
    }
    expect(seen.size).toBe(BULK_SIZE);
  });

  it('halaman di luar jangkauan: kosong, tapi total tetap benar', async () => {
    const beyond = await repo.listEvents({ search: token, sort: 'relevance', pageSize: 12, page: 9 });
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(7);
  });
});

describe('biaya, promosi, lencana (ADR-049)', () => {
  it('filter biaya di kedua jalur (RPC relevansi & PostgREST biasa); NULL tidak masuk keduanya', async () => {
    sql(`UPDATE events SET is_free = true WHERE title = 'Lomba Robot ${token}'`);
    sql(`UPDATE events SET is_free = false, price_amount = 125000 WHERE title = 'Lomba Riset ${token}'`);
    for (const sort of ['relevance', 'newest', 'deadline'] as const) {
      const free = await repo.listEvents({ search: token, sort, cost: 'free' });
      const paid = await repo.listEvents({ search: token, sort, cost: 'paid' });
      expect(free.items.map((item) => item.title), sort).toEqual([`Lomba Robot ${token}`]);
      expect(paid.items.map((item) => item.priceAmount), sort).toEqual([125000]);
    }
  });

  it('promosi: opt-in, aktif hanya selama masa promosi, berlaku di semua urutan', async () => {
    const promoted = sql(`SELECT id FROM events WHERE title = 'Lomba Lama ${token}'`);
    await repo.updateEventPresentation({
      eventId: promoted,
      verificationBadge: 'OFFICIAL_GOV',
      featuredUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });

    for (const sort of ['relevance', 'newest', 'deadline'] as const) {
      const withPromo = await repo.listEvents({ search: token, sort, promoted: true });
      const without = await repo.listEvents({ search: token, sort });
      expect(withPromo.items[0]?.id, sort).toBe(promoted);
      expect(without.items[0]?.id, sort).not.toBe(promoted);
    }

    const detail = await repo.getEventBySlug(sql(`SELECT slug FROM events WHERE id = '${promoted}'`));
    expect(detail).toMatchObject({ verificationBadge: 'OFFICIAL_GOV' });
    expect(ids(await repo.listFeaturedEvents(500))).toContain(promoted);

    sql(`UPDATE events SET featured_until = now() - interval '1 minute' WHERE id = '${promoted}'`);
    expect((await repo.listEvents({ search: token, sort: 'newest', promoted: true })).items[0]?.id).not.toBe(promoted);
  });

  it('lencana/promosi untuk acara PENDING ditolak (event_unavailable)', async () => {
    const pending = createEvent({ status: 'PENDING' }).id;
    const outcome = await repo
      .updateEventPresentation({ eventId: pending, verificationBadge: 'COMMUNITY', featuredUntil: null })
      .then(() => 'ok', (error: unknown) => (error instanceof AppError ? error.reason : String(error)));
    expect(outcome).toBe('event_unavailable');
    expect(sql(`SELECT coalesce(verification_badge, 'kosong') FROM events WHERE id = '${pending}'`)).toBe('kosong');
  });

  it('kiriman berbiaya + buku panduan: tersalin saat disetujui; kontak & bukti tidak', async () => {
    const unique = randomUUID().slice(0, 8);
    const payload: SubmissionPayload = {
      title: `Workshop Berbayar ${unique}`,
      organizer: `Himpunan ${unique}`,
      description: null,
      eventType: 'WORKSHOP',
      registrationLink: 'https://daftar.example/workshop',
      sourceUrl: null,
      educationLevels: ['D4_S1'],
      categorySlugs: [],
      location: null,
      isOnline: true,
      deadlineAt: new Date(Date.now() + 12 * 86_400_000).toISOString(),
      isFree: false,
      priceAmount: 50000,
      guidebookUrl: 'https://himpunan.example/panduan.pdf',
      organizerContact: '0812-1111-2222',
      proofLink: 'https://himpunan.example/sk',
    };
    await repo.createSubmission({ submittedByEmail: `${unique}@uji.example`, submittedBy: null, payload });
    const submission = (await repo.listSubmissions('PENDING', 500)).find((item) => item.payload?.title === payload.title)!;
    expect(submission.payload).toMatchObject({ organizerContact: '0812-1111-2222', proofLink: 'https://himpunan.example/sk' });

    await repo.reviewSubmission({ submissionId: submission.id, decision: 'APPROVED', reviewerId: null });
    const slug = sql(`SELECT slug FROM events WHERE title = '${payload.title}'`);
    const event = await repo.getEventBySlug(slug);
    expect(event).toMatchObject({ isFree: false, priceAmount: 50000, guidebookUrl: 'https://himpunan.example/panduan.pdf' });
    expect(JSON.stringify(event)).not.toContain('0812-1111-2222');
  });
});

describe('dispatch pengingat ke kanal luar (ADR-051)', () => {
  it('klaim → payload lengkap (email, tautan data) → klaim ulang kosong → ack sekali', async () => {
    const user = createUser({ fullName: 'Penerima Uji' });
    const { id: eventId } = createEvent({ title: `Lomba Pengingat ${token}`, deadlineInDays: 1 });
    sql(`INSERT INTO saved_events (user_id, event_id) VALUES ('${user}', '${eventId}')`);
    sql(`SELECT public.create_deadline_notifications()`);
    const notificationId = sql(`SELECT id FROM notifications WHERE user_id = '${user}' AND event_id = '${eventId}'`);

    const claimed = (await repo.claimDeadlineDispatches(500)).find((item) => item.notificationId === notificationId);
    expect(claimed).toMatchObject({
      type: 'DEADLINE_H1',
      recipient: { userId: user, email: `${user}@uji.example`, fullName: 'Penerima Uji' },
      event: { id: eventId, title: `Lomba Pengingat ${token}`, daysLeft: 1 },
    });

    const again = await repo.claimDeadlineDispatches(500);
    expect(again.map((item) => item.notificationId)).not.toContain(notificationId);

    expect(await repo.acknowledgeDeadlineDispatches([notificationId, 'bukan-uuid', randomUUID()])).toBe(1);
    expect(await repo.acknowledgeDeadlineDispatches([notificationId])).toBe(0);
    expect(sql(`SELECT dispatched_at IS NOT NULL FROM notifications WHERE id = '${notificationId}'`)).toBe('t');
  });
});
