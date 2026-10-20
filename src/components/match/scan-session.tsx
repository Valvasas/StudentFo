'use client';

import { useEffect } from 'react';

/**
 * Pengiring pemindaian (ADR-057). Dua pekerjaan kecil yang tak bisa dilakukan CSS:
 *
 *  1. Gulirkan area hasil ke atas layar. Pengalihan dari Server Action
 *     menjaga posisi gulir lama — orang yang menekan "Simpan" di dasar form
 *     panjang mendarat di tengah halaman hasil, dan radar yang baru saja
 *     berputar sudah di luar layar.
 *  2. Setelah pemindaian selesai, buang `cari=1` dari URL. Tanpa ini muat
 *     ulang atau tombol Kembali memutar ulang animasi yang sama, dan tautan
 *     yang dibagikan membawa "mulai memindai" ke orang lain. `replaceState`
 *     tidak memicu navigasi, jadi halaman dan posisi gulir tidak berubah.
 */
export function ScanSession({ targetId, afterMs = 3300 }: { targetId: string; afterMs?: number }) {
  useEffect(() => {
    document.getElementById(targetId)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('cari')) return;
      url.searchParams.delete('cari');
      window.history.replaceState(window.history.state, '', url);
    }, afterMs);
    return () => window.clearTimeout(timer);
  }, [targetId, afterMs]);
  return null;
}
