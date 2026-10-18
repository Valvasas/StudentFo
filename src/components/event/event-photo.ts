import type { EventPhoto } from '@/types/domain';

export function photoSrc(photoId: string): string {
  return `/media/foto/${encodeURIComponent(photoId)}`;
}

export function photoAlt(photo: Pick<EventPhoto, 'caption'>, position: number, eventTitle: string): string {
  // Satu unggahan berbagi keterangan; tanpa nomor, tautan ke foto berbeda punya nama yang sama.
  return photo.caption ? `${photo.caption} (foto ${position})` : `Foto ${position} dari ${eventTitle}`;
}
