'use client';

import { useEffect } from 'react';
import './globals.css';

/**
 * Batas error paling luar: menggantikan root layout ketika layout itu
 * sendiri yang gagal (navbar, footer, pembacaan header). `error.tsx` tidak
 * bisa menangkap kasus ini karena ia dirender DI DALAM layout yang sedang
 * rusak — tanpa berkas ini pengunjung hanya melihat halaman putih.
 *
 * Sengaja tanpa komponen proyek (Button, ikon lucide, ThemeScript): berkas
 * ini harus tetap bisa dirender justru saat bagian lain aplikasi bermasalah,
 * jadi setiap impor adalah satu hal lagi yang bisa ikut gagal. Tema gelap
 * tidak dipulihkan karena skrip tema butuh nonce dari header request, yang
 * tidak terjangkau dari Client Component.
 *
 * Seperti `error.tsx`, yang tampil hanya kalimat biasa dan `digest` —
 * `error.message` bisa memuat nama tabel atau potongan query.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-boundary]', error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="id">
      <body className="flex min-h-dvh items-center justify-center bg-canvas px-4 text-ink">
        <main className="flex max-w-md flex-col items-center gap-4 py-24 text-center">
          <p className="text-[17px] font-bold tracking-[-0.03em]">StudentFo</p>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Layanan sedang terganggu</h1>
          <p className="text-ink-muted">
            Kami tidak bisa memuat halaman ini sekarang — kemungkinan besar gangguan sementara di
            server kami, bukan di perangkatmu. Data dan akunmu tetap aman. Coba lagi dalam beberapa
            saat.
          </p>
          {error.digest && <p className="text-xs text-ink-faint">Kode kejadian: {error.digest}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center rounded-card bg-brand px-5 font-medium text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Coba lagi
            </button>
            {/* <a>, bukan <Link>: router klien mungkin ikut rusak; muat penuh
                dari server adalah jalan pulang yang paling pasti. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex min-h-11 items-center rounded-card border border-line px-5 font-medium transition-colors duration-150 ease-snap hover:bg-panel-nested focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Ke beranda
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
