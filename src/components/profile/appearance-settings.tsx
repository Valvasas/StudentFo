'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Monitor, Moon, Sparkles, Sun, Waves } from 'lucide-react';
import {
  MOTION_STORAGE_KEY,
  THEME_STORAGE_KEY,
  parseMotionPreference,
  parseThemePreference,
  resolveTheme,
  type MotionPreference,
  type ThemePreference,
} from '@/lib/appearance';
import { cn } from '@/lib/utils';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Penyimpanan diblokir (penyamaran/izin situs): pilihan tetap berlaku
    // untuk kunjungan ini, hanya tidak diingat. Sama dengan ThemeToggle.
  }
}

const THEMES: readonly { value: ThemePreference; label: string; note: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Ikuti perangkat', note: 'Berganti sendiri mengikuti setelan HP/laptop', icon: Monitor },
  { value: 'light', label: 'Terang', note: 'Kertas krem, nyaman di ruangan terang', icon: Sun },
  { value: 'dark', label: 'Gelap', note: 'Lebih redup untuk malam & ruang gelap', icon: Moon },
];

/** Miniatur halaman dengan warna literal tema itu — sengaja bukan token, karena harus menampilkan tema yang BELUM aktif. */
function ThemeThumb({ value }: { value: ThemePreference }) {
  const page = (paper: string, card: string, ink: string, muted: string) => (
    <span className="flex h-full flex-col gap-1.5 p-2.5" style={{ background: paper }}>
      <span className="h-1.5 w-8 rounded-pill" style={{ background: ink }} />
      <span className="flex flex-1 flex-col gap-1 rounded-[6px] p-1.5" style={{ background: card }}>
        <span className="h-1 w-10 rounded-pill" style={{ background: muted }} />
        <span className="h-1 w-6 rounded-pill" style={{ background: muted }} />
        <span className="mt-auto h-2.5 w-9 rounded-[3px]" style={{ background: ink }} />
      </span>
    </span>
  );
  const light = page('#faf8f3', '#ffffff', '#1d1b17', '#d6d0c4');
  const dark = page('#15140f', '#24221c', '#efebe1', '#575245');

  return (
    <span aria-hidden className="relative block h-[84px] overflow-hidden rounded-[10px] border border-line">
      {value === 'light' ? light : value === 'dark' ? dark : (
        <>
          <span className="absolute inset-0">{light}</span>
          <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">{dark}</span>
          <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
        </>
      )}
    </span>
  );
}

function OptionCard({
  name,
  value,
  checked,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer flex-col gap-2.5 rounded-[16px] border bg-panel p-2.5 pb-3 transition-[border-color,background-color,box-shadow] duration-150 ease-snap',
        'hover:border-line-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
        checked ? 'border-ink bg-panel-nested shadow-[inset_0_0_0_1px_var(--color-text-primary)]' : 'border-line',
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="sr-only" />
      {children}
      {checked && (
        <span aria-hidden className="stamp absolute right-4 top-4 flex size-6 items-center justify-center rounded-pill bg-brand text-on-brand ring-2 ring-panel">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      )}
    </label>
  );
}

/**
 * Tema & gerak per perangkat (ADR-055). Berlaku SEKETIKA — tanpa tombol
 * simpan, karena hasilnya langsung terlihat dan bisa dibalik dengan satu
 * ketukan lagi. Nilainya disimpan di localStorage dan dipasang ThemeScript
 * sebelum paint pertama di kunjungan berikutnya.
 *
 * Sebelum hidrasi pilihan dinonaktifkan: tanpa JavaScript tidak ada yang
 * bisa menerapkannya, dan radio yang tampak bisa dipilih tapi tidak berbuat
 * apa-apa lebih membingungkan daripada catatan jujur di bawahnya.
 */
export function AppearanceSettings() {
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>('system');
  const [motion, setMotion] = useState<MotionPreference>('system');
  const [deviceReduces, setDeviceReduces] = useState(false);

  useEffect(() => {
    setTheme(parseThemePreference(readStored(THEME_STORAGE_KEY)));
    setMotion(parseMotionPreference(readStored(MOTION_STORAGE_KEY)));
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setDeviceReduces(media.matches);
    const onChange = () => setDeviceReduces(media.matches);
    media.addEventListener('change', onChange);
    setReady(true);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // "Ikuti perangkat" harus benar-benar mengikuti: kalau OS berganti ke mode
  // gelap saat halaman terbuka, tema ikut berganti tanpa muat ulang.
  useEffect(() => {
    if (!ready || theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.setAttribute('data-theme', resolveTheme('system', media.matches));
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [ready, theme]);

  function chooseTheme(next: ThemePreference) {
    setTheme(next);
    writeStored(THEME_STORAGE_KEY, next === 'system' ? null : next);
    document.documentElement.setAttribute('data-theme', resolveTheme(next, window.matchMedia('(prefers-color-scheme: dark)').matches));
  }

  function chooseMotion(next: MotionPreference) {
    setMotion(next);
    writeStored(MOTION_STORAGE_KEY, next === 'reduce' ? 'reduce' : null);
    if (next === 'reduce') document.documentElement.setAttribute('data-motion', 'reduce');
    else document.documentElement.removeAttribute('data-motion');
  }

  const motionReduced = motion === 'reduce' || deviceReduces;

  return (
    <div className="flex flex-col gap-5">
      <fieldset disabled={!ready} className="flex min-w-0 flex-col gap-3 px-5 pb-6 sm:px-6">
        <legend className="mb-3 text-[13.5px] font-semibold">Tema</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEMES.map((option) => (
            <OptionCard key={option.value} name="theme" value={option.value} checked={theme === option.value} onSelect={() => chooseTheme(option.value)}>
              <ThemeThumb value={option.value} />
              <span className="flex flex-col gap-0.5 px-1">
                <span className="flex items-center gap-1.5 text-[14px] font-semibold">
                  <option.icon aria-hidden className="size-4" />
                  {option.label}
                </span>
                <span className="text-[12.5px] leading-snug text-ink-muted">{option.note}</span>
              </span>
            </OptionCard>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={!ready} className="flex min-w-0 flex-col gap-3 border-t border-line px-5 pb-6 pt-5 sm:px-6">
        <legend className="sr-only">Gerak & animasi</legend>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-[46ch] flex-col gap-1">
            <span aria-hidden className="text-[13.5px] font-semibold">
              Gerak & animasi
            </span>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              Perayaan, transisi halaman, dan ilustrasi bergerak. Kurangi kalau gerak di layar membuatmu pusing atau mengganggu fokus.
            </p>
          </div>
          {/* Pratinjau hidup: berhenti saat gerak dikurangi, jadi efek pilihan langsung terlihat. */}
          <span aria-hidden className="dot-grid flex h-14 w-24 items-center justify-center gap-1.5 rounded-[12px] bg-tint-sky">
            {[0, 160, 320].map((delay) => (
              <span key={delay} className="typing-dot size-2.5 rounded-pill bg-ink" style={{ '--d': `${delay}ms` } as CSSProperties} />
            ))}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <OptionCard name="motion" value="system" checked={motion === 'system'} onSelect={() => chooseMotion('system')}>
            <span className="flex items-start gap-3 px-1.5 pt-1">
              <Sparkles aria-hidden className="mt-0.5 size-[18px] shrink-0" />
              <span className="flex flex-col gap-0.5 pr-8">
                <span className="text-[14px] font-semibold">Ikuti perangkat</span>
                <span className="text-[12.5px] leading-snug text-ink-muted">
                  {deviceReduces ? 'Perangkatmu meminta gerak dikurangi — animasi sudah diredam.' : 'Animasi penuh, kecuali perangkatmu meminta dikurangi.'}
                </span>
              </span>
            </span>
          </OptionCard>
          <OptionCard name="motion" value="reduce" checked={motion === 'reduce'} onSelect={() => chooseMotion('reduce')}>
            <span className="flex items-start gap-3 px-1.5 pt-1">
              <Waves aria-hidden className="mt-0.5 size-[18px] shrink-0" />
              <span className="flex flex-col gap-0.5 pr-8">
                <span className="text-[14px] font-semibold">Kurangi gerak</span>
                <span className="text-[12.5px] leading-snug text-ink-muted">Semua animasi berhenti di keadaan akhirnya. Informasinya tetap sama.</span>
              </span>
            </span>
          </OptionCard>
        </div>
        <p aria-live="polite" className="text-[12.5px] text-ink-muted">
          {ready ? (motionReduced ? 'Gerak sedang dikurangi di perangkat ini.' : 'Gerak penuh aktif di perangkat ini.') : 'Pilihan ini butuh JavaScript aktif di peramban.'}
        </p>
      </fieldset>
    </div>
  );
}
