import type { ReactNode } from 'react';
import { isProfileMediaId, profileMediaSrc } from '@/lib/profile-media';
import { cn } from '@/lib/utils';
import type { BannerPreset, ProfileMedia } from '@/types/domain';

/**
 * Banner kartu profil (ADR-083). Urutan yang tampil: banner unggahan →
 * banner bawaan pilihan pemilik → kertas bertitik (wajah kartu sebelum fitur
 * ini ada). Selalu hiasan: `aria-hidden`, tanpa teks.
 *
 * Banner bawaan digambar dari token (tint, stabilo, garis), bukan berkas
 * gambar — ikut tema gelap, nol permintaan jaringan, dan tidak butuh
 * moderasi. `preserveAspectRatio="xMidYMid slice"`: satu gambar untuk strip
 * 56 px di menu akun sampai sampul 140 px di halaman profil.
 */

const INK = 'var(--color-text-primary)';
const HIGHLIGHT = 'var(--color-highlight)';

function Art({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 320 80"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke={INK}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="absolute inset-0 size-full"
    >
      {children}
    </svg>
  );
}

const spark = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x + r * 0.14} ${y - r * 0.14} ${x + r} ${y}Q${x + r * 0.14} ${y + r * 0.14} ${x} ${y + r}Q${x - r * 0.14} ${y + r * 0.14} ${x - r} ${y}Q${x - r * 0.14} ${y - r * 0.14} ${x} ${y - r}Z`;

const PRESET: Record<BannerPreset, { readonly surface: string; readonly art: ReactNode }> = {
  kertas: { surface: 'dot-grid bg-panel-nested', art: null },
  matahari: {
    surface: 'bg-tint-sun',
    art: (
      <Art>
        <circle cx="262" cy="84" r="36" fill={HIGHLIGHT} stroke="none" opacity="0.9" />
        <path d="M226 84a36 36 0 0 1 72 0" opacity="0.55" />
        <path d="M262 36v-12M228 50l-9-8M296 50l9-8M212 80h-13M312 80h13M244 40l-5-10M280 40l5-10" opacity="0.45" />
        <path d="M22 58q14-10 28 0t28 0" opacity="0.3" />
      </Art>
    ),
  },
  ombak: {
    surface: 'bg-tint-sky',
    art: (
      <Art>
        <path d="M-10 28q20-14 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0" opacity="0.5" />
        <path d="M-30 48q20-14 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0" opacity="0.35" />
        <path d="M-10 68q20-14 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0" opacity="0.22" />
      </Art>
    ),
  },
  daun: {
    surface: 'bg-tint-mint',
    art: (
      <Art>
        <g opacity="0.5">
          <path d="M34 60q8-26 34-18q-8 26-34 18zM40 56l20-11" />
          <path d="M138 30q20-16 36 4q-20 16-36-4zM146 31l22 1" />
          <path d="M236 64q2-28 30-28q-2 28-30 28zM242 58l18-16" />
        </g>
        <g opacity="0.3">
          <path d="M92 22q10-10 20-2q-10 10-20 2z" />
          <path d="M196 70q10-12 22-4q-10 12-22 4z" />
          <path d="M290 26q10-8 18 0q-10 8-18 0z" />
        </g>
      </Art>
    ),
  },
  senja: {
    surface: 'bg-tint-peach',
    art: (
      <Art>
        <circle cx="96" cy="56" r="24" fill={HIGHLIGHT} stroke="none" opacity="0.85" />
        <path d="M0 56h320" opacity="0.5" />
        <path d="M30 64h110M170 64h120M60 72h70M150 72h60M240 72h50" opacity="0.32" />
        <path d="M214 30q8-8 16 0M238 22q7-7 14 0" opacity="0.4" />
      </Art>
    ),
  },
  bintang: {
    surface: 'bg-tint-lilac',
    art: (
      <Art>
        <path d={spark(52, 34, 13)} fill={HIGHLIGHT} opacity="0.95" />
        <path d={spark(250, 46, 16)} fill={HIGHLIGHT} opacity="0.95" />
        <g opacity="0.45">
          <path d={spark(118, 58, 7)} />
          <path d={spark(176, 24, 9)} />
          <path d={spark(300, 18, 6)} />
          <path d={spark(20, 66, 5)} />
        </g>
        <g fill={INK} stroke="none" opacity="0.35">
          <circle cx="90" cy="18" r="1.6" />
          <circle cx="150" cy="44" r="1.6" />
          <circle cx="214" cy="66" r="1.6" />
          <circle cx="282" cy="62" r="1.6" />
        </g>
      </Art>
    ),
  },
  kotak: {
    surface:
      'bg-panel-nested [background-image:linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:16px_16px] [background-position:center]',
    art: (
      <Art>
        <path d="M32 54l34-22 30 14 44-28" opacity="0.5" />
        <circle cx="140" cy="18" r="3.2" fill={HIGHLIGHT} />
        <path d="M232 22h44v36h-44z" opacity="0.28" />
      </Art>
    ),
  },
  stabilo: {
    surface: 'bg-panel',
    art: (
      <Art>
        <g stroke={HIGHLIGHT} strokeWidth="13" opacity="0.9">
          <path d="M26 26l92-4" />
          <path d="M150 50l118-5" />
        </g>
        <path d="M40 54q10-9 20 0t20 0 20 0" opacity="0.4" />
        <path d="M226 22q12-8 24 0t24 0" opacity="0.4" />
      </Art>
    ),
  },
};

export function ProfileBanner({ media, className }: { media: Pick<ProfileMedia, 'bannerId' | 'bannerPreset'> | null | undefined; className?: string }) {
  const preset = PRESET[media?.bannerPreset ?? 'kertas'];
  const uploaded = isProfileMediaId(media?.bannerId) ? media.bannerId : null;
  return (
    <div aria-hidden className={cn('relative overflow-hidden', preset.surface, className)}>
      {preset.art}
      {uploaded && (
        // Menimpa banner bawaan, bukan menggantikannya: berkas yang gagal dimuat
        // (dicabut, pembaca diblokir) memperlihatkan banner bawaan di bawahnya.
        // eslint-disable-next-line @next/next/no-img-element -- rute bersesi (/media/profil) tidak bisa lewat pengoptimal gambar
        <img src={profileMediaSrc(uploaded)} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      )}
    </div>
  );
}
