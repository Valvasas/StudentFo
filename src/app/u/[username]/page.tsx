import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PublicPortfolioView } from '@/components/profile/public-portfolio-view';
import { PublicProfileView } from '@/components/profile/public-profile-view';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import { loginHref } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';
import type { PublicProfileDetails } from '@/types/domain';

export const dynamic = 'force-dynamic';

const resolve = cache(async (viewerId: string, username: string): Promise<string | null> =>
  (await getEventRepository()).resolveUsername(viewerId, username),
);

const loadProfile = cache(async (viewerId: string, userId: string) => (await getEventRepository()).getPublicProfile(viewerId, userId));

const loadPortfolio = cache(async (username: string) =>
  withFallback('portofolio publik', async () => (await getEventRepository()).getPublicPortfolioPage(username), null),
);

const session = cache(() => withFallback('sesi pengguna', getSessionUser, null));

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const username = decodeURIComponent((await params).username);
  const user = await session();
  const id = user ? await resolve(user.id, username) : null;
  const profile = user && id ? await loadProfile(user.id, id) : null;
  if (profile) {
    return { title: `${profile.person.fullName} (@${username.toLowerCase()})`, robots: { index: false, follow: false } };
  }
  const page = await loadPortfolio(username);
  // Tetap noindex walau terbuka untuk siapa saja dengan tautan: pemilik 13–17 tahun ikut memakai fitur ini,
  // dan nama + sekolah di indeks mesin pencari sulit ditarik kembali (ADR-098). Dibagikan lewat tautan, bukan dicari.
  if (page) {
    return {
      title: `Portofolio ${page.fullName} (@${page.username})`,
      description: `Riwayat lomba & prestasi ${page.fullName}${page.institutionName ? `, ${page.institutionName}` : ''}, di StudentFo.`,
      robots: { index: false, follow: true },
    };
  }
  return { title: 'Profil', robots: { index: false, follow: false } };
}

/**
 * Halaman profil per username (ADR-077) — `/u/rani.prameswari`.
 *
 * Dua bentuk (ADR-098): anggota yang BOLEH melihat profil lengkap
 * (`can_view_profile`) mendapat profil anggota seperti biasa; selain itu,
 * bila pemiliknya menyalakan portofolio publik, siapa pun — termasuk tamu —
 * mendapat portofolio publik yang sempit. Tidak ada keduanya: tamu tetap
 * dialihkan ke Masuk, anggota mendapat 404 — sama seperti sebelumnya, jadi
 * URL ini bukan alat menebak siapa yang terdaftar.
 */
export default async function UsernameProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ username: raw }, query] = await Promise.all([params, searchParams]);
  const username = decodeURIComponent(raw);
  const self = `/u/${username}`;
  const user = await session();

  const id = user ? await resolve(user.id, username) : null;
  if (user && id) {
    if (id === user.id) redirect('/profile?tampilan=publik');
    // Huruf besar di URL → bentuk kanonik huruf kecil.
    if (username !== username.toLowerCase()) redirect(`/u/${username.toLowerCase()}`);
    const repository = await getEventRepository();
    const [profile, details] = await Promise.all([
      loadProfile(user.id, id),
      withFallback('detail profil', () => repository.listPublicProfileDetails(user.id, [id]), new Map<string, PublicProfileDetails>()),
    ]);
    return <PublicProfileView viewer={user} profile={profile} details={details.get(id) ?? null} selfPath={self} query={query} />;
  }

  const page = await loadPortfolio(username);
  if (page) {
    if (username !== page.username) redirect(`/u/${page.username}`);
    return <PublicPortfolioView page={page} signedIn={user !== null} />;
  }
  if (!user) redirect(loginHref(self));
  notFound();
}
