'use client';

import { useState } from 'react';
import { EyeOff, Lock } from 'lucide-react';
import { updateNetworkProfileAction } from '@/app/connections/actions';
import { controlClass } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { NETWORK_LIMITS, type NetworkViewer } from '@/lib/network';
import { cn } from '@/lib/utils';
import type { NetworkProfile } from '@/types/domain';
import { SuggestionCard } from './person-cards';

/**
 * Form "Cara orang menemukanmu" dengan pratinjau HIDUP (ADR-055).
 *
 * Kolomnya tetap `discoverable` + `headline` di `<form>` Server Action yang
 * sama — tanpa JavaScript form ini terkirim apa adanya dan pratinjau
 * menampilkan isian awal. Dengan JavaScript, kartu pratinjau (kartu saran
 * SUNGGUHAN, ADR-054) mengikuti ketikan dan sakelar, ditandai "belum
 * disimpan" selama berbeda dari yang tersimpan — supaya orang melihat
 * akibat pilihannya SEBELUM menyimpan, bukan sesudah.
 *
 * Nama bidang dioper sebagai data (`categoryNames`), bukan fungsi: fungsi
 * tidak bisa menyeberang dari Server Component ke komponen klien.
 */
export function NetworkSettingsForm({
  viewer,
  profile,
  categoryNames,
  returnTo,
}: {
  viewer: NetworkViewer;
  profile: NetworkProfile;
  categoryNames: Readonly<Record<string, string>>;
  returnTo: string;
}) {
  const [discoverable, setDiscoverable] = useState(profile.discoverable);
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const dirty = discoverable !== profile.discoverable || headline.trim() !== (profile.headline ?? '');
  const length = headline.length;

  const switchNote =
    discoverable === profile.discoverable
      ? discoverable
        ? 'Sedang aktif'
        : 'Sedang tersembunyi'
      : discoverable
        ? 'Akan terlihat setelah disimpan'
        : 'Akan disembunyikan setelah disimpan';

  return (
    <div className="grid gap-6 border-t border-line p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_260px]">
      <form action={updateNetworkProfileAction} className="flex flex-col gap-5">
        <input type="hidden" name="returnTo" value={returnTo} />
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          Mati secara bawaan. Kamu tetap bisa mengajak orang lain, dan yang sudah terhubung tetap melihatmu.
        </p>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[16px] bg-panel-nested px-4 py-3 transition-colors duration-200 ease-snap has-[:checked]:bg-tint-mint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
          <span className="flex flex-col">
            <span className="text-[14px] font-semibold">Tampilkan aku di Cari Koneksi</span>
            <span aria-live="polite" className="text-[12.5px] text-ink-muted">
              {switchNote}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            name="discoverable"
            checked={discoverable}
            onChange={(event) => setDiscoverable(event.target.checked)}
            className="relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-pill bg-line-strong transition-colors duration-200 ease-snap before:absolute before:left-[3px] before:top-[3px] before:size-[22px] before:rounded-pill before:bg-canvas before:shadow-sm before:transition-transform before:duration-300 before:ease-[var(--easing-spring)] before:content-[''] checked:bg-brand checked:before:translate-x-5 focus-visible:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-3">
            <label htmlFor="headline" className="text-[13.5px] font-semibold">
              Headline
            </label>
            <span aria-hidden className={cn('font-mono text-[12px]', length > NETWORK_LIMITS.headlineMax - 15 ? 'text-ink' : 'text-ink-muted')}>
              {length}/{NETWORK_LIMITS.headlineMax}
            </span>
          </span>
          <input
            id="headline"
            name="headline"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            maxLength={NETWORK_LIMITS.headlineMax}
            aria-describedby="headline-hint"
            placeholder="Mis. Frontend, sedang cari tim hackathon"
            className={cn(controlClass, 'h-12 rounded-[14px] px-4')}
          />
          <p id="headline-hint" className="text-[12.5px] text-ink-muted">
            Satu kalimat tentang apa yang kamu kerjakan atau cari. Maks. {NETWORK_LIMITS.headlineMax} karakter.
          </p>
        </div>

        <p className="flex items-start gap-2 rounded-[14px] border border-dashed border-line-strong p-3.5 text-[12.5px] leading-relaxed text-ink-muted">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Email, kegiatan yang kamu simpan, dan status pendaftaranmu tidak pernah ditampilkan.
        </p>

        <SubmitButton
          pendingLabel="Menyimpan…"
          className="flex h-12 items-center justify-center rounded-pill bg-brand text-sm font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover active:pt-0.5"
        >
          Simpan pengaturan
        </SubmitButton>
      </form>

      <div className="flex flex-col gap-2.5">
        <span className="flex items-center justify-between gap-2">
          <span className="hand min-w-0 text-[19px] text-ink-muted">yang dilihat orang lain ↓</span>
          {dirty && (
            <span className="fade-in shrink-0 whitespace-nowrap rounded-pill bg-highlight px-2 py-0.5 text-[11px] font-semibold text-on-highlight">Belum disimpan</span>
          )}
        </span>
        {/* Pratinjau = kartu sungguhan (tanpa form), mengikuti isian yang sedang diketik. */}
        <div className="relative">
          <div inert className={cn('pointer-events-none select-none transition-[opacity,filter] duration-300 ease-snap', !discoverable && 'opacity-45 grayscale')}>
            <SuggestionCard
              person={{
                userId: viewer.id,
                fullName: viewer.fullName,
                headline: headline.trim() || null,
                educationLevel: viewer.educationLevel,
                major: viewer.major,
                interests: viewer.interests,
              }}
              reasons={[]}
              viewerInterests={[]}
              categoryName={(slug) => categoryNames[slug] ?? slug}
              returnTo={returnTo}
              preview
            />
          </div>
          {!discoverable && (
            <span className="fade-in absolute inset-x-4 top-[38%] flex items-center justify-center gap-2 rounded-pill border border-line bg-panel px-3 py-2 text-[12.5px] font-semibold shadow-raised">
              <EyeOff aria-hidden className="size-4" />
              Tidak muncul di Cari Koneksi
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
