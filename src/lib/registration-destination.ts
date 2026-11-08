import 'server-only';
import { registrationEventClosed } from '@/components/registration/registration-view';
import type { EventRepository } from '@/lib/data/repository';
import { siteUrl } from '@/lib/env';
import { withFallback } from '@/lib/fallback';
import { sanitizeExternalUrl } from '@/lib/utils';
import type { EventDetail } from '@/types/domain';

export type RegistrationDestination = { readonly kind: 'internal' | 'external'; readonly url: string } | null;

/**
 * Ke mana "Daftar" sebuah acara bermuara — SATU tempat untuk rute
 * `/daftar` dan gerbang pendataan kinerja (ADR-070), supaya keduanya tidak
 * pernah berbeda pendapat.
 *
 * Acara yang menerima pendaftaran lewat formulir StudentFo (ADR-056) →
 * formulir itu; selain itu tautan resmi dari database (bukan dari URL —
 * jadi bukan open redirect). null = tidak ada tujuan yang sah.
 */
export async function registrationDestination(event: EventDetail, repository: EventRepository): Promise<RegistrationDestination> {
  // Gagal dibaca = perilaku lama (tautan luar), seperti halaman acara yang memperlakukannya sebagai "tanpa formulir".
  const form = await withFallback('formulir pendaftaran', () => repository.getRegistrationForm(event.id), null);
  if (form?.isOpen && !registrationEventClosed(event)) {
    return { kind: 'internal', url: new URL(`/events/${event.slug}/formulir`, siteUrl).toString() };
  }
  const external = sanitizeExternalUrl(event.registrationLink);
  return external ? { kind: 'external', url: external } : null;
}
