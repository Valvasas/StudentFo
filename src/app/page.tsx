import { GuestLanding } from '@/components/landing/guest-landing';
import { RoleHome } from '@/components/home/role-home';
import { getSessionUser } from '@/lib/auth';
import { withFallback } from '@/lib/fallback';
import type { RawSearchParams } from '@/lib/search-params';

/**
 * Beranda: pemasaran untuk tamu, ruang kerja sesuai peran untuk yang sudah
 * masuk (ADR-053, ADR-056). Satu URL, beberapa isi — `/` adalah tujuan logo &
 * setelah masuk, jadi bagi pengguna terdaftar ia harus menjadi "rumah" sesuai
 * tugas utamanya, bukan iklan. Sesi gagal dibaca → diperlakukan sebagai tamu
 * (pola navbar, ADR-047), bukan halaman error.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await withFallback('sesi pengguna', getSessionUser, null);
  const params = await searchParams;
  if (user) return <RoleHome user={user} params={params} />;
  return <GuestLanding params={params} />;
}
