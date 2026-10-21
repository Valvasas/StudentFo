'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isMotionReduced } from '@/lib/motion-pref';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Pemindaian (per `scanId`, UUID baru di setiap respons server) yang sudah pernah dipasang di tab ini. */
const seenScans = new Set<string>();

/**
 * Pengiring pemindaian (ADR-057/058). Tiga pekerjaan kecil yang tak bisa dilakukan CSS:
 *
 *  1. Gulirkan area hasil ke atas layar. Pengalihan dari Server Action
 *     menjaga posisi gulir lama — orang yang menekan "Simpan" di dasar form
 *     panjang mendarat di tengah halaman hasil, dan radar yang baru saja
 *     berputar sudah di luar layar.
 *  2. Buang `cari=1` dari URL, supaya muat ulang dan tautan yang dibagikan
 *     tidak membawa "mulai memindai". Dilakukan SEGERA setelah dipasang
 *     (satu tugas kemudian, saat router Next sudah terpasang dan tak ada
 *     navigasi yang menunggu) dengan state `null`, sehingga Next ikut
 *     menyinkronkan URL router-nya; "Cari ulang" berikutnya pun tetap
 *     terhitung perpindahan URL. Di detik ke-3 sinkronisasi itu bisa
 *     membatalkan klik pengguna yang sedang berjalan.
 *  3. Radar itu `aria-hidden` dan hasilnya tersembunyi ±2,5 dtk: pembaca layar
 *     diberi tahu lewat wilayah status bahwa pencarian berjalan, lalu selesai.
 *
 * Kembali/Maju memulihkan respons pemindaian lama dari cache router (dengan
 * `scanId` yang sama). Itu bukan pemindaian baru: `data-scan-done` pada area
 * hasil mematikan animasinya, sehingga keadaan bawaan (radar tersembunyi,
 * hasil terlihat) langsung berlaku.
 */
export function ScanSession({
  scanId,
  targetId,
  startText,
  doneText,
  afterMs = 3300,
}: {
  scanId: string;
  targetId: string;
  startText: string;
  doneText: string;
  afterMs?: number;
}) {
  const [status, setStatus] = useState('');
  const fresh = useRef<boolean | null>(null);

  // Sebelum lukis, supaya radar yang dipulihkan dari riwayat tidak sempat berkedip satu bingkai.
  useIsoLayoutEffect(() => {
    if (fresh.current === null) {
      fresh.current = !seenScans.has(scanId);
      seenScans.add(scanId);
    }
    const area = document.getElementById(targetId);
    if (fresh.current) area?.removeAttribute('data-scan-done');
    else area?.setAttribute('data-scan-done', '');
  }, [scanId, targetId]);

  useEffect(() => {
    if (!fresh.current) return;
    document.getElementById(targetId)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    const strip = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('cari')) return;
      url.searchParams.delete('cari');
      window.history.replaceState(null, '', url);
    }, 0);
    // Gerak dikurangi = hasil sudah tampil seketika: langsung "selesai".
    const reduced = isMotionReduced();
    // Diisi sesudah dipasang: wilayah status yang lahir sudah berisi tidak diumumkan.
    const start = reduced ? 0 : window.setTimeout(() => setStatus(startText), 150);
    const done = window.setTimeout(() => setStatus(doneText), reduced ? 150 : afterMs);
    return () => {
      window.clearTimeout(strip);
      window.clearTimeout(start);
      window.clearTimeout(done);
    };
  }, [scanId, targetId, afterMs, startText, doneText]);

  return (
    <p role="status" className="sr-only">
      {status}
    </p>
  );
}
