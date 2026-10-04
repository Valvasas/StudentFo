import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Megaphone, Search, ShieldCheck } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { SelectInput, TextInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { checkAdminAccess } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { isPromoted } from '@/lib/data/listing';
import { daysUntil, formatDateId, jakartaDateKey } from '@/lib/deadline';
import { MAX_PROMOTION_DAYS } from '@/lib/event-presentation';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import {
  VERIFICATION_BADGE_DESCRIPTION,
  VERIFICATION_BADGE_LABEL,
  VERIFICATION_BADGES,
  type EventSummary,
} from '@/types/domain';
import { updateEventPresentationAction } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Lencana & promosi',
  robots: { index: false, follow: false },
};

const FEATURED_LIMIT = 50;
const RESULT_LIMIT = 20;

function promotionStatus(event: EventSummary, now: Date): string {
  if (!event.featuredUntil) return '—';
  if (isPromoted(event, now)) return `Tayang di atas sampai ${formatDateId(event.featuredUntil)}`;
  if (new Date(event.featuredUntil).getTime() <= now.getTime()) return `Selesai ${formatDateId(event.featuredUntil)}`;
  // Masa promosi belum habis tapi kegiatannya sudah tutup: tidak diangkat.
  return 'Tertahan — pendaftaran sudah tutup';
}

/**
 * Lencana otoritas penyelenggara & promosi berbayar (ADR-049).
 *
 * Dua keputusan dengan bobot berbeda di satu halaman karena keduanya
 * mengubah cara SATU kartu tampil di katalog, dan keduanya hanya untuk
 * acara yang sudah tayang. Lencana = klaim kepercayaan (cek sumber resmi
 * dulu); promosi = kesepakatan komersial (cek pembayaran dulu). Tidak ada
 * yang mengubah skor relevansi.
 */
export default async function PresentationPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const gate = await checkAdminAccess();
  if (!gate.allowed) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <ShieldCheck aria-hidden className="size-10 text-ink-faint" />
        <h1 className="text-2xl">Akses terbatas</h1>
        <p className="max-w-md text-ink-muted">Pengaturan lencana & promosi hanya untuk akun berperan admin.</p>
        {gate.reason === 'unauthenticated' && (
          <Button asChild>
            <Link href="/login?next=%2Fadmin%2Fpromosi">Masuk</Link>
          </Button>
        )}
      </div>
    );
  }

  const search = (firstParam(params.q) ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const repository = await getEventRepository();
  const [featured, results] = await Promise.all([
    repository.listFeaturedEvents(FEATURED_LIMIT),
    repository.listEvents({ search, sort: 'newest', pageSize: RESULT_LIMIT }),
  ]);
  const now = new Date();
  const today = jakartaDateKey(now);
  const lastDay = jakartaDateKey(new Date(now.getTime() + MAX_PROMOTION_DAYS * 86_400_000));

  return (
    // scroll-mt pada setiap kontrol: halaman ini panjang (satu form per acara),
    // dan kontrol yang digulir/difokus tidak boleh mendarat di bawah navbar
    // lengket 64px (WCAG 2.2 — 2.4.11 Focus Not Obscured).
    <div className="container-page py-8 [&_:is(a,button,input,select)]:scroll-mt-24">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1 text-sm text-brand-text hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Kembali ke antrean
      </Link>
      <header className="mb-6 mt-2">
        <h1 className="flex items-center gap-2 text-3xl">
          <Megaphone aria-hidden className="size-7 text-ink-muted" />
          Lencana & promosi
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Lencana menyatakan <strong className="font-semibold">siapa otoritas</strong> di balik acara — berikan hanya
          setelah mencocokkan dengan kanal resmi. Promosi menaruh acara di puncak daftar umum dengan label
          “Promosi” sampai tanggal yang dibayar; skor relevansinya tidak berubah.
        </p>
      </header>

      <ActionFeedback params={params} className="mb-6 max-w-2xl" />

      <section aria-labelledby="promosi-terjadwal" className="mb-10">
        <h2 id="promosi-terjadwal" className="text-xl">
          Promosi terjadwal
        </h2>
        {featured.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Belum ada acara yang dipromosikan.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line rounded-card border border-line bg-panel">
            {featured.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <Link href={`/events/${event.slug}`} className="inline-flex min-h-11 items-center font-medium hover:underline">
                  {event.title}
                </Link>
                <span className="text-ink-muted">{promotionStatus(event, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="atur-acara">
        <h2 id="atur-acara" className="text-xl">
          Atur acara tayang
        </h2>
        <form action="/admin/promosi" method="get" role="search" className="mt-3 flex max-w-xl gap-2">
          <TextInput
            type="search"
            name="q"
            defaultValue={search}
            maxLength={120}
            placeholder="Cari judul atau penyelenggara"
            aria-label="Cari judul atau penyelenggara"
          />
          <Button type="submit" variant="secondary">
            <Search aria-hidden /> Cari
          </Button>
        </form>
        <p className="mt-2 text-sm text-ink-muted">
          {search ? `${results.total} acara terbuka cocok dengan “${search}”.` : 'Acara terbuka terbaru.'} Acara yang sudah tutup tidak bisa
          dipromosikan.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {results.items.map((event) => {
            const activeUntil =
              event.featuredUntil && (daysUntil(event.featuredUntil, now) ?? -1) >= 0 ? jakartaDateKey(new Date(event.featuredUntil)) : '';
            const badgeId = `lencana-${event.id}`;
            const untilId = `promosi-${event.id}`;
            return (
              <li key={event.id} className="rounded-card border border-line bg-panel p-4">
                <form action={updateEventPresentationAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="q" value={search} />
                  <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                    <Link href={`/events/${event.slug}`} className="inline-flex min-h-11 items-center font-semibold hover:underline">
                      {event.title}
                    </Link>
                    <span className="text-sm text-ink-muted">{event.organizer}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={badgeId} className="text-xs font-medium text-ink-soft">
                      Lencana penyelenggara
                    </label>
                    <SelectInput id={badgeId} name="verificationBadge" defaultValue={event.verificationBadge ?? ''} className="min-w-[200px]">
                      <option value="">Tanpa lencana</option>
                      {VERIFICATION_BADGES.map((badge) => (
                        <option key={badge} value={badge} title={VERIFICATION_BADGE_DESCRIPTION[badge]}>
                          {VERIFICATION_BADGE_LABEL[badge]}
                        </option>
                      ))}
                    </SelectInput>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={untilId} className="text-xs font-medium text-ink-soft">
                      Promosi sampai (kosong = tanpa)
                    </label>
                    <TextInput id={untilId} type="date" name="featuredUntil" defaultValue={activeUntil} min={today} max={lastDay} />
                  </div>
                  <SubmitButton className={buttonVariants({ variant: 'secondary' })}>Simpan</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
