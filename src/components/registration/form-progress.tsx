'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDown, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RequiredQuestion {
  /** Nama input jawaban. */
  readonly name: string;
  readonly label: string;
}

const noop = () => () => {};

function answered(form: HTMLFormElement, name: string): boolean {
  const target = form.elements.namedItem(name);
  if (!target) return false;
  if (target instanceof RadioNodeList) return [...target].some((node) => node instanceof HTMLInputElement && node.checked);
  if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) return target.checked;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return target.value.trim() !== '';
  }
  return false;
}

/** Elemen yang bisa difokus untuk satu pertanyaan (radio pertama, kotak isian, dsb.). */
function focusable(form: HTMLFormElement, name: string): HTMLElement | null {
  const target = form.elements.namedItem(name);
  if (target instanceof RadioNodeList) return ([...target].find((node) => node instanceof HTMLElement) as HTMLElement | undefined) ?? null;
  return target instanceof HTMLElement ? target : null;
}

/**
 * Progres pertanyaan wajib (ADR-094): "4 dari 6 wajib terisi" + tombol ke
 * pertanyaan berikutnya yang masih kosong. Formulir panjang tanpa progres
 * membuat orang menyerah di tengah atau baru tahu ada yang terlewat setelah
 * peramban menolak kiriman. Hanya membaca isian — tidak mengubah apa pun.
 */
export function FormProgress({ questions }: { questions: readonly RequiredQuestion[] }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(0);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    const form = anchor.current?.closest('form');
    if (!form) return;
    const measure = () => setDone(questions.filter((question) => answered(form, question.name)).length);
    measure();
    form.addEventListener('input', measure);
    form.addEventListener('change', measure);
    return () => {
      form.removeEventListener('input', measure);
      form.removeEventListener('change', measure);
    };
  }, [questions]);

  if (questions.length === 0 || !hydrated) return <div ref={anchor} hidden />;
  const total = questions.length;
  const complete = done >= total;

  const jump = () => {
    const form = anchor.current?.closest('form');
    if (!form) return;
    const next = questions.find((question) => !answered(form, question.name));
    const element = next ? focusable(form, next.name) : null;
    element?.focus();
    element?.scrollIntoView({ block: 'center' });
  };

  return (
    <div ref={anchor} className="flex flex-col gap-2 rounded-card border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink-soft">
          {complete && <CircleCheck aria-hidden className="size-4 text-success" />}
          <span>
            <strong className="font-semibold tabular-nums text-ink">{done}</strong> dari <span className="tabular-nums">{total}</span> pertanyaan
            wajib terisi
          </span>
        </p>
        {!complete && (
          <button
            type="button"
            onClick={jump}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1.5 text-[13.5px] font-semibold text-ink underline underline-offset-[3px] hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ArrowDown aria-hidden className="size-4" /> Ke yang belum diisi
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Pertanyaan wajib terisi"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1.5 overflow-hidden rounded-pill bg-panel-nested"
      >
        {/* `scaleX`, bukan `width` (ADR-099): isian bergeser tanpa menata ulang baris. */}
        <div
          className={cn('h-full origin-left rounded-pill transition-transform duration-300 ease-snap', complete ? 'bg-success' : 'bg-brand')}
          style={{ transform: `scaleX(${total > 0 ? done / total : 0})` }}
        />
      </div>
    </div>
  );
}
