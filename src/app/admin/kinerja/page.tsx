import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, ListChecks, ShieldCheck } from 'lucide-react';
import { AdminNav } from '@/components/admin/admin-nav';
import { adminMetadata, requireAdmin } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { buttonVariants } from '@/components/ui/button';
import { formatAnswer } from '@/lib/registration-form';
import { OUTBOUND_LIMITS, OUTBOUND_RANGES, parseOutboundRange, summarizeOutboundSurveys, type CountRow, type QuestionSummary } from '@/lib/outbound-survey';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL } from '@/types/domain';

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
          {hidden.toLocaleString('id-ID')} jawaban lain digabung — jawaban dengan kurang dari {OUTBOUND_LIMITS.minBucket} pengisi tidak ditampilkan.
        </p>
      ) : null}
    </section>
  );
}

function QuestionCard({ summary }: { summary: QuestionSummary }) {
  const id = `q-${summary.field.id}`;
  if (summary.kind === 'number') {
    return (
      <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-panel p-5 shadow-card">
        <h2 id={id} className="text-base font-semibold">
          {summary.field.label}
        </h2>
        {summary.answered === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada jawaban.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Dijawab', summary.answered.toLocaleString('id-ID')],
              ['Rata-rata', formatAnswer(summary.mean ?? undefined)],
              ['Median', formatAnswer(summary.median ?? undefined)],
              ['Rentang', `${formatAnswer(summary.min ?? undefined)}–${formatAnswer(summary.max ?? undefined)}`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[12.5px] text-ink-muted">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    );
  }
  return (
    <Distribution
      id={id}
      title={summary.field.label}
      rows={summary.rows}
      total={summary.answered}
      label={(key) => key}
      hidden={summary.kind === 'text' ? summary.hidden : undefined}
    />
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
  const repository = await getEventRepository();
  const [records, config] = await Promise.all([repository.listOutboundSurveys(since), repository.getOutboundSurveyConfig()]);
  const summary = summarizeOutboundSurveys(records, config);

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
            pendaftaran, dan berapa yang memilih melewati. Acara berformulir StudentFo tidak lewat pendataan ini.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/kinerja/pertanyaan" className={buttonVariants({ variant: 'secondary' })}>
          <ListChecks aria-hidden /> Atur pertanyaan
        </Link>
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
        </div>
      </header>

      <dl className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        {[
          { label: 'Menuju pendaftaran', value: summary.visits.toLocaleString('id-ID') },
          { label: 'Menjawab', value: `${summary.answered.toLocaleString('id-ID')} · ${percent(summary.answered, summary.visits)}%` },
          { label: 'Melewati', value: `${summary.skipped.toLocaleString('id-ID')} · ${percent(summary.skipped, summary.visits)}%` },
          { label: 'Dari akun yang masuk', value: `${percent(summary.signedIn, summary.visits)}%` },
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
              <caption className="sr-only">Jumlah yang menuju pendaftaran, porsi yang melewati, dan porsi akun masuk per postingan</caption>
              <thead className="text-ink-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Postingan</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Menuju pendaftaran</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Melewati</th>
                  <th scope="col" className="py-2 font-medium">Akun masuk</th>
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
                    <td className="py-2.5 pr-4 tabular-nums">{event.visits.toLocaleString('id-ID')}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{percent(event.skipped, event.visits)}%</td>
                    <td className="py-2.5 tabular-nums">{percent(event.signedIn, event.visits)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        {summary.questions.map((question) => (
          <QuestionCard key={question.field.id} summary={question} />
        ))}
        {config.askEducation !== 'OFF' && (
          <Distribution id="jenjang" title="Jenjang" rows={summary.byLevel} total={summary.answered} label={(key) => EDUCATION_LEVEL_LABEL[key]} />
        )}
        {config.askRegion !== 'OFF' && (
          <>
            <Distribution id="provinsi" title="Provinsi domisili" rows={summary.provinces} total={summary.answered} label={(key) => key} hidden={summary.hiddenProvinces} />
            <Distribution id="kabkota" title="Kabupaten/kota domisili" rows={summary.regencies} total={summary.answered} label={(key) => key} hidden={summary.hiddenRegencies} />
          </>
        )}
        {config.askInstitution !== 'OFF' && (
          <Distribution
            id="institusi"
            title="Asal sekolah / kampus"
            rows={summary.institutions}
            total={summary.answered}
            label={(key) => key}
            hidden={summary.hiddenInstitutions}
          />
        )}
      </div>

      <p role="note" className="mt-8 flex max-w-3xl items-start gap-2 rounded-card bg-panel-nested p-4 text-sm text-ink-soft">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        Jawaban tidak memuat nama, email, atau id akun — hanya tanda masuk/tamu — dan dihapus otomatis setelah 365 hari.
        Satu peramban menjawab atau melewati sekali per acara; kunjungan dari bot dan banjir satu IP tidak dicatat.
        Persentase per pertanyaan dihitung dari yang menjawab, bukan yang melewati.
      </p>
    </div>
  );
}
