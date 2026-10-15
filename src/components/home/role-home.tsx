import { loadAccountRole } from '@/components/home/account-role';
import { AdminHome } from '@/components/home/admin-home';
import { OrganizerHome } from '@/components/home/organizer-home';
import { PersonalHome } from '@/components/home/personal-home';
import type { AuthUser } from '@/lib/auth';
import type { RawSearchParams } from '@/lib/search-params';

/**
 * Beranda pengguna masuk, dipilih menurut peran tampilan (ADR-056).
 * `loadAccountRole` sudah jatuh ke peserta bila profil penyelenggara gagal
 * dimuat — beranda peserta tetap berguna bagi siapa pun.
 */
export async function RoleHome({ user, params }: { user: AuthUser; params: RawSearchParams }) {
  const { role, organizer } = await loadAccountRole(user);
  if (role === 'admin') return <AdminHome user={user} params={params} />;
  if (role === 'organizer' && organizer) return <OrganizerHome user={user} organizer={organizer} params={params} />;
  return <PersonalHome user={user} params={params} />;
}
