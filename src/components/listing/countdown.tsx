import { TimeLeftToday } from '@/components/listing/time-left-today';
import { daysUntil } from '@/lib/deadline';
import { cn } from '@/lib/utils';

/**
 * Sisa waktu menuju tenggat dalam HARI KALENDER WIB — sumber yang sama
 * dengan tag di kartu (`daysUntil`, AGENTS.md #8).
 *
 * Penggantinya hitung mundur hari/jam/menit/detik (ADR-064). Hitung mundur
 * itu memakai selisih milidetik, jadi di satu layar kartu bisa menulis
 * "7 hari lagi" sementara panelnya "06 HARI", dan detik yang terus berdetak
 * untuk tenggat yang masih seminggu lagi hanya membuat cemas. Jam baru
 * tampil di hari terakhir — satu-satunya saat jam mengubah keputusan.
 */
export function DaysLeft({
  deadlineAt,
  now,
  size = 'md',
  className,
}: {
  deadlineAt: string;
  now: Date;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const days = daysUntil(deadlineAt, now);
  const numberClass = cn(
    'font-display font-bold leading-none tracking-[-0.045em] tabular-nums',
    size === 'lg' ? 'text-[clamp(44px,5.4vw,60px)]' : 'text-[38px]',
  );
  const unitClass = cn('font-medium text-ink-soft', size === 'lg' ? 'text-[17px]' : 'text-[15px]');

  if (days === null) {
    return <span className={cn('text-2xl font-semibold', className)}>Tanggal belum diumumkan</span>;
  }
  if (days < 0) {
    return <span className={cn('text-2xl font-semibold', className)}>Sudah ditutup</span>;
  }

  return (
    <span className={cn('flex flex-col gap-2', className)}>
      <span className="flex items-baseline gap-2">
        {days >= 2 ? (
          <>
            <span className={numberClass}>{days}</span>
            <span className={unitClass}>hari lagi</span>
          </>
        ) : (
          <span className={numberClass}>{days === 1 ? 'Besok' : 'Hari ini'}</span>
        )}
      </span>
      {days === 0 && <TimeLeftToday deadlineAt={deadlineAt} renderedAt={now.getTime()} />}
    </span>
  );
}
