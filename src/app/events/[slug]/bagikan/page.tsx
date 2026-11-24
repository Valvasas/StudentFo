import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Send, UserRoundPlus } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { requireUser } from '@/lib/auth';
import { communityDisplayName } from '@/lib/community';
import { getEventRepository } from '@/lib/data';
import { EVENT_SHARE_LIMITS } from '@/lib/event-comments';
import { withFallback } from '@/lib/fallback';
import { sectionTitle } from '@/lib/page-title';
import type { RawSearchParams } from '@/lib/search-params';
import { shareEventAction } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await (await getEventRepository()).getEventBySlug(slug);
  return { title: event ? sectionTitle('Kirim ke koneksi', event.title) : 'Kirim ke koneksi', robots: { index: false, follow: false } };
}

/**
 * Bagikan ke koneksi StudentFo (ADR-092): pilih koneksi, mereka dikabari
 * lewat lonceng dengan kalimat tetap — bukan pesan bebas, jadi tidak membuka
 * saluran privat antar-orang asing (ADR-062 #7). Kotak centang biasa, tanpa
 * JavaScript; batas jumlah penerima ditegakkan server (aksi + RPC).
 */
export default async function ShareToConnectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/events/${slug}/bagikan`);
  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(slug);
  if (!event) notFound();
  const recipients = await withFallback('koneksi untuk dibagikan', () => repository.listShareRecipients(user), []);
  const open = event.status === 'APPROVED';

  return (
    <div className="container-page pb-24 pt-6 sm:pt-8">
      <div className="mx-auto flex max-w-[640px] flex-col gap-6">
        <Link href={`/events/${event.slug}`} className="flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> Kembali ke kegiatan
        </Link>
        <header className="flex flex-col gap-2">
          <p className="text-[13.5px] font-semibold text-ink-muted">Kirim ke koneksi StudentFo</p>
          <h1 className="text-[clamp(24px,4vw,32px)] leading-[1.15] tracking-[-0.03em] [overflow-wrap:anywhere] [text-wrap:balance]">{event.title}</h1>
          <p className="text-[14.5px] text-ink-soft">
            Koneksi yang kamu pilih menerima kabar di lonceng notifikasi: “{communityDisplayName(user.fullName)} membagikan kegiatan ini kepadamu”. Tanpa
            pesan tambahan — untuk ngobrol, pakai Komentar atau lobi lomba.
          </p>
        </header>

        <ActionFeedback params={query} />

        {!open ? (
          <p className="rounded-card bg-panel-nested px-4 py-3 text-[14.5px] text-ink-muted">Kegiatan ini sudah ditutup, jadi tidak bisa dibagikan ke koneksi lagi.</p>
        ) : recipients.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line p-6">
            <UserRoundPlus aria-hidden className="size-6 text-ink-muted" />
            <p className="text-[14.5px] text-ink-soft">Kamu belum punya koneksi yang menerima ajakanmu. Ajak teman terhubung dulu, lalu bagikan dari sini.</p>
            <Link href="/connections" className={buttonVariants({ variant: 'secondary' })}>
              Cari koneksi
            </Link>
          </div>
        ) : (
          <form action={shareEventAction} className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 sm:p-7">
            <input type="hidden" name="slug" value={event.slug} />
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-2 text-[15px] font-semibold">
                Pilih koneksi <span className="font-normal text-ink-muted">(maks. {EVENT_SHARE_LIMITS.recipientsMax} sekali kirim)</span>
              </legend>
              <ul className="flex flex-col gap-2">
                {recipients.map((person) => (
                  <li key={person.userId}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-card border border-line px-3.5 py-2 transition-colors duration-150 ease-snap has-[:checked]:border-brand has-[:checked]:bg-panel-nested">
                      <input type="checkbox" name="recipient" value={person.userId} className="check shrink-0" />
                      <Avatar name={person.fullName} seed={person.userId} size="sm" />
                      <span className="min-w-0 text-[15px] font-medium [overflow-wrap:anywhere]">{person.fullName}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ size: 'lg', className: 'w-full sm:w-auto sm:self-start' })}>
              <Send aria-hidden /> Kirim ke koneksi terpilih
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
