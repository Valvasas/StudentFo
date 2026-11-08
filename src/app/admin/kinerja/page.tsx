import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, ShieldCheck } from 'lucide-react';
import { AdminNav } from '@/components/admin/admin-nav';
import { adminMetadata, requireAdmin } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { OUTBOUND_LIMITS, OUTBOUND_RANGES, parseOutboundRange, summarizeOutboundSurveys, type CountRow } from '@/lib/outbound-survey';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, OUTBOUND_PLAN_LABEL, OUTBOUND_SOURCE_LABEL } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const generateMetadata = (): Promise<Metadata> => adminMetadata('Kinerja postingan');

const percent = (count: number, total: number) => (total === 0 ? 0 : Math.round((count / total) * 100));

function Distribution<K extends string>({
  id,
  title,
  rows,
  total,
  label,
  hidden,
}: {
  id: string;
  title: string;
  rows: readonly CountRow<K>[];
  total: number;
  label: (key: K) => string;
  /** Jawaban yang digabung karena bucket-nya di bawah ambang k-anonim. */
  hidden?: number;
}) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-panel p-5 shadow-card">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Belum ada jawaban.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">{label(row.key)}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">
                  {row.count.toLocaleString('id-ID')} · {percent(row.count, total)}%
                </span>
              </span>
              <span aria-hidden className="h-1.5 overflow-hidden rounded-pill bg-panel-nested">
                <span className="block h-full rounded-pill bg-brand" style={{ width: `${Math.max(2, percent(row.count, total))}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {hidden ? (
        <p className="text-[12.5px] text-ink-muted">
          {hidden.toLocaleString('id-ID')} jawaban lain digabung — nama dengan kurang dari {OUTBOUND_LIMITS.minBucket} jawaban tidak ditampilkan.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Kinerja postingan (ADR-070) — jawaban pendataan sebelum pengunjung keluar
 * ke tautan pendaftaran resmi. Untuk pemilik StudentFo saja: tidak ada
 * identitas pengisi, provinsi & asal sekolah di bawah ambang k-anonim
 * digabung, dan penyelenggara tidak melihat halaman ini.
 */
export default async function OutboundPerformancePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requireAdmin();
  const range = parseOutboundRange((await searchParams).rentang);
  const since = new Date(Date.now() - range * 86_400_000);
  const summary = summarizeOutboundSurveys(await (await getEventRepository()).listOutboundSurveys(since));
  const planTotal = summary.byPlan.reduce((sum, row) => sum + row.count, 0);
  const topSource = summary.bySource[0];

  return (
    <div className="container-page py-8">
      <AdminNav active="kinerja" />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="flex items-center gap-2 text-3xl">
            <BarChart3 aria-hidden className="size-7 text-ink-muted" />
            Kinerja postingan
          </h1>
          <p className="mt-2 text-ink-soft">
            Jawaban singkat pengunjung tepat sebelum keluar ke tautan pendaftaran resmi — siapa yang benar-benar menuju
            pendaftaran, dan dari mana mereka tahu. Acara berformulir StudentFo tidak lewat pendataan ini.
          </p>
        </div>
        <nav aria-label="Rentang waktu" className="flex gap-1 rounded-pill border border-line bg-panel p-1">
          {OUTBOUND_RANGES.map((days) => (
            <Link
              key={days}
              href={`/admin/kinerja?rentang=${days}`}
              aria-current={days === range ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center rounded-pill px-4 text-[13.5px] transition-colors duration-200 ease-snap',
                days === range ? 'bg-brand font-semibold text-on-brand' : 'font-medium text-ink-muted hover:bg-panel-nested hover:text-ink',
              )}
            >
              {days} hari
            </Link>
          ))}
        </nav>
      </header>

      <dl className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        {[
          { label: 'Jawaban', value: summary.total.toLocaleString('id-ID') },
          { label: 'Dari akun yang masuk', value: `${percent(summary.signedIn, summary.total)}%` },
          { label: 'Sumber terbanyak', value: topSource ? OUTBOUND_SOURCE_LABEL[topSource.key] : '—' },
          { label: 'Postingan dengan jawaban', value: summary.events.length.toLocaleString('id-ID') },
        ].map((tile) => (
          <div key={tile.label} className="rounded-card border border-line bg-panel p-4 shadow-card">
            <dt className="text-[13px] text-ink-muted">{tile.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="per-postingan" className="mb-6 min-w-0 rounded-card border border-line bg-panel p-5 shadow-card">
        <h2 id="per-postingan" className="text-xl">
          Per postingan
        </h2>
        {summary.events.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Belum ada jawaban dalam {range} hari terakhir.</p>
        ) : (
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Tabel kinerja per postingan">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Jumlah jawaban, porsi akun masuk, sumber teratas, dan pencari tim per postingan</caption>
              <thead className="text-ink-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Postingan</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Jawaban</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Akun masuk</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Sumber teratas</th>
                  <th scope="col" className="py-2 font-medium">Mencari tim</th>
                </tr>
              </thead>
              <tbody>
                {summary.events.map((event) => (
                  <tr key={event.eventId} className="border-t border-line">
                    <th scope="row" className="py-2.5 pr-4 font-medium">
                      {event.eventSlug ? (
                        <Link href={`/events/${event.eventSlug}`} className="underline-offset-[3px] hover:underline">
                          {event.eventTitle ?? 'Acara'}
                        </Link>
                      ) : (
                        (event.eventTitle ?? 'Acara tidak lagi tersedia')
                      )}
                    </th>
                    <td className="py-2.5 pr-4 tabular-nums">{event.responses.toLocaleString('id-ID')}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{percent(event.signedIn, event.responses)}%</td>
                    <td className="py-2.5 pr-4">{event.topSource ? OUTBOUND_SOURCE_LABEL[event.topSource] : '—'}</td>
                    <td className="py-2.5 tabular-nums">{event.lookingForTeam.toLocaleString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        <Distribution id="sumber" title="Dari mana tahu info" rows={summary.bySource} total={summary.total} label={(key) => OUTBOUND_SOURCE_LABEL[key]} />
        <Distribution id="jenjang" title="Jenjang" rows={summary.byLevel} total={summary.total} label={(key) => EDUCATION_LEVEL_LABEL[key]} />
        <Distribution id="rencana" title="Rencana (lomba saja)" rows={summary.byPlan} total={planTotal} label={(key) => OUTBOUND_PLAN_LABEL[key]} />
        <Distribution id="provinsi" title="Provinsi domisili" rows={summary.provinces} total={summary.total} label={(key) => key} hidden={summary.hiddenProvinces} />
        <Distribution
          id="institusi"
          title="Asal sekolah / kampus"
          rows={summary.institutions}
          total={summary.total}
          label={(key) => key}
          hidden={summary.hiddenInstitutions}
        />
      </div>

      <p role="note" className="mt-8 flex max-w-3xl items-start gap-2 rounded-card bg-panel-nested p-4 text-sm text-ink-soft">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        Jawaban tidak memuat nama, email, atau id akun — hanya tanda masuk/tamu — dan dihapus otomatis setelah 365 hari.
        Satu peramban menjawab sekali per acara; jawaban dari bot dan banjir satu IP tidak dicatat.
      </p>
    </div>
  );
}
