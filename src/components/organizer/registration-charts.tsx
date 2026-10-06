import type { CSSProperties } from 'react';
import { niceMax } from '@/components/organizer/analytics-chart';
import { formatShortDateId } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import type { RegistrationCount, RegistrationDay, RegistrationSeats } from '@/types/domain';

const number = (value: number) => value.toLocaleString('id-ID');
const dayLabel = (day: string) => formatShortDateId(`${day}T05:00:00Z`);

/**
 * Pendaftar per hari (ADR-055) — satu seri, jadi tanpa kotak legenda (judul
 * kartu yang menamainya). Batang HTML, bukan SVG: kolom setinggi grafik
 * jadi target hover yang lebar dan tooltip-nya CSS murni (tanpa JS). Batal
 * per hari ikut di tooltip & tabel, tidak digambar sebagai seri kedua —
 * dua seri bertumpuk di batang setipis ini hanya jadi noise.
 *
 * Spesifikasi tanda mengikuti panduan dataviz: batang ≤ 24px, ujung data
 * membulat 4px dan rata di garis dasar, celah 2px, kisi garis rambut padat
 * dan samar. Angka lengkapnya ada di tabel sr-only.
 */
export function RegistrationColumns({ series }: { series: readonly RegistrationDay[] }) {
  const peak = Math.max(0, ...series.map((day) => day.submitted));
  const max = niceMax(peak);
  const total = series.reduce((sum, day) => sum + day.submitted, 0);
  const middle = series[Math.floor(series.length / 2)];

  return (
    <figure className="flex flex-col gap-3">
      <div
        className="relative h-[200px]"
        role="img"
        aria-label={`Pendaftar per hari selama ${series.length} hari: total ${number(total)}, paling ramai ${number(peak)} dalam sehari.`}
      >
        {[0.5, 1].map((fraction) => (
          <span key={fraction} aria-hidden className="absolute inset-x-0 h-px bg-line" style={{ bottom: `${fraction * 100}%` }}>
            <span className="absolute -top-2 right-0 bg-panel pl-1.5 font-mono text-[11px] leading-4 text-ink-muted">{number(max * fraction)}</span>
          </span>
        ))}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-line-strong" />
        <div aria-hidden className="absolute inset-0 right-8 flex items-end gap-[2px]">
          {series.map((day, index) => {
            const edge = index < series.length * 0.15 ? 'left-0' : index > series.length * 0.85 ? 'right-0' : 'left-1/2 -translate-x-1/2';
            return (
              <div key={day.day} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                <span className="absolute inset-0 rounded-[4px] transition-colors duration-150 ease-snap group-hover:bg-panel-nested" />
                {day.submitted > 0 && (
                  <span
                    className="grow-y relative block w-full max-w-[24px] rounded-t-[4px] bg-ink"
                    style={{ height: `${(day.submitted / max) * 100}%`, '--d': `${Math.min(index * 14, 560)}ms` } as CSSProperties}
                  />
                )}
                <span
                  className={cn(
                    'pointer-events-none absolute bottom-full z-10 mb-1.5 hidden whitespace-nowrap rounded-[8px] bg-ink px-2 py-1 text-[11.5px] font-medium text-on-brand shadow-raised group-hover:block',
                    edge,
                  )}
                >
                  {dayLabel(day.day)} · {number(day.submitted)} mendaftar{day.cancelled > 0 ? ` · ${number(day.cancelled)} batal` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div aria-hidden className="flex justify-between pr-8 font-mono text-[11.5px] text-ink-muted">
        <span>{series[0] ? dayLabel(series[0].day) : ''}</span>
        <span className="hidden sm:inline">{middle ? dayLabel(middle.day) : ''}</span>
        <span>{series.at(-1) ? dayLabel(series.at(-1)!.day) : ''}</span>
      </div>
      <div className="sr-only">
        <table>
          <caption>Pendaftar per hari</caption>
          <thead>
            <tr>
              <th scope="col">Tanggal</th>
              <th scope="col">Mendaftar</th>
              <th scope="col">Batal</th>
            </tr>
          </thead>
          <tbody>
            {series.map((day) => (
              <tr key={day.day}>
                <th scope="row">{day.day}</th>
                <td>{day.submitted}</td>
                <td>{day.cancelled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * Meter kursi: isi = yang memegang kursi, lintasan = sisa. Warna isi naik ke
 * peringatan hanya di ≥ 90% — keadaan yang memang menuntut keputusan
 * (tambah kuota / buka daftar tunggu). Kuota tanpa batas tidak digambar
 * sebagai meter: tidak ada "penuh" yang bisa dibandingkan.
 */
export function CapacityMeter({ seats, waitlist }: { seats: RegistrationSeats; waitlist: boolean }) {
  if (seats.capacity === null) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-display text-[34px] font-bold leading-none tracking-[-0.03em]">{number(seats.taken)}</span>
        <span className="text-[13px] text-ink-muted">kursi terisi · kuota tidak dibatasi</span>
      </div>
    );
  }
  const ratio = Math.min(seats.taken / seats.capacity, 1);
  const left = Math.max(seats.capacity - seats.taken, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-[34px] font-bold leading-none tracking-[-0.03em]">{number(seats.taken)}</span>
          <span className="text-[15px] font-semibold text-ink-muted">/ {number(seats.capacity)}</span>
        </span>
        <span className="text-[13px] font-semibold tabular-nums">{Math.round(ratio * 100)}%</span>
      </div>
      <span
        role="meter"
        aria-valuemin={0}
        aria-valuemax={seats.capacity}
        aria-valuenow={Math.min(seats.taken, seats.capacity)}
        aria-label="Kursi terisi"
        className="block h-3 overflow-hidden rounded-pill bg-panel-nested"
      >
        <span className={cn('grow-x block h-full rounded-pill', ratio >= 0.9 ? 'bg-caution' : 'bg-ink')} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="text-[13px] text-ink-muted">
        {left > 0 ? `${number(left)} kursi tersisa` : 'Kursi penuh'}
        {seats.waitlisted > 0 ? ` · ${number(seats.waitlisted)} di daftar tunggu` : waitlist && left === 0 ? ' · daftar tunggu dibuka' : ''}
      </span>
    </div>
  );
}

/**
 * Baris berlabel + batang satu warna. Identitas tiap baris ada di labelnya,
 * bukan di warna — lima warna status situs terlalu mirip untuk dibedakan
 * sebagai legenda (diperiksa dengan validator palet), jadi tidak dipakai.
 */
export function LabeledBars({
  rows,
  total,
  caption,
}: {
  rows: readonly (RegistrationCount & { readonly hint?: string })[];
  /** Penyebut persentase; `null` = batang relatif terhadap baris terbesar, tanpa persen. */
  total: number | null;
  caption?: string;
}) {
  const scale = total ?? Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="flex flex-col gap-3" aria-label={caption}>
      {rows.map((row, index) => {
        const pct = scale > 0 ? (row.count / scale) * 100 : 0;
        return (
          <li key={row.label} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="min-w-0 truncate font-medium">
                {row.label}
                {row.hint && <span className="font-normal text-ink-muted"> · {row.hint}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-ink-muted">
                <strong className="font-semibold text-ink">{number(row.count)}</strong>
                {total !== null && total > 0 && ` · ${Math.round(pct)}%`}
              </span>
            </span>
            <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-panel-nested">
              <span
                className="grow-x block h-full rounded-pill bg-ink"
                style={{ width: `${Math.max(pct, row.count > 0 ? 2 : 0)}%`, animationDelay: `${index * 70}ms` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
