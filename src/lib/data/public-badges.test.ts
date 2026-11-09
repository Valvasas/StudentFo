import { describe, expect, it } from 'vitest';
import { evaluateBadges } from '@/lib/achievements';
import type { NetworkViewer } from '@/lib/network';
import { MemoryEventRepository } from './memory-repository';
import { SEED_LOBBY } from './seed-data';

/** Lencana publik di mode seed (ADR-072) — skenario yang sama dengan supabase/tests/112_public_badges.test.sql. */
const viewer = (id: string): NetworkViewer => ({ id, fullName: id, educationLevel: 'D4_S1', major: null, interests: [] });

describe('MemoryEventRepository — lencana publik', () => {
  it('bawaan privat; pemilik selalu melihat miliknya', async () => {
    const repository = new MemoryEventRepository();
    expect(await repository.getBadgeVisibility('orang-baru')).toEqual({ show: false, adjustable: true });
    expect((await repository.listPublicBadgeFacts('pembaca', ['orang-baru'])).size).toBe(0);
    expect((await repository.listPublicBadgeFacts('orang-baru', ['orang-baru'])).has('orang-baru')).toBe(true);
  });

  it('opt-in + sesama anggota lobi: lencana dihitung aturan biasa dari pendaftaran terkonfirmasi yang sudah ditutup', async () => {
    const repository = new MemoryEventRepository();
    const reader = viewer('pembaca');
    const lomba = (await repository.listEvents({ types: ['LOMBA'] })).items.find((event) => event.slug === SEED_LOBBY.eventSlug)!;

    // Belum satu lobi & profil Arif tetap bisa ditemukan (seed) → boleh dilihat lewat profil.
    const viaProfile = await repository.listPublicBadgeFacts(reader.id, ['seed-user-9']);
    const badges = evaluateBadges(viaProfile.get('seed-user-9')!);
    expect(badges.find((badge) => badge.definition.key === 'kompetitor')?.tier).toBe(1);
    expect(badges.find((badge) => badge.definition.key === 'pembelajar')?.tier).toBe(1);

    // Tanpa id acara: fakta yang diserahkan memakai id buatan.
    expect(viaProfile.get('seed-user-9')!.registrations.every((row) => row.eventId.startsWith('publik-'))).toBe(true);

    await repository.upsertTrackerItem(reader.id, lomba.id, 'APPLIED');
    await repository.joinLobby(reader, lomba.id, { intent: 'CARI_TIM', note: null });
    // Yang TIDAK menyalakan tampilkan lencana tidak muncul walau satu lobi.
    expect((await repository.listPublicBadgeFacts(reader.id, ['seed-user-10'])).size).toBe(0);
  });

  it('menjadikan privat atau memblokir menutup lencana', async () => {
    const repository = new MemoryEventRepository();
    await repository.setBadgeVisibility('seed-user-9', false);
    expect((await repository.listPublicBadgeFacts('pembaca', ['seed-user-9'])).size).toBe(0);

    await repository.setBadgeVisibility('seed-user-9', true);
    // Memblokir mensyaratkan target pernah terlihat (ADR-041): pembaca membuka profilnya dulu.
    await repository.updateNetworkProfile(viewer('pembaca'), { discoverable: true, headline: null });
    await repository.blockPerson('seed-user-9', 'pembaca');
    expect((await repository.listPublicBadgeFacts('pembaca', ['seed-user-9'])).size).toBe(0);
  });
});
