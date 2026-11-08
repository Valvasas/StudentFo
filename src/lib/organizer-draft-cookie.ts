import 'server-only';
import { cookies } from 'next/headers';
import { parseOrganizerDraft, toOrganizerDraft } from '@/lib/organizer';
import type { OrganizerApplicationInput } from '@/lib/organizer';

/**
 * Titipan draf pengajuan untuk daftar penyelenggara lewat Google (ADR-069).
 * OAuth tidak bisa membawa user metadata seperti `signUp`, jadi draf yang
 * sudah divalidasi dititipkan di cookie httpOnly berumur 30 menit dengan
 * `path` /auth/callback — tidak ikut terkirim ke halaman lain — lalu
 * dipindah ke metadata oleh callback dan langsung dihapus.
 */
const COOKIE = 'sf_org_draft';
const CALLBACK_PATH = '/auth/callback';
const MAX_AGE_SECONDS = 30 * 60;

export async function writeOrganizerDraftCookie(draft: Record<string, string>): Promise<void> {
  (await cookies()).set(COOKIE, JSON.stringify(draft), {
    path: CALLBACK_PATH,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Membaca SEKALI: cookie dihapus apa pun isinya. Isi tidak valid = null. */
export async function takeOrganizerDraftCookie(): Promise<Record<string, string> | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (raw === undefined) return null;
  store.set(COOKIE, '', { path: CALLBACK_PATH, maxAge: 0 });

  let parsed: OrganizerApplicationInput | null = null;
  try {
    parsed = parseOrganizerDraft(JSON.parse(raw));
  } catch {
    parsed = null;
  }
  return parsed ? toOrganizerDraft(parsed) : null;
}
