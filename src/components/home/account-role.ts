import { cache } from 'react';
import { accountRoleOf, type AccountRole } from '@/lib/account-sidebar';
import type { AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import type { EventRegistration, OrganizerProfile } from '@/types/domain';

/*
 * Navbar, menu samping, dan beranda membaca data yang sama dalam satu
 * request; `cache` menyatukannya jadi satu query per request. Semuanya
 * PENDUKUNG (navbar ada di root layout — ADR-047): gagal dimuat = tampilan
 * peserta / tanpa angka, bukan seluruh situs jatuh.
 */
const loadOrganizerProfile = cache(
  (userId: string): Promise<OrganizerProfile | null> =>
    withFallback('profil penyelenggara', async () => (await getEventRepository()).getOrganizerProfile(userId), null),
);

export const loadMyRegistrations = cache(
  (userId: string): Promise<readonly EventRegistration[]> =>
    withFallback('pendaftaran saya', async () => (await getEventRepository()).listMyRegistrations(userId), []),
);

export interface AccountRoleContext {
  readonly role: AccountRole;
  readonly organizer: OrganizerProfile | null;
}

export async function loadAccountRole(user: AuthUser): Promise<AccountRoleContext> {
  // Admin tidak butuh profil penyelenggara untuk menentukan tampilannya.
  if (user.role === 'ADMIN') return { role: 'admin', organizer: null };
  const organizer = await loadOrganizerProfile(user.id);
  return { role: accountRoleOf(user.role, organizer?.status ?? null), organizer };
}

const loadSavedCount = cache(
  (userId: string): Promise<number> =>
    withFallback('jumlah tersimpan', async () => (await (await getEventRepository()).listSavedEventIds(userId)).length, 0),
);

/** Angka di samping item menu akun (`AccountBadge`) — dropdown navbar & menu samping. */
export interface AccountBadgeCounts {
  readonly saved: number;
  /** Tagihan yang belum dibayar. */
  readonly paymentDue: number;
}

export async function loadAccountBadges(userId: string): Promise<AccountBadgeCounts> {
  const [saved, registrations] = await Promise.all([loadSavedCount(userId), loadMyRegistrations(userId)]);
  return { saved, paymentDue: registrations.filter((registration) => registration.status === 'AWAITING_PAYMENT').length };
}
