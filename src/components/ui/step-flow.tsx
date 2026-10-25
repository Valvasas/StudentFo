'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { isMotionReduced } from '@/lib/motion-pref';
import { cn } from '@/lib/utils';

export interface FlowStep {
  /** Nama pendek untuk penunjuk langkah; judul lengkap tetap di `FormStep` di dalam `content`. */
  readonly title: string;
  readonly content: ReactNode;
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Tipe input yang TIDAK mengirim form saat Enter — selain ini, Enter di langkah tengah berarti "Lanjut". */
const ENTER_SAFE_TYPES = new Set(['button', 'submit', 'reset', 'image', 'file']);

const StepVisible = createContext(true);

/**
 * Grup centang "pilih minimal satu" (`data-require-one="pesan"`, lihat
 * `ChoiceGroup`): HTML tidak punya `required` untuk grup, jadi pesannya
 * dipasang di kotak pertama dan tampil sebagai gelembung validasi bawaan.
 */
function syncRequiredGroups(scope: ParentNode): void {
  for (const group of scope.querySelectorAll<HTMLElement>('[data-require-one]')) {
    const boxes = [...group.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    boxes[0]?.setCustomValidity(boxes.some((box) => box.checked) ? '' : (group.dataset.requireOne ?? ''));
  }
}

const noSubscribe = () => () => {};
/**
 * `false` di server dan selama hidrasi, `true` setelahnya — termasuk saat
 * di-mount ulang di klien (mis. `key` baru setelah redirect galat), sehingga
 * mount ulang tidak sempat menampilkan semua langkah sekejap.
 */
const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

/**
 * Apakah langkah tempat komponen ini berada sedang tampil. Di luar `StepFlow`
 * (atau sebelum hidrasi) selalu `true`. Dipakai widget yang tidak boleh
 * dirender di kontainer tersembunyi, mis. Turnstile.
 */
export function useStepVisible(): boolean {
  return useContext(StepVisible);
}

/**
 * Form panjang sebagai kartu per langkah (ADR-061), membungkus `FormStep`.
 *
 * Peningkatan progresif: HTML server memuat SEMUA langkah berurutan di dalam
 * satu `<form>` — tanpa JavaScript form tetap utuh dan terkirim sekali seperti
 * sebelumnya. Setelah hidrasi hanya satu kartu yang tampil; "Lanjut" memeriksa
 * kolom kartu itu dulu (validasi bawaan + `check`), jadi kesalahan ketahuan di
 * kartu tempat ia diisi, bukan setelah menekan kirim di akhir.
 *
 * Tidak ada yang dikirim ke server di antara langkah: kartu lain hanya
 * `hidden`, kolomnya tetap di DOM dan ikut terkirim bersama. Bila browser
 * menolak kirim karena kolom di kartu tersembunyi (mis. dikosongkan setelah
 * kembali ke langkah awal), kartu itu dibuka dan pesannya ditampilkan — bukan
 * gagal diam-diam ("not focusable").
 */
export function StepFlow({
  steps,
  submit,
  cancel,
  initialStep = 0,
  check,
  className,
}: {
  steps: readonly FlowStep[];
  /** Tombol kirim: tanpa JS selalu tampil di akhir, dengan JS hanya di langkah terakhir. */
  submit: ReactNode;
  /** Pengganti "Kembali" di langkah pertama, mis. tautan Batal. */
  cancel?: ReactNode;
  /** Mis. langkah berisi kolom yang ditolak server. */
  initialStep?: number;
  /** Validasi di luar atribut HTML (kolom buatan sendiri). Pesan = langkah ditahan. */
  check?: (index: number) => string | null;
  className?: string;
}) {
  const last = steps.length - 1;
  const start = Math.min(Math.max(initialStep, 0), last);
  const enhanced = useHydrated();
  const [active, setActive] = useState(start);
  const [reached, setReached] = useState(start);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [animate, setAnimate] = useState(false);
  // Kliping horizontal hanya selama kartu bergeser masuk: permanen, ia ikut memotong cincin fokus di tepi.
  const [sliding, setSliding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeRef = useRef(start);
  const focusHeading = useRef(false);

  const go = useCallback((to: number, moveFocus = true) => {
    setDirection(to >= activeRef.current ? 1 : -1);
    activeRef.current = to;
    setActive(to);
    setReached((value) => Math.max(value, to));
    setAnimate(true);
    setSliding(true);
    setMessage(null);
    focusHeading.current = moveFocus;
  }, []);

  // Fokus ke judul kartu baru: pembaca layar mengumumkan "Langkah 2: …", dan
  // Tab berikutnya jatuh ke kolom pertamanya. Keyboard ponsel tidak ikut terbuka.
  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    const root = rootRef.current;
    if (root && root.getBoundingClientRect().top < 0) {
      root.scrollIntoView({ block: 'start', behavior: isMotionReduced() ? 'auto' : 'smooth' });
    }
    const heading = stepRefs.current[active]?.querySelector<HTMLElement>('h2, h3');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [active]);

  const firstInvalid = (index: number): Control | null => {
    const step = stepRefs.current[index];
    if (!step) return null;
    syncRequiredGroups(step);
    return [...step.querySelectorAll<Control>('input, select, textarea')].find((control) => control.willValidate && !control.validity.valid) ?? null;
  };

  /** Maju ke `to`, tapi berhenti di langkah pertama (dari yang sekarang) yang belum lolos. */
  const advanceTo = (to: number) => {
    for (let index = activeRef.current; index < to; index += 1) {
      const control = firstInvalid(index);
      const problem = control ? null : (check?.(index) ?? null);
      if (!control && !problem) continue;
      if (index !== activeRef.current) flushSync(() => go(index, false));
      if (control) control.reportValidity();
      else setMessage(problem);
      return;
    }
    go(to);
  };

  useEffect(() => {
    const form = rootRef.current?.closest('form');
    if (!form || !enhanced) return;
    // Satu kirim memicu `invalid` untuk SETIAP kolom salah; hanya yang pertama
    // (urutan dokumen = langkah paling awal) yang menentukan kartu yang dibuka.
    let settling = false;
    const onInvalid = (event: Event) => {
      if (settling) return;
      settling = true;
      window.setTimeout(() => {
        settling = false;
      }, 0);
      const control = event.target as Control;
      const index = stepRefs.current.findIndex((step) => step?.contains(control));
      if (index === -1 || index === activeRef.current) return;
      window.setTimeout(() => {
        flushSync(() => go(index, false));
        control.reportValidity();
      }, 0);
    };
    form.addEventListener('invalid', onInvalid, true);
    return () => form.removeEventListener('invalid', onInvalid, true);
  }, [enhanced, go]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!enhanced || event.key !== 'Enter' || event.nativeEvent.isComposing || activeRef.current === last) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || ENTER_SAFE_TYPES.has(target.type)) return;
    event.preventDefault();
    advanceTo(activeRef.current + 1);
  };

  const next = steps[active + 1];

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      onChange={(event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox' && rootRef.current) syncRequiredGroups(rootRef.current);
      }}
      className={cn('flex min-w-0 scroll-mt-24 flex-col gap-5', sliding && 'overflow-x-clip', className)}>
      {/* Tampil juga tanpa JS (sebagai daftar isi) supaya tinggi bagian atas
          sama sebelum & sesudah hidrasi — kartu tidak melompat turun. */}
      <div className="flex flex-col gap-1.5">
        <p className="flex items-baseline gap-2 text-[13px]">
          <span className="font-semibold tabular-nums">{enhanced ? `Langkah ${active + 1} dari ${steps.length}` : `${steps.length} langkah`}</span>
          {enhanced && <span className="min-w-0 truncate text-ink-muted sm:hidden">· {steps[active]?.title}</span>}
        </p>
        <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((step, index) => {
            const done = enhanced && index < active;
            const filled = enhanced && index <= active;
            const body = (
              <>
                <span aria-hidden className="block h-1 overflow-hidden rounded-pill bg-line">
                  <span className={cn('block h-full bg-brand transition-[width] duration-300 ease-snap', filled ? 'w-full' : 'w-0')} />
                </span>
                <span className={cn('flex min-w-0 items-center gap-1 text-[12.5px] max-sm:sr-only', index === active && enhanced ? 'font-semibold text-ink' : 'text-ink-muted')}>
                  {done ? <Check aria-hidden className="size-3.5 shrink-0" strokeWidth={2.6} /> : <span aria-hidden className="font-mono tabular-nums">{index + 1}</span>}
                  <span className="truncate">{step.title}</span>
                </span>
              </>
            );
            return (
              <li key={step.title} className="min-w-0">
                {enhanced ? (
                  <button
                    type="button"
                    disabled={index > reached}
                    aria-current={index === active ? 'step' : undefined}
                    aria-label={`Langkah ${index + 1}: ${step.title}${done ? ' (selesai)' : ''}`}
                    onClick={() => (index > active ? advanceTo(index) : go(index))}
                    className="flex min-h-11 w-full flex-col justify-center gap-2 rounded-[8px] text-left disabled:cursor-not-allowed"
                  >
                    {body}
                  </button>
                ) : (
                  <span className="flex min-h-11 flex-col justify-center gap-2">{body}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {steps.map((step, index) => (
        <div
          key={step.title}
          ref={(element) => {
            stepRefs.current[index] = element;
          }}
          hidden={enhanced && index !== active}
          className={cn('flex min-w-0 flex-col gap-4', enhanced && '[&>.rise]:animate-none', animate && index === active && 'step-in')}
          style={animate ? ({ '--step-from': `${direction * 28}px` } as CSSProperties) : undefined}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setSliding(false);
          }}
        >
          <StepVisible.Provider value={!enhanced || index === active}>{step.content}</StepVisible.Provider>
        </div>
      ))}

      {message && (
        <p role="alert" className="text-[13.5px] font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {enhanced && active > 0 ? (
          <button
            type="button"
            onClick={() => go(active - 1)}
            className="flex h-12 items-center justify-center gap-2 rounded-pill px-5 text-[15px] font-semibold text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Kembali
          </button>
        ) : (
          cancel
        )}
        <div className="flex flex-col sm:ml-auto">
          {!enhanced || !next ? (
            submit
          ) : (
            <button
              type="button"
              onClick={() => advanceTo(active + 1)}
              className="flex h-12 items-center justify-center gap-2 rounded-pill bg-brand px-7 text-[15px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Lanjut
              <span className="font-normal opacity-75 max-sm:sr-only">· {next.title}</span>
              <ArrowRight aria-hidden className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
