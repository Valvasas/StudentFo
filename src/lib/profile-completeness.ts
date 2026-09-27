import type { AuthUser } from '@/lib/auth';

export interface CompletenessItem {
  readonly key: 'name' | 'education' | 'major' | 'interests';
  readonly label: string;
  readonly done: boolean;
  readonly href: string;
}

export interface ProfileCompleteness {
  readonly items: readonly CompletenessItem[];
  /** 0–100, dibulatkan. */
  readonly percent: number;
}

/**
 * Kelengkapan profil untuk cincin di halaman Profil dan bilah di menu akun.
 *
 * Hanya menghitung isian yang BENAR-BENAR tersimpan di akun. Kanvas desain
 * juga menghitung foto profil, tautan portofolio, dan dokumen — fitur itu
 * belum punya penyimpanan, dan persentase yang tidak pernah bisa mencapai
 * 100% sekeras apa pun pengguna mengisi hanya mengajarkan untuk mengabaikannya.
 */
export function profileCompleteness(
  user: Pick<AuthUser, 'fullName' | 'educationLevel' | 'major' | 'interests'>,
): ProfileCompleteness {
  const items: CompletenessItem[] = [
    { key: 'name', label: 'Nama lengkap', done: user.fullName.trim().length >= 2, href: '/profile/details' },
    { key: 'education', label: 'Jenjang pendidikan', done: user.educationLevel !== null, href: '/profile/interests' },
    { key: 'major', label: 'Program studi', done: Boolean(user.major?.trim()), href: '/profile/details' },
    { key: 'interests', label: 'Bidang minat', done: user.interests.length > 0, href: '/profile/interests' },
  ];
  const done = items.filter((item) => item.done).length;
  return { items, percent: Math.round((done / items.length) * 100) };
}
