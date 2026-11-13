import type { UploadedImage } from '@/lib/image-file';
import { BANNER_PRESETS, type BannerPreset, type OwnProfileMedia, type ProfileMedia } from '@/types/domain';

/**
 * Foto profil & banner kartu profil (ADR-083) — batas & bentuk yang dipakai
 * bersama form, Server Action, dan kedua repository.
 */

export const PROFILE_MEDIA_KINDS = ['avatar', 'banner'] as const;
export type ProfileMediaKind = (typeof PROFILE_MEDIA_KINDS)[number];

export function toProfileMediaKind(value: string): ProfileMediaKind | null {
  return (PROFILE_MEDIA_KINDS as readonly string[]).includes(value) ? (value as ProfileMediaKind) : null;
}

/**
 * Gambar profil disajikan apa adanya ke setiap pembaca (rutenya butuh sesi,
 * jadi tidak bisa lewat pengoptimal gambar). Karena itu batasnya lebih ketat
 * dari galeri acara: dengan JavaScript peramban memperkecilnya ke
 * `uploadEdge` (±40–150 KB); tanpa JavaScript berkas besar DITOLAK dengan
 * pesan jelas, bukan disimpan lalu membebani semua orang yang melihatnya.
 */
export const PROFILE_MEDIA_LIMITS = {
  avatar: { maxBytes: 1024 * 1024, maxSide: 1024, uploadEdge: 512 },
  banner: { maxBytes: 2 * 1024 * 1024, maxSide: 2400, uploadEdge: 1600 },
} as const satisfies Record<ProfileMediaKind, { maxBytes: number; maxSide: number; uploadEdge: number }>;

/** Cermin `consume_rate_limit('profile-media:…', 20, 86400)` di `set_profile_media()`. */
export const PROFILE_MEDIA_RATE_LIMIT = { limit: 20, windowSeconds: 86_400 } as const;

export const NO_PROFILE_MEDIA: ProfileMedia = { avatarId: null, bannerId: null, bannerPreset: null };
export const UNAVAILABLE_PROFILE_MEDIA: OwnProfileMedia = { ...NO_PROFILE_MEDIA, available: false };

export function toBannerPreset(value: string | null | undefined): BannerPreset | null {
  return (BANNER_PRESETS as readonly string[]).includes(value ?? '') ? (value as BannerPreset) : null;
}

const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Id berkas = UUID huruf kecil; selain itu tidak pernah jadi bagian URL atau path penyimpanan. */
export function isProfileMediaId(value: string | null | undefined): value is string {
  return typeof value === 'string' && FILE_ID.test(value);
}

export function profileMediaSrc(id: string): string {
  return `/media/profil/${id}`;
}

/** Unggahan yang lolos pemeriksa gambar umum tetapi terlalu besar untuk gambar profil. */
export function exceedsProfileLimit(kind: ProfileMediaKind, image: Pick<UploadedImage, 'bytes' | 'width' | 'height'>): boolean {
  const limit = PROFILE_MEDIA_LIMITS[kind];
  return image.bytes.byteLength > limit.maxBytes || Math.max(image.width, image.height) > limit.maxSide;
}

/** Jumlah langkah "profil berwajah" yang sudah dikerjakan — bahan ajakan melengkapi profil. */
export function hasCustomLook(media: ProfileMedia): boolean {
  return media.avatarId !== null || media.bannerId !== null || media.bannerPreset !== null;
}
