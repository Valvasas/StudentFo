import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { CreateTeamForm } from '@/components/team/create-team-form';
import { IllustrationStage } from '@/components/ui/feature-hero';
import { PlantFlagSketch } from '@/components/ui/feature-illustrations';
import { HandNote } from '@/components/ui/sketch';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { firstParam, parseEventQuery, type RawSearchParams } from '@/lib/search-params';

/**
 * Buka tim baru (ADR-054) — dulu form terlipat di kolom samping /teams.
 *
 * Halaman sendiri karena membuka tim adalah tugas yang berbeda dari mencari
 * tim: butuh lebar untuk menulis keterangan dan melihat pratinjau, dan
 * setelah selesai pengguna diarahkan ke halaman timnya, bukan kembali ke daftar.
 * `?kegiatan=<slug>` memilihkan kegiatannya bila dibuka dari halaman kegiatan
 * atau dari /teams yang sudah disaring.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Buka tim baru',
  robots: { index: false, follow: false },
};

export default async function NewTeamPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const slug = firstParam(params.kegiatan);
  const self = slug ? `/teams/baru?kegiatan=${encodeURIComponent(slug)}` : '/teams/baru';
  const user = await requireUser(self);
  const repository = await getEventRepository();

  const [listing, scoped] = await Promise.all([
    // Tim hanya masuk akal untuk kegiatan yang masih terbuka. Diurutkan dari
    // tenggat terdekat supaya pilihan teratas adalah yang paling mendesak.
    repository.listEvents({ ...parseEventQuery({}), sort: 'deadline', pageSize: 48 }),
    slug ? repository.getEventBySlug(slug) : Promise.resolve(null),
  ]);
  // Kegiatan yang dipilih lewat URL tetap ada di pilihan walau di luar 48 teratas.
  const events = scoped && !listing.items.some((item) => item.id === scoped.id) ? [scoped, ...listing.items] : listing.items;
  const backHref = scoped ? `/teams?kegiatan=${encodeURIComponent(scoped.slug)}` : '/teams';

  return (
    <div className="container-page pb-24 pt-6 sm:pt-10">
      <Link href={backHref} className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Cari tim
      </Link>

      <header className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="enter flex flex-col gap-4 [animation-duration:900ms]">
          <HandNote className="text-[22px] text-ink-muted">tiga langkah, ±1 menit</HandNote>
          <h1 className="-mt-1 text-[clamp(36px,5vw,56px)] leading-[1]">
            Buka <span className="marker">tim baru</span>
          </h1>
          <p className="max-w-[52ch] text-[16px] leading-relaxed text-ink-muted">
            Pilih kegiatannya, ceritakan siapa yang kamu cari, lalu tentukan jumlah kursinya. Timmu langsung tampil di Cari Tim dan di halaman kegiatannya.
          </p>
        </div>
        <IllustrationStage tint="mint" className="enter hidden pb-3 pt-6 [animation-delay:140ms] md:flex">
          <PlantFlagSketch />
        </IllustrationStage>
      </header>

      <ActionFeedback params={params} className="mt-8 max-w-2xl" />

      <div className="mt-10">
        <CreateTeamForm
          events={events}
          defaultEventId={scoped?.id ?? ''}
          returnTo={self}
          cancelHref={backHref}
          leader={{ id: user.id, name: user.fullName }}
        />
      </div>
    </div>
  );
}
