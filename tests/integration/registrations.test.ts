import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import type { RegistrationFormInput, RegistrationSubmission } from '@/lib/registration';
import { actAs, createEvent, createUser, sql, type EventSeed } from './harness';

/**
 * Pendaftaran langsung (ADR-055) lewat PostgREST sungguhan: RPC, RLS,
 * kunci kuota, notifikasi, dan pemetaan pesan RAISE → kode aksi. Aturan yang
 * sama diuji di SQL murni (supabase/tests/94_registrations.test.sql) dan di
 * mode seed (src/lib/data/registrations.test.ts); di sini yang dibuktikan
 * adalah lapisan TypeScript di atasnya — 13 metode SupabaseEventRepository.
 */
const repo = new SupabaseEventRepository(noCache);

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? (error.reason ?? `tanpa-reason: ${error.message}`) : String(error);
  }
}

async function managedEvent(seed: EventSeed = {}): Promise<{ org: string; event: { id: string; slug: string } }> {
  const org = createUser({ fullName: 'Panitia Pendaftaran' });
  const admin = createUser({ role: 'ADMIN' });
  actAs(org);
  await repo.applyAsOrganizer(
    { id: org, fullName: 'Panitia Pendaftaran', email: `${org}@uji` },
    { orgName: `Himpunan ${org.slice(0, 6)}`, website: 'https://himpunan.example', evidence: 'Saya ketua himpunan, lihat https://himpunan.example/pengurus' },
  );
  await repo.reviewOrganizer({ userId: org, decision: 'VERIFIED', reviewerId: admin, note: null });
  const event = createEvent(seed);
  sql(`INSERT INTO public.event_managers (event_id, user_id, source) VALUES ('${event.id}', '${org}', 'ADMIN')`);
  return { org, event };
}

const form = (overrides: Partial<RegistrationFormInput> = {}): RegistrationFormInput => ({
  reviewMode: 'AUTO',
  capacity: null,
  waitlist: true,
  teamSize: null,
  questions: [],
  intro: null,
  confirmationNote: null,
  ...overrides,
});

const submission = (overrides: Partial<RegistrationSubmission> = {}): RegistrationSubmission => ({
  phone: '+6281234567890',
  institution: 'Universitas Integrasi',
  major: null,
  educationLevel: 'D4_S1',
  answers: [],
  teamId: null,
  ...overrides,
});

const actor = (id: string) => ({ id, fullName: 'diabaikan — diambil dari users', email: 'diabaikan@uji' });

beforeEach(() => actAs(null));

describe('SupabaseEventRepository — pendaftaran langsung', () => {
  it('susun → buka → daftar → antre → batal menaikkan antrean; statistik & ringkasan konsisten', async () => {
    const { org, event } = await managedEvent();
    actAs(org);
    expect(await repo.getManagedRegistrationForm(org, event.id)).toBeNull();
    await repo.saveRegistrationForm(
      org,
      event.id,
      form({ capacity: 1, questions: [{ id: 'q1', label: 'Ukuran kaos', kind: 'CHOICE', required: true, options: ['S', 'M'] }], intro: 'Halo!' }),
    );
    expect((await repo.getManagedRegistrationForm(org, event.id))?.status).toBe('DRAFT');
    // DRAFT tidak pernah sampai ke halaman publik, walau yang membuka pengelolanya.
    expect(await repo.getRegistrationForm(event.id)).toBeNull();
    await repo.setRegistrationFormStatus(org, event.id, 'OPEN');

    actAs(null);
    expect(await repo.getRegistrationForm(event.id)).toMatchObject({
      status: 'OPEN',
      capacity: 1,
      intro: 'Halo!',
      questions: [{ id: 'q1', kind: 'CHOICE', required: true, options: ['S', 'M'] }],
    });
    expect([...(await repo.listOpenRegistrationEventIds([event.id, 'bukan-uuid']))]).toEqual([event.id]);

    const first = createUser({ fullName: 'Peserta Pertama' });
    const second = createUser({ fullName: 'Peserta Kedua' });
    actAs(first);
    const ticket = await repo.submitRegistration(
      actor(first),
      event.id,
      submission({ answers: [{ questionId: 'q1', label: 'label palsu dari klien', value: 'M' }] }),
    );
    expect(ticket).toMatchObject({ status: 'CONFIRMED', fullName: 'Peserta Pertama', answers: [{ questionId: 'q1', label: 'Ukuran kaos', value: 'M' }] });
    expect(ticket.code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    expect((await repo.listTrackerItems(first)).find((item) => item.eventId === event.id)?.status).toBe('APPLIED');
    expect(await reason(repo.submitRegistration(actor(first), event.id, submission({ answers: [{ questionId: 'q1', label: '', value: 'M' }] })))).toBe(
      'registration_exists',
    );

    actAs(second);
    expect(await reason(repo.submitRegistration(actor(second), event.id, submission()))).toBe('invalid_registration');
    expect(
      await reason(repo.submitRegistration(actor(second), event.id, submission({ educationLevel: 'SMA_SMK', answers: [{ questionId: 'q1', label: '', value: 'S' }] }))),
    ).toBe('registration_not_eligible');
    const waiting = await repo.submitRegistration(actor(second), event.id, submission({ answers: [{ questionId: 'q1', label: '', value: 'S' }] }));
    expect(waiting).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });
    expect(await repo.getRegistrationSeats(event.id)).toEqual({ capacity: 1, taken: 1, waitlisted: 1 });

    actAs(first);
    await repo.cancelRegistration(first, event.id);
    expect(await reason(repo.cancelRegistration(first, event.id))).toBe('registration_not_found');
    actAs(second);
    expect(await repo.getMyRegistration(second, event.id)).toMatchObject({ status: 'CONFIRMED', waitlistPosition: null });
    expect((await repo.listNotifications(second, 10)).some((notification) => notification.type === 'REGISTRATION_PROMOTED')).toBe(true);

    actAs(org);
    const list = await repo.listRegistrations(org, event.id);
    expect(list.map((entry) => entry.status).sort()).toEqual(['CANCELLED', 'CONFIRMED']);
    const stats = await repo.getRegistrationStats(org, event.id, 14);
    expect(stats.series).toHaveLength(14);
    expect(stats.byStatus).toMatchObject({ CONFIRMED: 1, CANCELLED: 1, PENDING: 0 });
    expect(stats.levels).toEqual([{ label: 'D4/S1', count: 1 }]);
    expect((await repo.listRegistrationSummaries(org, [event.id])).get(event.id)).toEqual({
      status: 'OPEN',
      seats: { capacity: 1, taken: 1, waitlisted: 0 },
      pending: 0,
    });
  });

  it('peninjauan MANUAL: keputusan sampai ke peserta; yang bukan pengelola ditolak jujur', async () => {
    const { org, event } = await managedEvent();
    actAs(org);
    await repo.saveRegistrationForm(org, event.id, form({ reviewMode: 'MANUAL', waitlist: false }));
    await repo.setRegistrationFormStatus(org, event.id, 'OPEN');

    const applicant = createUser({ fullName: 'Pelamar Integrasi' });
    actAs(applicant);
    const mine = await repo.submitRegistration(actor(applicant), event.id, submission());
    expect(mine.status).toBe('PENDING');

    const stranger = createUser();
    actAs(stranger);
    expect(await reason(repo.getManagedRegistrationForm(stranger, event.id))).toBe('not_event_manager');
    expect(await reason(repo.listRegistrations(stranger, event.id))).toBe('not_event_manager');
    expect(await reason(repo.getRegistrationStats(stranger, event.id, 30))).toBe('not_event_manager');
    expect(await reason(repo.saveRegistrationForm(stranger, event.id, form()))).toBe('not_event_manager');
    // Bukan acaranya = "tidak ditemukan": id pendaftaran orang lain tidak bocor.
    expect(await reason(repo.decideRegistration(stranger, mine.id, 'CONFIRM', null))).toBe('registration_not_found');
    expect(await repo.listRegistrationSummaries(stranger, [event.id])).toEqual(new Map());

    actAs(org);
    await repo.decideRegistration(org, mine.id, 'REJECT', 'Kuota divisi penuh.');
    expect(await reason(repo.decideRegistration(org, mine.id, 'REJECT', null))).toBe('registration_invalid_transition');

    actAs(applicant);
    expect(await repo.getMyRegistration(applicant, event.id)).toMatchObject({ status: 'REJECTED', decisionNote: 'Kuota divisi penuh.' });
    expect((await repo.listNotifications(applicant, 10)).find((notification) => notification.type === 'REGISTRATION_REJECTED')?.message).toContain(
      'Kuota divisi penuh.',
    );
    expect(await reason(repo.submitRegistration(actor(applicant), event.id, submission()))).toBe('registration_rejected_before');
  });

  it('pertanyaan yang meminta data sensitif ditolak; acara lewat tenggat tidak bisa dibuka', async () => {
    const { org, event } = await managedEvent({ deadlineInDays: -2 });
    actAs(org);
    expect(
      await reason(repo.saveRegistrationForm(org, event.id, form({ questions: [{ id: 'q1', label: 'Nomor KTP kamu', kind: 'SHORT', required: true, options: [] }] }))),
    ).toBe('invalid_registration_form');
    await repo.saveRegistrationForm(org, event.id, form());
    expect(await reason(repo.setRegistrationFormStatus(org, event.id, 'OPEN'))).toBe('registration_form_unavailable');

    const late = createUser();
    actAs(late);
    expect(await reason(repo.submitRegistration(actor(late), event.id, submission()))).toBe('registration_closed');
    expect(await repo.getMyRegistration(late, event.id)).toBeNull();
  });
});
