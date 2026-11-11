'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

export interface LightboxItem {
  readonly id: string;
  readonly src: string;
  readonly alt: string;
  readonly caption: string | null;
  readonly width: number;
  readonly height: number;
}

const SWIPE_MIN_PX = 48;

/** Klik biasa dibuka di penampil; Ctrl/Cmd/Shift/tengah tetap membuka berkasnya seperti tautan biasa. */
export function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Penampil foto layar penuh (`<dialog>` modal): panah kiri/kanan, geser satu
 * jari, Esc menutup, fokus kembali ke pemicunya. Dikendalikan induk lewat
 * `index` (`null` = tertutup) — dipakai slide media acara (ADR-079).
 */
export function PhotoLightbox({
  items,
  label,
  index,
  onIndexChange,
}: {
  items: readonly LightboxItem[];
  label: string;
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<Element | null>(null);
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const count = items.length;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (index === null || !dialog || dialog.open) return;
    openerRef.current = document.activeElement;
    dialog.showModal();
  }, [index]);

  function step(delta: number) {
    if (index === null) return;
    onIndexChange((index + delta + count) % count);
  }

  function close() {
    dialogRef.current?.close();
  }

  function onClose() {
    onIndexChange(null);
    // Peramban modern mengembalikan fokus sendiri; Safari lama tidak.
    if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (count < 2) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  }

  // Geser hanya untuk sentuhan/pena satu jari: jari kedua (cubit-perbesar milik
  // peramban) membatalkan geseran yang sedang berjalan.
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return;
    swipeRef.current = event.isPrimary ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const start = swipeRef.current;
    if (!start || start.id !== event.pointerId) return;
    swipeRef.current = null;
    if (event.type === 'pointercancel' || count < 2) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }

  function onStageClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) close();
  }

  const current = index === null ? null : items[index];
  // Foto sebelah dimuat lebih dulu (tersembunyi) supaya pindah foto tidak menunggu jaringan.
  const neighbours =
    index === null ? [] : [...new Set([(index + 1) % count, (index - 1 + count) % count])].filter((at) => at !== index).map((at) => items[at]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      onClose={onClose}
      onKeyDown={onKeyDown}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 overscroll-contain bg-black p-0 text-white backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-black/80"
    >
      {current && index !== null && (
        <div className="fade-in flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 px-3 pt-[max(env(safe-area-inset-top),0.5rem)] sm:px-5">
            <p aria-live="polite" aria-atomic="true" className="min-w-16 text-sm font-medium tabular-nums text-white/85">
              <span aria-hidden>
                {index + 1} / {count}
              </span>
              <span className="sr-only">
                Foto {index + 1} dari {count}
              </span>
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="Tutup penampil foto"
              className="flex size-11 items-center justify-center rounded-pill bg-white/10 transition-colors duration-150 ease-snap hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          <div className="relative min-h-0 flex-1 touch-pan-y" onPointerDown={onPointerDown} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
            <div onClick={onStageClick} className="absolute inset-0 flex items-center justify-center p-2 sm:px-20 sm:py-4">
              <Image
                key={current.id}
                src={current.src}
                alt={current.alt}
                width={current.width}
                height={current.height}
                sizes="100vw"
                loading="eager"
                draggable={false}
                className="fade-in h-auto max-h-full w-auto max-w-full select-none object-contain"
              />
            </div>
            {count > 1 && (
              <>
                <StepButton direction="prev" onClick={() => step(-1)} className="absolute inset-y-0 left-4 my-auto hidden sm:flex" />
                <StepButton direction="next" onClick={() => step(1)} className="absolute inset-y-0 right-4 my-auto hidden sm:flex" />
              </>
            )}
            {neighbours.map((item) =>
              item ? <Image key={`pre-${item.id}`} src={item.src} alt="" width={item.width} height={item.height} sizes="100vw" loading="eager" className="hidden" /> : null,
            )}
          </div>

          <div className="flex min-h-16 items-center gap-3 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 sm:px-5">
            {count > 1 && <StepButton direction="prev" onClick={() => step(-1)} className="shrink-0 sm:hidden" />}
            <p className="line-clamp-2 min-w-0 flex-1 text-center text-sm leading-snug text-white/80">{current.caption}</p>
            {count > 1 && <StepButton direction="next" onClick={() => step(1)} className="shrink-0 sm:hidden" />}
          </div>
        </div>
      )}
    </dialog>
  );
}

function StepButton({ direction, onClick, className }: { direction: 'prev' | 'next'; onClick: () => void; className?: string }) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Foto sebelumnya' : 'Foto berikutnya'}
      className={cn(
        'flex size-12 items-center justify-center rounded-pill bg-white/10 transition-colors duration-150 ease-snap hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        className,
      )}
    >
      <Icon aria-hidden className="size-6" />
    </button>
  );
}
