'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

export interface GalleryItem {
  readonly id: string;
  readonly src: string;
  readonly alt: string;
  readonly caption: string | null;
  readonly width: number;
  readonly height: number;
}

interface Tile {
  readonly className: string;
  /** Porsi lebar galeri yang dipakai petak ini di sm+ dan di ponsel — untuk `sizes`. */
  readonly desktop: number;
  readonly mobile: number;
}

const BIG: Tile = { className: 'col-span-6 aspect-[3/2] sm:col-span-2 sm:row-span-2', desktop: 1 / 2, mobile: 1 };
const SMALL: Tile = { className: 'col-span-2 aspect-square sm:col-span-1', desktop: 1 / 4, mobile: 1 / 3 };

/**
 * Mosaik: ponsel = grid 6 kolom (1 besar + maks. 3 kecil), sm+ = grid 4×2
 * (1 besar + maks. 4 kecil). Susunan per jumlah foto supaya tidak pernah
 * ada petak kosong di ujung baris.
 */
function tilesFor(count: number): readonly Tile[] {
  if (count === 1) return [{ className: 'col-span-6 aspect-[3/2] sm:col-span-4 sm:row-span-2', desktop: 1, mobile: 1 }];
  const half: Tile = { className: 'col-span-3 aspect-square sm:col-span-2 sm:row-span-2', desktop: 1 / 2, mobile: 1 / 2 };
  if (count === 2) return [half, half];
  const wide: Tile = { className: 'col-span-3 aspect-square sm:col-span-2', desktop: 1 / 2, mobile: 1 / 2 };
  if (count === 3) return [BIG, wide, wide];
  if (count === 4) return [BIG, { ...wide, className: 'col-span-2 aspect-square sm:col-span-2', mobile: 1 / 3 }, SMALL, SMALL];
  return [BIG, SMALL, SMALL, SMALL, { ...SMALL, className: `${SMALL.className} hidden sm:block` }];
}

const MOBILE_VISIBLE = 4;
const DESKTOP_VISIBLE = 5;
const SWIPE_MIN_PX = 48;

/** Lebar kolom utama halaman detail acara (sidebar 340px muncul mulai 960px). */
function sizesOf(tile: Tile): string {
  const vw = (fraction: number) => `${Math.round(fraction * 100)}vw`;
  return [
    `(min-width: 1200px) ${Math.round(780 * tile.desktop)}px`,
    `(min-width: 960px) ${Math.round(68 * tile.desktop)}vw`,
    `(min-width: 640px) ${vw(tile.desktop)}`,
    vw(tile.mobile),
  ].join(', ');
}

/** Klik biasa dibuka di penampil; Ctrl/Cmd/Shift/tengah tetap membuka berkasnya seperti tautan biasa. */
function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Mosaik galeri + penampil layar penuh. Tanpa JavaScript setiap petak adalah
 * tautan ke berkas fotonya dan "Lihat semua" membuka daftar lengkap di
 * tempat; dengan JavaScript keduanya membuka `<dialog>` modal.
 */
export function GalleryViewer({ items, label }: { items: readonly GalleryItem[]; label: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const count = items.length;
  const tiles = tilesFor(count);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (index !== null && dialog && !dialog.open) dialog.showModal();
  }, [index]);

  function step(delta: number) {
    setIndex((current) => (current === null ? null : (current + delta + count) % count));
  }

  function open(at: number, event: MouseEvent<HTMLElement>) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    openerRef.current = event.currentTarget;
    setIndex(at);
  }

  function close() {
    dialogRef.current?.close();
  }

  function onClose() {
    setIndex(null);
    // Peramban modern mengembalikan fokus sendiri; Safari lama tidak.
    openerRef.current?.focus();
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
  const showAllClass = count > DESKTOP_VISIBLE ? 'block' : count > MOBILE_VISIBLE ? 'block sm:hidden' : 'hidden';

  return (
    <>
      <ul
        className={cn(
          'grid grid-cols-6 gap-1.5 overflow-hidden rounded-panel sm:grid-cols-4 sm:grid-rows-2 sm:gap-2',
          count === 1 ? 'sm:aspect-[16/9]' : 'sm:aspect-[2/1]',
        )}
      >
        {tiles.map((tile, at) => {
          const item = items[at];
          if (!item) return null;
          return (
            <li key={item.id} className={cn('relative min-h-0 sm:aspect-auto', tile.className)}>
              {/* Cincin fokus dua warna di atas foto: putih saja hilang di foto terang. Garis
                  luar transparan untuk mode kontras tinggi, yang membuang bayangan. */}
              <a
                href={item.src}
                onClick={(event) => open(at, event)}
                className="group absolute inset-0 block bg-panel-nested after:pointer-events-none after:absolute after:inset-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-transparent focus-visible:after:shadow-[inset_0_0_0_2px_rgb(0_0_0/0.75),inset_0_0_0_4px_white]"
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  width={item.width}
                  height={item.height}
                  sizes={sizesOf(tile)}
                  className="size-full object-cover transition-[filter] duration-150 ease-snap group-hover:brightness-90"
                />
              </a>
            </li>
          );
        })}
      </ul>

      <details className={showAllClass}>
        <summary
          onClick={(event) => open(0, event)}
          className="press inline-flex h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-card border border-line bg-panel px-4 text-sm font-semibold text-ink transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden"
        >
          <Images aria-hidden className="size-4" /> Lihat semua ({count})
        </summary>
        <ul className="grid grid-cols-3 gap-1.5 pt-3 sm:grid-cols-5">
          {items.map((item) => (
            <li key={item.id}>
              <a href={item.src} className="relative block aspect-square overflow-hidden rounded-sm bg-panel-nested focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                <Image src={item.src} alt={item.alt} width={item.width} height={item.height} sizes="(min-width: 640px) 160px, 34vw" className="absolute inset-0 size-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      </details>

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
                aria-label="Tutup galeri"
                className="flex size-11 items-center justify-center rounded-pill bg-white/10 transition-colors duration-150 ease-snap hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>

            <div
              className="relative min-h-0 flex-1 touch-pan-y"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
            >
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
                item ? (
                  <Image key={`pre-${item.id}`} src={item.src} alt="" width={item.width} height={item.height} sizes="100vw" loading="eager" className="hidden" />
                ) : null,
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
    </>
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
