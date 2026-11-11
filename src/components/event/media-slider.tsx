'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight, Expand, Play } from 'lucide-react';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { isPlainClick, PhotoLightbox, type LightboxItem } from '@/components/event/photo-lightbox';
import type { EventVideo } from '@/lib/video';
import { cn } from '@/lib/utils';

export type MediaSlide =
  | (LightboxItem & { readonly kind: 'photo'; readonly isPoster: boolean })
  | { readonly kind: 'video'; readonly id: string; readonly video: EventVideo };

/** Sampai jumlah ini titik penanda tampil; lebih dari itu cukup penghitung "3 / 12". */
const MAX_DOTS = 8;

const noop = () => () => {};

/** Lebar kolom utama halaman detail acara (sidebar 340px muncul mulai 960px). */
const SLIDE_SIZES = '(min-width: 1200px) 780px, (min-width: 960px) 68vw, 100vw';

/**
 * Slide poster, foto, dan video acara (ADR-079) — pola carousel APG W3C:
 * wilayah ber-label, slide = grup "x dari n", tanpa putar otomatis.
 *
 * - Tanpa JavaScript: deretan scroll-snap yang bisa digeser/di-scroll dan
 *   setiap foto menautkan berkasnya; video menautkan halaman YouTube/Vimeo.
 * - Dengan JavaScript: tombol sebelum/berikut (juga di ponsel — geser bukan
 *   satu-satunya cara, WCAG 2.5.7), titik penanda, penampil layar penuh, dan
 *   pemutar video yang baru dimuat setelah ditekan.
 * - Slide aktif dihitung dari posisi gulir (`scroll` + rAF): event
 *   `scrollsnapchanging` belum ada di Firefox/Safari.
 */
export function MediaSlider({ slides, label }: { slides: readonly MediaSlide[]; label: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const trackId = useId();
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const count = slides.length;

  const photos = slides.filter((slide): slide is Extract<MediaSlide, { kind: 'photo' }> => slide.kind === 'photo');
  const photoIndex = (slideIndex: number) => {
    const slide = slides[slideIndex];
    return slide?.kind === 'photo' ? photos.findIndex((photo) => photo.id === slide.id) : -1;
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const measure = () => {
      const width = track.clientWidth;
      if (width > 0) setActive(Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / width))));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    // Posisi gulir bisa dipulihkan peramban (kembali ke halaman) tanpa event scroll.
    measure();
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [count]);

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const target = Math.min(count - 1, Math.max(0, index));
    // `scroll-behavior` dari CSS (`motion-safe:scroll-smooth`) menghormati prefers-reduced-motion.
    track.scrollTo({ left: target * track.clientWidth });
    setActive(target);
  }

  function openPhoto(slideIndex: number, event: MouseEvent<HTMLAnchorElement>) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    const at = photoIndex(slideIndex);
    if (at >= 0) setLightbox(at);
  }

  if (count === 0) return null;
  const activeSlide = slides[active];
  const activePhoto = activeSlide?.kind === 'photo' ? photoIndex(active) : -1;
  const showControls = hydrated && count > 1;

  return (
    <section aria-roledescription="carousel" aria-label={label} className="flex flex-col gap-3">
      <div className="relative">
        <div
          ref={trackRef}
          id={trackId}
          // Fokus keyboard + panah = geser antar slide (perilaku asli kontainer gulir ber-snap).
          // `group`: elemen yang bisa difokus butuh peran agar labelnya dibacakan (div polos dilarang diberi nama, ARIA 1.2).
          tabIndex={0}
          role="group"
          aria-label={`${label} — geser untuk melihat ${count} slide`}
          className={cn(
            'flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-panel bg-panel-nested motion-safe:scroll-smooth',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            // Tanpa JS scrollbar tetap terlihat — satu-satunya cara menggulir dengan tetikus.
            hydrated && '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} dari ${count}${slide.kind === 'video' ? ', video' : slide.isPoster ? ', poster' : ''}`}
              className="relative aspect-square w-full shrink-0 snap-center snap-always overflow-hidden sm:aspect-[3/2]"
            >
              {slide.kind === 'photo' ? (
                <a
                  href={slide.src}
                  onClick={(event) => openPhoto(index, event)}
                  className="group absolute inset-0 block focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-focus"
                >
                  {/* Latar buram dari foto yang sama (URL & ukuran sama = satu unduhan) mengisi sisi poster tegak. */}
                  <Image
                    src={slide.src}
                    alt=""
                    aria-hidden
                    width={slide.width}
                    height={slide.height}
                    sizes={SLIDE_SIZES}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    className="absolute inset-0 size-full scale-110 object-cover opacity-45 blur-2xl"
                  />
                  <Image
                    src={slide.src}
                    alt={slide.alt}
                    width={slide.width}
                    height={slide.height}
                    sizes={SLIDE_SIZES}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    className="relative size-full object-contain"
                  />
                  {slide.isPoster && (
                    <span className="absolute left-3 top-3 rounded-sm bg-panel/90 px-2 py-1 text-[12px] font-semibold text-ink shadow-sm">Poster</span>
                  )}
                </a>
              ) : (
                <VideoSlide video={slide.video} isActive={!hydrated || index === active} />
              )}
            </div>
          ))}
        </div>

        {showControls && (
          <>
            {/* Berputar, tidak pernah dinonaktifkan: tombol yang mendadak disabled membuang fokus keyboard ke <body>. */}
            <StepButton direction="prev" controls={trackId} onClick={() => goTo((active - 1 + count) % count)} />
            <StepButton direction="next" controls={trackId} onClick={() => goTo((active + 1) % count)} />
          </>
        )}
      </div>

      {hydrated && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-1">
            {count > 1 && count <= MAX_DOTS
              ? slides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    aria-controls={trackId}
                    aria-current={index === active ? 'true' : undefined}
                    aria-label={`Ke slide ${index + 1}${slide.kind === 'video' ? ' (video)' : slide.isPoster ? ' (poster)' : ''}`}
                    onClick={() => goTo(index)}
                    className="group flex size-11 items-center justify-center rounded-pill focus-visible:outline-2 focus-visible:outline-offset-[-6px] focus-visible:outline-focus"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'block h-2 rounded-pill transition-[width,background-color] duration-150 ease-snap',
                        index === active ? 'w-6 bg-ink' : 'w-2 bg-line-strong group-hover:bg-ink-muted',
                      )}
                    />
                  </button>
                ))
              : null}
            {count > 1 && (
              <p aria-live="polite" aria-atomic="true" className={cn('text-[13px] tabular-nums text-ink-muted', count <= MAX_DOTS && 'sr-only')}>
                {active + 1} / {count}
              </p>
            )}
          </div>
          {activePhoto >= 0 && (
            <button
              type="button"
              onClick={() => setLightbox(activePhoto)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-card px-2 text-[13.5px] font-medium text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Expand aria-hidden className="size-4" /> Layar penuh
            </button>
          )}
        </div>
      )}

      {photos.length > 0 && <PhotoLightbox items={photos} label={`Foto ${label}`} index={lightbox} onIndexChange={setLightbox} />}
    </section>
  );
}

/**
 * Pemutar baru dimuat setelah ditekan: membuka halaman acara tidak
 * menghubungi YouTube/Vimeo sama sekali (tanpa cookie, tanpa IP bocor).
 * Pindah slide = pemutar dilepas, supaya video tidak terus berbunyi di slide
 * yang tidak terlihat.
 */
function VideoSlide({ video, isActive }: { video: EventVideo; isActive: boolean }) {
  const [playing, setPlaying] = useState(false);
  if (playing && !isActive) setPlaying(false);

  if (playing) {
    return (
      <iframe
        src={video.embedUrl}
        title={`Video acara (${video.providerLabel})`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 size-full border-0 bg-black"
      />
    );
  }

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        setPlaying(true);
      }}
      className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
    >
      <span aria-hidden className="flex size-16 items-center justify-center rounded-pill bg-white text-black transition-transform duration-150 ease-snap group-hover:scale-105">
        <Play className="size-7 translate-x-0.5" fill="currentColor" />
      </span>
      <span className="text-base font-semibold">Putar video</span>
      <span className="max-w-[34ch] text-[12.5px] leading-snug text-white/75">
        Diputar dari {video.providerLabel} — baru dimuat setelah kamu menekan putar.
        <span className="sr-only"> (tanpa JavaScript, terbuka di tab baru)</span>
      </span>
    </a>
  );
}

function StepButton({ direction, controls, onClick }: { direction: 'prev' | 'next'; controls: string; onClick: () => void }) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-controls={controls}
      aria-label={direction === 'prev' ? 'Slide sebelumnya' : 'Slide berikutnya'}
      onClick={onClick}
      className={cn(
        'absolute inset-y-0 my-auto flex size-11 items-center justify-center rounded-pill border border-line bg-panel/90 text-ink shadow-card transition-colors duration-150 ease-snap',
        'hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        direction === 'prev' ? 'left-2 sm:left-3' : 'right-2 sm:right-3',
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
