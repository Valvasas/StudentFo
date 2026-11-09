import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PublicProfileView } from '@/components/profile/public-profile-view';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import type { RawSearchParams } from '@/lib/search-params';
import type { PublicProfileDetails } from '@/types/domain';

export const dynamic = 'force-dynamic';

const resolve = cache(async (viewerId: string, username: string): Promise<string | null> =>
  (await getEventRepository()).resolveUsername(viewerId, username),
);

const loadProfile = cache(async (viewerId: string, userId: string) => (await getEventRepository()).getPublicProfile(viewerId, userId));

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const user = await requireUser(`/u/${username}`);
  const id = await resolve(user.id, decodeURIComponent(username));
  const profile = id ? await loadProfile(user.id, id) : null;
  // Tetap noindex: profil hanya untuk anggota yang masuk (ADR-077), bukan halaman publik mesin pencari.
  return { title: profile ? `${profile.person.fullName} (@${decodeURIComponent(username).toLowerCase()})` : 'Profil', robots: { index: false, follow: false } };
}

/**
 * Halaman profil per username (ADR-077) — `/u/rani.prameswari`. Username
 * yang tidak ada dan profil yang tidak boleh dilihat sama-sama 404
 * (`user_id_by_username`), jadi URL ini bukan alat menebak siapa yang terdaftar.
 */
export default async function UsernameProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ username: raw }, query] = await Promise.all([params, searchParams]);
  const username = decodeURIComponent(raw);
  const self = `/u/${username}`;
  const user = await requireUser(self);
  const id = await resolve(user.id, username);
  if (!id) notFound();
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
