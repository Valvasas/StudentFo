import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { ChoiceGroup } from '@/components/ui/form-step';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  activeFilterCount,
  DISTANCE_CHOICES,
  MATCH_STYLES,
  MATCH_STYLE_LABEL,
  type MatchQuery,
  type PortfolioFilter,
} from '@/lib/matchmaking';
import { SKILL_DOMAINS, SKILL_DOMAIN_LABEL, TEAM_SKILLS } from '@/types/domain';

const PORTFOLIO_CHOICES: readonly { value: PortfolioFilter; label: string }[] = [
  { value: 'semua', label: 'Siapa saja' },
  { value: 'ada', label: 'Sudah punya portofolio' },
  { value: 'juara', label: 'Pernah juara' },
];

/**
 * Saringan pencocokan (ADR-057): `<form method="get">` murni, jadi setiap
 * kombinasi = satu URL yang bisa dibagikan, tombol Kembali bekerja, dan semua
 * tetap berfungsi tanpa JavaScript (AGENTS.md §9). Saringan TIDAK memutar
 * radar: ia hanya berputar setelah Simpan kartu dan "Cari ulang". Saringan
 * yang aktif tampil sebagai chip pelepas di luar <details> ini.
 *
 * "Hanya yang bisa bertemu langsung" ditulis sebagai kotak centang bernilai
 * `daring=0`: kotak yang tidak dicentang tidak terkirim, dan ketiadaan
 * parameter berarti "ikutkan yang daring" (bawaan).
 */
export function MatchFilters({ query, hasCity }: { query: MatchQuery; hasCity: boolean }) {
  const { filters, style } = query;
  const active = activeFilterCount(filters) + Number(style !== 'seimbang');
  return (
    <details id="saringan" className="group rounded-[24px] border border-line bg-panel">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-semibold [&::-webkit-details-marker]:hidden sm:px-6">
        <span className="flex items-center gap-2.5">
          <SlidersHorizontal aria-hidden className="size-[18px]" />
          Saring & atur gaya tim
          {active > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-brand px-1.5 text-[11px] font-bold text-on-brand">
              {active}
              <span className="sr-only"> pilihan aktif</span>
            </span>
          )}
        </span>
        <span aria-hidden className="text-[13px] font-medium text-ink-muted group-open:hidden">
          Buka
        </span>
      </summary>

      <form method="get" action="/teams/cocok" className="flex flex-col gap-6 border-t border-line p-5 sm:p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <ChoiceGroup
            legend="Jarak dari kotamu"
            hint={hasCity ? 'Yang sama-sama bersedia kerja daring tetap ikut, kecuali kotak di bawah dicentang' : 'Isi kota di kartumu agar jarak bisa dihitung'}
          >
            <div className="flex flex-wrap gap-2">
              <label className="choice">
                <input type="radio" className="check" name="jarak" value="" defaultChecked={filters.maxDistanceKm === null} />
                Berapa pun
              </label>
              {DISTANCE_CHOICES.map((km) => (
                <label key={km} className="choice">
                  <input type="radio" className="check" name="jarak" value={km} defaultChecked={filters.maxDistanceKm === km} />
                  ≤ {km} km
                </label>
              ))}
            </div>
            <label className="choice self-start">
              <input type="checkbox" className="check" name="daring" value="0" defaultChecked={!filters.includeRemote} />
              Hanya yang bisa bertemu langsung
            </label>
          </ChoiceGroup>

          <ChoiceGroup legend="Portofolio publik">
            <div className="flex flex-wrap gap-2">
              {PORTFOLIO_CHOICES.map((choice) => (
                <label key={choice.value} className="choice">
                  <input type="radio" className="check" name="portofolio" value={choice.value === 'semua' ? '' : choice.value} defaultChecked={filters.portfolio === choice.value} />
                  {choice.label}
                </label>
              ))}
            </div>
            <label className="choice self-start">
              <input type="checkbox" className="check" name="jenjang" value="sama" defaultChecked={filters.sameLevel} />
              Jenjang pendidikan sama denganku
            </label>
          </ChoiceGroup>
        </div>

        <ChoiceGroup legend="Harus punya keahlian" hint="Cukup salah satu dari yang dipilih">
          <div className="flex flex-col gap-3">
            {SKILL_DOMAINS.map((domain) => (
              <div key={domain} className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{SKILL_DOMAIN_LABEL[domain]}</span>
                {TEAM_SKILLS.filter((skill) => skill.domain === domain).map((skill) => (
                  <label key={skill.slug} className="choice">
                    <input type="checkbox" className="check" name="keahlian" value={skill.slug} defaultChecked={filters.skills.includes(skill.slug)} />
                    {skill.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </ChoiceGroup>

        <ChoiceGroup legend="Gaya tim" hint="Mengubah cara portofolio dinilai">
          <div className="grid gap-2 sm:grid-cols-3">
            {MATCH_STYLES.map((value) => (
              <label key={value} className="choice h-full items-start">
                <input type="radio" className="check mt-0.5" name="gaya" value={value === 'seimbang' ? '' : value} defaultChecked={style === value} />
                <span className="flex flex-col gap-0.5">
                  <span>{MATCH_STYLE_LABEL[value].label}</span>
                  <span className="text-[12.5px] font-normal text-ink-muted">{MATCH_STYLE_LABEL[value].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </ChoiceGroup>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Mencari…" className="inline-flex h-12 items-center rounded-pill bg-brand px-6 text-[15px] font-semibold text-on-brand hover:bg-brand-hover">
            Cari sekarang
          </SubmitButton>
          {active > 0 && (
            <Link href="/teams/cocok" className="inline-flex min-h-11 items-center px-2 text-[14px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
              Hapus semua saringan
            </Link>
          )}
        </div>
      </form>
    </details>
  );
}
