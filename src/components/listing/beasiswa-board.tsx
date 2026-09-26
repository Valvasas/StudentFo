import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
import { Pagination } from '@/components/event/pagination';
import { Breadcrumb, PageTitle, ResultsEmpty, SaveToggle, SearchBox, ToggleLink } from '@/components/listing/listing-ui';
import type { BoardProps } from '@/components/listing/lomba-board';
import { daysLeftLabel, daysUntil, formatDateId } from '@/lib/deadline';
import { initialsOf } from '@/lib/initials';
import { ELIGIBILITY_LEVELS, eligibilityReason } from '@/lib/eligibility';
import { buildEventHref } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, type EducationLevel } from '@/types/domain';

function withUntuk(href: string, level: EducationLevel): string {
  return `${href}${href.includes('?') ? '&' : '?'}untuk=${level}`;
}

/**
 * Daftar beasiswa dengan cek kelayakan (kanvas desain Beasiswa).
 *
 * Kanvas memeriksa jenjang, IPK, dan tujuan studi, lalu membandingkan
 * cakupan dana per kolom. Hanya jenjang yang tercatat di data kegiatan
 * (ADR-039), jadi hanya itu yang diperiksa — menebak kelayakan dari data
 * yang tidak ada akan memberi jawaban "memenuhi syarat" yang keliru.
 */
export function BeasiswaBoard({
  query,
  result,
  savedIds,
  currentHref,
  now,
  level,
  userLevel,
  totalOpen,
  eligibleTotal,
}: BoardProps & { level: EducationLevel; userLevel: EducationLevel | null; totalOpen: number; eligibleTotal: number }) {
  const onlyEligible = query.levels.includes(level);
  const rows = result.items
    .map((event) => ({ event, why: eligibilityReason(event, level) }))
    .sort((left, right) => Number(Boolean(left.why)) - Number(Boolean(right.why)));
  const baseHref = buildEventHref({ types: query.types, search: query.search });

  return (
    <div className="container-page pb-10 pt-12">
      <div className="enter flex max-w-[640px] flex-col gap-3 [animation-duration:900ms]">
        <Breadcrumb current="Beasiswa" />
        <PageTitle>Beasiswa yang bisa kamu ajukan</PageTitle>
        <p className="text-base leading-relaxed text-ink-muted">
          Pilih jenjangmu. Kami tandai beasiswa yang terbuka untuk jenjang itu, dan beasiswa lain tetap terlihat beserta
          alasannya.
        </p>
      </div>

      <section
        aria-label="Filter kegiatan"
        className="enter mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line [animation-delay:120ms] [animation-duration:900ms] [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]"
      >
        <div className="flex flex-col gap-3 bg-panel-nested px-6 py-[22px] sm:col-span-2">
          <span className="font-mono text-xs tracking-[.06em] text-ink-muted">01 · JENJANG KAMU</span>
          <nav aria-label="Jenjang untuk cek kelayakan" className="flex flex-wrap gap-0.5 self-start rounded-sm bg-line p-[3px]">
            {ELIGIBILITY_LEVELS.map((option) => {
              const active = option === level;
              return (
                <Link
                  key={option}
                  href={withUntuk(buildEventHref(query, { levels: onlyEligible ? [option, 'UMUM'] : [], page: 1 }), option)}
                  scroll={false}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex min-h-11 items-center rounded-[6px] px-4 text-sm font-medium transition-colors duration-150 ease-snap sm:min-h-[34px]',
                    active ? 'bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,.1)]' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {EDUCATION_LEVEL_LABEL[option]}
                </Link>
              );
            })}
          </nav>
          <p className="text-[13px] text-ink-muted">
            {userLevel ? 'Diisi dari profilmu.' : 'Masuk dan isi profil supaya jenjangmu terpilih otomatis.'}
          </p>
        </div>
        <div className="flex flex-col justify-center gap-1 bg-inverse px-6 py-[22px] text-on-inverse">
          <span className="flex items-baseline gap-2">
            <span className="text-[44px] font-bold leading-none tracking-[-0.04em]">{eligibleTotal}</span>
            <span className="text-[15px] text-on-inverse-muted">dari {totalOpen} beasiswa</span>
          </span>
          <span className="text-sm text-on-inverse-muted">terbuka untuk jenjang {EDUCATION_LEVEL_LABEL[level]}</span>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex w-full max-w-[360px] flex-[1_1_260px]">
          <SearchBox query={query} placeholder="Cari nama beasiswa atau penyelenggara" />
        </div>
        <div className="flex items-center gap-4 text-[13px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="flex size-[18px] items-center justify-center rounded-pill bg-brand text-on-brand">
              <Check className="size-[11px]" strokeWidth={2.6} />
            </span>
            Memenuhi syarat jenjang
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-[18px] rounded-pill border-[1.5px] border-dashed border-line-strong" />
            Khusus jenjang lain
          </span>
        </div>
        <ToggleLink
          on={onlyEligible}
          href={withUntuk(buildEventHref(query, { levels: onlyEligible ? [] : [level, 'UMUM'], page: 1 }), level)}
        >
          Hanya yang memenuhi syarat
        </ToggleLink>
      </div>

      {rows.length > 0 ? (
        <ul className="mt-4 flex flex-col">
          <li aria-hidden className="hidden grid-cols-[minmax(0,1fr)_150px_130px_200px] gap-3 border-b border-brand px-4 pb-3 text-[12.5px] font-medium text-ink-muted md:grid">
            <span>Beasiswa</span>
            <span>Jenjang</span>
            <span>Tutup</span>
            <span>Kelayakan</span>
          </li>
          {rows.map(({ event, why }, index) => {
            const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
            return (
              <li
                key={event.id}
                className={cn(
                  'enter group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-line px-4 py-[18px] transition-[background-color,opacity] duration-200 ease-snap [animation-duration:700ms] hover:bg-panel-nested md:grid-cols-[minmax(0,1fr)_150px_130px_200px]',
                  why && 'opacity-70 hover:opacity-100',
                )}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-brand font-mono text-[13px] font-medium">
                    {initialsOf(event.organizer)}
                  </span>
                  <div className="flex min-w-0 flex-col gap-[3px]">
                    <h2 className="text-[15.5px] font-semibold tracking-[-0.01em]">
                      <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 after:content-['']">
                        {event.title}
                      </Link>
                    </h2>
                    <span className="truncate text-[13px] text-ink-muted">
                      {event.organizer} · {event.isOnline ? 'Daring' : (event.location ?? 'Lokasi menyusul')}
                    </span>
                  </div>
                </div>
                <SaveToggle eventId={event.id} isSaved={savedIds.includes(event.id)} returnTo={currentHref} className="md:hidden" />
                <span className="col-span-2 text-[13px] text-ink-soft md:col-span-1">
                  {event.educationLevels.map((item) => EDUCATION_LEVEL_LABEL[item]).join(', ') || 'Semua jenjang'}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{event.primaryDeadlineAt ? formatDateId(event.primaryDeadlineAt) : 'Belum diumumkan'}</span>
                  <span className="text-[12.5px] text-ink-muted">{daysLeftLabel(days)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  {why ? (
                    <span className="inline-flex h-7 items-center whitespace-nowrap rounded-sm border border-dashed border-ink-muted px-2.5 text-[12.5px] font-medium text-ink-soft">
                      {why}
                    </span>
                  ) : (
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-brand px-2.5 text-[12.5px] font-semibold text-on-brand">
                      <Check aria-hidden className="size-[13px]" strokeWidth={2.4} />
                      Memenuhi syarat
                    </span>
                  )}
                  <ChevronRight aria-hidden className="hidden size-4 text-ink-muted md:block" />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ResultsEmpty
          className="mt-6"
          description="Belum ada beasiswa terbuka untuk pilihan ini. Matikan “Hanya yang memenuhi syarat” untuk melihat semua beasiswa beserta syaratnya."
          resetHref={baseHref}
        />
      )}

      <p className="mt-5 max-w-[70ch] text-[13px] leading-relaxed text-ink-muted">
        Pengecekan ini hanya membaca jenjang. Syarat lain seperti IPK, usia, atau kondisi ekonomi tercantum di halaman detail
        dan pengumuman resmi masing-masing beasiswa.
      </p>

      {result.totalPages > 1 && (
        <div className="mt-8">
          <Pagination query={query} totalPages={result.totalPages} />
        </div>
      )}
    </div>
  );
}
