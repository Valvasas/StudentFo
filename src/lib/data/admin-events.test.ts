import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { SubmissionPayload } from '@/types/domain';
import { MemoryEventRepository } from './memory-repository';
import type { EventActor } from './repository';

/**
 * "Buat acara StudentFo" (ADR-093) di mode seed — skenario yang sama dengan
 * supabase/tests/121_admin_create_event.test.sql.
 */
const admin: EventActor = { id: 'admin-1', fullName: 'Admin Pembuat', email: 'admin@studentfo.test', isAdmin: true };
const member: EventActor = { id: 'anggota-1', fullName: 'Anggota Biasa', email: 'anggota@studentfo.test', isAdmin: false };

function payload(overrides: Partial<SubmissionPayload> = {}): SubmissionPayload {
  return {
    title: 'Lomba Esai StudentFo 2027',
    organizer: 'StudentFo',
    description: 'Lomba internal untuk pelajar SMA dan mahasiswa.',
    eventType: 'LOMBA',
    registrationLink: 'https://studentfo.test/events',
    sourceUrl: null,
    educationLevels: ['SMA_SMK', 'D4_S1'],
    categorySlugs: ['sosial'],
    location: null,
    isOnline: true,
    deadlineAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    stages: [{ label: 'announcement', deadlineAt: new Date(Date.now() + 40 * 86_400_000).toISOString() }],
    isFree: true,
    priceAmount: null,
    guidebookUrl: null,
    organizerContact: null,
    proofLink: null,
    registrationMode: 'studentfo',
    ...overrides,
  };
}

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

describe('MemoryEventRepository.createEventAsAdmin', () => {
  it('admin: langsung tayang sebagai lomba mandiri, lengkap dengan tahapan, tercatat di riwayat', async () => {
    const repository = new MemoryEventRepository();
    const { id, slug } = await repository.createEventAsAdmin(admin, payload());

    const event = await repository.getEventBySlug(slug);
    expect(event).toMatchObject({ id, status: 'APPROVED', registrationMode: 'studentfo', organizer: 'StudentFo', isFree: true });
    expect(event?.deadlines.map((deadline) => deadline.label)).toEqual(['registration', 'announcement']);
    // Tanpa antrean: tidak ada kiriman baru yang menunggu.
    expect(await repository.listSubmissions('PENDING', 50)).toHaveLength((await new MemoryEventRepository().listSubmissions('PENDING', 50)).length);
    const [latest] = await repository.listModerationLog(5);
    expect(latest).toMatchObject({ subjectId: id, toStatus: 'APPROVED', fromStatus: null });
  });

  it('bukan admin ditolak; judul + penyelenggara yang sama ditolak sebagai duplikat', async () => {
    const repository = new MemoryEventRepository();
    expect(await reason(repository.createEventAsAdmin(member, payload()))).toBe('not_event_manager');
    await repository.createEventAsAdmin(admin, payload());
    expect(await reason(repository.createEventAsAdmin(admin, payload()))).toBe('submission_duplicate');
  });

  it('tautan luar tetap tautan luar; admin bisa langsung menyusun formulirnya', async () => {
    const repository = new MemoryEventRepository();
    const external = await repository.createEventAsAdmin(admin, payload({ title: 'Webinar Karier Internal', registrationMode: undefined }));
    expect((await repository.getEventBySlug(external.slug))?.registrationMode).toBe('external');

    const internal = await repository.createEventAsAdmin(admin, payload({ title: 'Lomba Poster Internal' }));
    await repository.saveRegistrationForm(admin, internal.id, {
      isOpen: false,
      intro: null,
      fields: [{ id: 'f1', type: 'short_text', label: 'Nama tim', help: null, required: true, options: [] }],
      capacity: null,
      feeAmount: null,
      paymentInstructions: null,
    });
    expect(await repository.getRegistrationForm(internal.id)).toMatchObject({ isOpen: false, fields: [{ label: 'Nama tim' }] });
  });
});
