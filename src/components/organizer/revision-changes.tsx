import { formatDateTimeId } from '@/lib/deadline';
import { sanitizeExternalUrl } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, type EducationLevel, type EventDetail, type EventRevisionChanges } from '@/types/domain';

type Current = Pick<EventDetail, 'description' | 'registrationLink' | 'location' | 'isOnline' | 'educationLevels' | 'primaryDeadlineAt'>;

interface Row {
  readonly label: string;
  readonly before: string | null;
  readonly after: string;
  readonly link?: string | null;
}

const levels = (values: readonly EducationLevel[]) => values.map((level) => EDUCATION_LEVEL_LABEL[level]).join(', ') || '—';

function rowsOf(changes: EventRevisionChanges, current: Current | null): Row[] {
  const rows: Row[] = [];
  if ('description' in changes) {
    rows.push({ label: 'Deskripsi', before: current ? (current.description ?? '—') : null, after: changes.description || '(dikosongkan)' });
  }
  if (changes.registrationLink !== undefined) {
    rows.push({
      label: 'Tautan pendaftaran',
      before: current?.registrationLink ?? null,
      after: changes.registrationLink,
      link: sanitizeExternalUrl(changes.registrationLink),
    });
  }
  if ('location' in changes) {
    rows.push({ label: 'Lokasi', before: current ? (current.location ?? '—') : null, after: changes.location || '(dikosongkan)' });
  }
  if (changes.isOnline !== undefined) {
    rows.push({
      label: 'Pelaksanaan',
      before: current ? (current.isOnline ? 'Daring' : 'Luring') : null,
      after: changes.isOnline ? 'Daring' : 'Luring',
    });
  }
  if (changes.educationLevels !== undefined) {
    rows.push({ label: 'Jenjang', before: current ? levels(current.educationLevels) : null, after: levels(changes.educationLevels) });
  }
  if (changes.deadlineAt !== undefined) {
    rows.push({
      label: 'Tenggat pendaftaran',
      before: current ? (current.primaryDeadlineAt ? formatDateTimeId(current.primaryDeadlineAt) : '—') : null,
      after: formatDateTimeId(changes.deadlineAt),
    });
  }
  return rows;
}

/**
 * Selisih yang diusulkan, satu baris per kolom. Moderator membaca "dari →
 * menjadi", bukan seluruh form — perubahan kecil yang berbahaya (tautan
 * pendaftaran diganti) tidak tenggelam di antara isian yang sama.
 */
export function RevisionChanges({ changes, current }: { changes: EventRevisionChanges; current: Current | null }) {
  return (
    <dl className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line text-sm">
      {rowsOf(changes, current).map((row) => (
        <div key={row.label} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-3">
          <dt className="font-medium text-ink-muted">{row.label}</dt>
          <dd className="flex min-w-0 flex-col gap-1">
            {row.before !== null && (
              <span className="line-clamp-3 break-words text-ink-muted line-through decoration-ink-faint">{row.before}</span>
            )}
            {row.link ? (
              <a href={row.link} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-medium text-brand-text underline">
                {row.after}
              </a>
            ) : (
              <span className="line-clamp-6 whitespace-pre-line break-words font-medium">{row.after}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
