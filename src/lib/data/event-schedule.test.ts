import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { eventJsonLd } from '@/lib/structured-data';
import { MemoryEventRepository } from './memory-repository';
import type { EventActor } from './repository';
import { SEED_EVENTS } from './seed-data';

/**
 * Waktu pelaksanaan (ADR-100) di mode seed — cermin
 * supabase/tests/127_event_schedule.test.sql: hanya pengelola/admin, urutan
 * dijaga, laju dibatasi, dan jadwal menjadikan workshop ber-`Event`.
 */
async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

const seed = SEED_EVENTS.find((candidate) => candidate.slug === 'program-magang-analis-data-kuartal-ii');
if (!seed) throw new Error('acara contoh hilang');
const person = (id: string, isAdmin = false): EventActor => ({ id, fullName: `Nama ${id}`, email: `${id}@uji.example`, isAdmin });
const admin = person('admin', true);
const ana = person('ana');
const START = '2026-12-12T02:00:00.000Z';
const END = '2026-12-12T09:00:00.000Z';

describe('MemoryEventRepository — waktu pelaksanaan', () => {
  let repository: MemoryEventRepository;

  beforeEach(() => {
    repository = new MemoryEventRepository(new Date());
  });

  it('admin memasang & menghapus; bukan pengelola ditolak dengan jawaban yang sama dengan tidak ada', async () => {
    await repository.setEventSchedule(admin, seed.id, { startsAt: START, endsAt: END });
    expect(await repository.getEventBySlug(seed.slug)).toMatchObject({ startsAt: START, endsAt: END });

    expect(await reason(repository.setEventSchedule(ana, seed.id, { startsAt: START, endsAt: null }))).toBe('not_event_manager');
    expect(await reason(repository.setEventSchedule(admin, 'tidak-ada', { startsAt: START, endsAt: null }))).toBe('not_event_manager');

    await repository.setEventSchedule(admin, seed.id, { startsAt: null, endsAt: null });
    expect((await repository.getEventBySlug(seed.slug))?.startsAt).toBeNull();
  });

  it('selesai tanpa mulai atau sebelum mulai ditolak (cermin CHECK events_schedule_order)', async () => {
    expect(await reason(repository.setEventSchedule(admin, seed.id, { startsAt: null, endsAt: END }))).toBe('invalid_schedule');
    expect(await reason(repository.setEventSchedule(admin, seed.id, { startsAt: END, endsAt: START }))).toBe('invalid_schedule');
  });

  it('batas 30 perubahan per hari per orang (cermin set_event_schedule)', async () => {
    for (let i = 0; i < 30; i += 1) await repository.setEventSchedule(admin, seed.id, { startsAt: START, endsAt: null });
    expect(await reason(repository.setEventSchedule(admin, seed.id, { startsAt: START, endsAt: null }))).toBe('schedule_rate_limited');
  });

  it('workshop contoh berjadwal → data terstruktur Event dengan startDate/endDate', async () => {
    const workshop = await repository.getEventBySlug('workshop-riset-kualitatif-untuk-mahasiswa-tingkat-akhir');
    expect(workshop?.startsAt).toBeTruthy();
    const jsonLd = eventJsonLd(workshop!, { siteUrl: 'https://studentfo.test', imagePath: '/og.png', description: null }, new Date());
    expect(jsonLd).toMatchObject({ '@type': 'Event', startDate: workshop!.startsAt, endDate: workshop!.endsAt });
  });
});
