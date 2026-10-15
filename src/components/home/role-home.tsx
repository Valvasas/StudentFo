import { PersonalHome } from '@/components/home/personal-home';
import type { AuthUser } from '@/lib/auth';
import type { RawSearchParams } from '@/lib/search-params';

/** Beranda pengguna masuk, dipilih menurut peran (ADR-056). */
export async function RoleHome({ user, params }: { user: AuthUser; params: RawSearchParams }) {
  return <PersonalHome user={user} params={params} />;
}
