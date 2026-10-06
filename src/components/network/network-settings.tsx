import Link from 'next/link';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import type { NetworkProfile } from '@/types/domain';
import type { NetworkViewer } from '@/lib/network';
import { cn } from '@/lib/utils';
import { NetworkSettingsForm } from './network-settings-form';

/**
 * Opt-in "bisa ditemukan" + headline. Pratinjau di sampingnya adalah KARTU
 * SARAN YANG SAMA dengan yang dilihat orang lain (ADR-054), berisi persis
 * kolom yang dibuka view `network_directory` — orang berhak tahu apa yang
 * terlihat sebelum menyalakannya. Form + pratinjau hidupnya ada di
 * `NetworkSettingsForm` (klien, ADR-055).
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
        <NetworkSettingsForm
          viewer={{ id: viewer.id, fullName: viewer.fullName, educationLevel: viewer.educationLevel, major: viewer.major, interests: viewer.interests }}
          profile={profile}
          categoryNames={Object.fromEntries(viewer.interests.map((slug) => [slug, categoryName(slug)]))}
          returnTo={returnTo}
        />
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
