import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { RegistrationSubmission } from '@/lib/registration';
import { MemoryEventRepository } from './memory-repository';

/**
 * Pendaftaran langsung di mode seed (ADR-055). Uji paritas sisi SQL ada di
 * supabase/tests/94_registrations.test.sql — keduanya mengunci aturan yang
 * sama dari lib/registration.ts.
 */

const NOW = new Date();
const reason = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof AppError ? error.reason : 'bukan AppError';
  }
};

const student = (id: string, fullName = `Peserta ${id}`) => ({ id, fullName, email: `${id}@contoh.id` });
const answers = (overrides: Partial<RegistrationSubmission> = {}): RegistrationSubmission => ({
  phone: '+6281234567890',
  institution: 'Universitas Contoh',
  major: 'Statistika',
  educationLevel: 'D4_S1',
  answers: [],
  teamId: null,
  ...overrides,
});

async function eventIdOf(repo: MemoryEventRepository, prefix: string) {
  const page = await repo.listEvents({ pageSize: 48 });
  const event = page.items.find((item) => item.title.startsWith(prefix));
  if (!event) throw new Error(`acara ${prefix} tidak ada di data contoh`);
  return event.id;
}

describe('pendaftaran langsung — peserta', () => {
  it('formulir contoh tayang, beasiswa sengaja tanpa formulir', async () => {
    const repo = new MemoryEventRepository(NOW);
    const conference = await eventIdOf(repo, 'Konferensi Mahasiswa Kesehatan');
    const scholarship = await eventIdOf(repo, 'Beasiswa Unggulan');
    expect((await repo.getRegistrationForm(conference))?.status).toBe('OPEN');
    expect(await repo.getRegistrationForm(scholarship)).toBeNull();
    expect([...(await repo.listOpenRegistrationEventIds([conference, scholarship]))]).toEqual([conference]);
  });

  it('daftar → tiket berkode, pelacak "Sudah daftar"; dobel ditolak; batal lalu daftar ulang memakai kode yang sama', async () => {
    const repo = new MemoryEventRepository(NOW);
    const eventId = await eventIdOf(repo, 'Konferensi Mahasiswa Kesehatan');
    const form = (await repo.getRegistrationForm(eventId))!;
    const input = answers({ answers: [{ questionId: 'q1', label: form.questions[0]!.label, value: form.questions[0]!.options[0]! }] });

    const first = await repo.submitRegistration(student('u1'), eventId, input);
    expect(first.status).toBe('CONFIRMED');
    expect(first.code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    expect((await repo.listTrackerItems('u1')).find((item) => item.eventId === eventId)?.status).toBe('APPLIED');
    expect(await reason(repo.submitRegistration(student('u1'), eventId, input))).toBe('registration_exists');

    await repo.cancelRegistration('u1', eventId);
    expect((await repo.getMyRegistration('u1', eventId))?.status).toBe('CANCELLED');
    const again = await repo.submitRegistration(student('u1'), eventId, input);
    expect(again.code).toBe(first.code);
    expect(again.status).toBe('CONFIRMED');
  });

  it('jenjang di luar ketentuan ditolak dengan alasan yang jelas', async () => {
    const repo = new MemoryEventRepository(NOW);
    const eventId = await eventIdOf(repo, 'Konferensi Mahasiswa Kesehatan');
    expect(await reason(repo.submitRegistration(student('u2'), eventId, answers({ educationLevel: 'SMA_SMK' })))).toBe('registration_not_eligible');
  });

  it('kuota penuh → daftar tunggu; kursi lepas → antrean naik FIFO dan dikabari', async () => {
    const repo = new MemoryEventRepository(NOW);
    const eventId = await eventIdOf(repo, 'Workshop Analisis Data dengan Python');
    const seats = await repo.getRegistrationSeats(eventId);
    expect(seats.capacity).toBe(40);
    expect(seats.taken).toBe(40);

    const waiting = await repo.submitRegistration(student('late'), eventId, answers({ answers: [{ questionId: 'q1', label: 'OS', value: 'Linux' }] }));
    expect(waiting.status).toBe('WAITLISTED');
    expect(waiting.waitlistPosition).toBe(seats.waitlisted + 1);

    // Satu pemegang kursi (data contoh) membatalkan → orang PERTAMA di antrean naik, bukan yang terakhir.
    let holder: string | null = null;
    for (let index = 0; index < 60 && !holder; index += 1) {
      const candidate = `seed-registrant-${eventId.slice(-4)}-${index}`;
      if ((await repo.getMyRegistration(candidate, eventId))?.status === 'CONFIRMED') holder = candidate;
    }
    await repo.cancelRegistration(holder!, eventId);
    const after = await repo.getMyRegistration('late', eventId);
    expect(after?.status).toBe(seats.waitlisted === 0 ? 'CONFIRMED' : 'WAITLISTED');
    expect(after?.waitlistPosition).toBe(seats.waitlisted === 0 ? null : seats.waitlisted);
    expect((await repo.getRegistrationSeats(eventId)).taken).toBe(40);
  });

  it('mode tim: wajib tim yang kamu ketuai dengan ukuran sesuai ketentuan', async () => {
    const repo = new MemoryEventRepository(NOW);
    const eventId = await eventIdOf(repo, 'Kompetisi Inovasi Perangkat Lunak');
    const form = (await repo.getRegistrationForm(eventId))!;
    expect(form.teamSize).toEqual({ min: 2, max: 4 });
    const required = form.questions
      .filter((question) => question.required)
      .map((question) => ({ questionId: question.id, label: question.label, value: question.options[0] ?? 'Antrean puskesmas' }));

    const teamId = await repo.createTeam({ eventId, title: 'Tim Uji Pendaftaran', description: null, slotsNeeded: 3, createdBy: 'lead', createdByName: 'Ketua Uji' });
    // Baru ketua seorang diri: di bawah minimal 2.
    expect(await reason(repo.submitRegistration(student('lead'), eventId, answers({ answers: required, teamId })))).toBe('registration_team_invalid');
    await repo.joinTeam('member', 'Anggota Uji', teamId);
    // Anggota biasa tidak bisa mendaftarkan tim.
    expect(await reason(repo.submitRegistration(student('member'), eventId, answers({ answers: required, teamId })))).toBe('registration_team_invalid');

    const registered = await repo.submitRegistration(student('lead', 'Ketua Uji'), eventId, answers({ answers: required, teamId }));
    expect(registered.status).toBe('PENDING');
    expect(registered.team).toEqual({ id: teamId, title: 'Tim Uji Pendaftaran', members: ['Ketua Uji', 'Anggota Uji'] });
  });
});

describe('pendaftaran langsung — studio penyelenggara', () => {
  const organizer = { id: 'org-1', fullName: 'Sekar Ayu', email: 'org@contoh.id' };

  it('hanya pengelola terverifikasi yang bisa membaca & memutuskan', async () => {
    const repo = new MemoryEventRepository(NOW);
    repo.seedDemoOrganizer(organizer, NOW);
    const eventId = await eventIdOf(repo, 'Program Magang Analis Data');
    expect(await reason(repo.listRegistrations('orang-lain', eventId))).toBe('not_event_manager');
    expect(await reason(repo.getManagedRegistrationForm('orang-lain', eventId))).toBe('not_event_manager');
    expect((await repo.listRegistrations(organizer.id, eventId)).length).toBeGreaterThan(10);
  });

  it('keputusan: konfirmasi PENDING, tolak dengan catatan → peserta dikabari; transisi tak sah ditolak', async () => {
    const repo = new MemoryEventRepository(NOW);
    repo.seedDemoOrganizer(organizer, NOW);
    const eventId = await eventIdOf(repo, 'Program Magang Analis Data');
    const form = (await repo.getManagedRegistrationForm(organizer.id, eventId))!;
    const mine = await repo.submitRegistration(
      student('pelamar'),
      eventId,
      answers({ answers: form.questions.map((question) => ({ questionId: question.id, label: question.label, value: question.kind === 'URL' ? 'https://cv.contoh' : (question.options[0] ?? 'Saya suka data.') })) }),
    );
    expect(mine.status).toBe('PENDING');

    await repo.decideRegistration(organizer.id, mine.id, 'REJECT', 'Kuota divisi sudah penuh.');
    expect((await repo.getMyRegistration('pelamar', eventId))?.decisionNote).toBe('Kuota divisi sudah penuh.');
    const notifications = await repo.listNotifications('pelamar', 10);
    expect(notifications[0]?.type).toBe('REGISTRATION_REJECTED');
    expect(await reason(repo.decideRegistration(organizer.id, mine.id, 'REJECT', null))).toBe('registration_invalid_transition');
    expect(await reason(repo.submitRegistration(student('pelamar'), eventId, answers()))).toBe('registration_rejected_before');

    await repo.decideRegistration(organizer.id, mine.id, 'REOPEN', null);
    await repo.decideRegistration(organizer.id, mine.id, 'CONFIRM', null);
    expect((await repo.getMyRegistration('pelamar', eventId))?.status).toBe('CONFIRMED');
  });

  it('simpan formulir baru, buka hanya untuk acara tayang, ringkasan studio & statistik konsisten', async () => {
    const repo = new MemoryEventRepository(NOW);
    repo.seedDemoOrganizer(organizer, NOW);
    const scholarship = await eventIdOf(repo, 'Beasiswa Unggulan');
    expect(await repo.getManagedRegistrationForm(organizer.id, scholarship)).toBeNull();

    await repo.saveRegistrationForm(organizer.id, scholarship, {
      reviewMode: 'MANUAL',
      capacity: 10,
      waitlist: true,
      teamSize: null,
      questions: [{ id: 'q1', label: 'Ringkasan prestasi', kind: 'LONG', required: true, options: [] }],
      intro: null,
      confirmationNote: null,
    });
    expect(await repo.getRegistrationForm(scholarship)).toBeNull();
    await repo.setRegistrationFormStatus(organizer.id, scholarship, 'OPEN');
    expect((await repo.getRegistrationForm(scholarship))?.status).toBe('OPEN');

    const managed = await repo.listManagedEvents(organizer.id);
    const summaries = await repo.listRegistrationSummaries(organizer.id, managed.map((entry) => entry.event.id));
    expect(summaries.get(scholarship)).toEqual({ status: 'OPEN', seats: { capacity: 10, taken: 0, waitlisted: 0 }, pending: 0 });

    const expired = managed.find((entry) => entry.event.status === 'EXPIRED');
    if (expired) {
      await repo.saveRegistrationForm(organizer.id, expired.event.id, {
        reviewMode: 'AUTO',
        capacity: null,
        waitlist: false,
        teamSize: null,
        questions: [],
        intro: null,
        confirmationNote: null,
      });
      expect(await reason(repo.setRegistrationFormStatus(organizer.id, expired.event.id, 'OPEN'))).toBe('registration_form_unavailable');
    }

    const magang = await eventIdOf(repo, 'Program Magang Analis Data');
    const stats = await repo.getRegistrationStats(organizer.id, magang, 30);
    const listed = await repo.listRegistrations(organizer.id, magang);
    expect(Object.values(stats.byStatus).reduce((sum, value) => sum + value, 0)).toBe(listed.length);
    expect(stats.series).toHaveLength(30);
    expect(stats.visitors).toBeGreaterThan(0);
  });
});
