'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { RegistrationSeats } from '@/types/domain';

/** Di atas ini kursi digambar sebagai batang, bukan titik — 200 titik tidak terbaca. */
const DOTS_MAX = 48;
const URGENT_LEFT = 5;

export function seatHeadline(seats: RegistrationSeats, waitlist: boolean): string {
  if (seats.capacity === null) return 'Kursi tidak dibatasi';
  const left = Math.max(seats.capacity - seats.taken, 0);
  if (left > 0) return `${left.toLocaleString('id-ID')} kursi tersisa`;
  return waitlist ? 'Kursi penuh · daftar tunggu dibuka' : 'Kursi penuh';
}

/**
 * Sisa kursi apa adanya (ADR-055). Angka asli, bukan "hampir habis!" palsu:
 * penekanan warna hanya muncul bila sisanya memang ≤ 5. Titik-titik kursi
 * untuk kuota kecil terasa seperti denah ruangan; kuota besar jadi batang.
 * Gambarnya `aria-hidden` — kalimat di atasnya yang membawa maknanya.
 *
 * Komponen klien bukan karena interaktif: puluhan titik sebagai daftar di
 * payload RSC di-stream sebagai potongan lazy, dan React dev lalu salah
 * melaporkan "key hilang". Dibuat di klien, daftarnya utuh.
 */
export function SeatMeter({ seats, waitlist, className }: { seats: RegistrationSeats; waitlist: boolean; className?: string }) {
  const { capacity, taken, waitlisted } = seats;
  const left = capacity === null ? null : Math.max(capacity - taken, 0);
  const urgent = left !== null && left > 0 && left <= URGENT_LEFT;
  const detail =
    capacity === null
      ? `${taken.toLocaleString('id-ID')} orang sudah mendaftar`
      : `${taken.toLocaleString('id-ID')} dari ${capacity.toLocaleString('id-ID')} kursi terisi${waitlisted > 0 ? ` · ${waitlisted.toLocaleString('id-ID')} antre` : ''}`;

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <p className="flex flex-col gap-0.5">
        <span className={cn('text-[15px] font-semibold', urgent && 'text-caution')}>{seatHeadline(seats, waitlist)}</span>
        <span className="text-[12.5px] text-ink-muted">{detail}</span>
      </p>
      {capacity !== null &&
        (capacity <= DOTS_MAX ? (
          <span aria-hidden className="flex flex-wrap gap-[5px]">
            {Array.from({ length: capacity }, (_, index) => (
              <span
                key={index}
                className={cn('rise size-2.5 rounded-pill border-[1.5px] border-ink', index < taken ? 'bg-ink' : 'bg-panel')}
                style={{ '--i': Math.min(index, 10) } as CSSProperties}
              />
            ))}
          </span>
        ) : (
          <span aria-hidden className="h-2.5 overflow-hidden rounded-pill bg-panel-nested ring-1 ring-inset ring-line">
            <span className="grow-x block h-full rounded-pill bg-ink" style={{ width: `${Math.min((taken / capacity) * 100, 100)}%` }} />
          </span>
        ))}
    </div>
  );
}
