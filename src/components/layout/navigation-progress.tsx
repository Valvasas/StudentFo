'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'loading' | 'finishing';

/** Di bawah ini navigasi dianggap instan — bilah yang berkedip 50 ms lebih mengganggu daripada tidak ada. */
const SHOW_AFTER_MS = 120;
/** Navigasi yang tidak pernah selesai (unduhan, tab dibatalkan) tidak boleh meninggalkan bilah selamanya. */
const GIVE_UP_AFTER_MS = 15_000;

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
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const pending = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clearTimers = () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current = [];
    };

    const start = () => {
      clearTimers();
      pending.current = true;
      timers.current.push(
        setTimeout(() => {
          if (pending.current) setPhase('loading');
        }, SHOW_AFTER_MS),
        setTimeout(() => {
          pending.current = false;
          setPhase('idle');
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
      start();
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'get') return;
      start();
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      clearTimers();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    setPhase((current) => (current === 'loading' ? 'finishing' : 'idle'));
  }, [pathname, searchParams]);

  useEffect(() => {
    if (phase !== 'finishing') return;
    const timer = setTimeout(() => setPhase('idle'), 260);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'idle') return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
      <div
        className="h-full rounded-r-pill bg-brand shadow-[0_0_10px_var(--color-highlight)]"
        style={{
          animation:
            phase === 'loading'
              ? 'sf-progress 9s cubic-bezier(0.1, 0.65, 0.2, 1) forwards'
              : 'sf-progress-done 260ms ease-out forwards',
        }}
      />
    </div>
  );
}
