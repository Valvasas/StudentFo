import type { Metadata } from 'next';
import { GuestLanding } from '@/components/landing/guest-landing';
import { RoleHome } from '@/components/home/role-home';
import { JsonLd } from '@/components/seo/json-ld';
import { getSessionUser } from '@/lib/auth';
import { siteUrl } from '@/lib/env';
import { withFallback } from '@/lib/fallback';
import type { RawSearchParams } from '@/lib/search-params';
import { organizationJsonLd, websiteJsonLd } from '@/lib/structured-data';

// Canonical di halaman, bukan di layout: canonical di layout diwarisi SEMUA halaman (ADR-097).
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

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
  return (
    <>
      <JsonLd data={[organizationJsonLd(siteUrl), websiteJsonLd(siteUrl)]} />
      {user ? <RoleHome user={user} params={params} /> : <GuestLanding params={params} />}
    </>
  );
}
