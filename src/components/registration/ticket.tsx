import type { CSSProperties } from 'react';
import { EventTypeIcon } from '@/components/event/event-type-icon';
import { TINT_BG } from '@/components/ui/avatar';
import { formatTicketCode } from '@/lib/registration-basics';
import type { Tint } from '@/lib/tint';
import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, type EventType, type RegistrationStatus } from '@/types/domain';

export type TicketStatus = RegistrationStatus | 'PREVIEW';

/** Warna cap = makna status (token semantik), bukan tint — tint tiket adalah identitas acara (ADR-054). */
const STAMP_TONE: Record<TicketStatus, string> = {
  CONFIRMED: 'border-success text-success',
  PENDING: 'border-caution text-caution',
  WAITLISTED: 'border-ink text-ink',
  REJECTED: 'border-danger text-danger',
  CANCELLED: 'border-ink-muted text-ink-muted line-through decoration-2',
  PREVIEW: 'border-dashed border-ink-muted text-ink-muted',
};

export interface TicketProps {
  eventTitle: string;
  organizer: string;
  eventType: EventType;
  /** Agenda berikutnya yang sudah diformat, mis. "Babak final · 12 Nov 2026". */
  when: string;
  where: string;
  holder: string;
  institution: string | null;
  team?: string | null;
  /** `null` di pratinjau: kode baru terbit setelah dikirim. */
  code: string | null;
  status: TicketStatus;
  stampLabel: string;
  tint: Tint;
  /** Cap "dijatuhkan" sekali — hanya saat tiket baru terbit, bukan setiap kunjungan. */
  animate?: boolean;
  className?: string;
}

function Item({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{label}</dt>
      <dd className="line-clamp-2 break-words text-[14.5px] font-semibold leading-snug">{value}</dd>
      {sub && <dd className="truncate text-[12.5px] text-ink-muted">{sub}</dd>}
    </div>
  );
}

/**
 * Tiket pendaftaran (ADR-055): badan kertas + sobekan bertakik + potongan
 * bertint berisi kode. Satu komponen untuk pratinjau langsung di formulir
 * dan tiket sungguhan, supaya yang dibayangkan peserta saat mengisi sama
 * persis dengan yang ia terima. Murni presentasi — aman di server & klien.
 *
 * Kode ditulis dengan huruf monospace berjarak lebar dan tanpa karakter
 * kembar (0/O, 1/I/L): dibacakan ke panitia di meja registrasi ulang.
 * Tidak ada QR palsu — kode yang tidak bisa dipindai hanya menyesatkan.
 */
export function Ticket({
  eventTitle,
  organizer,
  eventType,
  when,
  where,
  holder,
  institution,
  team,
  code,
  status,
  stampLabel,
  tint,
  animate = false,
  className,
}: TicketProps) {
  return (
    // Tata letak mengikuti lebar WADAH, bukan layar: tiket yang sama tampil di
    // kolom samping 400px (tegak, potongan di bawah) dan di halaman tiket (mendatar).
    <div className={cn('@container drop-shadow-[0_18px_28px_rgba(29,27,23,0.10)] print:drop-shadow-none', className)}>
      <article
        aria-label={`Tiket ${eventTitle}`}
        className="ticket-notch-y grid overflow-hidden rounded-[24px] bg-panel ring-1 ring-inset ring-line [--cut:calc(100%-112px)] @[32rem]:ticket-notch-x @[32rem]:grid-cols-[minmax(0,1fr)_184px] @[32rem]:[--cut:calc(100%-184px)]"
      >
        <div className="flex min-w-0 flex-col gap-5 p-5 pb-6 @[32rem]:p-7">
          <p className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-ink-muted">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-panel-nested text-ink">
              <EventTypeIcon type={eventType} className="size-3.5" />
            </span>
            <span className="truncate">
              {EVENT_TYPE_LABEL[eventType]} · {organizer}
            </span>
          </p>
          <h3 className="line-clamp-3 font-display text-[22px] font-bold leading-[1.1] tracking-[-0.03em] [text-wrap:balance] @[32rem]:line-clamp-2 @[32rem]:text-[25px]">
            {eventTitle}
          </h3>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Item label="Pemegang" value={holder} sub={institution} />
            <Item label="Agenda" value={when} />
            <Item label="Tempat" value={where} />
            {team && <Item label="Tim" value={team} />}
          </dl>
        </div>

        <div
          className={cn(
            'flex h-[112px] items-center justify-between gap-4 border-t-2 border-dashed border-line-strong/60 px-5 @[32rem]:h-auto @[32rem]:flex-col @[32rem]:items-start @[32rem]:justify-between @[32rem]:border-l-2 @[32rem]:border-t-0 @[32rem]:p-6',
            TINT_BG[tint],
          )}
        >
          <span className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Kode tiket</span>
            <span className={cn('whitespace-nowrap font-mono text-[23px] font-bold tracking-[0.08em]', !code && 'text-ink-muted')}>
              {code ? formatTicketCode(code) : '····-····'}
            </span>
          </span>
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-[10px] border-[2.5px] bg-panel/75 px-2.5 py-1 font-display text-[12.5px] font-extrabold uppercase tracking-[0.08em]',
              animate ? 'stamp' : '-rotate-6',
              STAMP_TONE[status],
            )}
            style={animate ? ({ '--d': '450ms' } as CSSProperties) : undefined}
          >
            {stampLabel}
          </span>
        </div>
      </article>
    </div>
  );
}
