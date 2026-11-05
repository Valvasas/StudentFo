'use client';

import { useId, useRef, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react';
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
/**
 * Konfirmasi hanya bila kolom form `field` bernilai salah satu `values` saat
 * ditekan — mis. tahap lamaran yang membuat entri tampil di profil publik.
 * Selain itu tombol langsung mengirim: konfirmasi untuk perubahan yang tidak
 * berakibat apa-apa hanya melatih orang menekan "Ya" tanpa membaca.
 */
export interface ConfirmWhen {
  readonly field: string;
  readonly values: readonly string[];
}

/**
 * Bingkai dialog konfirmasi — satu tampilan untuk `ConfirmSubmit` dan
 * `UnsavedChangesGuard`: bottom-sheet di ponsel, kartu di tengah mulai `sm`,
 * `role="alertdialog"`, ketuk latar = batal. Tombol aksi dari pemanggil.
 */
export function ConfirmDialog({
  dialogRef,
  cancelRef,
  copy,
  onCancel,
  action,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  cancelRef: RefObject<HTMLButtonElement | null>;
  copy: ConfirmCopy;
  onCancel: () => void;
  /** Tombol "Ya, …" — `type="submit"` (form) atau tombol biasa. Kelas dari `confirmButtonClass(copy)`. */
  action: ReactNode;
}) {
  const pressStartedOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const danger = (copy.tone ?? 'danger') === 'danger';

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={onCancel}
      onPointerDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressStartedOnBackdrop.current) onCancel();
        pressStartedOnBackdrop.current = false;
      }}
      className="sheet-up sm:sheet-pop m-0 mt-auto max-h-[86dvh] w-full max-w-none overflow-y-auto rounded-t-[24px] border border-line bg-panel p-0 text-left text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-[420px] sm:rounded-[24px]"
    >
      <div className="flex flex-col gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
        <span aria-hidden className="mx-auto h-1 w-10 rounded-pill bg-line sm:hidden" />
        <div className="flex items-start gap-3.5">
          {copy.icon && (
            <span
              aria-hidden
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-pill [&_svg]:size-5',
                danger ? 'bg-danger-soft text-danger' : 'bg-panel-nested text-ink',
              )}
            >
              {copy.icon}
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
            <h2 id={titleId} className="text-[18px] font-bold leading-snug tracking-[-0.02em]">
              {copy.title}
            </h2>
            <div id={descriptionId} className="text-[14px] leading-relaxed text-ink-muted">
              {copy.description}
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} className={buttonVariants({ variant: 'secondary', className: 'w-full sm:w-auto' })}>
            {copy.cancelLabel ?? 'Batal'}
          </button>
          {action}
        </div>
      </div>
    </dialog>
  );
}

export function confirmButtonClass(copy: ConfirmCopy): string {
  return buttonVariants({ variant: (copy.tone ?? 'danger') === 'danger' ? 'danger' : 'primary', className: 'w-full sm:w-auto' });
}

export function ConfirmSubmit({
  confirm,
  when,
  children,
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onClick'> & { confirm: ConfirmCopy; when?: ConfirmWhen }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <SubmitButton
        {...props}
        className={className}
        onClick={(event) => {
          const dialog = dialogRef.current;
          if (!dialog || typeof dialog.showModal !== 'function' || dialog.open) return;
          const form = event.currentTarget.form;
          if (when && form && !when.values.includes(String(new FormData(form).get(when.field) ?? ''))) return;
          // Form belum sah (isian wajib kosong): biarkan peramban menunjukkan
          // kolomnya. Dialog modal di atasnya membuat kolom itu tak terjangkau.
          if (form && !form.checkValidity()) return;
          event.preventDefault();
          dialog.showModal();
          cancelRef.current?.focus();
        }}
      >
        {children}
      </SubmitButton>
      <ConfirmDialog
        dialogRef={dialogRef}
        cancelRef={cancelRef}
        copy={confirm}
        onCancel={() => dialogRef.current?.close()}
        action={<SubmitButton className={confirmButtonClass(confirm)}>{confirm.confirmLabel}</SubmitButton>}
      />
    </>
  );
}
