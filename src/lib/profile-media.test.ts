import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  exceedsProfileLimit,
  hasCustomLook,
  isProfileMediaId,
  NO_PROFILE_MEDIA,
  PROFILE_MEDIA_LIMITS,
  PROFILE_MEDIA_RATE_LIMIT,
  profileMediaSrc,
  toBannerPreset,
  toProfileMediaKind,
} from '@/lib/profile-media';
import { BANNER_PRESET_LABEL, BANNER_PRESETS } from '@/types/domain';

const MIGRATION = readFileSync('supabase/migrations/20261110100001_profile_media.sql', 'utf8');

describe('gambar profil — bentuk & batas', () => {
  it('jenis & banner bawaan hanya dari daftar tertutup', () => {
    expect(toProfileMediaKind('avatar')).toBe('avatar');
    expect(toProfileMediaKind('banner')).toBe('banner');
    expect(toProfileMediaKind('poster')).toBeNull();
    expect(toProfileMediaKind('')).toBeNull();

    expect(toBannerPreset('ombak')).toBe('ombak');
    expect(toBannerPreset('OMBAK')).toBeNull();
    expect(toBannerPreset(null)).toBeNull();
    expect(toBannerPreset('url(https://evil.example/x.png)')).toBeNull();
  });

  it('id berkas = UUID huruf kecil; selain itu tidak pernah jadi URL atau path', () => {
    const id = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
    expect(isProfileMediaId(id)).toBe(true);
    expect(profileMediaSrc(id)).toBe(`/media/profil/${id}`);
    for (const bad of [id.toUpperCase(), `${id}.png`, `../${id}`, `${id}/..`, ` ${id}`, 'seed-user-1', '', null, undefined]) {
      expect(isProfileMediaId(bad)).toBe(false);
    }
  });

  it('batas ukuran: foto 1 MB / 1024 px, banner 2 MB / 2400 px', () => {
    const image = (bytes: number, width: number, height: number) => ({ bytes: new Uint8Array(bytes), width, height });
    expect(exceedsProfileLimit('avatar', image(1024 * 1024, 1024, 1024))).toBe(false);
    expect(exceedsProfileLimit('avatar', image(1024 * 1024 + 1, 512, 512))).toBe(true);
    expect(exceedsProfileLimit('avatar', image(1000, 1025, 400))).toBe(true);
    expect(exceedsProfileLimit('avatar', image(1000, 400, 1025))).toBe(true);
    expect(exceedsProfileLimit('banner', image(2 * 1024 * 1024, 2400, 600))).toBe(false);
    expect(exceedsProfileLimit('banner', image(2 * 1024 * 1024 + 1, 1600, 400))).toBe(true);
    // Perkecilan di peramban selalu menghasilkan gambar yang lolos batas server.
    for (const kind of ['avatar', 'banner'] as const) {
      expect(PROFILE_MEDIA_LIMITS[kind].uploadEdge).toBeLessThanOrEqual(PROFILE_MEDIA_LIMITS[kind].maxSide);
    }
  });

  it('hasCustomLook: foto, banner unggahan, atau banner bawaan', () => {
    expect(hasCustomLook(NO_PROFILE_MEDIA)).toBe(false);
    expect(hasCustomLook({ ...NO_PROFILE_MEDIA, bannerPreset: 'kertas' })).toBe(true);
    expect(hasCustomLook({ ...NO_PROFILE_MEDIA, avatarId: '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b' })).toBe(true);
  });
});

describe('gambar profil — kode dan SQL sepakat (migration 20261110100001)', () => {
  it('banner bawaan = CHECK users_banner_preset_values, dan semuanya berlabel', () => {
    const check = /banner_preset IN \(([^)]+)\)/.exec(MIGRATION);
    expect(check).not.toBeNull();
    const sqlPresets = (check?.[1] ?? '').split(',').map((value) => value.trim().replace(/'/g, ''));
    expect(sqlPresets).toEqual([...BANNER_PRESETS]);
    expect(Object.keys(BANNER_PRESET_LABEL).sort()).toEqual([...BANNER_PRESETS].sort());
  });

  it('batas laju = consume_rate_limit() di set_profile_media()', () => {
    const call = /consume_rate_limit\('profile-media:' \|\| \w+::text, (\d+), (\d+)\)/.exec(MIGRATION);
    expect(call?.slice(1).map(Number)).toEqual([PROFILE_MEDIA_RATE_LIMIT.limit, PROFILE_MEDIA_RATE_LIMIT.windowSeconds]);
  });

  it('batas bucket = batas banner (berkas terbesar yang boleh masuk)', () => {
    const bucket = /'profile-media',\s*'profile-media',\s*false,\s*(\d+)/.exec(MIGRATION);
    expect(Number(bucket?.[1])).toBe(PROFILE_MEDIA_LIMITS.banner.maxBytes);
    expect(PROFILE_MEDIA_LIMITS.avatar.maxBytes).toBeLessThanOrEqual(PROFILE_MEDIA_LIMITS.banner.maxBytes);
  });

  it('tanpa perintah hapus: penerapan lewat Supabase MCP tidak meminta konfirmasi destruktif', () => {
    const statements = MIGRATION.split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(statements).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
    expect(statements).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('fungsi baru tertutup bagi anon; hanya yang perlu dibuka untuk authenticated', () => {
    for (const fn of ['set_profile_media', 'clear_profile_media', 'public_profile_media', 'profile_media_file', 'admin_clear_profile_media', 'profile_media_path']) {
      expect(MIGRATION).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
    }
    expect(MIGRATION).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_clear_profile_media\([^)]*\) TO (anon|authenticated)/);
    expect(MIGRATION).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.\w+\([^)]*\) TO anon/);
  });
});
