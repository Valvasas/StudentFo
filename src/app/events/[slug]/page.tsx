import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Building2, CalendarClock, ExternalLink, Globe, GraduationCap, MapPin } from 'lucide-react';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { SaveButton } from '@/components/event/save-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId, getDeadlineState } from '@/lib/deadline';
import type { RawSearchParams } from '@/lib/search-params';
import { safeHostname, sanitizeExternalUrl } from '@/lib/utils';
import {
  DEADLINE_LABEL_TEXT,
  EDUCATION_LEVEL_LABEL,
  EVENT_TYPE_LABEL,
  type EventDetail,
} from '@/types/domain';

export const dynamic = 'force-dynamic';

/** Dipanggil oleh generateMetadata DAN halaman; cache() membuatnya satu query per request. */
const loadEvent = cache(async (slug: string): Promise<EventDetail | null> =>
  (await getEventRepository()).getEventBySlug(slug),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadEvent(slug);
  if (!event) return { title: 'Kegiatan tidak ditemukan' };

  const description =
    event.description?.slice(0, 155) ?? `${EVENT_TYPE_LABEL[event.eventType]} oleh ${event.organizer}.`;

  return {
    title: event.title,
    description,
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: { title: event.title, description, type: 'article' },
  };
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [event, user, repository] = await Promise.all([
    loadEvent(slug),
    getSessionUser(),
    getEventRepository(),
  ]);
  if (!event) notFound();

  const isSaved = user ? await repository.isEventSaved(user.id, event.id) : false;

  const state = getDeadlineState(event.primaryDeadlineAt);
  const isClosed = state.urgency === 'closed' || event.status === 'EXPIRED';
  // Tautan berasal dari sumber pihak ketiga hasil scraping. Divalidasi ulang
  // di titik render — bukan diasumsikan aman karena "kan sudah divalidasi
  // di pipeline". Satu lapis saja tidak cukup untuk data yang tidak kita tulis.
  const registrationUrl = sanitizeExternalUrl(event.registrationLink);
  const sourceUrl = sanitizeExternalUrl(event.sourceUrl);

  return (
    <div className="container-page py-8">
      <nav aria-label="Remah roti" className="mb-6 text-sm text-ink-muted">
        <Link href="/events" className="hover:text-ink">
          Jelajahi
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="text-ink-soft">{EVENT_TYPE_LABEL[event.eventType]}</span>
      </nav>

      <ActionFeedback params={query} className="mb-6 max-w-2xl" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">{EVENT_TYPE_LABEL[event.eventType]}</Badge>
            <DeadlineTag deadlineAt={event.primaryDeadlineAt} />
            {isClosed && <Badge variant="neutral">Pendaftaran ditutup</Badge>}
          </div>

          <h1 className="mt-3 text-3xl">{event.title}</h1>

          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span className="flex items-center gap-1.5">
              <Building2 aria-hidden className="size-4" /> {event.organizer}
            </span>
            <span className="flex items-center gap-1.5">
              {event.isOnline ? (
                <>
                  <Globe aria-hidden className="size-4" /> Daring
                </>
              ) : (
                <>
                  <MapPin aria-hidden className="size-4" /> {event.location ?? 'Lokasi menyusul'}
                </>
              )}
            </span>
          </p>

          {event.description && (
            <div className="mt-6">
              <h2 className="text-xl">Tentang kegiatan ini</h2>
              <p className="mt-2 whitespace-pre-line text-ink-soft">{event.description}</p>
            </div>
          )}

          {event.deadlines.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl">Lini masa</h2>
              <ol className="mt-3 flex flex-col gap-3">
                {event.deadlines.map((deadline) => {
                  const itemState = getDeadlineState(deadline.deadlineAt);
                  return (
                    <li
                      key={deadline.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-panel p-4"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <CalendarClock aria-hidden className="size-4 text-ink-muted" />
                        {DEADLINE_LABEL_TEXT[deadline.label]}
                        {deadline.isPrimary && <Badge variant="outline">Tenggat utama</Badge>}
                      </span>
                      <span className="flex items-center gap-3 text-sm text-ink-muted">
                        {formatDateTimeId(deadline.deadlineAt)}
                        <span className="font-medium text-ink-soft">{itemState.shortLabel}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {event.educationLevels.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl">Siapa yang bisa ikut</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {event.educationLevels.map((level) => (
                  <li key={level}>
                    <Badge variant="neutral">
                      <GraduationCap aria-hidden className="size-3.5" />
                      {EDUCATION_LEVEL_LABEL[level]}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>

        {/* Panel aksi. `lg:sticky` supaya tombol daftar tetap terjangkau saat
            deskripsi panjang — mengurangi satu hambatan tepat di titik konversi. */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border border-line bg-panel p-6 shadow-card">
            <p className="text-sm text-ink-muted">{state.longLabel}</p>
            {event.primaryDeadlineAt && (
              <p className="mt-1 font-medium">{formatDateTimeId(event.primaryDeadlineAt)}</p>
            )}

            {isClosed ? (
              // `disabled` tidak berefek pada <a>: tautannya tetap bisa diklik.
              // Kegiatan yang sudah ditutup dirender sebagai tombol mati.
              <Button size="lg" className="mt-5 w-full" disabled>
                Pendaftaran sudah ditutup
              </Button>
            ) : registrationUrl ? (
              <Button asChild size="lg" className="mt-5 w-full">
                {/* rel="noopener": tanpa ini, halaman tujuan bisa mengakses
                    window.opener dan mengarahkan ulang tab kita. */}
                {/* Lewat /daftar supaya klik tercatat untuk kalibrasi (ADR-032);
                    <a> biasa, bukan <Link>, supaya prefetch tidak ikut tercatat. */}
                <a href={`/events/${event.slug}/daftar`} target="_blank" rel="noopener noreferrer nofollow">
                  Daftar sekarang
                  <ArrowUpRight aria-hidden />
                  <span className="sr-only">(membuka tab baru)</span>
                </a>
              </Button>
            ) : (
              <p className="mt-5 rounded-sm bg-caution-soft p-3 text-sm text-caution">
                Tautan pendaftaran belum tersedia atau tidak valid. Cek langsung ke situs penyelenggara.
              </p>
            )}

            <SaveButton
              eventId={event.id}
              isSaved={isSaved}
              returnTo={`/events/${event.slug}`}
              variant="full"
              className="mt-3"
            />

            <p className="mt-4 text-xs text-ink-faint">
              StudentFo hanya mengumpulkan informasi. Pendaftaran, seleksi, dan keputusan sepenuhnya
              ada di penyelenggara.
            </p>

            {sourceUrl && (
              <p className="mt-4 border-t border-line pt-4 text-xs text-ink-muted">
                Sumber informasi:{' '}
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-brand-text hover:underline"
                >
                  {safeHostname(sourceUrl) ?? 'tautan sumber'}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
