import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { DEFAULT_MATCH_FILTERS, MATCH_CANDIDATE_WINDOW, clampCandidateWindow, rankCandidates, type MatchViewer } from '@/lib/matchmaking';
import { portfolioDigestOf } from '@/lib/portfolio';
import type { NetworkViewer } from '@/lib/network';
import { TEAM_SKILL_SLUGS, type TeamSeekerInput } from '@/types/domain';
import { MemoryEventRepository } from './memory-repository';
import { SEED_SEEKERS } from './seed-data';

const ana: NetworkViewer = { id: 'ana', fullName: 'Ana', educationLevel: 'D4_S1', major: 'Teknik Informatika', interests: ['teknologi', 'desain'] };
const budi: NetworkViewer = { id: 'budi', fullName: 'Budi', educationLevel: 'D3', major: null, interests: [] };

const card = (overrides: Partial<TeamSeekerInput> = {}): TeamSeekerInput => ({
  open: true,
  city: 'Bandung',
  skills: ['web-aplikasi'],
  seeking: ['ui-ux'],
  remoteOk: true,
  pitch: null,
  ...overrides,
});

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

describe('katalog keahlian: paritas SQL ↔ TypeScript', () => {
  it('team_skill_slugs() di migration memuat tepat slug yang sama dengan TEAM_SKILLS', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/20261020100001_team_matching.sql', import.meta.url), 'utf8');
    const body = /FUNCTION public\.team_skill_slugs\(\)[\s\S]*?SELECT ARRAY\[([\s\S]*?)\]::TEXT\[\]/.exec(sql)?.[1] ?? '';
    const slugs = [...body.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
    expect([...slugs].sort()).toEqual([...TEAM_SKILL_SLUGS].sort());
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('batas panjang slug cocok dengan VARCHAR(24)', () => {
    for (const slug of TEAM_SKILL_SLUGS) expect(slug.length).toBeLessThanOrEqual(24);
  });
});

describe('clampCandidateWindow', () => {
  it('aturan yang sama dengan LEAST(GREATEST(COALESCE(p, 200), 1), 400)', () => {
    expect(clampCandidateWindow(undefined)).toBe(200);
    expect(clampCandidateWindow(null)).toBe(200);
    expect(clampCandidateWindow(Number.NaN)).toBe(200);
    expect(clampCandidateWindow(0)).toBe(1);
    expect(clampCandidateWindow(-5)).toBe(1);
    expect(clampCandidateWindow(37.9)).toBe(37);
    expect(clampCandidateWindow(100_000)).toBe(MATCH_CANDIDATE_WINDOW.max);
  });
});

describe('MemoryEventRepository — pencocokan tim', () => {
  let repository: MemoryEventRepository;

  beforeEach(() => {
    repository = new MemoryEventRepository(new Date('2026-10-20T03:00:00Z'));
  });

  it('bawaan: belum ada kartu', async () => {
    expect(await repository.getSeekerProfile('ana')).toBeNull();
  });

  it('menyimpan lalu membaca kartu; menyimpan lagi menggantinya', async () => {
    await repository.saveSeekerProfile(ana, card({ pitch: 'Halo' }));
    expect(await repository.getSeekerProfile('ana')).toMatchObject({ open: true, city: 'Bandung', skills: ['web-aplikasi'], pitch: 'Halo' });
    await repository.saveSeekerProfile(ana, card({ open: false, skills: [] }));
    expect(await repository.getSeekerProfile('ana')).toMatchObject({ open: false, skills: [] });
  });

  it('TIMBAL-BALIK: tanpa kartu terbuka milik sendiri, tidak ada kandidat', async () => {
    expect(await repository.listSeekerCandidates('ana', 50)).toEqual([]);
    await repository.saveSeekerProfile(ana, card({ open: false }));
    expect(await repository.listSeekerCandidates('ana', 50)).toEqual([]);
    await repository.saveSeekerProfile(ana, card());
    expect((await repository.listSeekerCandidates('ana', 50)).length).toBeGreaterThan(0);
  });

  it('kandidat = kartu terbuka orang lain: bukan diri sendiri, bukan yang tertutup, bukan yang tersembunyi tanpa kartu', async () => {
    await repository.saveSeekerProfile(ana, card());
    await repository.saveSeekerProfile(budi, card({ open: false }));
    const ids = (await repository.listSeekerCandidates('ana', 500)).map((candidate) => candidate.person.userId);
    expect(ids).not.toContain('ana');
    expect(ids).not.toContain('budi'); // kartu tertutup
    expect(ids).not.toContain('seed-user-14'); // tersembunyi, tanpa kartu
    expect(new Set(ids)).toEqual(new Set(SEED_SEEKERS.map((seed) => seed.userId)));
  });

  it('blokir menghilangkan di kedua arah', async () => {
    await repository.saveSeekerProfile(ana, card());
    await repository.saveSeekerProfile(budi, card());
    await repository.updateNetworkProfile(budi, { discoverable: true, headline: null });
    expect((await repository.listSeekerCandidates('ana', 500)).map((c) => c.person.userId)).toContain('budi');

    await repository.blockPerson('ana', 'budi');
    expect((await repository.listSeekerCandidates('ana', 500)).map((c) => c.person.userId)).not.toContain('budi');
    expect((await repository.listSeekerCandidates('budi', 500)).map((c) => c.person.userId)).not.toContain('ana');

    await repository.unblockPerson('ana', 'budi');
    await repository.blockPerson('budi', 'ana');
    expect((await repository.listSeekerCandidates('ana', 500)).map((c) => c.person.userId)).not.toContain('budi');
  });

  it('relasi mengikuti ajakan: outgoing → connected; incoming dari sisi lawan', async () => {
    await repository.saveSeekerProfile(ana, card());
    await repository.saveSeekerProfile(budi, card());
    const relationOf = async (viewer: string, other: string) =>
      (await repository.listSeekerCandidates(viewer, 500)).find((candidate) => candidate.person.userId === other)?.relation;

    expect(await relationOf('ana', 'budi')).toBeNull();
    await repository.requestConnection(ana, 'budi', null);
    expect(await relationOf('ana', 'budi')).toBe('outgoing');
    expect(await relationOf('budi', 'ana')).toBe('incoming');

    const [pending] = (await repository.listConnections('budi', { limit: 10, cursor: null })).items;
    await repository.respondToConnection('budi', pending!.id, 'accept');
    expect(await relationOf('ana', 'budi')).toBe('connected');
  });

  it('kartu terbuka bisa diajak walau tidak ada di direktori Koneksi; kartu tertutup tidak (cermin is_discoverable)', async () => {
    await repository.saveSeekerProfile(budi, card());
    expect((await repository.getNetworkProfile('budi')).discoverable).toBe(false);
    expect(await repository.requestConnection(ana, 'budi', null)).toBe('requested');

    await repository.saveSeekerProfile(budi, card({ open: false }));
    const cici: NetworkViewer = { id: 'cici', fullName: 'Cici', educationLevel: null, major: null, interests: [] };
    await repository.saveSeekerProfile(cici, card({ open: false }));
    expect(await reason(repository.requestConnection(ana, 'cici', null))).toBe('person_unavailable');
  });

  it('profil publik pemilik kartu terbuka terbaca; setelah ditutup tidak lagi', async () => {
    await repository.saveSeekerProfile(budi, card());
    expect((await repository.getPublicProfile('ana', 'budi'))?.person.fullName).toBe('Budi');
    await repository.saveSeekerProfile(budi, card({ open: false }));
    expect(await repository.getPublicProfile('ana', 'budi')).toBeNull();
  });

  it('direktori Koneksi TIDAK berubah: pemilik kartu terbuka tidak muncul di saran orang', async () => {
    await repository.saveSeekerProfile(budi, card());
    const suggestions = await repository.suggestPeople(ana, { search: '', interest: null, limit: 50, viewerEvents: [] });
    expect(suggestions.map((s) => s.person.userId)).not.toContain('budi');
  });

  it('portofolio kandidat = ringkasan publik saja (beasiswa privat tidak ikut)', async () => {
    await repository.saveSeekerProfile(ana, card());
    const candidates = await repository.listSeekerCandidates('ana', 500);
    const citra = candidates.find((candidate) => candidate.person.userId === 'seed-user-10')!;
    // Citra: finalis lomba (publik) + penerima beasiswa (privat bawaan).
    expect(citra.portfolio.achievements).toEqual(['FINALIS']);
    expect(citra.portfolio.count).toBe(1);
    const rani = candidates.find((candidate) => candidate.person.userId === 'seed-user-1')!;
    expect(rani.portfolio.achievements).toContain('JUARA_2');
    expect(rani.portfolio.count).toBeGreaterThanOrEqual(2);
  });

  it('jendela dibatasi dan konsisten dengan SQL: 0 → 1, urutan stabil', async () => {
    await repository.saveSeekerProfile(ana, card());
    expect(await repository.listSeekerCandidates('ana', 0)).toHaveLength(1);
    expect(await repository.listSeekerCandidates('ana', 3)).toHaveLength(3);
    const first = (await repository.listSeekerCandidates('ana', 500)).map((c) => c.person.userId);
    const second = (await repository.listSeekerCandidates('ana', 500)).map((c) => c.person.userId);
    expect(second).toEqual(first);
  });

  it('ujung ke ujung: pembaca yang mencari UI/UX mendapat desainer di puncak, dan data seed lengkap kotanya', async () => {
    await repository.saveSeekerProfile(ana, card({ skills: ['web-aplikasi'], seeking: ['ui-ux'], city: 'Bandung' }));
    const viewer: MatchViewer = {
      userId: 'ana',
      educationLevel: ana.educationLevel,
      major: ana.major,
      interests: ana.interests,
      profile: { city: 'Bandung', skills: ['web-aplikasi'], seeking: ['ui-ux'], remoteOk: true },
      portfolio: portfolioDigestOf([]),
    };
    const ranked = rankCandidates(viewer, await repository.listSeekerCandidates('ana', 500), { style: 'seimbang', filters: DEFAULT_MATCH_FILTERS });
    expect(ranked.length).toBeGreaterThan(5);
    expect(ranked[0]!.candidate.skills).toContain('ui-ux');
    expect(ranked[0]!.score).toBeGreaterThan(ranked.at(-1)!.score);

    const near = rankCandidates(viewer, await repository.listSeekerCandidates('ana', 500), {
      style: 'seimbang',
      filters: { ...DEFAULT_MATCH_FILTERS, maxDistanceKm: 25, includeRemote: false },
    });
    expect(near.length).toBeGreaterThan(0);
    // Bandung = satu kota; Cimahi ±10 km = berdekatan. Selain itu tidak boleh lolos.
    expect(near.every((match) => ['Bandung', 'Cimahi'].includes(match.candidate.city ?? ''))).toBe(true);
    expect(near.some((match) => match.candidate.city === 'Cimahi')).toBe(true);
  });

  it('isolateSeekers (store demo): kartu pengunjung lain tidak dicalonkan, orang contoh tetap; bawaan mencerminkan SQL', async () => {
    const isolated = new MemoryEventRepository(new Date('2026-10-20T03:00:00Z'), { isolateSeekers: true });
    for (const repo of [repository, isolated]) {
      await repo.saveSeekerProfile(ana, card());
      await repo.saveSeekerProfile(budi, card({ pitch: 'tulisan bebas pengunjung lain' }));
    }
    const open = (await repository.listSeekerCandidates('ana', 500)).map((c) => c.person.userId);
    const demo = (await isolated.listSeekerCandidates('ana', 500)).map((c) => c.person.userId);
    expect(open).toContain('budi');
    expect(demo).not.toContain('budi');
    expect(new Set(demo)).toEqual(new Set(SEED_SEEKERS.map((seed) => seed.userId)));
    // Pembaca tetap wajib membuka kartunya sendiri.
    await isolated.saveSeekerProfile(ana, card({ open: false }));
    expect(await isolated.listSeekerCandidates('ana', 500)).toEqual([]);
  });

  it('persona demo di Bandung: setelah jaringan awalnya, saringan ≤25 km tetap menemukan orang (bukan hasil kosong)', async () => {
    // Persona sudah terhubung dengan dua orang Bandung (DEMO_STARTER_NETWORK) dan orang yang
    // terhubung tidak dicalonkan lagi. Bila seed tidak menyediakan orang dekat lain, pengunjung demo
    // yang mencoba saringan jarak melihat "tidak ada hasil" dan menyimpulkan fiturnya rusak.
    const persona: NetworkViewer = { id: 'demo-mahasiswa', fullName: 'Dinda Pratiwi', educationLevel: 'D4_S1', major: 'Rekayasa Perangkat Lunak', interests: ['teknologi'] };
    repository.seedDemoNetwork(persona.id);
    await repository.saveSeekerProfile(persona, card({ skills: ['web-aplikasi'], seeking: ['ui-ux'], city: 'Bandung' }));
    const viewer: MatchViewer = {
      userId: persona.id,
      educationLevel: persona.educationLevel,
      major: persona.major,
      interests: persona.interests,
      profile: { city: 'Bandung', skills: ['web-aplikasi'], seeking: ['ui-ux'], remoteOk: true },
      portfolio: portfolioDigestOf([]),
    };
    const near = rankCandidates(viewer, await repository.listSeekerCandidates(persona.id, 500), {
      style: 'seimbang',
      filters: { ...DEFAULT_MATCH_FILTERS, maxDistanceKm: 25, includeRemote: false },
    });
    expect(near.length).toBeGreaterThanOrEqual(2);
    expect(near.some((match) => match.distanceKm === 0)).toBe(true);

    // Hal yang sama untuk "Pernah juara": juara yang sudah terhubung tidak dicalonkan, jadi harus ada yang lain.
    const winners = rankCandidates(viewer, await repository.listSeekerCandidates(persona.id, 500), {
      style: 'seimbang',
      filters: { ...DEFAULT_MATCH_FILTERS, portfolio: 'juara' },
    });
    expect(winners.length).toBeGreaterThanOrEqual(1);
  });
});
