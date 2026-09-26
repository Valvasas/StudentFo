import { Check, ExternalLink, X } from 'lucide-react';
import { reviewEventAction } from '@/app/admin/actions';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTimeId } from '@/lib/deadline';
import { sanitizeExternalUrl } from '@/lib/utils';
import { DEADLINE_LABEL_TEXT, EVENT_TYPE_LABEL, type EventDetail } from '@/types/domain';

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

/**
 * Satu event hasil scraping di antrean moderasi.
 *
 * Domain sumber ditulis sebagai teks, bukan hanya disembunyikan di tautan:
 * sekilas pandang moderator harus tahu apakah datanya dari situs resmi
 * penyelenggara atau dari agregator pihak ketiga. Kedua tautan membuka tab
 * baru supaya posisi di antrean tidak hilang.
 */
export function EventReviewCard({ event }: { event: EventDetail }) {
  const sourceUrl = sanitizeExternalUrl(event.sourceUrl);
  const registrationUrl = sanitizeExternalUrl(event.registrationLink);

  return (
    <li className="flex flex-col gap-4 rounded-card border border-line bg-panel p-5 shadow-card sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">{EVENT_TYPE_LABEL[event.eventType]}</Badge>
          <DeadlineTag deadlineAt={event.primaryDeadlineAt} />
        </div>
        <h2 className="mt-2 text-base font-semibold">{event.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{event.organizer}</p>

        {event.deadlines.length > 0 && (
          <ul className="mt-3 flex flex-col gap-0.5 text-sm">
            {event.deadlines.map((deadline) => (
              <li key={deadline.id}>
                <span className="text-ink-muted">{DEADLINE_LABEL_TEXT[deadline.label]}: </span>
                {formatDateTimeId(deadline.deadlineAt)}
              </li>
            ))}
          </ul>
        )}
        {event.description && (
          <p className="mt-3 line-clamp-3 text-sm text-ink-soft">{event.description}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-h-11 items-center gap-1 break-all font-medium text-brand-text hover:underline"
            >
              Sumber asli ({hostOf(sourceUrl)}) <ExternalLink aria-hidden className="size-3 shrink-0" />
            </a>
          ) : (
            <span className="text-danger">Sumber tidak valid — jangan setujui.</span>
          )}
          {registrationUrl && (
            <a
              href={registrationUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-h-11 items-center gap-1 break-all text-brand-text hover:underline"
            >
              Tautan pendaftaran ({hostOf(registrationUrl)}) <ExternalLink aria-hidden className="size-3 shrink-0" />
            </a>
          )}
        </div>
      </div>

      {/* Dua <form> terpisah, masing-masing satu aksi. Menaruh dua
          tombol submit dengan nilai berbeda di satu form membuat
          tombol Enter di keyboard memilih aksi pertama — di sini itu
          berarti "Setujui" tanpa sengaja. */}
      <div className="flex shrink-0 gap-2">
        <form action={reviewEventAction}>
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="decision" value="APPROVED" />
          <Button type="submit" variant="success" size="sm">
            <Check aria-hidden /> Setujui
          </Button>
        </form>
        <form action={reviewEventAction}>
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="decision" value="REJECTED" />
          <Button type="submit" variant="danger" size="sm">
            <X aria-hidden /> Tolak
          </Button>
        </form>
      </div>
    </li>
  );
}
