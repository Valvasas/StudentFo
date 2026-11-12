'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCOUNT_SIDEBAR_COOKIE, ACCOUNT_SIDEBAR_MAX_AGE, isSidebarCollapsed } from '@/lib/account-sidebar';
import { type ActionErrorCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { getSessionUser, requireUser } from '@/lib/auth';
import { type AuthErrorCode } from '@/lib/auth-messages';
import { getEventRepository } from '@/lib/data';
import { PROFILE_LIMITS, profileSchema } from '@/lib/auth-schema';
import { cleanStudyFields, withParentCategories } from '@/lib/study-fields';
import { readImageUpload } from '@/lib/image-file';
import { parseProfileIdentity } from '@/lib/profile-identity';
import { exceedsProfileLimit, toBannerPreset, toProfileMediaKind } from '@/lib/profile-media';
import { parseStudyPlace } from '@/lib/study-profile';
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
  // Hanya halaman Peminatan yang mengirim bidang spesifik (ADR-075); halaman
  // lain yang memakai aksi ini tidak boleh mengosongkannya.
  const studyFields = formData.has('studyFieldsPresent') ? cleanStudyFields(formList(formData, 'studyFields')) : null;
  const interests = formList(formData, 'interests');

  const parsed = profileSchema.safeParse({
    fullName: text(formData, 'fullName'),
    educationLevel: EDUCATION_LEVELS.includes(level as EducationLevel)
      ? (level as EducationLevel)
      : null,
    major: major || null,
    // Bidang spesifik selalu membawa induknya: rekomendasi membaca kategori, bukan bidang.
    interests: studyFields ? withParentCategories(interests, studyFields, PROFILE_LIMITS.interests) : interests,
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

  if (!failure && studyFields) {
    try {
      const user = await getSessionUser();
      if (user) await (await getEventRepository()).saveStudyFields(user.id, studyFields);
    } catch (error) {
      console.error('[profil] bidang spesifik gagal disimpan:', error);
      failure = 'unknown';
    }
  }

  if (failure) {
    redirect(`${returnTo}?error=${failure}`);
  }

  revalidatePath('/', 'layout');
  redirect(`${returnTo}?notice=profile_saved`);
}

/**
 * Username, bio, keterlihatan profil (ADR-077). Kartu sendiri: kolomnya baru
 * (urutan deploy) dan keunikan username hanya bisa dipastikan database.
 */
export async function updateProfileIdentityAction(formData: FormData): Promise<void> {
  const returnTo = '/profile/details';
  const user = await requireUser(returnTo);
  const parsed = parseProfileIdentity(formData);
  if (!parsed.ok) redirect(withQuery(returnTo, { ubah: 'publik', error: 'invalid_profile_identity' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).saveProfileIdentity(user.id, parsed.value);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(withQuery(returnTo, { ubah: 'publik', error: failure }));
  revalidatePath('/profile', 'layout');
  redirect(`${withQuery(returnTo, { notice: 'profile_identity_saved' })}#publik`);
}

const PROFILE_MEDIA_RETURN = '/profile/details';
const profileMediaReturn = (params: Record<string, string>) => `${withQuery(PROFILE_MEDIA_RETURN, params)}#tampilan`;

/**
 * Unggah foto profil atau banner (ADR-083). Jenis berkas dibaca dari BYTE-nya
 * dan metadatanya dibuang (`readImageUpload`); batas khusus gambar profil
 * diperiksa di sini karena gambarnya disajikan apa adanya ke setiap pembaca.
 * Pemilik = sesi server, tidak pernah dari form.
 */
export async function uploadProfileImageAction(formData: FormData): Promise<void> {
  const user = await requireUser(PROFILE_MEDIA_RETURN);
  const kind = toProfileMediaKind(text(formData, 'kind'));
  if (!kind) redirect(profileMediaReturn({ error: 'image_invalid' }));

  const upload = await readImageUpload(formData.get('image'));
  if (!upload.ok) redirect(profileMediaReturn({ error: upload.error === 'image_too_large' ? 'profile_image_too_large' : upload.error }));
  if (exceedsProfileLimit(kind, upload.image)) redirect(profileMediaReturn({ error: 'profile_image_too_large' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).setProfileImage(user.id, kind, upload.image);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(profileMediaReturn({ error: failure }));
  // Foto tampil di navbar setiap halaman.
  revalidatePath('/', 'layout');
  redirect(profileMediaReturn({ notice: kind === 'avatar' ? 'avatar_saved' : 'banner_saved' }));
}

export async function removeProfileImageAction(formData: FormData): Promise<void> {
  const user = await requireUser(PROFILE_MEDIA_RETURN);
  const kind = toProfileMediaKind(text(formData, 'kind'));
  if (!kind) redirect(profileMediaReturn({ error: 'image_invalid' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).removeProfileImage(user.id, kind);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(profileMediaReturn({ error: failure }));
  revalidatePath('/', 'layout');
  redirect(profileMediaReturn({ notice: kind === 'avatar' ? 'avatar_removed' : 'banner_removed' }));
}

/** Banner bawaan; nilai kosong = kembali ke kertas bertitik. Nilai di luar daftar ditolak, bukan disimpan. */
export async function setBannerPresetAction(formData: FormData): Promise<void> {
  const user = await requireUser(PROFILE_MEDIA_RETURN);
  const raw = text(formData, 'preset');
  const preset = toBannerPreset(raw);
  if (raw && !preset) redirect(profileMediaReturn({ error: 'invalid_banner_preset' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).setBannerPreset(user.id, preset);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(profileMediaReturn({ error: failure }));
  revalidatePath('/', 'layout');
  redirect(profileMediaReturn({ notice: 'banner_preset_saved' }));
}

/**
 * Tempat studi & domisili (ADR-076). Kartu sendiri, bukan `updateProfileAction`:
 * kolomnya baru (urutan deploy) dan validasinya butuh direktori server.
 */
export async function updateStudyPlaceAction(formData: FormData): Promise<void> {
  const returnTo = '/profile/details';
  const user = await requireUser(returnTo);
  const parsed = parseStudyPlace(formData);
  if (!parsed.ok) redirect(withQuery(returnTo, { ubah: 'asal', error: 'invalid_study_place' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).saveStudyPlace(user.id, parsed.value);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(withQuery(returnTo, { ubah: 'asal', error: failure }));
  revalidatePath('/profile', 'layout');
  redirect(`${withQuery(returnTo, { notice: 'study_place_saved' })}#asal`);
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

/**
 * Saklar pengingat tenggat (ADR-067). Nilai kotak centang, bukan "balik
 * keadaan": dua tab yang menyimpan bersamaan berakhir di pilihan terakhir
 * yang jelas, bukan saling membatalkan.
 */
export async function updateNotificationPreferencesAction(formData: FormData): Promise<void> {
  const returnTo = '/profile/settings/notifikasi';
  const user = await requireUser(returnTo);
  const deadlineReminders = formData.get('deadlineReminders') === 'on';

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).updateNotificationPreferences(user.id, { deadlineReminders });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(withQuery(returnTo, { error: failure }));
  revalidatePath('/profile/settings', 'layout');
  redirect(withQuery(returnTo, { notice: deadlineReminders ? 'reminders_on' : 'reminders_off' }));
}

/** Hapus akun tinggal di Privasi & data (hak penghapusan UU PDP, di samping unduh salinan). */
const PRIVACY_PAGE = '/profile/privacy';
/** Pengingat email berdampingan dengan saklar pengingat di lonceng (ADR-067). */
const NOTIFICATION_SETTINGS_PAGE = '/profile/settings/notifikasi';

/**
 * Hapus akun sendiri (ADR-061, UU PDP Pasal 8). Konfirmasi ketik frasa —
 * bukan sandi, karena akun Google tidak punya sandi; sesi yang sah + frasa
 * yang disengaja sudah membuktikan niat pemilik.
 */
export async function deleteOwnAccountAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect(loginHref(PRIVACY_PAGE));
  if (!isDeleteConfirmed(text(formData, 'confirm'))) redirect(`${withQuery(PRIVACY_PAGE, { error: 'account_delete_confirm' })}#hapus-akun`);

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).deleteAccount({ userId: user.id, actorId: user.id, reason: null });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(`${withQuery(PRIVACY_PAGE, { error: failure })}#hapus-akun`);

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
  if (!user) redirect(loginHref(NOTIFICATION_SETTINGS_PAGE));
  const enabled = text(formData, 'mode') === 'on';

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).setDeadlineEmailReminders(user.id, enabled);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(`${withQuery(NOTIFICATION_SETTINGS_PAGE, { error: failure })}#pengingat-email`);
  revalidatePath(NOTIFICATION_SETTINGS_PAGE);
  redirect(`${withQuery(NOTIFICATION_SETTINGS_PAGE, { notice: enabled ? 'email_reminders_on' : 'email_reminders_off' })}#pengingat-email`);
}

/** Saklar "tampilkan lencanaku" (ADR-072). Nilai eksplisit dari form, bukan "balik keadaan" — dua tab tidak saling membatalkan. */
export async function setBadgeVisibilityAction(formData: FormData): Promise<void> {
  const returnTo = '/profile?tab=lencana';
  const user = await requireUser(returnTo);
  const show = text(formData, 'show') === 'on';

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).setBadgeVisibility(user.id, show);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(withQuery(returnTo, { error: failure }));
  revalidatePath('/profile');
  redirect(withQuery(returnTo, { notice: show ? 'badges_shown' : 'badges_hidden' }));
}
