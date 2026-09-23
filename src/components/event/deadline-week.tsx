import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { DeadlineDay } from '@/types/domain';

const weekdayFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'UTC' });
const dayFormatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', timeZone: 'UTC' });
const fullFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * Pita "Minggu ini": 7 kolom hari, tinggi bar = jumlah tenggat hari itu.
 *
 * `date` sudah berupa tanggal kalender WIB (`YYYY-MM-DD`), jadi diformat di
 * zona UTC — memformatnya lagi di Asia/Jakarta akan menggeser tanggal yang
 * sudah benar. Angka jumlah selalu ditulis sebagai teks; bar hanya penegas
 * visual, bukan satu-satunya pembawa makna (CONVENTIONS.md § Desain).
 */
export function DeadlineWeek({ days }: { days: readonly DeadlineDay[] }) {
  const max = Math.max(...days.map((day) => day.count), 1);
  const total = days.reduce((sum, day) => sum + day.count, 0);

  return (
    <section aria-labelledby="minggu-ini" className="mb-12">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="minggu-ini" className="text-2xl">
          Minggu ini
        </h2>
        <p className="text-sm text-ink-muted">{total} tenggat dalam 7 hari</p>
      </div>

      <ol className="grid grid-cols-7 gap-2">
        {days.map((day, index) => {
          const date = new Date(`${day.date}T00:00:00Z`);
          const isToday = index === 0;
          return (
            <li key={day.date}>
              <Link
                href="/events?sort=deadline"
                aria-label={`${fullFormatter.format(date)}: ${day.count} tenggat`}
                className={cn(
                  'flex h-full flex-col items-center gap-2 rounded-card border bg-panel px-1 py-3 text-center',
                  'transition-colors duration-150 ease-snap hover:border-brand',
                  isToday ? 'border-brand' : 'border-line',
                )}
              >
                <span className="text-xs text-ink-muted">{isToday ? 'Hari ini' : weekdayFormatter.format(date)}</span>
                <span className="font-display text-lg font-semibold tabular-nums">{dayFormatter.format(date)}</span>
                <span aria-hidden className="flex h-12 w-3 items-end rounded-pill bg-panel-nested">
                  <span
                    className={cn('w-full rounded-pill', day.count > 0 ? 'bg-brand' : 'bg-transparent')}
                    style={{ height: `${(day.count / max) * 100}%` }}
                  />
                </span>
                <span className="text-xs font-medium tabular-nums text-ink-soft">{day.count}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
