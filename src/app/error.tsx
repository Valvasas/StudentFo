'use client';

import { useEffect } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Batas error global.
 *
 * Yang ditampilkan ke user adalah kalimat biasa — BUKAN `error.message`.
 * Pesan error mentah bisa memuat nama tabel, potongan query, atau detail
 * infrastruktur. `digest` disertakan karena itu pengenal yang menghubungkan
 * laporan user dengan baris log di server, tanpa membocorkan apa pun.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Titik sambung Sentry (§2: wajib ada sejak MVP).
    console.error('[boundary]', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
      <TriangleAlert aria-hidden className="size-10 text-caution" />
      <h1 className="text-3xl">Ada yang tidak beres di sisi kami</h1>
      <p className="max-w-md text-ink-muted">
        Halaman ini gagal dimuat. Coba muat ulang — kalau masih sama, tunggu sebentar lalu kembali
        lagi.
      </p>
      {error.digest && <p className="text-xs text-ink-faint">Kode kejadian: {error.digest}</p>}
      <Button onClick={reset} className="mt-2">
        <RefreshCw aria-hidden /> Coba lagi
      </Button>
    </div>
  );
}
