'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { RouteSceneArt } from '@/components/layout/route-scene-art';
import { routeSceneFor, type RouteScene, type RouteSceneKey } from '@/lib/route-scene';
import type { Tint } from '@/lib/tint';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'loading' | 'finishing';

/** Di bawah ini navigasi dianggap instan — bilah yang berkedip 50 ms lebih mengganggu daripada tidak ada. */
const SHOW_AFTER_MS = 120;
/**
 * Kartu pemuat hanya untuk navigasi yang benar-benar terasa lambat.
 * Di bawah ±0,4 dtk bilah tipis sudah cukup; kartu yang muncul-hilang di
 * setiap klik justru membuat aplikasi terasa LEBIH lambat.
 */
const CARD_AFTER_MS = 450;
/** Navigasi yang tidak pernah selesai (unduhan, tab dibatalkan) tidak boleh meninggalkan bilah selamanya. */
const GIVE_UP_AFTER_MS = 15_000;
const FINISH_MS = 260;

/** Latar ilustrasi kartu: hiasan pembeda antar-tujuan, bukan penanda makna (ADR-054). */
const STAGE_TINT: Record<RouteSceneKey, Tint> = {
  home: 'sun',
  catalog: 'sky',
  event: 'peach',
  register: 'mint',
  tracker: 'sun',
  teams: 'mint',
  network: 'lilac',
  inbox: 'sky',
  profile: 'peach',
  settings: 'lilac',
  admin: 'mint',
  studio: 'sky',
  submit: 'sun',
  auth: 'peach',
  page: 'sun',
};

const TINT_BG: Record<Tint, string> = {
  sun: 'bg-tint-sun',
  mint: 'bg-tint-mint',
  peach: 'bg-tint-peach',
  sky: 'bg-tint-sky',
  lilac: 'bg-tint-lilac',
};

/**
 * Bilah progres tipis di tepi atas saat berpindah halaman.
 *
 * Produk ini sengaja TANPA `loading.tsx`/Suspense di sekitar halaman (lihat
 * komentar di `src/app/events/page.tsx`: soft-404 & halaman kosong tanpa JS),
 * jadi router App menahan halaman lama sampai halaman baru siap. Di Supabase
 * sungguhan itu 0,3–1 detik tanpa tanda apa pun — klik terasa "tidak terjadi
 * apa-apa", lalu orang mengeklik lagi. Bilah ini mengisi celah itu tanpa
 * mengubah cara halaman dirender: tanpa JavaScript ia tidak ada, dan status
 * HTTP/HTML awal tidak berubah.
 *
 * Mulai: klik tautan internal (fase capture — `<Link>` memanggil
 * `preventDefault` sebelum event sampai ke document) dan kirim form GET.
 * Selesai: path atau query berubah. Form Server Action (POST) tidak
 * ditangani di sini; tombolnya sendiri sudah menandai "Memproses…"
 * (`SubmitButton`).
 *
 * Navigasi yang lewat dari `CARD_AFTER_MS` mendapat kartu pemuat di TENGAH
 * layar: ilustrasi kecil + "Memuat <tujuan>…" (`routeSceneFor`) — pengganti
 * layar pemuat yang tidak bisa kita pasang tanpa `loading.tsx` (soft-404,
 * ADR-053/055). Seluruh lapisan `pointer-events: none`: orang yang berubah
 * pikiran tetap bisa mengeklik tautan lain di halaman lama.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const [scene, setScene] = useState<RouteScene | null>(null);
  const pending = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clearTimers = () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current = [];
    };

    const start = (destination: URL) => {
      clearTimers();
      pending.current = true;
      setScene(null);
      timers.current.push(
        setTimeout(() => {
          if (pending.current) setPhase('loading');
        }, SHOW_AFTER_MS),
        setTimeout(() => {
          if (pending.current) setScene(routeSceneFor(destination.pathname));
        }, CARD_AFTER_MS),
        setTimeout(() => {
          pending.current = false;
          setPhase('idle');
          setScene(null);
        }, GIVE_UP_AFTER_MS),
      );
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return;
      // Jangkar di halaman yang sama (#konten, #faq) bukan navigasi.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start(url);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'get') return;
      // Form tanpa `method` juga GET — termasuk form yang ditangani klien
      // (kotak masuk demo: onSubmit + preventDefault) dan tidak pernah
      // berpindah halaman. Listener ini jalan di fase capture, SEBELUM handler
      // React, jadi keputusannya ditunda satu tick sampai preventDefault terbaca.
      window.setTimeout(() => {
        if (!event.defaultPrevented) start(new URL(form.action, window.location.href));
      }, 0);
    };

    // Form GET = muat penuh. Bila pengguna menekan Kembali, halaman lama bisa
    // dipulihkan dari bfcache lengkap dengan state "loading" yang membeku.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      clearTimers();
      pending.current = false;
      setPhase('idle');
      setScene(null);
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      clearTimers();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    setPhase((current) => (current === 'loading' ? 'finishing' : 'idle'));
  }, [pathname, searchParams]);

  useEffect(() => {
    if (phase !== 'finishing') return;
    const timer = setTimeout(() => {
      setPhase('idle');
      setScene(null);
    }, FINISH_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'idle') return null;
  const finishing = phase === 'finishing';

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
        <div
          className="relative h-full overflow-hidden rounded-r-pill bg-brand shadow-[0_0_10px_var(--color-highlight)]"
          style={{
            animation: finishing
              ? `sf-progress-done ${FINISH_MS}ms ease-out forwards`
              : 'sf-progress 9s cubic-bezier(0.1, 0.65, 0.2, 1) forwards',
          }}
        >
          {!finishing && <span className="progress-sheen absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-transparent via-highlight to-transparent opacity-80" />}
        </div>
      </div>

      {scene && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none fixed inset-0 z-[60] grid place-items-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]',
            finishing ? 'loader-out' : 'loader-in',
          )}
        >
          {/* Selubung warna kanvas yang sangat tipis, bukan scrim gelap: scrim
              gelap berarti "modal, tunggu dulu", padahal halaman lama tetap
              bisa dipakai. Cukup untuk memisahkan kartu dari isi di bawahnya. */}
          <div className="absolute inset-0 bg-canvas/35" />
          <div className="relative flex w-[min(15rem,100%)] flex-col items-center gap-3 rounded-[20px] border border-line bg-panel px-6 pb-5 pt-6 text-center shadow-overlay">
            <span className={cn('dot-grid flex h-[72px] w-24 items-center justify-center rounded-[14px] text-ink', TINT_BG[STAGE_TINT[scene.key]])}>
              <RouteSceneArt scene={scene.key} className="h-12 w-16" />
            </span>
            <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{scene.label}</span>
          </div>
        </div>
      )}
    </>
  );
}
