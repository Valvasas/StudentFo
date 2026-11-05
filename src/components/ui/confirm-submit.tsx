'use client';

import { useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

export interface ConfirmCopy {
  /** Pertanyaan, mis. "Keluar dari StudentFo?" */
  readonly title: string;
  /** Akibatnya, ditulis apa adanya — orang harus tahu apa yang hilang sebelum menekan. */
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** `danger` = menghapus/memutus sesuatu; `neutral` = hanya berpindah keadaan (keluar akun). */
  readonly tone?: 'danger' | 'neutral';
  readonly icon?: ReactNode;
}

/**
 * Tombol kirim yang meminta konfirmasi lewat `<dialog>` sebelum form-nya
 * dikirim (ADR-063). Dipasang DI DALAM `<form action={…}>` pemiliknya.
 *
 * - Dialognya anak form: tombol "Ya, …" adalah `type="submit"` milik form
 *   yang sama, jadi kolom tersembunyi, Server Action, dan status "Memproses…"
 *   (`useFormStatus`) bekerja tanpa jembatan apa pun.
 * - Tanpa JavaScript (atau peramban tanpa `showModal`) pemicunya tetap tombol
 *   kirim biasa — aksi berjalan tanpa jeda, tidak pernah menjadi tombol mati.
 *   Aksi yang WAJIB terkonfirmasi tanpa JS (hapus permanen) tetap memakai
 *   pola `<details>` (`RejectConfirm`, `BlockPersonDetails`).
 * - Fokus awal di "Batal" (APG alertdialog): Enter yang tak sengaja tidak
 *   pernah menjalankan aksi. Esc & ketuk latar = batal.
 */
export function ConfirmSubmit({
  confirm,
  children,
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onClick'> & { confirm: ConfirmCopy }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const danger = (confirm.tone ?? 'danger') === 'danger';

  const close = () => dialogRef.current?.close();

  return (
    <>
      <SubmitButton
        {...props}
        className={className}
        onClick={(event) => {
          const dialog = dialogRef.current;
          if (!dialog || typeof dialog.showModal !== 'function' || dialog.open) return;
          event.preventDefault();
          dialog.showModal();
          cancelRef.current?.focus();
        }}
      >
        {children}
      </SubmitButton>
      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onPointerDown={(event) => {
          pressStartedOnBackdrop.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && pressStartedOnBackdrop.current) close();
          pressStartedOnBackdrop.current = false;
        }}
        className="sheet-up sm:sheet-pop m-0 mt-auto max-h-[86dvh] w-full max-w-none overflow-y-auto rounded-t-[24px] border border-line bg-panel p-0 text-left text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-[420px] sm:rounded-[24px]"
      >
        <div className="flex flex-col gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
          <span aria-hidden className="mx-auto h-1 w-10 rounded-pill bg-line sm:hidden" />
          <div className="flex items-start gap-3.5">
            {confirm.icon && (
              <span
                aria-hidden
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-pill [&_svg]:size-5',
                  danger ? 'bg-danger-soft text-danger' : 'bg-panel-nested text-ink',
                )}
              >
                {confirm.icon}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
              <h2 id={titleId} className="text-[18px] font-bold leading-snug tracking-[-0.02em]">
                {confirm.title}
              </h2>
              <div id={descriptionId} className="text-[14px] leading-relaxed text-ink-muted">
                {confirm.description}
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button ref={cancelRef} type="button" onClick={close} className={buttonVariants({ variant: 'secondary', className: 'w-full sm:w-auto' })}>
              {confirm.cancelLabel ?? 'Batal'}
            </button>
            <SubmitButton className={buttonVariants({ variant: danger ? 'danger' : 'primary', className: 'w-full sm:w-auto' })}>
              {confirm.confirmLabel}
            </SubmitButton>
          </div>
        </div>
      </dialog>
    </>
  );
}
