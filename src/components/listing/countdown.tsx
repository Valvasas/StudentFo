'use client';

import { useEffect, useState } from 'react';

function remaining(targetMs: number, nowMs: number) {
  const left = Math.max(0, targetMs - nowMs);
  return {
    days: Math.floor(left / 86_400_000),
    hours: Math.floor(left / 3_600_000) % 24,
    minutes: Math.floor(left / 60_000) % 60,
    seconds: Math.floor(left / 1000) % 60,
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Hitung mundur ke tenggat (kanvas desain Info Lomba). Nilai awal dihitung
 * server dari `renderedAt`, jadi tanpa JavaScript angkanya tetap benar saat
 * halaman dimuat — hanya tidak berdetak. Angka yang berubah tiap detik
 * disembunyikan dari pembaca layar; kalimat utuhnya ada di `label`.
 */
export function Countdown({ deadlineAt, renderedAt, label }: { deadlineAt: string; renderedAt: number; label: string }) {
  const target = new Date(deadlineAt).getTime();
  const [now, setNow] = useState(renderedAt);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const left = remaining(target, now);
  const cells = [
    [left.days, 'HARI'],
    [left.hours, 'JAM'],
    [left.minutes, 'MENIT'],
    [left.seconds, 'DETIK'],
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-2">
      <span className="sr-only">{label}</span>
      {cells.map(([value, unit]) => (
        <div key={unit} aria-hidden className="flex flex-col items-center gap-1.5 rounded-[10px] bg-inverse-nested pb-2.5 pt-3.5">
          <span className="font-mono text-[clamp(26px,3.4vw,34px)] font-medium leading-none tracking-[-0.02em] tabular-nums">{pad(value)}</span>
          <span className="font-mono text-[10.5px] tracking-[.1em] text-on-inverse-muted">{unit}</span>
        </div>
      ))}
    </div>
  );
}

/** Varian ringkas (panel samping Detail): "03 hari 14 jam 22 menit", berdetak tiap 30 detik. */
export function InlineCountdown({ deadlineAt, renderedAt }: { deadlineAt: string; renderedAt: number }) {
  const target = new Date(deadlineAt).getTime();
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const left = remaining(target, now);
  const cells = [
    [left.days, 'hari'],
    [left.hours, 'jam'],
    [left.minutes, 'menit'],
  ] as const;
  return (
    <span aria-hidden className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
      {cells.map(([value, unit]) => (
        <span key={unit} className="flex items-baseline gap-[3px]">
          <span className="font-mono text-[30px] font-medium tracking-[-0.03em] tabular-nums">{pad(value)}</span>
          <span className="text-[12.5px] text-ink-muted">{unit}</span>
        </span>
      ))}
    </span>
  );
}
