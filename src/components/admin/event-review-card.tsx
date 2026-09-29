import { AlertTriangle, Check, ExternalLink, GraduationCap, MapPin, Tag } from 'lucide-react';
import { reviewEventAction } from '@/app/admin/actions';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RejectConfirm } from '@/components/admin/reject-confirm';
import { formatDateTimeId, formatShortDateId } from '@/lib/deadline';
import { sanitizeExternalUrl } from '@/lib/utils';
import { DEADLINE_LABEL_TEXT, EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, type EventDetail } from '@/types/domain';

const DESCRIPTION_PREVIEW = 240;

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
 *
 * Jenjang, tempat, dan kategori ikut ditampilkan: ketiganya tayang apa
 * adanya di halaman publik begitu disetujui, dan justru di situlah
 * ekstraksi LLM paling sering meleset (SMA terbaca S1, luring terbaca
 * daring). Yang kosong ditandai, bukan disembunyikan — kosong berarti
 * kegiatan itu tidak akan muncul di saringan jenjang/bidang mana pun.
 */
export function EventReviewCard({ event, categoryNames }: { event: EventDetail; categoryNames: Readonly<Record<string, string>> }) {
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
        <p className="mt-1 text-sm text-ink-muted">
          {event.organizer} · masuk antrean {formatShortDateId(event.createdAt)}
        </p>

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          <Fact icon={GraduationCap} label="Jenjang" missing={event.educationLevels.length === 0 ? 'Jenjang tidak disebutkan' : null}>
            {event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(', ')}
          </Fact>
          <Fact icon={MapPin} label="Pelaksanaan" missing={!event.isOnline && !event.location ? 'Lokasi tidak disebutkan' : null}>
            {event.isOnline ? 'Daring' : event.location}
          </Fact>
          <Fact icon={Tag} label="Bidang" missing={event.categorySlugs.length === 0 ? 'Tanpa bidang' : null}>
            {event.categorySlugs.map((slug) => categoryNames[slug] ?? slug).join(', ')}
          </Fact>
        </dl>

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
        {event.description &&
          (event.description.length > DESCRIPTION_PREVIEW ? (
            // Moderator harus bisa membaca SEMUA yang akan tayang sebelum
            // menyetujuinya; potongan tiga baris saja tidak cukup.
            <div className="group/desc mt-3 text-sm text-ink-soft">
              <p className="line-clamp-3 whitespace-pre-line group-has-[details[open]]/desc:hidden">{event.description}</p>
              <details className="group/more">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-medium text-ink underline underline-offset-[3px] [&::-webkit-details-marker]:hidden">
                  <span className="group-open/more:hidden">Baca deskripsi lengkap</span>
                  <span className="hidden group-open/more:inline">Ringkas deskripsi</span>
                </summary>
                <p className="whitespace-pre-line">{event.description}</p>
              </details>
            </div>
          ) : (
            <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{event.description}</p>
          ))}

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
        <RejectConfirm action={reviewEventAction} fields={{ eventId: event.id, decision: 'REJECTED' }} subject="kegiatan ini" />
      </div>
    </li>
  );
}

function Fact({
  icon: Icon,
  label,
  missing,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  missing: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <dt>
        <Icon aria-hidden className="size-4 text-ink-muted" />
        <span className="sr-only">{label}</span>
      </dt>
      {missing ? (
        <dd className="flex items-center gap-1 text-caution">
          <AlertTriangle aria-hidden className="size-3.5" /> {missing}
        </dd>
      ) : (
        <dd>{children}</dd>
      )}
    </div>
  );
}
