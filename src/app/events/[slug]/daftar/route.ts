import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { siteUrl } from '@/lib/env';
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
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(slug);
  const destination = event ? sanitizeExternalUrl(event.registrationLink) : null;

  if (!event || !destination) {
    return NextResponse.redirect(new URL(event ? `/events/${event.slug}` : '/events', siteUrl), 303);
  }

  await recordSignal('register_click', event.id, await getSessionUser());
  return NextResponse.redirect(destination, 303);
}
