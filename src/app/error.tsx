'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TangledSketch } from '@/components/ui/illustrations';

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
    <div className="container-page flex flex-col items-center gap-3 py-16 text-center sm:py-24">
      <TangledSketch className="text-ink" />
      <h1 className="mt-4 text-[clamp(28px,5vw,36px)]">Ada yang kusut di sisi kami</h1>
      <p className="max-w-md text-ink-muted">
        Halaman ini gagal dimuat — bukan karena perangkatmu. Coba muat ulang; kalau masih sama, tunggu
        sebentar lalu kembali lagi. Data dan akunmu tetap aman.
      </p>
      {error.digest && <p className="text-xs text-ink-faint">Kode kejadian: {error.digest}</p>}
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>
          <RefreshCw aria-hidden /> Coba lagi
        </Button>
        {/* <a>, bukan <Link>: router klien bisa jadi bagian yang sedang
            bermasalah; muat penuh dari server adalah jalan pulang paling pasti. */}
        <Button asChild variant="ghost">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">Ke beranda</a>
        </Button>
      </div>
    </div>
  );
}
