'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, type ComponentProps } from 'react';
import { isMotionReduced } from '@/lib/motion-pref';
import { canUseViewTransition, isTransitionableClick, VIEW_TRANSITION_CAP_MS } from '@/lib/view-transition';

/**
 * Tautan daftar → detail dengan View Transitions API (ADR-099). Next 15
 * stabil belum punya `<ViewTransition>` (hanya kanal React eksperimental),
 * jadi transisinya dimulai di sini: `document.startViewTransition` →
 * `router.push` → selesai saat `ViewTransitionBridge` melihat pathname baru
 * dirender (atau batas `VIEW_TRANSITION_CAP_MS`).
 *
 * Kartu asal bertanda `data-vt-card`; anak bertanda `data-vt-name` (judul,
 * poster) diberi `view-transition-name` HANYA selama transisi, jadi nama
 * tidak pernah ganda di DOM. Pasangannya di halaman detail adalah kelas
 * `vt-title`/`vt-poster` yang hanya bernama saat `html[data-vt='morph']`.
 * Dari halaman detail (sudah ada `.vt-title`) transisinya crossfade saja.
 *
 * Gagal-aman: tanpa dukungan, gerak dikurangi, koneksi lambat, atau klik
 * berpengubah → `<Link>` biasa tanpa perubahan apa pun.
 */
let settlePending: (() => void) | null = null;

/** Dipasang sekali di layout akar: menandai "halaman baru sudah dirender". */
export function ViewTransitionBridge() {
  const pathname = usePathname();
  useEffect(() => {
    settlePending?.();
  }, [pathname]);
  return null;
}

type NetworkInformationLike = { effectiveType?: string; saveData?: boolean };

function transitionsAllowed(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return canUseViewTransition({
    supported: 'startViewTransition' in document,
    reducedMotion: isMotionReduced(),
    effectiveType: connection?.effectiveType,
    saveData: connection?.saveData,
  });
}

const PREFETCH_DWELL_MS = 120;

type TransitionLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

export function TransitionLink({ href, onClick, onPointerEnter, onPointerLeave, ...props }: TransitionLinkProps) {
  const router = useRouter();
  const dwell = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(dwell.current), []);

  return (
    <Link
      href={href}
      {...props}
      // Halaman detail dirender dinamis, jadi prefetch bawaan `<Link>` tidak
      // mengambil isinya. Kursor yang BERHENTI di kartu = niat; mengambilnya
      // lebih awal memendekkan jeda beku transisi. Sentuhan tidak dipakai:
      // jari yang menggulir juga menyentuh kartu.
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (event.pointerType !== 'mouse') return;
        window.clearTimeout(dwell.current);
        dwell.current = window.setTimeout(() => router.prefetch(href), PREFETCH_DWELL_MS);
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        window.clearTimeout(dwell.current);
      }}
      onClick={(event) => {
        onClick?.(event);
        const anchor = event.currentTarget;
        const destination = new URL(anchor.href, window.location.href);
        if (!isTransitionableClick(event, anchor.target, destination, new URL(window.location.href))) return;
        if (!transitionsAllowed()) return;
        event.preventDefault();
        navigateWithTransition(anchor, () => router.push(href));
      }}
    />
  );
}

function navigateWithTransition(anchor: HTMLAnchorElement, navigate: () => void) {
  const root = document.documentElement;
  const card = document.querySelector('.vt-title') ? null : anchor.closest<HTMLElement>('[data-vt-card]');
  const named = card ? Array.from(card.querySelectorAll<HTMLElement>('[data-vt-name]')) : [];
  for (const element of named) element.style.viewTransitionName = element.dataset.vtName ?? '';
  root.dataset.vt = card ? 'morph' : 'fade';

  const cleanup = () => {
    for (const element of named) element.style.viewTransitionName = '';
    delete root.dataset.vt;
  };

  try {
    const transition = document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          const done = () => {
            window.clearTimeout(timer);
            if (settlePending === done) settlePending = null;
            resolve();
          };
          const timer = window.setTimeout(done, VIEW_TRANSITION_CAP_MS);
          settlePending = done;
          navigate();
        }),
    );
    // `ready` menolak bila transisinya dilewati (mis. diganti transisi lain) —
    // ditangkap supaya tidak jadi galat tak tertangani; navigasinya tetap jalan.
    transition.ready.catch(() => undefined);
    transition.finished.then(cleanup, cleanup);
  } catch {
    cleanup();
    navigate();
  }
}
