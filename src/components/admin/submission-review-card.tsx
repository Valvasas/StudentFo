import { AlertTriangle, Check, ExternalLink, X } from 'lucide-react';
import { reviewSubmissionAction } from '@/app/admin/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateId, formatDateTimeId } from '@/lib/deadline';
import { sanitizeExternalUrl } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, type Submission } from '@/types/domain';

function DecisionForm({ submissionId, decision }: { submissionId: string; decision: 'APPROVED' | 'REJECTED' }) {
  const approve = decision === 'APPROVED';
  return (
    <form action={reviewSubmissionAction}>
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="decision" value={decision} />
      <Button type="submit" variant={approve ? 'success' : 'danger'} size="sm">
        {approve ? <Check aria-hidden /> : <X aria-hidden />} {approve ? 'Setujui & tayangkan' : 'Tolak'}
      </Button>
    </form>
  );
}

/**
 * Satu kiriman komunitas di antrean moderasi.
 *
 * Tautan dari kiriman adalah input publik yang belum diverifikasi — ditampilkan
 * lewat `sanitizeExternalUrl` (hanya http/https) dan `rel="nofollow noopener"`,
 * persis seperti tautan hasil scraping di halaman detail.
 */
export function SubmissionReviewCard({ submission }: { submission: Submission }) {
  const { payload } = submission;
  const registrationUrl = payload ? sanitizeExternalUrl(payload.registrationLink) : null;
  const sourceUrl = payload?.sourceUrl ? sanitizeExternalUrl(payload.sourceUrl) : null;

  return (
    <li className="flex flex-col gap-4 rounded-card border border-line bg-panel p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>Dikirim {formatDateId(submission.createdAt)} oleh {submission.submittedByEmail}</span>
        {payload && <Badge variant="brand">{EVENT_TYPE_LABEL[payload.eventType]}</Badge>}
      </div>

      {payload ? (
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{payload.title}</h3>
          <p className="mt-1 text-sm text-ink-muted">{payload.organizer}</p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="inline text-ink-muted">Tenggat: </dt>
              <dd className="inline">{formatDateTimeId(payload.deadlineAt)}</dd>
            </div>
            <div>
              <dt className="inline text-ink-muted">Lokasi: </dt>
              <dd className="inline">{payload.isOnline ? 'Daring' : (payload.location ?? '—')}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="inline text-ink-muted">Jenjang: </dt>
              <dd className="inline">{payload.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(', ')}</dd>
            </div>
          </dl>
          {payload.description && (
            <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm text-ink-soft">{payload.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            {[
              { label: 'Tautan pendaftaran', url: registrationUrl },
              { label: 'Sumber', url: sourceUrl },
            ].map(({ label, url }) =>
              url ? (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-h-11 items-center gap-1 text-brand-text hover:underline"
                >
                  {label} <ExternalLink aria-hidden className="size-3" />
                </a>
              ) : null,
            )}
          </div>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-card bg-caution-soft p-3 text-sm text-caution">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          Isi kiriman ini tidak sesuai format yang dikenal (kemungkinan dikirim langsung lewat API). Tolak saja.
        </p>
      )}

      {/* Dua <form> terpisah — lihat catatan tombol Enter di antrean event. */}
      <div className="flex flex-wrap gap-2">
        {payload && <DecisionForm submissionId={submission.id} decision="APPROVED" />}
        <DecisionForm submissionId={submission.id} decision="REJECTED" />
      </div>
    </li>
  );
}
