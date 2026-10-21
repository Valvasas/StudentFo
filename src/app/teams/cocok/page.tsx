import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { FormView } from './form-view';
import { ResultsView } from './results-view';
import { PAGE } from './shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cocokkan tim',
  description: 'Radar yang mencarikan rekan satu tim: sesuai keahlian, dekat dari kotamu, dan portofolionya meyakinkan.',
  robots: { index: false, follow: false },
};

export default async function MatchPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const user = await requireUser(PAGE);
  const profile = await (await getEventRepository()).getSeekerProfile(user.id);

  // Kartu belum ada, tertutup, atau sedang diubah → form. Hasil hanya untuk kartu terbuka
  // (timbal-balik, ADR-057): repository pun mengembalikan daftar kosong selain itu.
  if (!profile?.open || firstParam(params.ubah) === '1') return <FormView user={user} params={params} profile={profile} />;
  return <ResultsView user={user} params={params} profile={profile} />;
}
