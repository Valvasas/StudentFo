'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCOUNT_SIDEBAR_COOKIE, ACCOUNT_SIDEBAR_MAX_AGE, isSidebarCollapsed } from '@/lib/account-sidebar';
import { type AuthErrorCode } from '@/lib/auth-messages';
import { profileSchema } from '@/lib/auth-schema';
import { updateDemoProfile } from '@/lib/demo/session';
import { dataMode } from '@/lib/env';
import { formList, formTrimmed as text } from '@/lib/form-data';
import { safeNextPath } from '@/lib/safe-redirect';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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
