'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FilePen } from 'lucide-react';
import { ConfirmDialog, confirmButtonClass, type ConfirmCopy } from '@/components/ui/confirm-submit';

/** Isi form sebagai teks; berkas diwakili nama + ukurannya. */
function snapshot(form: HTMLFormElement): string {
  return [...new FormData(form).entries()]
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : `${value.name}:${value.size}`}`)
    .join('&');
}

const COPY: ConfirmCopy = {
  title: 'Tinggalkan tanpa menyimpan?',
  description: 'Isian yang sudah kamu ubah di halaman ini belum tersimpan dan akan hilang.',
  confirmLabel: 'Tinggalkan',
  cancelLabel: 'Lanjut mengisi',
  icon: <FilePen />,
};

/**
 * Penjaga isian yang belum disimpan (ADR-063). Taruh DI DALAM `<form>` yang
 * dijaga. "Berubah" = isi FormData berbeda dari saat halaman dibuka — mengetik
 * lalu mengembalikan isian ke semula tidak memicu peringatan.
 *
 * - Tautan internal: diperiksa di fase capture `window`, SEBELUM `<Link>` dan
 *   bilah progres (`NavigationProgress`, capture `document`) bereaksi, lalu
 *   dialog yang sama dengan `ConfirmSubmit`. "Tinggalkan" = `router.push`.
 * - Tutup tab, muat ulang, tautan luar: `beforeunload` (dialog bawaan peramban).
 * - Mengirim form mematikan penjaga — hasilnya redirect Server Action.
 *
 * Tidak menjaga tombol kembali perangkat di dalam aplikasi: App Router tidak
 * memberi cara membatalkan `popstate`, dan menyiasatinya dengan memanipulasi
 * riwayat justru merusak tombol kembali itu sendiri.
 *
 * `changeEvent`: event tambahan dari isian yang tidak memicu `input`/`change`
 * (mis. pembuat formulir panitia yang menyusun ulang pertanyaan).
 */
export function UnsavedChangesGuard({ changeEvent }: { changeEvent?: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const leavingRef = useRef(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const form = anchorRef.current?.closest('form');
    if (!form) return;
    const initial = snapshot(form);
    let dirty = false;
    const check = () => {
      dirty = snapshot(form) !== initial;
    };
    const onSubmit = () => {
      leavingRef.current = true;
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || leavingRef.current) return;
      event.preventDefault();
      // Peramban lama hanya menampilkan dialog bila returnValue diisi.
      event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      if (!dirty || leavingRef.current || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      // Situs lain = muat penuh, ditangani `beforeunload`. Jangkar di halaman yang sama bukan berpindah.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    };

    form.addEventListener('input', check);
    form.addEventListener('change', check);
    if (changeEvent) form.addEventListener(changeEvent, check);
    form.addEventListener('submit', onSubmit);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('click', onClick, true);
    return () => {
      form.removeEventListener('input', check);
      form.removeEventListener('change', check);
      if (changeEvent) form.removeEventListener(changeEvent, check);
      form.removeEventListener('submit', onSubmit);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('click', onClick, true);
    };
  }, [changeEvent]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!pendingHref || !dialog || dialog.open) return;
    dialog.showModal();
    cancelRef.current?.focus();
  }, [pendingHref]);

  const stay = () => {
    dialogRef.current?.close();
    setPendingHref(null);
  };

  return (
    <>
      <span ref={anchorRef} hidden />
      <ConfirmDialog
        dialogRef={dialogRef}
        cancelRef={cancelRef}
        copy={COPY}
        onCancel={stay}
        action={
          <button
            type="button"
            className={confirmButtonClass(COPY)}
            onClick={() => {
              if (!pendingHref) return;
              leavingRef.current = true;
              dialogRef.current?.close();
              router.push(pendingHref);
            }}
          >
            {COPY.confirmLabel}
          </button>
        }
      />
    </>
  );
}
