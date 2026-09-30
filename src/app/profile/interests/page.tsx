import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Save } from 'lucide-react';
import { updateProfileAction } from '@/app/profile/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { AccountShell } from '@/components/layout/account-shell';
import { CategoryIcon } from '@/components/listing/category-icon';
import { DemoRolePicker } from '@/components/profile/demo-role-picker';
import { SelectInput } from '@/components/ui/field';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil } from '@/lib/deadline';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import type { RawSearchParams } from '@/lib/search-params';
import { EDUCATION_LEVELS, EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, EVENT_TYPES } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Peminatan',
  robots: { index: false, follow: false },
};

/**
 * Peminatan (kanvas desain Peminatan).
 *
 * Kanvas punya tiga tingkat per bidang dan bobot per jenis kesempatan,
 * tersimpan otomatis tiap ketukan. Akun menyimpan daftar minat & jenjang
 * saja — itu yang dibaca skor rekomendasi (§6) — jadi ubin di sini dua
 * tingkat, disimpan lewat satu tombol, dan panel rekomendasi di kanan
 * memakai urutan relevansi yang sama dengan halaman daftar.
 */
export default async function InterestsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const user = await requireUser('/profile/interests');
  const repository = await getEventRepository();
  const profile = { educationLevel: user.educationLevel, interests: user.interests };
  const [categories, ranked, all] = await Promise.all([
    repository.listCategories(),
    repository.listEvents({ sort: 'relevance', pageSize: 48, profile }),
    repository.listEvents({ pageSize: 1 }),
  ]);
  const matches = ranked.items.filter(
    (event) =>
      event.categorySlugs.some((slug) => user.interests.includes(slug)) &&
      (!user.educationLevel || event.educationLevels.length === 0 || event.educationLevels.includes(user.educationLevel) || event.educationLevels.includes('UMUM')),
  );
  const byType = EVENT_TYPES.map((type) => ({ type, count: matches.filter((event) => event.eventType === type).length })).filter((row) => row.count > 0);
  const shades = ['bg-on-inverse', 'bg-on-inverse/70', 'bg-on-inverse/45', 'bg-on-inverse/30', 'bg-on-inverse/20', 'bg-on-inverse/15', 'bg-on-inverse/10'];
  const now = new Date();

  return (
    <AccountShell user={user} active="minat">
      <div className="flex flex-wrap items-start gap-8">
        <form action={updateProfileAction} className="flex min-w-0 flex-[2_1_460px] flex-col gap-9">
          <input type="hidden" name="returnTo" value="/profile/interests" />
          <input type="hidden" name="fullName" value={user.fullName} />
          <input type="hidden" name="major" value={user.major ?? ''} />

          <div className="enter flex flex-col gap-2.5 [animation-duration:800ms]">
            <h1 className="text-[36px] leading-[1.05] tracking-[-0.04em]">Peminatan</h1>
            <p className="max-w-[56ch] text-[15.5px] leading-relaxed text-ink-muted">
              Pilih bidang yang kamu minati dan jenjangmu sekarang. Keduanya dipakai untuk menaruh kegiatan yang paling
              relevan di urutan teratas.
            </p>
          </div>

          <AuthFeedback params={params} />

          <fieldset className="enter flex flex-col gap-4 [animation-delay:80ms] [animation-duration:800ms]">
            <div className="flex items-baseline justify-between gap-3">
              <legend className="float-left text-lg font-semibold tracking-[-0.015em]">Bidang</legend>
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                <span aria-hidden className="size-3.5 rounded-[4px] bg-brand" />
                Dipilih · maksimal 12
              </span>
            </div>
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(128px,1fr))]">
              {categories.map((category) => (
                <label
                  key={category.slug}
                  className="group relative flex h-[104px] cursor-pointer flex-col justify-between gap-[18px] rounded-[14px] border border-line bg-panel p-3.5 transition-colors duration-300 ease-enter has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-on-brand has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
                >
                  <input type="checkbox" name="interests" value={category.slug} defaultChecked={user.interests.includes(category.slug)} className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-[14px] opacity-0" />
                  <span className="flex items-start justify-between">
                    <CategoryIcon slug={category.slug} className="size-5" />
                    <Check aria-hidden className="size-4 opacity-0 transition-opacity duration-200 peer-checked:opacity-100 group-has-[:checked]:opacity-100" strokeWidth={2.4} />
                  </span>
                  <span className="text-sm font-semibold leading-tight tracking-[-0.01em]">{category.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="enter flex flex-col gap-3.5 [animation-delay:140ms] [animation-duration:800ms]">
            <label htmlFor="educationLevel" className="text-lg font-semibold tracking-[-0.015em]">
              Jenjang pendidikan
            </label>
            <SelectInput
              id="educationLevel"
              name="educationLevel"
              defaultValue={user.educationLevel ?? ''}
              className="max-w-xs"
            >
              <option value="">Belum diisi</option>
              {EDUCATION_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {EDUCATION_LEVEL_LABEL[level]}
                </option>
              ))}
            </SelectInput>
          </div>

          {demoFeaturesEnabled && (
            <div className="enter flex flex-col gap-3 [animation-delay:200ms] [animation-duration:800ms]">
              <span className="text-lg font-semibold tracking-[-0.015em]">Preferensi tim</span>
              <DemoRolePicker />
            </div>
          )}

          <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <button
              type="submit"
              className="flex h-12 items-center gap-2 rounded-card bg-brand px-5 text-[15px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover"
            >
              <Save aria-hidden className="size-4" />
              Simpan profil
            </button>
            <span className="text-[13px] text-ink-muted">Rekomendasi di samping ikut berubah setelah disimpan.</span>
          </div>
        </form>

        <aside
          aria-labelledby="rekomendasi-title"
          className="enter flex min-w-[260px] flex-[1_1_280px] flex-col gap-4 rounded-[18px] bg-inverse p-[22px] text-on-inverse [animation-delay:120ms] [animation-duration:900ms] lg:sticky lg:top-[92px]"
        >
          <h2 id="rekomendasi-title" className="font-mono text-[11.5px] font-normal tracking-[.08em] text-on-inverse-muted">
            REKOMENDASI UNTUKMU
          </h2>
          <p className="flex items-baseline gap-2.5">
            <span className="text-[52px] font-bold leading-none tracking-[-0.05em]">{matches.length}</span>
            <span className="text-sm leading-snug text-on-inverse-muted">kegiatan cocok dari {all.total}</span>
          </p>
          {byType.length > 0 && (
            <>
              <div aria-hidden className="flex gap-[3px]">
                {byType.map((row, index) => (
                  <span key={row.type} className={`h-1.5 rounded-[3px] ${shades[index] ?? 'bg-on-inverse/10'}`} style={{ flex: row.count }} />
                ))}
              </div>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-on-inverse-muted">
                {byType.map((row) => (
                  <span key={row.type}>
                    {EVENT_TYPE_LABEL[row.type]} {row.count}
                  </span>
                ))}
              </p>
            </>
          )}
          <ul className="flex flex-col border-t border-inverse-nested">
            {matches.slice(0, 4).map((event) => (
              <li key={event.id}>
                <Link href={`/events/${event.slug}`} className="flex flex-col gap-[3px] border-b border-inverse-nested py-3 transition-opacity duration-150 hover:opacity-80">
                  <span className="text-xs text-on-inverse-muted">
                    {EVENT_TYPE_LABEL[event.eventType]} · {daysLeftLabel(event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null)}
                  </span>
                  <span className="text-sm font-semibold leading-snug">{event.title}</span>
                </Link>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="py-3.5 text-[13.5px] leading-normal text-on-inverse-muted">
                Pilih minimal satu bidang lalu simpan untuk melihat rekomendasi.
              </li>
            )}
          </ul>
        </aside>
      </div>
    </AccountShell>
  );
}
