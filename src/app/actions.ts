'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { GETTING_STARTED_COOKIE, GETTING_STARTED_MAX_AGE, hideGettingStartedFor } from '@/lib/getting-started';

/** Sembunyikan panduan "Mulai di sini" untuk akun ini. Hanya preferensi tampilan, seperti sakelar sidebar. */
export async function hideGettingStartedAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    const store = await cookies();
    store.set(GETTING_STARTED_COOKIE, hideGettingStartedFor(store.get(GETTING_STARTED_COOKIE)?.value, user.id), {
      path: '/',
      maxAge: GETTING_STARTED_MAX_AGE,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  redirect('/');
}
