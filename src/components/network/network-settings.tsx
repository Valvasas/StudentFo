import Link from 'next/link';
import { ChevronDown, Eye, EyeOff, Lock } from 'lucide-react';
import { updateNetworkProfileAction } from '@/app/connections/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { NETWORK_LIMITS } from '@/lib/network';
import type { NetworkProfile } from '@/types/domain';
import type { NetworkViewer } from '@/lib/network';
import { cn } from '@/lib/utils';
import { SuggestionCard } from './person-cards';

/**
 * Opt-in "bisa ditemukan" + headline. Pratinjau di sampingnya adalah KARTU
 * SARAN YANG SAMA dengan yang dilihat orang lain (ADR-054), berisi persis
 * kolom yang dibuka view `network_directory` — orang berhak tahu apa yang
 * terlihat sebelum menyalakannya.
 */
export function NetworkSettings({
  viewer,
  profile,
  categoryName,
  returnTo,
}: {
  viewer: NetworkViewer;
  profile: NetworkProfile;
  categoryName: (slug: string) => string;
  returnTo: string;
}) {
  return (
    <section id="pengaturan-jaringan" aria-labelledby="pengaturan-jaringan-title" className="scroll-mt-28 overflow-hidden rounded-[24px] border border-line bg-panel">
      {/* Terbuka sendiri hanya saat profil masih tersembunyi (ada yang perlu
          diputuskan, dan banner "Atur sekarang" menautkan ke sini). Setelah
          diatur, form penuh tidak perlu terus memakan tempat di samping daftar. */}
      <details open={!profile.discoverable} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-3.5">
            <span
              aria-hidden
              className={cn('flex size-11 shrink-0 items-center justify-center rounded-pill', profile.discoverable ? 'bg-tint-mint' : 'bg-panel-nested')}
            >
              {profile.discoverable ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
            </span>
            <span className="flex flex-col gap-0.5">
              <h2 id="pengaturan-jaringan-title" className="text-[17px] font-semibold">
                Cara orang menemukanmu
              </h2>
              <span className="text-[13px] text-ink-muted">{profile.discoverable ? 'Terlihat di Cari Koneksi' : 'Tersembunyi dari Cari Koneksi'}</span>
            </span>
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-snap group-open:rotate-180" />
        </summary>
        <div className="grid gap-6 border-t border-line p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <form action={updateNetworkProfileAction} className="flex flex-col gap-5">
            <input type="hidden" name="returnTo" value={returnTo} />
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              Mati secara bawaan. Kamu tetap bisa mengajak orang lain, dan yang sudah terhubung tetap melihatmu.
            </p>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[16px] bg-panel-nested px-4 py-3">
              <span className="flex flex-col">
                <span className="text-[14px] font-semibold">Tampilkan aku di Cari Koneksi</span>
                <span className="text-[12.5px] text-ink-muted">{profile.discoverable ? 'Sedang aktif' : 'Sedang tersembunyi'}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                name="discoverable"
                defaultChecked={profile.discoverable}
                className="relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-pill bg-line-strong transition-colors duration-200 ease-snap before:absolute before:left-[3px] before:top-[3px] before:size-[22px] before:rounded-pill before:bg-canvas before:shadow-sm before:transition-transform before:duration-200 before:content-[''] checked:bg-brand checked:before:translate-x-5"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="headline" className="text-[13.5px] font-semibold">
                Headline
              </label>
              <input
                id="headline"
                name="headline"
                defaultValue={profile.headline ?? ''}
                maxLength={NETWORK_LIMITS.headlineMax}
                aria-describedby="headline-hint"
                placeholder="Mis. Frontend, sedang cari tim hackathon"
                className="h-12 w-full rounded-[14px] border border-line-strong/70 bg-panel px-4 text-base transition-colors duration-150 hover:border-line-strong focus-visible:border-brand sm:text-sm"
              />
              <p id="headline-hint" className="text-[12.5px] text-ink-muted">
                Satu kalimat tentang apa yang kamu kerjakan atau cari. Maks. {NETWORK_LIMITS.headlineMax} karakter.
              </p>
            </div>

            <p className="flex items-start gap-2 rounded-[14px] border border-dashed border-line-strong p-3.5 text-[12.5px] leading-relaxed text-ink-muted">
              <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Email, kegiatan yang kamu simpan, dan status pendaftaranmu tidak pernah ditampilkan.
            </p>

            <SubmitButton className="flex h-12 items-center justify-center rounded-pill bg-brand text-sm font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover">
              Simpan pengaturan
            </SubmitButton>
          </form>

          <div className="flex flex-col gap-2.5">
            <span className="hand text-[19px] text-ink-muted">yang dilihat orang lain ↓</span>
            {/* Pratinjau = kartu sungguhan (tanpa form). Headline yang tampil adalah yang TERSIMPAN. */}
            <div inert className="pointer-events-none select-none">
              <SuggestionCard
                person={{ userId: viewer.id, fullName: viewer.fullName, headline: profile.headline, educationLevel: viewer.educationLevel, major: viewer.major, interests: viewer.interests }}
                reasons={[]}
                viewerInterests={[]}
                categoryName={categoryName}
                returnTo={returnTo}
                preview
              />
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

export function HiddenProfileBanner() {
  return (
    <div className="enter flex flex-wrap items-center gap-4 rounded-[22px] border border-line bg-highlight-soft px-5 py-4 [animation-duration:500ms]">
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-panel">
        <EyeOff className="size-5" />
      </span>
      <p className="min-w-[220px] flex-1 text-[14px] leading-relaxed">
        <span className="font-semibold">Profilmu belum bisa ditemukan.</span> Kamu tetap bisa mengajak orang, tapi orang lain belum bisa mengajakmu lebih dulu.
      </p>
      <Link href="/connections?tab=pengaturan#pengaturan-jaringan" className="flex min-h-11 items-center rounded-pill bg-brand px-5 text-[13.5px] font-semibold text-on-brand hover:bg-brand-hover">
        Atur sekarang
      </Link>
    </div>
  );
}
