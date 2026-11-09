import 'server-only';
import { cookies } from 'next/headers';
import { parseAnsweredEvents, withAnsweredEvent } from '@/lib/outbound-survey';

/**
 * "Sudah menjawab pendataan untuk acara ini" (ADR-070) — supaya orang yang
 * kembali menekan Daftar tidak ditanya ulang. Di cookie, bukan di database:
 * jawaban sengaja tidak terhubung ke akun, jadi tidak ada yang bisa dicari
 * per pengguna. `path` /events: tidak ikut terkirim ke halaman lain.
 */
export const OUTBOUND_SURVEY_COOKIE = 'sf_out';
const COOKIE = OUTBOUND_SURVEY_COOKIE;
const MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export async function hasAnsweredOutboundSurvey(eventId: string): Promise<boolean> {
  return parseAnsweredEvents((await cookies()).get(COOKIE)?.value).includes(eventId);
}

export async function rememberOutboundSurvey(eventId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, withAnsweredEvent(store.get(COOKIE)?.value, eventId), {
    path: '/events',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_SECONDS,
  });
}
