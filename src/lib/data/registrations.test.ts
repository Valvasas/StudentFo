import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { UploadedImage } from '@/lib/image-file';
import type { RegistrationFormInput } from '@/lib/registration-form';
import { DEMO_MEDIA_BYTE_LIMIT, MemoryEventRepository } from './memory-repository';
import type { EventActor } from './repository';
import { SEED_EVENTS } from './seed-data';

/**
 * Cermin supabase/tests/94_registrations.test.sql dan
 * tests/integration/registrations.test.ts di mode seed (ADR-056): mode demo
 * tidak boleh lebih longgar dari produksi soal hak, transisi, kuota, dan galeri.
 */
const idOf = (slug: string) => {
  const event = SEED_EVENTS.find((seed) => seed.slug === slug);
  if (!event) throw new Error(`seed ${slug} tidak ada`);
  return event.id;
};
/** Acara tanpa formulir contoh — data demo hanya memberi formulir ke dua acara (lihat SEEDED_EVENT). */
const FREE_EVENT = idOf('program-magang-analis-data-kuartal-ii');
const SEEDED_EVENT = idOf('kompetisi-inovasi-perangkat-lunak-nusantara-2026');
const OTHER_EVENT = idOf('beasiswa-unggulan-bakti-pendidikan-2026');
const PENDING_EVENT = idOf('seminar-nasional-teknologi-pangan-menunggu-review');

const person = (id: string, isAdmin = false): EventActor => ({ id, fullName: `Nama ${id}`, email: `${id}@uji.example`, isAdmin });
const admin = person('admin', true);
const ana = person('ana');
const budi = person('budi');

const form = (overrides: Partial<RegistrationFormInput> = {}): RegistrationFormInput => ({
  isOpen: true,
  intro: null,
  fields: [{ id: 'f_hp', type: 'phone', label: 'Nomor WhatsApp', help: null, required: true, options: [] }],
  capacity: null,
  feeAmount: null,
  paymentInstructions: null,
  ...overrides,
});

const image = (bytes = 1024): UploadedImage => ({ type: 'image/png', width: 640, height: 480, bytes: new Uint8Array(bytes) });

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

describe('MemoryEventRepository — formulir & pendaftaran', () => {
  let repository: MemoryEventRepository;

  beforeEach(() => {
    repository = new MemoryEventRepository(new Date());
  });

  it('hanya pengelola/admin yang menyimpan formulir', async () => {
    expect(await reason(repository.saveRegistrationForm(ana, FREE_EVENT, form()))).toBe('not_event_manager');
    await repository.saveRegistrationForm(admin, FREE_EVENT, form({ capacity: 2 }));
    expect(await repository.getRegistrationForm(FREE_EVENT)).toMatchObject({ isOpen: true, capacity: 2, activeCount: 0 });
  });

  it('gratis terkonfirmasi + papan maju; ganda & kuota ditolak; batal membuka kuota', async () => {
    await repository.saveRegistrationForm(admin, FREE_EVENT, form({ capacity: 1 }));
    const registration = await repository.registerForEvent(ana, FREE_EVENT, { f_hp: '0812345678' });
    expect(registration).toMatchObject({ status: 'CONFIRMED', fullName: 'Nama ana', feeAmount: null });
    expect(registration.code).toMatch(/^SF-[0-9A-F]{8}$/);
    expect((await repository.listTrackerItems('ana')).find((item) => item.eventId === FREE_EVENT)?.status).toBe('APPLIED');
    expect(await reason(repository.registerForEvent(ana, FREE_EVENT, {}))).toBe('registration_exists');
    expect(await reason(repository.registerForEvent(budi, FREE_EVENT, {}))).toBe('registration_full');

    await repository.cancelRegistration(ana, registration.id);
    expect(await repository.getMyRegistration('ana', FREE_EVENT)).toBeNull();
    expect((await repository.registerForEvent(budi, FREE_EVENT, {})).status).toBe('CONFIRMED');
  });

  it('pendaftaran yang sudah maju di papan tidak dimundurkan', async () => {
    await repository.saveRegistrationForm(admin, FREE_EVENT, form());
    await repository.upsertTrackerItem('ana', FREE_EVENT, 'INTERVIEW');
    await repository.registerForEvent(ana, FREE_EVENT, {});
    expect((await repository.listTrackerItems('ana')).find((item) => item.eventId === FREE_EVENT)?.status).toBe('INTERVIEW');
  });

  it('formulir tutup & acara belum tayang menolak', async () => {
    await repository.saveRegistrationForm(admin, FREE_EVENT, form({ isOpen: false }));
    expect(await reason(repository.registerForEvent(ana, FREE_EVENT, {}))).toBe('registration_closed');
    expect(await reason(repository.registerForEvent(ana, OTHER_EVENT, {}))).toBe('registration_closed');
    expect(await reason(repository.saveRegistrationForm(admin, PENDING_EVENT, form()).then(() =>
      repository.registerForEvent(ana, PENDING_EVENT, {}),
    ))).toBe('registration_closed');
  });

  it('alur bayar: bukti → tolak (catatan wajib) → bukti ulang → konfirmasi; bukti lama dibuang', async () => {
    await repository.saveRegistrationForm(admin, FREE_EVENT, form({ feeAmount: 75000, paymentInstructions: 'BCA 123 a.n. Panitia' }));
    const registration = await repository.registerForEvent(ana, FREE_EVENT, {});
    expect(registration.status).toBe('AWAITING_PAYMENT');

    expect(await reason(repository.submitPaymentProof(budi, registration.id, image()))).toBe('registration_not_found');
    await repository.submitPaymentProof(ana, registration.id, image(10));
    expect((await repository.getPaymentProof(ana, registration.id))?.bytes.length).toBe(10);
    expect(await repository.getPaymentProof(budi, registration.id)).toBeNull();
    expect((await repository.getPaymentProof(admin, registration.id))?.contentType).toBe('image/png');

    expect(await reason(repository.reviewRegistration(budi, registration.id, 'confirm', null))).toBe('registration_not_found');
    expect(await reason(repository.reviewRegistration(admin, registration.id, 'reject_payment', null))).toBe('review_note_required');
    await repository.reviewRegistration(admin, registration.id, 'reject_payment', 'Nominal kurang');
    expect(await repository.getRegistration(ana, registration.id)).toMatchObject({ status: 'AWAITING_PAYMENT', reviewNote: 'Nominal kurang' });
    expect((await repository.listNotifications('ana', 10)).some((entry) => entry.type === 'PAYMENT_REJECTED')).toBe(true);

    await repository.submitPaymentProof(ana, registration.id, image(20));
    expect((await repository.getPaymentProof(ana, registration.id))?.bytes.length).toBe(20);
    await repository.reviewRegistration(admin, registration.id, 'confirm', null);
    expect((await repository.getRegistration(ana, registration.id))?.status).toBe('CONFIRMED');
    expect(await reason(repository.submitPaymentProof(ana, registration.id, image()))).toBe('registration_invalid_transition');
  });

  it('pengelola melihat pendaftar & statistik; orang luar tidak', async () => {
    await repository.saveRegistrationForm(admin, FREE_EVENT, form());
    await repository.registerForEvent(ana, FREE_EVENT, {});
    expect((await repository.listEventRegistrations(admin, FREE_EVENT)).map((entry) => entry.email)).toEqual(['ana@uji.example']);
    expect(await repository.listEventRegistrations(budi, FREE_EVENT)).toEqual([]);
    expect(await repository.listRegistrationStats(budi, [FREE_EVENT])).toEqual([]);
    expect(await repository.listRegistrationStats(admin, [FREE_EVENT])).toEqual([
      { eventId: FREE_EVENT, total: 1, confirmed: 1, awaitingPayment: 0, paymentReview: 0, recent: 1 },
    ]);
  });

  it('persona Penyelenggara mendapat formulir, pendaftar, dan bukti contoh', async () => {
    const organizer = { id: 'org', fullName: 'Sekar', email: 'org@demo' };
    repository.seedDemoOrganizer(organizer);
    const managed = await repository.listManagedEvents('org');
    const paid = managed.find(({ event }) => event.isFree === false)?.event;
    expect(paid).toBeDefined();
    const actor = person('org');
    const registrations = await repository.listEventRegistrations(actor, paid!.id);
    const inReview = registrations.find((entry) => entry.status === 'PAYMENT_REVIEW');
    expect(inReview).toBeDefined();
    expect((await repository.getPaymentProof(actor, inReview!.id))?.contentType).toBe('image/png');
    expect((await repository.getRegistrationForm(SEEDED_EVENT))?.fields.length).toBeGreaterThan(0);
  });
});

describe('MemoryEventRepository — galeri', () => {
  let repository: MemoryEventRepository;

  beforeEach(() => {
    repository = new MemoryEventRepository(new Date());
  });

  it('hanya pengelola mengunggah; maks 30; berkas publik hanya untuk acara tayang', async () => {
    expect(await reason(repository.addEventPhotos(ana, FREE_EVENT, [image()], null))).toBe('not_event_manager');
    expect(await repository.addEventPhotos(admin, FREE_EVENT, Array.from({ length: 30 }, () => image()), 'Final')).toBe(30);
    expect(await reason(repository.addEventPhotos(admin, FREE_EVENT, [image()], null))).toBe('gallery_full');

    const [photo] = await repository.listEventPhotos(FREE_EVENT);
    expect(photo).toMatchObject({ width: 640, height: 480, caption: 'Final' });
    expect(await repository.getEventPhotoFile(photo!.id)).not.toBeNull();

    await repository.addEventPhotos(admin, PENDING_EVENT, [image()], null);
    const [hidden] = await repository.listEventPhotos(PENDING_EVENT);
    expect(await repository.getEventPhotoFile(hidden!.id)).toBeNull();

    expect(await reason(repository.deleteEventPhoto(ana, photo!.id))).toBe('photo_not_found');
    await repository.deleteEventPhoto(admin, photo!.id);
    expect(await repository.getEventPhotoFile(photo!.id)).toBeNull();
  });

  it('total berkas di memori dibatasi supaya server pratinjau tidak dibanjiri', async () => {
    const big = image(DEMO_MEDIA_BYTE_LIMIT / 2 + 1);
    await repository.addEventPhotos(admin, FREE_EVENT, [big], null);
    expect(await reason(repository.addEventPhotos(admin, OTHER_EVENT, [big], null))).toBe('gallery_full');
  });

  it('kiriman yang tidak muat ditolak utuh — tidak ada foto yang setengah tersimpan', async () => {
    const big = image(DEMO_MEDIA_BYTE_LIMIT / 2 + 1);
    expect(await reason(repository.addEventPhotos(admin, FREE_EVENT, [big, big], null))).toBe('gallery_full');
    expect(await repository.listEventPhotos(FREE_EVENT)).toEqual([]);
    expect(await repository.addEventPhotos(admin, FREE_EVENT, [big], null)).toBe(1);
  });

  it('memori penuh saat unggah bukti bayar tidak dilaporkan sebagai galeri penuh', async () => {
    await repository.saveRegistrationForm(admin, FREE_EVENT, form({ feeAmount: 75000, paymentInstructions: 'BCA 123 a.n. Panitia' }));
    const registration = await repository.registerForEvent(ana, FREE_EVENT, {});
    const big = image(DEMO_MEDIA_BYTE_LIMIT / 2 + 1);
    await repository.addEventPhotos(admin, OTHER_EVENT, [big], null);
    const failure = await repository.submitPaymentProof(ana, registration.id, big).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).reason).toBeUndefined();
    expect(await repository.getRegistration(ana, registration.id)).toMatchObject({ status: 'AWAITING_PAYMENT' });
  });
});
