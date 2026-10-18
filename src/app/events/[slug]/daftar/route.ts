import { NextResponse, type NextRequest } from 'next/server';
import { registrationEventClosed } from '@/components/registration/registration-view';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { siteUrl } from '@/lib/env';
import { withFallback } from '@/lib/fallback';
import { recordSignal } from '@/lib/recommendation-signals';
import { sanitizeExternalUrl } from '@/lib/utils';

/**
 * Keluar ke tautan pendaftaran lewat server, supaya klik "Daftar" — sinyal
 * niat terkuat yang kita punya — bisa dicatat untuk kalibrasi (ADR-032).
 *
 * Bukan open redirect: tujuannya SELALU `registration_link` event itu dari
 * database, tidak pernah dari parameter URL. Route ini di-Disallow di
 * robots.txt dan ditautkan dengan <a> biasa (bukan <Link>) supaya prefetch
 * router tidak memicu pencatatan.
 *
 * Acara yang menerima pendaftaran lewat formulir StudentFo (ADR-056) diarahkan
 * ke formulir itu, bukan tautan luar — sama dengan `registrationCta` di
 * halaman acara — supaya pendaftar tidak lolos dari alur bayar & verifikasi.
 * Kliknya tetap dicatat: niatnya sama, hanya tujuannya yang berbeda.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(slug);
  if (!event) return NextResponse.redirect(new URL('/events', siteUrl), 303);

  // Gagal dibaca = perilaku lama (tautan luar), seperti halaman acara yang memperlakukannya sebagai "tanpa formulir".
  const form = await withFallback('formulir pendaftaran', () => repository.getRegistrationForm(event.id), null);
  const internal = form?.isOpen && !registrationEventClosed(event) ? new URL(`/events/${event.slug}/formulir`, siteUrl) : null;
  const destination = internal ?? sanitizeExternalUrl(event.registrationLink);

  if (!destination) {
    return NextResponse.redirect(new URL(`/events/${event.slug}`, siteUrl), 303);
  }

  await recordSignal('register_click', event.id, await getSessionUser());
  return NextResponse.redirect(destination, 303);
}
