import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Check, GraduationCap, Info, UserPlus } from 'lucide-react';
import { requestConnectionAction } from '@/app/connections/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { CategoryIcon } from '@/components/listing/category-icon';
import { PortfolioList } from '@/components/profile/portfolio-list';
import { SubmitButton } from '@/components/ui/submit-button';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { initialsOf } from '@/lib/initials';
import type { RawSearchParams } from '@/lib/search-params';
import { EDUCATION_LEVEL_LABEL, type ProfileRelation, type PublicProfile } from '@/types/domain';

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

const RELATION_TEXT: Record<Exclude<ProfileRelation, null | 'self'>, string> = {
  connected: 'Terhubung denganmu',
  incoming: 'Mengajakmu terhubung',
  outgoing: 'Ajakanmu menunggu jawaban',
};

/**
 * Profil publik seseorang (ADR-046): kolom yang sama dengan kartu Cari
 * Koneksi + portofolio. Aturan kelihatannya ada di repository/SQL (bisa
 * ditemukan ATAU berkoneksi, tidak saling memblokir) — halaman ini tidak
 * menambah jalur baca sendiri. Tidak boleh dilihat dan tidak ada sama-sama
 * 404, supaya URL tidak jadi alat menebak siapa yang terdaftar.
 */
export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const self = `/orang/${id}`;
  const user = await requireUser(self);
  if (id === user.id) redirect('/profile?tampilan=publik&tab=portofolio');

  const [profile, repository] = await Promise.all([loadProfile(user.id, id), getEventRepository()]);
  if (!profile) notFound();
  const categories = await repository.listCategories();
  const { person, relation, portfolio } = profile;
  const interests = person.interests
    .map((slug) => categories.find((category) => category.slug === slug))
    .filter((category): category is NonNullable<typeof category> => Boolean(category));
  const now = new Date();

  return (
    <div className="container-page flex max-w-3xl flex-col gap-6 pb-16 pt-8">
      <Link href="/connections" className="-mb-2 flex min-h-11 items-center gap-1.5 self-start text-[13.5px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Koneksi
      </Link>

      <ActionFeedback params={query} />

      <section aria-labelledby="nama-orang" className="enter flex flex-col gap-4 rounded-[20px] border border-line p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <span aria-hidden className="flex size-16 items-center justify-center rounded-pill bg-brand text-xl font-semibold text-on-brand">
            {initialsOf(person.fullName)}
          </span>
          {relation && relation !== 'self' ? (
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-sm bg-panel-nested px-3 text-[13px] font-medium">
              {relation === 'connected' && <Check aria-hidden className="size-4" />}
              {RELATION_TEXT[relation]}
              {relation === 'incoming' && (
                <Link href="/connections#ajakan-masuk" className="ml-1 underline underline-offset-[3px]">
                  Jawab
                </Link>
              )}
            </span>
          ) : (
            <form action={requestConnectionAction}>
              <input type="hidden" name="targetId" value={person.userId} />
              <input type="hidden" name="returnTo" value={self} />
              <SubmitButton className="flex h-11 items-center gap-1.5 rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
                <UserPlus aria-hidden className="size-4" /> Hubungkan
                <span className="sr-only"> dengan {person.fullName}</span>
              </SubmitButton>
            </form>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 id="nama-orang" className="text-[clamp(28px,4vw,36px)] leading-[1.05] tracking-[-0.04em]">
            {person.fullName}
          </h1>
          {person.headline && <p className="text-base text-ink-soft">{person.headline}</p>}
        </div>
        <p className="flex items-center gap-1.5 text-[13.5px] text-ink-muted">
          <GraduationCap aria-hidden className="size-4" />
          {[person.major, person.educationLevel ? EDUCATION_LEVEL_LABEL[person.educationLevel] : null].filter(Boolean).join(' · ') ||
            'Program studi & jenjang belum diisi'}
        </p>
        {interests.length > 0 && (
          <ul aria-label="Minat" className="flex flex-wrap gap-1.5">
            {interests.map((category) => (
              <li key={category.slug} className="flex h-[30px] items-center gap-1.5 rounded-sm bg-panel-nested px-[11px] text-[13px] font-medium">
                <CategoryIcon slug={category.slug} />
                {category.name.split(' & ')[0]}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="portofolio-orang" className="flex flex-col gap-1.5 rounded-[18px] border border-line p-5 sm:p-6">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="portofolio-orang" className="text-base font-semibold">
            Portofolio
          </h2>
          <span className="text-[12.5px] text-ink-muted">{portfolio.length} kegiatan</span>
        </div>
        <PortfolioList rows={portfolio.map((entry) => ({ entry }))} now={now} emptyText="Belum ada kegiatan yang ditampilkan." />
        {portfolio.length > 0 && (
          <p className="mt-2 flex items-start gap-2 text-[12.5px] leading-normal text-ink-muted">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Dicatat pemilik profil dari pendaftarannya di StudentFo. Hasil (juara, finalis, dst.) dilaporkan sendiri dan belum
            diverifikasi penyelenggara — cek tautan bukti bila ada.
          </p>
        )}
      </section>
    </div>
  );
}
