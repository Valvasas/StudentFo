import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { DEMO_PERSONAS, type DemoPersonaId } from './personas';
import {
  DEMO_SESSION_MAX_AGE_SECONDS,
  decodeDemoSession,
  encodeDemoSession,
  type DemoSession,
} from './session-token';

export const DEMO_SESSION_COOKIE = 'sf_demo_session';

/**
 * Rahasia penanda tangan.
 *
 * `DEMO_SESSION_SECRET` dipakai kalau diisi (wajib untuk demo yang berjalan
 * di lebih dari satu instance, supaya token dari instance A sah di B).
 * Kalau kosong, dibuat acak sekali per proses dan disimpan di globalThis
 * agar bertahan saat hot reload. Konsekuensinya disengaja: restart server
 * = semua sesi demo keluar, dan itu wajar untuk data yang juga ikut hilang.
 */
const globalForDemo = globalThis as typeof globalThis & { __studentfoDemoSecret?: string };

function secret(): string {
  if (env.DEMO_SESSION_SECRET) return env.DEMO_SESSION_SECRET;
  globalForDemo.__studentfoDemoSecret ??= randomBytes(32).toString('hex');
  return globalForDemo.__studentfoDemoSecret;
}

export async function readDemoSession(): Promise<DemoSession | null> {
  const store = await cookies();
  return decodeDemoSession(store.get(DEMO_SESSION_COOKIE)?.value, secret());
}

async function writeDemoSession(session: DemoSession): Promise<void> {
  const store = await cookies();
  store.set(DEMO_SESSION_COOKIE, encodeDemoSession(session, secret()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEMO_SESSION_MAX_AGE_SECONDS,
  });
}

/** Masuk sebagai persona: setiap login mendapat identitas baru yang terisolasi. */
export async function startDemoSession(personaId: DemoPersonaId): Promise<void> {
  const persona = DEMO_PERSONAS[personaId];
  await writeDemoSession({
    v: 1,
    uid: randomUUID(),
    persona: persona.id,
    role: persona.role,
    fullName: persona.fullName,
    educationLevel: persona.educationLevel,
    major: persona.major,
    interests: [...persona.interests],
    iat: Math.floor(Date.now() / 1000),
  });
}

/** Perbarui profil tanpa mengganti identitas (uid) maupun peran. */
export async function updateDemoProfile(
  profile: Pick<DemoSession, 'fullName' | 'educationLevel' | 'major' | 'interests'>,
): Promise<boolean> {
  const current = await readDemoSession();
  if (!current) return false;
  await writeDemoSession({ ...current, ...profile, iat: Math.floor(Date.now() / 1000) });
  return true;
}

export async function endDemoSession(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_SESSION_COOKIE);
}
