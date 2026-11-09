import { cache } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PublicProfileView } from '@/components/profile/public-profile-view';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import type { RawSearchParams } from '@/lib/search-params';
import type { PublicProfile, PublicProfileDetails } from '@/types/domain';

export const dynamic = 'force-dynamic';

/** Dipanggil generateMetadata DAN halaman; satu query per request. */
const loadProfile = cache(async (viewerId: string, userId: string): Promise<PublicProfile | null> =>
  (await getEventRepository()).getPublicProfile(viewerId, userId),
);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser(`/orang/${id}`);
  const profile = await loadProfile(user.id, id);
  return { title: profile ? profile.person.fullName : 'Profil', robots: { index: false, follow: false } };
}

function queryString(query: RawSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) for (const item of [value ?? []].flat()) params.append(key, item);
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * Profil publik lewat id (ADR-046). Sejak ADR-077 orang yang sudah memasang
 * username dialihkan ke `/u/<username>` — alamat yang enak dibagikan — dengan
 * query (`notice=`/`error=` dari aksi Hubungkan) ikut terbawa. Tautan lama
 * berbasis id tetap berfungsi.
 */
export default async function PublicProfileByIdPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const self = `/orang/${id}`;
  const user = await requireUser(self);
  if (id === user.id) redirect('/profile?tampilan=publik&tab=portofolio');

  const repository = await getEventRepository();
  const [profile, details] = await Promise.all([
    loadProfile(user.id, id),
    withFallback('detail profil', () => repository.listPublicProfileDetails(user.id, [id]), new Map<string, PublicProfileDetails>()),
  ]);
  const username = profile ? details.get(id)?.username : null;
  if (username) redirect(`/u/${username}${queryString(query)}`);

  return <PublicProfileView viewer={user} profile={profile} details={details.get(id) ?? null} selfPath={self} query={query} />;
}
