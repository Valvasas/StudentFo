import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateBadges, type AchievementFacts } from '@/lib/achievements';
import type { RegistrationFormInput } from '@/lib/registration-form';
import { MemoryEventRepository } from './memory-repository';
import type { EventActor } from './repository';
import { SEED_EVENTS } from './seed-data';

/**
 * Lencana di atas repository sungguhan mode seed (ADR-068): bentuk
 * `EventRegistration.event` yang dibaca lencana, seed persona Mahasiswa,
 * dan jalur "daftar → batal" yang tidak boleh menyisakan hitungan.
 */
const idOf = (slug: string) => {
  const event = SEED_EVENTS.find((seed) => seed.slug === slug);
  if (!event) throw new Error(`seed ${slug} tidak ada`);
  return event.id;
};

const admin: EventActor = { id: 'admin', fullName: 'Admin', email: 'admin@uji.example', isAdmin: true };
const dinda = { id: 'dinda', fullName: 'Dinda Pratiwi', email: 'dinda@uji.example' };
const dindaActor: EventActor = { ...dinda, isAdmin: false };

const freeForm: RegistrationFormInput = {
  isOpen: true,
  intro: null,
  fields: [],
  capacity: null,
  feeAmount: null,
  paymentInstructions: null,
};

async function factsOf(repository: MemoryEventRepository, userId: string): Promise<AchievementFacts> {
  const registrations = await repository.listMyRegistrations(userId);
  return {
    registrations: registrations.map((registration) => ({
      eventId: registration.event.id,
      eventType: registration.event.eventType,
      eventStatus: registration.event.status,
      deadlineAt: registration.event.primaryDeadlineAt,
      status: registration.status,
      confirmedAt: registration.reviewedAt ?? registration.createdAt,
    })),
    managedEventIds: [],
    approvedSubmissions: 0,
    organizerStatus: null,
    organizerReviewedAt: null,
    hostedEventClosedAt: [],
  };
}

const tierOf = (facts: AchievementFacts, key: string, now: Date) => evaluateBadges(facts, now).find((item) => item.definition.key === key)?.tier;

describe('lencana × MemoryEventRepository', () => {
  const now = new Date();
  let repository: MemoryEventRepository;

  beforeEach(() => {
    repository = new MemoryEventRepository(now);
  });

  it('pendaftaran membawa jenis & status acara; acara yang tidak tayang terbaca null (cermin RLS events_listing)', async () => {
    repository.seedDemoParticipation(dinda, now);
    const registrations = await repository.listMyRegistrations(dinda.id);
    const lomba = registrations.find((registration) => registration.event.id === idOf('lomba-desain-ui-ux-nasional-edisi-lalu'));
    expect(lomba?.event).toMatchObject({ eventType: 'LOMBA', status: 'EXPIRED' });
  });

  it('seed persona Mahasiswa: lomba & workshop terhitung, beasiswa yang ditolak tidak', async () => {
    repository.seedDemoParticipation(dinda, now);
    repository.seedDemoParticipation(dinda, now);
    const facts = await factsOf(repository, dinda.id);
    expect(facts.registrations).toHaveLength(3);
    expect(tierOf(facts, 'kompetitor', now)).toBe(1);
    expect(tierOf(facts, 'pembelajar', now)).toBe(1);
    expect(tierOf(facts, 'penjelajah', now)).toBe(1);
  });

  it('daftar → terkonfirmasi (acara gratis) → batal: tidak pernah terhitung, dan tidak ada sisa setelah batal', async () => {
    const eventId = idOf('kompetisi-inovasi-perangkat-lunak-nusantara-2026');
    await repository.saveRegistrationForm(admin, eventId, freeForm);
    const registration = await repository.registerForEvent(dindaActor, eventId, {});
    expect(registration.status).toBe('CONFIRMED');

    const whileOpen = evaluateBadges(await factsOf(repository, dinda.id), now).find((item) => item.definition.key === 'kompetitor');
    // Acara masih buka: terkonfirmasi tetapi MENUNGGU, belum lencana.
    expect(whileOpen).toMatchObject({ tier: 0, pending: 1 });

    await repository.cancelRegistration(dindaActor, registration.id);
    const afterCancel = evaluateBadges(await factsOf(repository, dinda.id), now).find((item) => item.definition.key === 'kompetitor');
    expect(afterCancel).toMatchObject({ tier: 0, pending: 0, count: 0 });
  });
});
