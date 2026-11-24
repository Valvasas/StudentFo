import type { EventPhoto } from '@/types/domain';

export function photoSrc(photoId: string): string {
  return `/media/foto/${encodeURIComponent(photoId)}`;
}

/**
 * Alt poster di kartu & papan: judul + penyelenggara, sama dengan nama yang
 * dicari orang di Google Gambar. Poster memuat informasi (tanggal, hadiah,
 * logo penyelenggara), jadi bukan hiasan.
 */
export function posterAlt(eventTitle: string, organizer: string): string {
  return `Poster ${eventTitle.trim()} — ${organizer.trim()}`;
}

export function photoAlt(photo: Pick<EventPhoto, 'caption' | 'isPoster'>, position: number, eventTitle: string): string {
  if (photo.isPoster) return `Poster ${eventTitle}`;
  // Satu unggahan berbagi keterangan; tanpa nomor, tautan ke foto berbeda punya nama yang sama.
  return photo.caption ? `${photo.caption} (foto ${position})` : `Foto ${position} dari ${eventTitle}`;
}
