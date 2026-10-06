'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

/** Hapus draf formulir tab ini begitu tiket terbit — data pribadi tidak perlu tertinggal di sessionStorage. */
export function DraftCleaner({ storageKey }: { storageKey: string }) {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Penyimpanan diblokir: memang tidak ada draf yang tersimpan.
    }
  }, [storageKey]);
  return null;
}

/**
 * "Simpan sebagai PDF" lewat dialog cetak peramban — semua peramban modern
 * menyediakan tujuan PDF. Navigasi & footer disembunyikan saat cetak
 * (`print:hidden`), jadi yang tercetak hanya tiketnya. Tanpa JS tombol ini
 * tidak dirender sama sekali alih-alih tampil tapi mati.
 */
export function PrintTicketButton() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return (
    <button type="button" onClick={() => window.print()} className={buttonVariants({ variant: 'secondary', className: 'print:hidden' })}>
      <Printer aria-hidden /> Simpan / cetak tiket
    </button>
  );
}
