'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type AuthErrorCode } from '@/lib/auth-messages';
import { profileSchema } from '@/lib/auth-schema';
import { dataMode } from '@/lib/env';
import { formList, formTrimmed as text } from '@/lib/form-data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EDUCATION_LEVELS, type EducationLevel } from '@/types/domain';

export async function updateProfileAction(formData: FormData): Promise<void> {
  let failure: AuthErrorCode | null = null;

  if (dataMode === 'seed') {
    failure = 'unavailable';
  } else {
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
    redirect(`/profile?error=${failure}`);
  }

  revalidatePath('/', 'layout');
  redirect('/profile?notice=profile_saved');
}
