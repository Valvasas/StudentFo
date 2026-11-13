import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import type { ProfileMedia } from '@/types/domain';

const CHUNK = 100;

/**
 * Foto profil & banner (ADR-083) untuk orang-orang yang tampil di satu
 * halaman — satu panggilan per 100 orang (batas `public_profile_media`),
 * bukan satu per kartu. Siapa yang fotonya boleh dilihat diputuskan
 * repository; yang tidak ada di peta tampil dengan inisial.
 *
 * Pelengkap saja: gagal dimuat = semua orang berinisial, bukan halaman galat.
 */
export async function loadProfileMedia(viewerId: string, userIds: readonly string[]): Promise<ReadonlyMap<string, ProfileMedia>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  return withFallback(
    'foto profil',
    async () => {
      const repository = await getEventRepository();
      const chunks: string[][] = [];
      for (let start = 0; start < ids.length; start += CHUNK) chunks.push(ids.slice(start, start + CHUNK));
      const pages = await Promise.all(chunks.map((chunk) => repository.listProfileMedia(viewerId, chunk)));
      return new Map(pages.flatMap((page) => [...page]));
    },
    new Map<string, ProfileMedia>(),
  );
}

/** userId → id foto, sebagai objek polos (bisa dioper ke komponen klien seperti `TeamCard`). */
export function avatarIdsOf(media: ReadonlyMap<string, ProfileMedia>): Readonly<Record<string, string | undefined>> {
  const photos: Record<string, string> = {};
  for (const [userId, look] of media) if (look.avatarId) photos[userId] = look.avatarId;
  return photos;
}
