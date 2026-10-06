import { CheckCircle2, CircleSlash, Clock3, Hourglass, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REGISTRATION_STATUS_LABEL, type RegistrationStatus } from '@/types/domain';

const TONE: Record<RegistrationStatus, { icon: LucideIcon; className: string }> = {
  CONFIRMED: { icon: CheckCircle2, className: 'border-success-line bg-success-soft text-success' },
  PENDING: { icon: Clock3, className: 'border-caution-line bg-caution-soft text-caution' },
  WAITLISTED: { icon: Hourglass, className: 'border-line bg-panel-nested text-ink' },
  REJECTED: { icon: XCircle, className: 'border-danger-line bg-danger-soft text-danger' },
  CANCELLED: { icon: CircleSlash, className: 'border-line bg-panel text-ink-muted' },
};

/** Status pendaftar = ikon + label + warna; tidak pernah warna saja (buta warna, cetak hitam-putih). */
export function RegistrationStatusChip({
  status,
  position,
  className,
}: {
  status: RegistrationStatus;
  /** Urutan daftar tunggu, ditempel ke label "Daftar tunggu #3". */
  position?: number | null;
  className?: string;
}) {
  const tone = TONE[status];
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-pill border px-2 text-[12px] font-semibold', tone.className, className)}>
      <tone.icon aria-hidden className="size-3.5" />
      {REGISTRATION_STATUS_LABEL[status]}
      {status === 'WAITLISTED' && position ? ` #${position}` : ''}
    </span>
  );
}
