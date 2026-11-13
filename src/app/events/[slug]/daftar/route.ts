import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { siteUrl } from '@/lib/env';
import { isSurveyEmpty } from '@/lib/outbound-survey';
import { hasAnsweredOutboundSurvey } from '@/lib/outbound-survey-cookie';
import { recordSignal } from '@/lib/recommendation-signals';
import { registrationDestination } from '@/lib/registration-destination';
import { loginHref } from '@/lib/safe-redirect';

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
 *
 * Tujuan LUAR melewati pendataan kinerja dulu (ADR-070): sekali per acara per
 * peramban, dijawab atau dilewati (ADR-073). Aksi pendataan lalu mengantar langsung ke tujuan & mencatat klik
 * sendiri (tujuan dari `registrationDestination()` yang sama); di sini klik
 * hanya dicatat saat benar-benar keluar, jadi tidak terhitung dua kali.
 */
/**
 * Admin mematikan semua pertanyaan (ADR-073) = tidak ada layar pendataan.
 * Konfigurasi yang gagal dimuat juga = langsung ke pendaftaran: statistik
 * tidak pernah boleh menahan orang di depan pintu pendaftaran.
 */
async function shouldAskSurvey(eventId: string, repository: Awaited<ReturnType<typeof getEventRepository>>): Promise<boolean> {
  if (await hasAnsweredOutboundSurvey(eventId)) return false;
  try {
    return !isSurveyEmpty(await repository.getOutboundSurveyConfig());
  } catch (error) {
    console.error('[pendataan-kinerja] konfigurasi gagal dimuat:', error);
    return false;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(slug);
  if (!event) return NextResponse.redirect(new URL('/events', siteUrl), 303);
  // Tautan pendaftaran khusus anggota (ADR-085). Kembali ke halaman acaranya,
  // bukan langsung ke luar: setelah masuk, syarat & biayanya terbaca dulu.
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(loginHref(`/events/${event.slug}`), siteUrl), 303);

  const destination = await registrationDestination(event, repository);
  if (!destination) {
    return NextResponse.redirect(new URL(`/events/${event.slug}`, siteUrl), 303);
  }
  if (destination.kind === 'external' && (await shouldAskSurvey(event.id, repository))) {
    return NextResponse.redirect(new URL(`/events/${event.slug}/sebelum-daftar`, siteUrl), 303);
  }

  await recordSignal('register_click', event.id, user);
  return NextResponse.redirect(destination.url, 303);
}
