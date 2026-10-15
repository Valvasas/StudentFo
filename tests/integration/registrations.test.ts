import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import type { EventActor } from '@/lib/data/repository';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import type { RegistrationFormInput } from '@/lib/registration-form';
import { actAs, createEvent, createUser, sql } from './harness';

/**
 * Formulir internal, pendaftaran, dan pembayaran (ADR-056) lewat PostgREST
 * sungguhan: hak per kolom, policy terpisah anon/authenticated, RPC DEFINER
 * berkomposit, dan penyaringan RLS untuk UPDATE yang "berhasil" tanpa baris.
 * Berkas Storage tidak ada di tumpukan uji ini — unggah bukti/foto diuji di
 * mode seed dan lewat `94_registrations.test.sql` untuk sisi database.
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

const actor = (id: string): EventActor => ({ id, fullName: 'Uji', email: `${id}@uji.example`, isAdmin: false });

const form = (overrides: Partial<RegistrationFormInput> = {}): RegistrationFormInput => ({
  isOpen: true,
  intro: null,
  fields: [{ id: 'f_hp', type: 'phone', label: 'Nomor WhatsApp', help: null, required: true, options: [] }],
  capacity: null,
  feeAmount: null,
  paymentInstructions: null,
  ...overrides,
});

async function managedEvent(): Promise<{ organizer: string; eventId: string; slug: string }> {
  const organizer = createUser({ fullName: 'Panitia Formulir' });
  const admin = createUser({ role: 'ADMIN' });
  const event = createEvent();
  actAs(organizer);
  await repo.applyAsOrganizer({ id: organizer, fullName: 'Panitia Formulir', email: 'p@uji' }, {
    orgName: `Himpunan ${event.id.slice(0, 6)}`,
    website: 'https://himpunan.example',
    evidence: 'Saya ketua himpunan, lihat https://himpunan.example/pengurus',
  });
  await repo.reviewOrganizer({ userId: organizer, decision: 'VERIFIED', reviewerId: admin, note: null });
  sql(`INSERT INTO public.event_managers (event_id, user_id, source) VALUES ('${event.id}', '${organizer}', 'ADMIN')`);
  return { organizer, eventId: event.id, slug: event.slug };
}

beforeEach(() => actAs(null));

describe('SupabaseEventRepository — formulir pendaftaran', () => {
  it('hanya pengelola yang menyimpan; simpan kedua memperbarui; tamu membaca formulir acara tayang', async () => {
    const { organizer, eventId } = await managedEvent();
    const stranger = createUser();
    actAs(stranger);
    expect(await reason(repo.saveRegistrationForm(actor(stranger), eventId, form()))).toBe('not_event_manager');

    actAs(organizer);
    await repo.saveRegistrationForm(actor(organizer), eventId, form());
    await repo.saveRegistrationForm(actor(organizer), eventId, form({ capacity: 50, intro: 'Halo peserta' }));

    actAs(null);
    const publicForm = await repo.getRegistrationForm(eventId);
    expect(publicForm).toMatchObject({ isOpen: true, capacity: 50, intro: 'Halo peserta', activeCount: 0 });
    expect(publicForm?.fields.map((field) => field.id)).toEqual(['f_hp']);

    actAs(stranger);
    expect(await reason(repo.saveRegistrationForm(actor(stranger), eventId, form({ isOpen: false })))).toBe('not_event_manager');
    expect((await repo.getRegistrationForm(eventId))?.isOpen).toBe(true);
  });

  it('berbayar tanpa instruksi ditolak database', async () => {
    const { organizer, eventId } = await managedEvent();
    actAs(organizer);
    expect(await reason(repo.saveRegistrationForm(actor(organizer), eventId, form({ feeAmount: 50000 })))).toBe(
      'invalid_registration_form',
    );
  });
});

describe('SupabaseEventRepository — pendaftaran & pembayaran', () => {
  it('gratis: terkonfirmasi, papan maju, ganda & kuota ditolak, batal membuka kuota', async () => {
    const { organizer, eventId } = await managedEvent();
    actAs(organizer);
    await repo.saveRegistrationForm(actor(organizer), eventId, form({ capacity: 1 }));

    const first = createUser({ fullName: 'Peserta Pertama' });
    actAs(first);
    const registration = await repo.registerForEvent(actor(first), eventId, { f_hp: '081234567890' });
    expect(registration).toMatchObject({ status: 'CONFIRMED', fullName: 'Peserta Pertama', feeAmount: null });
    expect(registration.code).toMatch(/^SF-[0-9A-F]{8}$/);
    expect(registration.event.id).toBe(eventId);
    expect((await repo.listTrackerItems(first)).find((item) => item.eventId === eventId)?.status).toBe('APPLIED');
    expect(await reason(repo.registerForEvent(actor(first), eventId, {}))).toBe('registration_exists');

    const second = createUser();
    actAs(second);
    expect(await reason(repo.registerForEvent(actor(second), eventId, {}))).toBe('registration_full');
    expect(await repo.getRegistration(actor(second), registration.id)).toBeNull();

    actAs(first);
    await repo.cancelRegistration(actor(first), registration.id);
    expect(await repo.getMyRegistration(first, eventId)).toBeNull();
    actAs(second);
    expect((await repo.registerForEvent(actor(second), eventId, {})).status).toBe('CONFIRMED');
  });

  it('berbayar: menunggu → panitia tandai lunas; tolak bukti hanya saat diperiksa; peserta dikabari', async () => {
    const { organizer, eventId } = await managedEvent();
    actAs(organizer);
    await repo.saveRegistrationForm(
      actor(organizer),
      eventId,
      form({ feeAmount: 75000, paymentInstructions: 'BCA 1234567890 a.n. Panitia Uji' }),
    );

    const participant = createUser({ fullName: 'Peserta Bayar' });
    actAs(participant);
    const registration = await repo.registerForEvent(actor(participant), eventId, { f_hp: '081234567890' });
    expect(registration).toMatchObject({ status: 'AWAITING_PAYMENT', feeAmount: 75000 });
    expect((await repo.listMyRegistrations(participant)).map((entry) => entry.id)).toEqual([registration.id]);

    actAs(organizer);
    const listed = await repo.listEventRegistrations(actor(organizer), eventId);
    expect(listed.map((entry) => entry.email)).toEqual([`${participant}@uji.example`]);
    expect(await repo.listRegistrationStats(actor(organizer), [eventId])).toEqual([
      { eventId, total: 1, confirmed: 0, awaitingPayment: 1, paymentReview: 0, recent: 1 },
    ]);
    expect(await reason(repo.reviewRegistration(actor(organizer), registration.id, 'reject_payment', 'Kurang'))).toBe(
      'registration_invalid_transition',
    );
    expect(await reason(repo.reviewRegistration(actor(organizer), registration.id, 'reject', null))).toBe('review_note_required');
    await repo.reviewRegistration(actor(organizer), registration.id, 'confirm', null);

    actAs(participant);
    expect((await repo.getRegistration(actor(participant), registration.id))?.status).toBe('CONFIRMED');
    expect((await repo.listNotifications(participant, 10)).some((entry) => entry.type === 'REGISTRATION_CONFIRMED')).toBe(true);
    expect(await repo.getPaymentProof(actor(participant), registration.id)).toBeNull();
  });

  it('orang luar tidak melihat pendaftar maupun statistik acara', async () => {
    const { organizer, eventId } = await managedEvent();
    actAs(organizer);
    await repo.saveRegistrationForm(actor(organizer), eventId, form());
    const participant = createUser();
    actAs(participant);
    await repo.registerForEvent(actor(participant), eventId, {});

    const stranger = createUser();
    actAs(stranger);
    expect(await repo.listEventRegistrations(actor(stranger), eventId)).toEqual([]);
    expect(await repo.listRegistrationStats(actor(stranger), [eventId])).toEqual([]);
    expect(await reason(repo.reviewRegistration(actor(stranger), (await repo.listMyRegistrations(participant))[0]?.id ?? '', 'confirm', null))).toBe(
      'registration_not_found',
    );
  });

  it('formulir tertutup atau acara belum tayang menolak pendaftaran', async () => {
    const { organizer, eventId } = await managedEvent();
    actAs(organizer);
    await repo.saveRegistrationForm(actor(organizer), eventId, form({ isOpen: false }));
    const participant = createUser();
    actAs(participant);
    expect(await reason(repo.registerForEvent(actor(participant), eventId, {}))).toBe('registration_closed');
    expect(await reason(repo.registerForEvent(actor(participant), createEvent({ status: 'PENDING' }).id, {}))).toBe(
      'registration_closed',
    );
  });
});

describe('SupabaseEventRepository — galeri', () => {
  it('foto acara tayang terbaca tamu tanpa kolom pengunggah', async () => {
    const { eventId } = await managedEvent();
    sql(`INSERT INTO public.event_photos (event_id, storage_path, content_type, width, height, caption)
         VALUES ('${eventId}', '${eventId}/00000000-0000-4000-8000-0000000000f1.jpg', 'image/jpeg', 1200, 800, 'Final 2025')`);
    actAs(null);
    const photos = await repo.listEventPhotos(eventId);
    expect(photos).toEqual([
      expect.objectContaining({ eventId, width: 1200, height: 800, caption: 'Final 2025' }),
    ]);
    expect(Object.keys(photos[0] ?? {})).not.toContain('uploadedBy');
  });
});
