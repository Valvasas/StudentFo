import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { actAs, createEvent, createUser, sql } from './harness';

const repo = new SupabaseEventRepository(noCache);
// Token unik di judul memisahkan data uji ini dari berkas uji lain di database yang sama.
const token = `zq${randomUUID().replace(/-/g, '').slice(0, 10)}`;

beforeAll(() => {
  actAs(null);
  createEvent({ title: `Lomba Robot ${token}`, eventType: 'LOMBA', deadlineInDays: 20, categories: ['teknologi'], levels: ['D4_S1'], createdDaysAgo: 1 });
  createEvent({ title: `Beasiswa Riset ${token}`, eventType: 'BEASISWA', deadlineInDays: 3, categories: ['sains'], levels: ['S2'], createdDaysAgo: 2 });
  createEvent({ title: `Magang Desain ${token}`, eventType: 'MAGANG', deadlineInDays: 40, categories: ['desain'], levels: ['SMA_SMK', 'D4_S1'], createdDaysAgo: 3 });
  createEvent({ title: `Workshop Tanpa Tenggat ${token}`, eventType: 'WORKSHOP', deadlineInDays: null, categories: ['teknologi'], createdDaysAgo: 4 });
  createEvent({ title: `Lomba Sudah Tutup ${token}`, eventType: 'LOMBA', deadlineInDays: -2, categories: ['teknologi'], createdDaysAgo: 30 });
  createEvent({ title: `Lomba Kedaluwarsa ${token}`, status: 'EXPIRED', deadlineInDays: -10, categories: ['teknologi'], createdDaysAgo: 40 });
  createEvent({ title: `Lomba Menunggu ${token}`, status: 'PENDING', deadlineInDays: 10, categories: ['teknologi'] });
});

const titles = (items: readonly { title: string }[]) => items.map((item) => item.title.replace(` ${token}`, ''));

describe('SupabaseEventRepository.listEvents (PostgREST sungguhan)', () => {
  it('pencarian FTS: hanya yang terbuka & tayang; tanpa tenggat tetap ikut', async () => {
    const result = await repo.listEvents({ search: token, sort: 'newest' });
    expect(titles(result.items)).toEqual(['Lomba Robot', 'Beasiswa Riset', 'Magang Desain', 'Workshop Tanpa Tenggat']);
    expect(result.total).toBe(4);
  });

  it('includeClosed menampilkan yang lewat tenggat & EXPIRED, tidak pernah PENDING', async () => {
    const result = await repo.listEvents({ search: token, sort: 'newest', includeClosed: true });
    expect(titles(result.items)).toEqual([
      'Lomba Robot', 'Beasiswa Riset', 'Magang Desain', 'Workshop Tanpa Tenggat', 'Lomba Sudah Tutup', 'Lomba Kedaluwarsa',
    ]);
  });

  it('filter jenis, jenjang (overlap), dan kategori', async () => {
    expect(titles((await repo.listEvents({ search: token, types: ['LOMBA'] })).items)).toEqual(['Lomba Robot']);
    expect(titles((await repo.listEvents({ search: token, levels: ['SMA_SMK'] })).items)).toEqual(['Magang Desain']);
    expect(titles((await repo.listEvents({ search: token, categories: ['teknologi'], sort: 'newest' })).items)).toEqual([
      'Lomba Robot', 'Workshop Tanpa Tenggat',
    ]);
  });

  it('urut tenggat: terdekat dulu, tanpa tenggat paling akhir', async () => {
    const result = await repo.listEvents({ search: token, sort: 'deadline' });
    expect(titles(result.items)).toEqual(['Beasiswa Riset', 'Lomba Robot', 'Magang Desain', 'Workshop Tanpa Tenggat']);
  });

  it('paginasi: total & halaman konsisten', async () => {
    const first = await repo.listEvents({ search: token, sort: 'newest', pageSize: 3, page: 1 });
    const second = await repo.listEvents({ search: token, sort: 'newest', pageSize: 3, page: 2 });
    expect(first).toMatchObject({ total: 4, totalPages: 2, page: 1 });
    expect(titles([...first.items, ...second.items])).toEqual(['Lomba Robot', 'Beasiswa Riset', 'Magang Desain', 'Workshop Tanpa Tenggat']);
  });

  it('relevansi dengan profil: minat desain + jenjang SMA mengangkat Magang Desain ke atas', async () => {
    const result = await repo.listEvents({
      search: token,
      sort: 'relevance',
      profile: { interests: ['desain'], educationLevel: 'SMA_SMK' },
    });
    expect(titles(result.items)[0]).toBe('Magang Desain');
  });

  it('getEventBySlug: EXPIRED tetap terbaca (halaman lama tidak 404), PENDING tidak', async () => {
    const expiredSlug = sql(`SELECT slug FROM events WHERE title = 'Lomba Kedaluwarsa ${token}'`);
    const pendingSlug = sql(`SELECT slug FROM events WHERE title = 'Lomba Menunggu ${token}'`);
    expect(await repo.getEventBySlug(expiredSlug)).not.toBeNull();
    expect(await repo.getEventBySlug(pendingSlug)).toBeNull();
  });
});

describe('batas max_rows PostgREST', () => {
  it('listCalibrationData membaca > 1000 baris (range per halaman), bukan terpotong diam-diam', async () => {
    const event = createEvent();
    const user = createUser();
    const since = new Date(Date.now() - 60_000);
    sql(`INSERT INTO recommendation_signals (event_id, user_id, kind, interests)
         SELECT '${event.id}', '${user}', 'save', '{teknologi}' FROM generate_series(1, 1205)`);
    const data = await repo.listCalibrationData(since);
    expect(data.signals.filter((signal) => signal.eventId === event.id)).toHaveLength(1205);
  });
});

describe('mode hitung otomatis', () => {
  it('di atas ambang memakai perkiraan planner, total tetap angka yang masuk akal', async () => {
    const planned = new SupabaseEventRepository(noCache, 0);
    const exact = await repo.listEvents({ search: token, sort: 'newest' });
    const estimate = await planned.listEvents({ search: token, sort: 'newest' });
    expect(estimate.items.map((item) => item.id)).toEqual(exact.items.map((item) => item.id));
    expect(estimate.total).toBeGreaterThan(0);
  });
});
