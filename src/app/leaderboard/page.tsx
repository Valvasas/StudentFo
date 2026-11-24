import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Calculator, ChevronDown, ShieldCheck, Trophy } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { SelectInput } from '@/components/ui/field';
import { getEventRepository } from '@/lib/data';
import { LEADERBOARD_LIMITS } from '@/lib/data/repository';
import { withFallback } from '@/lib/fallback';
import { institutionDisplayName, isCampusKind } from '@/lib/institution-kinds';
import { institutionById } from '@/lib/institutions';
import {
  compareStandings,
  formulaText,
  LEADERBOARD_RESULT_LABEL,
  LEADERBOARD_TAB_LABEL,
  LEADERBOARD_TABS,
  leaderboardHref,
  leaderboardRange,
  parseLeaderboardQuery,
  periodYears,
  type LeaderboardQuery,
} from '@/lib/leaderboard';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { LEADERBOARD_RESULTS, type Category, type CampusStanding, type LeaderboardCounts, type PersonStanding } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Peringkat prestasi kampus & pelajar',
  description: 'Kampus dan sekolah dengan juara & finalis lomba terbanyak, dihitung hanya dari prestasi yang diverifikasi moderator. Rumusnya terbuka.',
  // Saringan tab/periode/bidang tetap URL yang bisa dibagikan; canonical ke halaman bersih (ADR-097).
  alternates: { canonical: '/leaderboard' },
};

const RULES = [
  'Hanya prestasi yang buktinya (sertifikat atau pengumuman pemenang resmi) diperiksa moderator. Klaim tanpa bukti tidak pernah dihitung.',
  'Satu orang dihitung sekali per lomba. Mengubah hasil setelah diverifikasi membatalkan verifikasinya.',
  'Prestasi milik kampus/sekolah tempat ia diraih — pindah kampus tidak memindahkan skor.',
  'Tanggal prestasi = tahap terakhir lomba (biasanya pengumuman pemenang). Akun yang ditangguhkan dan data uji tidak dihitung.',
  'Nama pelajar hanya tampil bila pemiliknya menyalakan portofolio publik. Skor kampus adalah jumlah tanpa nama.',
] as const;

function Breakdown({ counts }: { counts: LeaderboardCounts }) {
  const parts = LEADERBOARD_RESULTS.filter((result) => counts[result] > 0);
  return (
    <span className="flex flex-wrap gap-1.5">
      {parts.map((result) => (
        <span key={result} className="inline-flex h-6 items-center rounded-pill bg-panel-nested px-2 text-[12px] font-medium tabular-nums text-ink-soft">
          {counts[result]}× {LEADERBOARD_RESULT_LABEL[result]}
        </span>
      ))}
    </span>
  );
}

function Rank({ position }: { position: number }) {
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-pill text-sm font-bold tabular-nums',
        position === 1 ? 'bg-highlight text-highlight-ink' : 'bg-panel-nested text-ink-soft',
      )}
    >
      <span className="sr-only">Peringkat </span>
      {position}
    </span>
  );
}

interface CampusRow extends CampusStanding {
  readonly label: string;
  readonly region: string | null;
}

/** Nama & kota dari direktori resmi (ADR-076) bila kodenya dikenal; selain itu nama salinan pengajuan. */
function withDirectory(rows: readonly CampusStanding[], tab: 'kampus' | 'sekolah'): CampusRow[] {
  return rows
    .map((row) => {
      const hit = institutionById(row.institutionId);
      return { ...row, hit, label: hit ? institutionDisplayName(hit.name, hit.short) : row.institutionName, region: hit?.region ?? null };
    })
    // Kode yang tidak ada di direktori diperlakukan kampus: lebih baik tampil di tab yang kurang tepat daripada hilang.
    .filter((row) => (tab === 'sekolah' ? row.hit !== null && !isCampusKind(row.hit.kind) : row.hit === null || isCampusKind(row.hit.kind)))
    .sort((a, b) => compareStandings({ ...a, name: a.label }, { ...b, name: b.label }));
}

function Filters({ query, categories }: { query: LeaderboardQuery; categories: readonly Category[] }) {
  return (
    <form action="/leaderboard" method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-panel p-4">
      {query.tab !== 'kampus' && <input type="hidden" name="tab" value={query.tab} />}
      <label className="flex min-w-[160px] flex-1 flex-col gap-1.5 text-[13.5px] font-semibold">
        Periode
        <SelectInput name="periode" defaultValue={query.period}>
          <option value="semua">Semua waktu</option>
          <option value="12-bulan">12 bulan terakhir</option>
          {periodYears().map((year) => (
            <option key={year} value={String(year)}>
              Tahun {year}
            </option>
          ))}
        </SelectInput>
      </label>
      <label className="flex min-w-[160px] flex-1 flex-col gap-1.5 text-[13.5px] font-semibold">
        Bidang lomba
        <SelectInput name="bidang" defaultValue={query.category ?? ''}>
          <option value="">Semua bidang</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </SelectInput>
      </label>
      <button type="submit" className="flex h-11 items-center rounded-card bg-brand px-5 text-sm font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover">
        Terapkan
      </button>
    </form>
  );
}

/**
 * Peringkat prestasi (ADR-098). Permintaan pemilik 24 Nov membalik
 * "Ditolak: papan peringkat antar pengguna" di ADR-082 — dengan syarat yang
 * menjawab alasan penolakan itu: hanya prestasi TERVERIFIKASI (bukan klaim,
 * bukan jumlah keikutsertaan yang bisa diternakkan), skor kampus tanpa nama,
 * dan nama orang hanya bila ia sendiri membuka portofolionya.
 */
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const query = parseLeaderboardQuery(params);
  const range = leaderboardRange(query);
  const repository = await getEventRepository();
  const [categories, campuses, people] = await Promise.all([
    withFallback('kategori', () => repository.listCategories(), [] as readonly Category[]),
    query.tab === 'mahasiswa' ? Promise.resolve([] as readonly CampusStanding[]) : withFallback('peringkat kampus', () => repository.listCampusStandings(range, 500), [] as readonly CampusStanding[]),
    query.tab === 'mahasiswa' ? withFallback('peringkat pelajar', () => repository.listPeopleStandings(range, LEADERBOARD_LIMITS.people), [] as readonly PersonStanding[]) : Promise.resolve([] as readonly PersonStanding[]),
  ]);
  const rows = query.tab === 'mahasiswa' ? [] : withDirectory(campuses, query.tab).slice(0, LEADERBOARD_LIMITS.campus);
  const empty = query.tab === 'mahasiswa' ? people.length === 0 : rows.length === 0;

  return (
    <div className="container-page flex max-w-4xl flex-col gap-8 pb-20 pt-10">
      <header className="flex flex-col gap-3">
        <h1 className="flex items-center gap-2.5 text-[clamp(28px,4vw,40px)] leading-[1.05] tracking-[-0.04em]">
          <Trophy aria-hidden className="size-8 shrink-0 text-ink-muted" />
          Peringkat prestasi
        </h1>
        <p className="max-w-[62ch] text-[15.5px] leading-relaxed text-ink-soft">
          Kampus, sekolah, dan pelajar dengan juara & finalis lomba terbanyak — dihitung hanya dari prestasi yang buktinya sudah
          diperiksa moderator.
        </p>
      </header>

      <ActionFeedback params={params} />

      {/* Rumus selalu terlihat (transparansi); aturan lengkap dilipat supaya peringkat tetap di layar pertama ponsel. */}
      <section aria-labelledby="rumus-title" className="flex flex-col gap-3 rounded-[18px] border border-line bg-panel-nested p-5 sm:p-6">
        <h2 id="rumus-title" className="flex items-center gap-2 text-base font-semibold">
          <Calculator aria-hidden className="size-[18px] text-ink-muted" /> Cara menghitung skor
        </h2>
        <p className="rounded-card bg-panel px-4 py-3 font-mono text-[13.5px] leading-relaxed text-ink [overflow-wrap:anywhere]">Skor = {formulaText()}</p>
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13.5px] font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden className="size-4 transition-transform duration-200 ease-snap group-open:rotate-180" />
            Aturan lengkap: yang dihitung & yang tidak
          </summary>
          <ul className="flex list-disc flex-col gap-1.5 pb-1 pl-5 pt-1 text-[13.5px] leading-relaxed text-ink-soft">
            {RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </details>
      </section>

      <nav aria-label="Jenis peringkat" className="flex gap-1 border-b border-line">
        {LEADERBOARD_TABS.map((tab) => {
          const active = tab === query.tab;
          return (
            <Link
              key={tab}
              href={leaderboardHref(query, { tab })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-12 items-center px-3.5 text-[14.5px] transition-colors duration-150 ease-snap first:pl-0',
                active ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-text-primary)]' : 'font-medium text-ink-muted hover:text-ink',
              )}
            >
              {LEADERBOARD_TAB_LABEL[tab]}
            </Link>
          );
        })}
      </nav>

      <Filters query={query} categories={categories} />

      {empty ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-line bg-panel px-6 py-8">
          <p className="text-[15px] font-semibold">Belum ada prestasi terverifikasi untuk saringan ini.</p>
          <p className="max-w-[56ch] text-sm leading-relaxed text-ink-muted">
            {query.tab === 'mahasiswa'
              ? 'Yang tampil di sini hanya pelajar yang menyalakan portofolio publik di Data diri.'
              : 'Pernah juara atau finalis? Catat hasil & buktinya di Papan lamaran, lalu ajukan verifikasi.'}
          </p>
          <Link href="/tracker" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold underline underline-offset-[3px]">
            Buka Papan lamaran <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      ) : query.tab === 'mahasiswa' ? (
        <ol className="flex flex-col">
          {people.map((person, index) => (
            <li key={`${person.username ?? person.fullName}-${index}`} className="flex items-center gap-4 border-b border-line py-4">
              <Rank position={index + 1} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {person.username ? (
                  <Link href={`/u/${person.username}`} className="min-w-0 text-[15.5px] font-semibold [overflow-wrap:anywhere] hover:underline">
                    {person.fullName}
                  </Link>
                ) : (
                  <span className="min-w-0 text-[15.5px] font-semibold [overflow-wrap:anywhere]">{person.fullName}</span>
                )}
                {person.institutionName && <span className="min-w-0 text-[13px] text-ink-muted [overflow-wrap:anywhere]">{person.institutionName}</span>}
                <Breakdown counts={person.counts} />
              </div>
              <span className="shrink-0 text-right">
                <span className="block font-display text-2xl font-bold tabular-nums">{person.score}</span>
                <span className="text-[12px] text-ink-muted">poin</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="flex flex-col">
          {rows.map((row, index) => (
            <li key={row.institutionId} className="flex items-center gap-4 border-b border-line py-4">
              <Rank position={index + 1} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="min-w-0 text-[15.5px] font-semibold [overflow-wrap:anywhere]">{row.label}</span>
                <span className="min-w-0 text-[13px] text-ink-muted [overflow-wrap:anywhere]">
                  {row.region ? `${row.region} · ` : ''}
                  {row.people.toLocaleString('id-ID')} orang berprestasi
                </span>
                <Breakdown counts={row.counts} />
              </div>
              <span className="shrink-0 text-right">
                <span className="block font-display text-2xl font-bold tabular-nums">{row.score}</span>
                <span className="text-[12px] text-ink-muted">poin</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        Prestasi tanpa verifikasi tetap tampil di portofolio pemiliknya berlabel &ldquo;dilaporkan sendiri&rdquo;, tetapi tidak pernah
        menambah skor di sini.
      </p>
    </div>
  );
}
