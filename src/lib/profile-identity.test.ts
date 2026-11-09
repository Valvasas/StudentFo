import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryEventRepository } from '@/lib/data/memory-repository';
import { AppError } from '@/lib/errors';
import { isValidUsername, normalizeUsername, parseProfileIdentity, profileHref, RESERVED_USERNAMES, suggestUsername, USERNAME_PATTERN } from './profile-identity';

const sql = readFileSync(new URL('../../supabase/migrations/20261109100001_profile_details.sql', import.meta.url), 'utf8');
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};
const reason = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof AppError ? error.reason : String(error)));

describe('aturan username ↔ CHECK users_username_shape', () => {
  it('pola & daftar terlarang identik dengan migration', () => {
    expect(sql).toContain(`username ~ '${USERNAME_PATTERN.source}'`);
    const reserved = /username NOT IN \(([^)]+)\)/.exec(sql)?.[1]?.split(',').map((value) => value.trim().replace(/'/g, ''));
    expect(reserved).toEqual([...RESERVED_USERNAMES]);
  });

  it('bentuk sah & tidak sah', () => {
    for (const ok of ['rani', 'rani.prameswari', 'dimas_arya', 'a1b', 'x'.repeat(30)]) expect(isValidUsername(ok), ok).toBe(true);
    for (const bad of ['ab', 'x'.repeat(31), '.rani', 'rani.', 'ra..ni', 'ra._ni', 'Rani', 'rani-p', 'admin', 'studentfo', 'ra ni'])
      expect(isValidUsername(bad), bad).toBe(false);
  });

  it('normalisasi @ & huruf besar; saran dari nama selalu sah', () => {
    expect(normalizeUsername('  @Rani.P ')).toBe('rani.p');
    expect(suggestUsername('Rani Prameswari')).toBe('rani.prameswari');
    expect(suggestUsername('Ádì Ñugroho')).toBe('adi.nugroho');
    for (const name of ['Al', 'Admin', '!!!', 'Muhammad Rizky Maulana Zein Al Farizi Pratama']) expect(isValidUsername(suggestUsername(name)), name).toBe(true);
  });
});

describe('parseProfileIdentity', () => {
  it('username dinormalisasi, bio dirapikan, keterlihatan asing = MEMBERS', () => {
    expect(parseProfileIdentity(form({ username: '@Rani.P', bio: '  Halo  ', profileVisibility: 'NETWORK' }))).toEqual({
      ok: true,
      value: { username: 'rani.p', bio: 'Halo', visibility: 'NETWORK' },
    });
    expect(parseProfileIdentity(form({ username: '', bio: '', profileVisibility: 'APA' }))).toEqual({ ok: true, value: { username: null, bio: null, visibility: 'MEMBERS' } });
  });

  it('username & bio yang melanggar ditolak', () => {
    expect(parseProfileIdentity(form({ username: 'ra..ni' }))).toEqual({ ok: false, problem: 'invalid_username' });
    expect(parseProfileIdentity(form({ bio: 'x'.repeat(281) }))).toEqual({ ok: false, problem: 'invalid_bio' });
  });

  it('alamat profil: username bila ada, id bila belum', () => {
    expect(profileHref({ userId: 'u1', username: 'rani' })).toBe('/u/rani');
    expect(profileHref({ userId: 'u1', username: null })).toBe('/orang/u1');
  });
});

describe('MemoryEventRepository — identitas profil (cermin SQL)', () => {
  it('username unik, resolveUsername hormat keterlihatan & tidak bocor', async () => {
    const repository = new MemoryEventRepository();
    expect(await repository.getProfileIdentity('seed-user-1')).toMatchObject({ username: 'rani.prameswari', visibility: 'MEMBERS' });
    expect(await reason(repository.saveProfileIdentity('pengguna-baru', { username: 'rani.prameswari', bio: null, visibility: 'MEMBERS' }))).toBe('username_taken');

    // Profil terbuka untuk anggota: siapa pun yang masuk bisa membuka lewat username.
    expect(await repository.resolveUsername('pembaca', 'Rani.Prameswari')).toBe('seed-user-1');
    // "Hanya koneksi": tidak ada & tersembunyi sama-sama null.
    expect(await repository.resolveUsername('pembaca', 'putri.ayu')).toBeNull();
    expect(await repository.resolveUsername('pembaca', 'tidak.ada')).toBeNull();
    // Pemiliknya sendiri selalu bisa.
    expect(await repository.resolveUsername('seed-user-14', 'putri.ayu')).toBe('seed-user-14');
  });

  it('profil terbuka bisa diajak terhubung walau tidak "bisa ditemukan"; detail publik memuat username & bio', async () => {
    const repository = new MemoryEventRepository();
    const viewer = { id: 'pembaca', fullName: 'Pembaca', educationLevel: null, major: null, interests: [] };
    expect(await repository.requestConnection(viewer, 'seed-user-9', null)).toBe('requested');
    const details = await repository.listPublicProfileDetails('pembaca', ['seed-user-1', 'seed-user-14']);
    expect(details.get('seed-user-1')).toMatchObject({ username: 'rani.prameswari', bio: expect.stringContaining('antarmuka') });
    expect(details.has('seed-user-14')).toBe(false);
  });
});
