'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { isMotionReduced } from '@/lib/motion-pref';

/**
 * Mesin tur berpemandu: kursor bergerak, mengklik, dan kamera mendekat lalu
 * mundur per langkah (ADR-063, menggantikan tur yang dihapus di ADR-056).
 *
 * Panggung digambar di bingkai tetap 880×560 lalu diskalakan ke lebar kolom,
 * supaya koordinat kursor di data bab berlaku di semua ukuran layar. Warna
 * memakai token tema lewat `var()`, jadi mode gelap ikut tanpa cabang.
 *
 * Panggung `aria-hidden` dan TIDAK punya region `aria-live`: narasi yang maju
 * sendiri tiap dua detik adalah gangguan bagi pembaca layar. Isinya dibawa
 * daftar langkah — tombol sungguhan dengan judul & penjelasan bab.
 *
 * Hanya berjalan saat terlihat dan tab aktif, berhenti sendiri setelah satu
 * putaran penuh, dan bisa dijeda (WCAG 2.2.2). Dengan "kurangi gerak" (OS atau
 * Personalisasi) tur tidak berjalan: setiap bab tampil di keadaan akhirnya.
 */

export type TourState = Readonly<Record<string, string | number>>;

export interface TourBeat {
  readonly x: number;
  readonly y: number;
  readonly click?: boolean;
  readonly cap: string;
  readonly set?: TourState;
  readonly dur?: number;
  /** [x, y, zoom] titik fokus kamera, kalau berbeda dari posisi kursor. */
  readonly focus?: readonly [number, number, number];
  /** Tingkat zoom di posisi kursor (bawaan 1.5). */
  readonly zoom?: number;
  /** Kamera mundur ke tampilan penuh setelah klik (hasilnya besar). */
  readonly hitWide?: boolean;
  readonly wide?: boolean;
}

export interface TourChapter {
  readonly title: string;
  readonly detail: string;
  /** Path yang ditampilkan di bilah alamat — rute sungguhan di aplikasi. */
  readonly path: string;
  readonly beats: readonly TourBeat[];
  readonly render: (state: TourState) => ReactNode;
}

export const STAGE_W = 880;
export const STAGE_H = 560;

export const C = {
  ink: 'var(--color-ink)',
  soft: 'var(--color-ink-soft)',
  muted: 'var(--color-ink-muted)',
  faint: 'var(--color-ink-faint)',
  line: 'var(--color-line)',
  lineStrong: 'var(--color-line-strong)',
  panel: 'var(--color-panel)',
  nested: 'var(--color-panel-nested)',
  canvas: 'var(--color-canvas)',
  brand: 'var(--color-brand)',
  onBrand: 'var(--color-on-brand)',
  brandSoft: 'var(--color-brand-soft)',
  success: 'var(--color-success)',
  successSoft: 'var(--color-success-container)',
  warning: 'var(--color-warning)',
  warningSoft: 'var(--color-warning-container)',
  highlight: 'var(--color-highlight)',
  onHighlight: 'var(--color-on-highlight)',
} as const;

export const at = (left: number, top: number, extra: CSSProperties = {}): CSSProperties => ({ position: 'absolute', left, top, ...extra });

export const chip = (on: boolean): CSSProperties => ({
  background: on ? C.brand : C.panel,
  color: on ? C.onBrand : C.ink,
  borderColor: on ? C.brand : C.line,
  transition: 'background 220ms ease,color 220ms ease,border-color 220ms ease',
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const CAMERA_WIDE_MS = 1100;
const CAMERA_ZOOM_MS = 1000;
/** Pembuka bab harus lebih lama dari transisi ke zoom 1, kalau tidak kamera berbalik sebelum mundur penuh. */
const ESTABLISH_MS = CAMERA_WIDE_MS + 500;
/** Di atas ini teks panggung mulai pecah (digambar di 880×560 lalu diskalakan). */
const MAX_ZOOM = 2.2;
const EASE = 'cubic-bezier(.65,0,.25,1)';

function stateOf(chapter: TourChapter, beat: number, hit: boolean): TourState {
  const state: Record<string, string | number> = {};
  chapter.beats.slice(0, beat).forEach((b) => Object.assign(state, b.set));
  if (hit) Object.assign(state, chapter.beats[beat]?.set);
  return state;
}

export function ProductTour({
  chapters,
  host,
  appName,
  nav,
  avatar,
  cta,
}: {
  chapters: readonly TourChapter[];
  host: string;
  appName: string;
  nav: readonly string[];
  avatar: string;
  cta: { readonly href: string; readonly label: string };
}) {
  const [chapter, setChapter] = useState(0);
  const [beat, setBeat] = useState(0);
  const [hit, setHit] = useState(false);
  const [press, setPress] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const [inView, setInView] = useState(false);
  const [scale, setScale] = useState(0.8);
  const [wide, setWide] = useState(true);
  const [still, setStill] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const enteringChapter = useRef(true);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    if (isMotionReduced()) {
      setStill(true);
      setPlaying(false);
    }
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const resize = new ResizeObserver(() => {
      if (el.clientWidth) setScale(el.clientWidth / STAGE_W);
    });
    resize.observe(el);
    const visible = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? false), { threshold: 0.35 });
    visible.observe(el);
    const onVisibility = () => {
      if (document.hidden) setInView(false);
      else {
        const rect = el.getBoundingClientRect();
        setInView(rect.top < window.innerHeight && rect.bottom > 0);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      resize.disconnect();
      visible.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Satu efek menggerakkan seluruh timeline: setiap perubahan bab/beat/status
  // putar menjadwal ulang klik & perpindahan berikutnya.
  useEffect(() => {
    clearTimers();
    if (!playing || !inView) return;
    const current = chapters[chapter]?.beats[beat];
    if (!current) return;
    let extra = 0;
    if (enteringChapter.current) {
      extra = ESTABLISH_MS;
      enteringChapter.current = false;
      setWide(true);
      later(() => setWide(false), extra);
    }
    later(
      () => {
        setHit(true);
        setPress(Boolean(current.click));
        later(() => setPress(false), 90);
      },
      (current.click ? 1000 : 400) + extra,
    );
    later(
      () => {
        const nextBeat = beat + 1;
        if (nextBeat < (chapters[chapter]?.beats.length ?? 0)) {
          setHit(false);
          setBeat(nextBeat);
          return;
        }
        if (chapter + 1 >= chapters.length) {
          // Satu putaran cukup: tur yang berulang tanpa akhir mencuri
          // perhatian dari isi halaman di bawahnya.
          setPlaying(false);
          setFinished(true);
          setWide(true);
          return;
        }
        enteringChapter.current = true;
        setHit(false);
        setBeat(0);
        setChapter(chapter + 1);
      },
      (current.dur ?? 2400) + extra,
    );
    return clearTimers;
  }, [chapter, beat, playing, inView, chapters, clearTimers, later]);

  const jump = (index: number) => {
    enteringChapter.current = true;
    setFinished(false);
    setChapter(index);
    if (still) {
      setBeat((chapters[index]?.beats.length ?? 1) - 1);
      setHit(true);
      return;
    }
    setBeat(0);
    setHit(false);
    setPress(false);
    setPlaying(true);
  };

  const togglePlay = () => {
    if (finished) {
      jump(0);
      return;
    }
    setPlaying((value) => !value);
  };

  const current = chapters[chapter]!;
  // Kurangi gerak: bab tampil di keadaan akhirnya, kamera tetap penuh.
  const beatIndex = still ? current.beats.length - 1 : beat;
  const bt = current.beats[beatIndex]!;
  const state = stateOf(current, beatIndex, still || hit || finished);

  const captionBelow = scale < 0.66;
  let zoom = bt.focus ? bt.focus[2] : (bt.zoom ?? 1.5);
  let fx = bt.focus ? bt.focus[0] : bt.x;
  let fy = bt.focus ? bt.focus[1] : bt.y;
  if (captionBelow) zoom = Math.min(zoom * 1.25, MAX_ZOOM);
  if (bt.wide || (hit && bt.hitWide) || wide || still || finished) {
    zoom = 1;
    fx = STAGE_W / 2;
    fy = STAGE_H / 2;
  }
  const ox = clamp(fx - STAGE_W / 2 / zoom, 0, STAGE_W - STAGE_W / zoom);
  const oy = clamp(fy - STAGE_H / 2 / zoom, 0, STAGE_H - STAGE_H / zoom);
  const camDur = zoom === 1 ? CAMERA_WIDE_MS : CAMERA_ZOOM_MS;
  const camTransition = `transform ${camDur}ms ${EASE}`;
  const screenX = (bt.x - ox) * zoom;
  const screenY = (bt.y - oy) * zoom;

  const live = playing && inView;
  const progressDur = (bt.dur ?? 2400) + (beat === 0 ? ESTABLISH_MS : 0);
  const doneBeats = still || finished ? current.beats.length : live ? beat + 1 : beat + (hit ? 1 : 0);
  const progressPct = `${Math.round((doneBeats / current.beats.length) * 100)}%`;
  const progressTransition = live ? `width ${progressDur}ms linear` : 'width 300ms ease';
  const caption = still || finished ? current.detail : bt.cap;
  const statusText = still ? 'Tampilan statis' : finished ? 'Tur selesai' : playing ? 'Tur berjalan' : 'Tur dijeda';

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {!still && (
        <button
          type="button"
          onClick={togglePlay}
          className="press flex min-h-11 items-center gap-2 rounded-sm border border-line-strong/70 px-3.5 text-sm font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested"
        >
          {finished ? (
            <RotateCcw aria-hidden className="size-3.5" />
          ) : playing ? (
            <Pause aria-hidden className="size-3.5" />
          ) : (
            <Play aria-hidden className="size-3.5 fill-current" />
          )}
          {finished ? 'Putar ulang' : playing ? 'Jeda tur' : 'Lanjutkan tur'}
        </button>
      )}
      <Link
        href={cta.href}
        className="flex min-h-11 items-center rounded-sm bg-brand px-3.5 text-sm font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover"
      >
        {cta.label}
      </Link>
    </div>
  );

  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
      {/* Daftar langkah: bilah segmen di layar sempit (panggung langsung di
          bawahnya, tombol sesudahnya), kolom di layar lebar. */}
      <div className="order-1 flex min-w-0 basis-full flex-col gap-3 min-[920px]:hidden">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${chapters.length},minmax(0,1fr))` }}>
          {chapters.map((c, index) => {
            const on = index === chapter;
            const done = index < chapter || (finished && on);
            return (
              <button
                key={c.title}
                type="button"
                onClick={() => jump(index)}
                aria-current={on ? 'step' : undefined}
                aria-label={`Langkah ${index + 1}: ${c.title}. ${c.detail}`}
                className="flex min-h-11 flex-col justify-end gap-2 py-1 text-left"
              >
                <span className={`font-mono text-xs ${on ? 'text-ink' : 'text-ink-muted'}`}>0{index + 1}</span>
                <span className="block h-[3px] overflow-hidden rounded-[2px] bg-line">
                  <span
                    className="block h-full bg-brand"
                    style={{ width: on ? progressPct : done ? '100%' : '0%', transition: on ? progressTransition : 'width 300ms ease' }}
                  />
                </span>
              </button>
            );
          })}
        </div>
        <span className="text-[17px] font-semibold tracking-[-0.01em]">{current.title}</span>
      </div>
      <div className="order-3 basis-full min-[920px]:hidden">{controls}</div>

      <ol className="order-1 hidden max-w-[300px] flex-[1_1_240px] flex-col gap-1 min-[920px]:flex">
        {chapters.map((c, index) => {
          const on = index === chapter;
          const done = index < chapter || (finished && on);
          return (
            <li key={c.title}>
              <button
                type="button"
                onClick={() => jump(index)}
                aria-current={on ? 'step' : undefined}
                className={`flex w-full gap-3.5 rounded-[12px] p-3.5 text-left transition-colors duration-200 ease-snap hover:bg-panel-nested ${on ? 'bg-panel-nested' : ''}`}
              >
                <span
                  className={`flex size-[30px] shrink-0 items-center justify-center rounded-pill border border-brand font-mono text-xs transition-colors duration-200 ${on || done ? 'bg-brand text-on-brand' : 'bg-panel text-ink'}`}
                >
                  0{index + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className={`text-[15px] font-semibold ${on ? 'text-ink' : 'text-ink-soft'}`}>{c.title}</span>
                  <span className="text-[13.5px] leading-snug text-ink-muted">{c.detail}</span>
                  <span aria-hidden className={`mt-2 block h-0.5 overflow-hidden rounded-[1px] ${on ? 'bg-line' : 'bg-transparent'}`}>
                    <span className="block h-full bg-brand" style={{ width: on ? progressPct : '0%', transition: on ? progressTransition : 'none' }} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        <li className="mt-4 px-3.5">{controls}</li>
      </ol>

      <div
        data-reveal="scale"
        style={{ ['--reveal-delay' as string]: '150ms' }}
        className="order-2 min-w-0 flex-[3_1_520px] overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_1px_2px_rgba(0,0,0,.04),0_16px_40px_rgba(0,0,0,.07)]"
      >
        <div aria-hidden className="flex h-10 items-center gap-2 border-b border-line bg-panel-nested px-4">
          <span className="size-2.5 rounded-pill bg-line-strong/60" />
          <span className="size-2.5 rounded-pill bg-line-strong/60" />
          <span className="size-2.5 rounded-pill bg-line-strong/60" />
          <span className="ml-2.5 min-w-0 truncate rounded-[6px] bg-panel px-2.5 py-1 font-mono text-[11.5px] text-ink-muted">
            {host}/{current.path}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-ink-muted">
            <span className="relative size-[7px]">
              <span className="absolute inset-0 rounded-pill bg-ink" />
              {live && <span className="absolute inset-0 animate-ping rounded-pill bg-ink opacity-40" />}
            </span>
            {statusText}
          </span>
        </div>

        <div ref={stageRef} aria-hidden data-tour-stage="" className="relative w-full overflow-hidden bg-panel" style={{ height: Math.round(STAGE_H * scale) }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: STAGE_W,
              height: STAGE_H,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              color: C.ink,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: STAGE_W,
                height: STAGE_H,
                transform: `translate(${(-ox * zoom).toFixed(1)}px,${(-oy * zoom).toFixed(1)}px) scale(${zoom.toFixed(3)})`,
                transformOrigin: '0 0',
                transition: camTransition,
                willChange: 'transform',
              }}
            >
              <div
                style={at(0, 0, {
                  width: STAGE_W,
                  height: 52,
                  boxSizing: 'border-box',
                  borderBottom: `1px solid ${C.line}`,
                  background: C.panel,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 24px',
                })}
              >
                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.03em' }}>{appName}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20, fontSize: 13, color: C.muted }}>
                  {nav.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: C.brand,
                      color: C.onBrand,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {avatar}
                  </span>
                </span>
              </div>

              {chapters.map((c, index) => (
                <div
                  key={c.title}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: STAGE_W,
                    height: STAGE_H,
                    opacity: chapter === index ? 1 : 0,
                    transition: 'opacity 450ms ease',
                  }}
                >
                  {/* Bab lain digambar di keadaan awalnya: hanya bab aktif yang membaca state. */}
                  {c.render(chapter === index ? state : {})}
                </div>
              ))}

              {!still && !finished && <Cursor x={bt.x} y={bt.y} zoom={zoom} press={press} camTransition={camTransition} />}
            </div>

            {!captionBelow && (
              <div
                style={at(
                  Math.round(clamp(screenX > 560 ? screenX - 290 : screenX + 30, 12, 610)),
                  Math.round(
                    still || finished ? STAGE_H - 96 : clamp(screenY > 400 ? screenY - 112 : screenY + 34, 60, 470),
                  ),
                  {
                    width: 260,
                    display: 'flex',
                    gap: 10,
                    padding: '12px 14px',
                    boxSizing: 'border-box',
                    borderRadius: 12,
                    background: C.brand,
                    color: C.onBrand,
                    boxShadow: '0 14px 30px rgba(0,0,0,.2)',
                    transition: `left ${camDur}ms ${EASE},top ${camDur}ms ${EASE}`,
                  },
                )}
              >
                <StepBadge index={chapter} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>
                    Langkah {chapter + 1} dari {chapters.length}
                  </span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.4, fontWeight: 500 }}>{caption}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {captionBelow && (
          <div aria-hidden className="flex min-h-[76px] items-start gap-3 bg-brand px-4 py-3.5 text-on-brand">
            <StepBadge index={chapter} />
            <span className="flex flex-col gap-[3px]">
              <span className="text-xs opacity-70">
                Langkah {chapter + 1} dari {chapters.length}
              </span>
              <span className="text-[14.5px] font-medium leading-snug">{caption}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Cursor({ x, y, zoom, press, camTransition }: { x: number; y: number; zoom: number; press: boolean; camTransition: string }) {
  const move = `850ms ${EASE}`;
  return (
    <div style={at(x, y, { width: 0, height: 0, transition: `left ${move},top ${move}` })}>
      {/* Kursor diperkecil saat kamera mendekat supaya ukurannya di layar tetap wajar. */}
      <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${(1 / Math.sqrt(zoom)).toFixed(3)})`, transition: camTransition }}>
        <span
          style={{
            position: 'absolute',
            left: -22,
            top: -22,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: C.ink,
            opacity: press ? 0.25 : 0,
            transform: press ? 'scale(.35)' : 'scale(1.5)',
            transition: press ? 'none' : 'opacity 520ms ease, transform 520ms ease',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: -18,
            top: -18,
            width: 36,
            height: 36,
            boxSizing: 'border-box',
            borderRadius: '50%',
            border: `1.5px solid ${C.ink}`,
            opacity: press ? 0.55 : 0,
            transform: press ? 'scale(.4)' : 'scale(1.9)',
            transition: press ? 'none' : 'opacity 700ms ease, transform 700ms cubic-bezier(.2,.65,.2,1)',
          }}
        />
        <svg
          width="22"
          height="26"
          viewBox="0 0 22 26"
          style={{
            position: 'absolute',
            left: -2,
            top: -2,
            transform: press ? 'scale(.86)' : 'scale(1)',
            transformOrigin: '2px 2px',
            transition: 'transform 140ms ease',
            filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.28))',
          }}
        >
          <path d="M2 2v19l5-4.5 3.5 7.5 3-1.4-3.4-7.3 6.9-.3Z" fill={C.ink} stroke={C.panel} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function StepBadge({ index }: { index: number }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: C.onBrand,
        color: C.brand,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      0{index + 1}
    </span>
  );
}
