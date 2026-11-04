'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCOUNT_SIDEBAR_COOKIE, ACCOUNT_SIDEBAR_MAX_AGE, isSidebarCollapsed } from '@/lib/account-sidebar';
import { type ActionErrorCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { getSessionUser } from '@/lib/auth';
import { type AuthErrorCode } from '@/lib/auth-messages';
import { getEventRepository } from '@/lib/data';
import { profileSchema } from '@/lib/auth-schema';
import { endDemoSession, updateDemoProfile } from '@/lib/demo/session';
import { dataMode } from '@/lib/env';
import { formList, formTrimmed as text } from '@/lib/form-data';
import { loginHref, safeNextPath } from '@/lib/safe-redirect';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isDeleteConfirmed } from '@/lib/trust-safety';
import { EDUCATION_LEVELS, type EducationLevel } from '@/types/domain';

/**
 * Tiga halaman menyimpan lewat aksi yang sama (Profil dipecah jadi Data
 * diri & Peminatan, ADR-039). Tujuan kembali dipilih dari daftar tertutup,
 * bukan diambil mentah dari form — isian tersembunyi tetap bisa dipalsukan.
 */
const PROFILE_RETURN_PATHS = ['/profile', '/profile/details', '/profile/interests'] as const;

export async function updateProfileAction(formData: FormData): Promise<void> {
  let failure: AuthErrorCode | null = null;
  const requested = text(formData, 'returnTo');
  const returnTo = PROFILE_RETURN_PATHS.find((path) => path === requested) ?? '/profile';

  const level = text(formData, 'educationLevel');
  const major = text(formData, 'major');

  const parsed = profileSchema.safeParse({
    fullName: text(formData, 'fullName'),
    educationLevel: EDUCATION_LEVELS.includes(level as EducationLevel)
      ? (level as EducationLevel)
      : null,
    major: major || null,
    interests: formList(formData, 'interests'),
  });

  if (dataMode === 'seed') {
    // Validasi yang sama dengan produksi; profil demo disimpan di cookie
    // sesi bertanda tangan (lib/demo/session.ts), bukan di database.
    if (!parsed.success) {
      failure = 'validation';
    } else if (!(await updateDemoProfile(parsed.data))) {
      failure = 'session_missing';
    }
  } else {
    if (!parsed.success) {
      failure = 'validation';
    } else {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        failure = 'session_missing';
      } else {
        // Klien anon + RLS `users_update_own`, bukan service_role: kalau
        // suatu saat `id` di bawah keliru, yang terjadi adalah update nol
        // baris — bukan menimpa profil orang lain. `.eq()` di sini lapis
        // kedua, bukan satu-satunya penjaga.
        const { error } = await supabase
          .from('users')
          .update({
            full_name: parsed.data.fullName,
            education_level: parsed.data.educationLevel,
            major: parsed.data.major,
            interests: parsed.data.interests,
          })
          .eq('id', user.id);

        if (error) failure = 'unknown';
      }
    }
  }

  if (failure) {
    redirect(`${returnTo}?error=${failure}`);
  }

  revalidatePath('/', 'layout');
  redirect(`${returnTo}?notice=profile_saved`);
}

/**
 * Lipat/buka sidebar akun. Hanya preferensi tampilan — tidak butuh sesi,
 * jadi tidak ada pemeriksaan otorisasi. Tujuan kembali lewat safeNextPath():
 * nilai `returnTo` datang dari form dan bisa dipalsukan.
 */
export async function toggleAccountSidebarAction(formData: FormData): Promise<void> {
  const store = await cookies();
  const collapsed = isSidebarCollapsed(store.get(ACCOUNT_SIDEBAR_COOKIE)?.value);
  store.set(ACCOUNT_SIDEBAR_COOKIE, collapsed ? 'expanded' : 'collapsed', {
    path: '/',
    maxAge: ACCOUNT_SIDEBAR_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
  redirect(safeNextPath(text(formData, 'returnTo'), '/profile'));
}

const SETTINGS_PAGE = '/profile/settings';

/**
 * Hapus akun sendiri (ADR-061, UU PDP Pasal 8). Konfirmasi ketik frasa —
 * bukan sandi, karena akun Google tidak punya sandi; sesi yang sah + frasa
 * yang disengaja sudah membuktikan niat pemilik.
 */
export async function deleteOwnAccountAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect(loginHref(SETTINGS_PAGE));
  if (!isDeleteConfirmed(text(formData, 'confirm'))) redirect(`${withQuery(SETTINGS_PAGE, { error: 'account_delete_confirm' })}#hapus-akun`);

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).deleteAccount({ userId: user.id, actorId: user.id, reason: null });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(`${withQuery(SETTINGS_PAGE, { error: failure })}#hapus-akun`);

  // Akun sudah tidak ada; yang tersisa hanya cookie sesi di peramban ini.
  if (dataMode === 'seed') {
    await endDemoSession();
  } else {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error('[akun] gagal membersihkan sesi setelah hapus akun:', error);
    }
  }
  revalidatePath('/', 'layout');
  redirect(withQuery('/', { notice: 'account_deleted' }));
}

/**
 * Pengingat tenggat lewat email (ADR-062 #6). Tombol yang ditekan adalah
 * tindakan persetujuan; waktunya dicatat server (RPC), bukan dari form.
 */
export async function setDeadlineEmailRemindersAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect(loginHref(SETTINGS_PAGE));
  const enabled = text(formData, 'mode') === 'on';

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).setDeadlineEmailReminders(user.id, enabled);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(`${withQuery(SETTINGS_PAGE, { error: failure })}#pengingat-email`);
  revalidatePath(SETTINGS_PAGE);
  redirect(`${withQuery(SETTINGS_PAGE, { notice: enabled ? 'email_reminders_on' : 'email_reminders_off' })}#pengingat-email`);
}
