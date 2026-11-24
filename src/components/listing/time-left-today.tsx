'use client';

import { useEffect, useState } from 'react';
import { timeLeftToday } from '@/lib/deadline';

/**
 * Jam & menit tersisa di hari terakhir pendaftaran. Nilai awal dihitung dari
 * `renderedAt` milik server, jadi HTML awal dan render pertama klien identik
 * (tanpa ketidakcocokan hidrasi) dan tanpa JavaScript angkanya tetap benar
 * saat dimuat. Berdetak tiap 30 detik — detik yang berdetak hanya menambah
 * cemas tanpa mengubah keputusan apa pun. Bukan `aria-live`: pengumuman tiap
 * 30 detik akan memotong apa pun yang sedang dibacakan.
 */
export function TimeLeftToday({
  deadlineAt,
  renderedAt,
  variant = 'line',
}: {
  deadlineAt: string;
  renderedAt: number;
  /** `inline` = teks saja, di dalam pil tenggat yang sudah punya titiknya sendiri. */
  variant?: 'line' | 'inline';
}) {
  const [now, setNow] = useState(renderedAt);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const left = timeLeftToday(deadlineAt, new Date(now));
  if (variant === 'inline') return <>{left ? `Tutup dalam ${left}` : 'Baru saja ditutup'}</>;
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold tabular-nums">
      <span aria-hidden className="urgency-dot size-2 shrink-0 rounded-pill bg-due-urgent" />
      {left ? `Tutup dalam ${left}` : 'Pendaftaran baru saja ditutup'}
    </span>
  );
}
