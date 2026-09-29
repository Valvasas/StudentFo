import Link from 'next/link';
import { ArrowUpRight, Check, ShieldQuestion, X } from 'lucide-react';
import { reviewVerificationAction } from '@/app/penyelenggara/actions';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatDateId } from '@/lib/deadline';
import { VERIFICATION_NOTE_MAX, achievementLabel } from '@/lib/portfolio';
import { cn, sanitizeExternalUrl } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, type PendingVerification } from '@/types/domain';

/**
 * Kotak masuk konfirmasi hasil (ADR-047). Tampil paling atas di studio
 * karena satu-satunya bagian yang MENUNGGU keputusan penyelenggara; kalau
 * kosong, tidak tampil sama sekali — kotak kosong hanya menambah bising.
 *
 * "Konfirmasi" satu klik (kasus umum); "Tidak sesuai" di balik <details>
 * dengan alasan opsional, karena peserta akan membacanya dan satu klik
 * meleset tidak boleh langsung mengirim kabar buruk.
 */
export function VerificationInbox({ requests }: { requests: readonly PendingVerification[] }) {
  if (requests.length === 0) return null;

  return (
    <section aria-labelledby="verifikasi-hasil" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="verifikasi-hasil" className="flex scroll-mt-24 flex-wrap items-center gap-2.5 text-2xl">
          Konfirmasi hasil peserta
          <span className="inline-flex h-7 items-center rounded-pill bg-brand px-2.5 font-sans text-[13px] font-semibold text-on-brand">
            {requests.length} menunggu
          </span>
        </h2>
        <p className="max-w-2xl text-sm text-ink-soft">
          Peserta meminta kamu memastikan hasil yang mereka catat di portofolionya. Cocokkan dengan daftar pemenang atau
          peserta resmimu — yang kamu konfirmasi tampil bertanda terverifikasi atas nama lembagamu.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {requests.map((request) => {
          const proofUrl = request.proofUrl ? sanitizeExternalUrl(request.proofUrl) : null;
          const profileLine = [request.educationLevel ? EDUCATION_LEVEL_LABEL[request.educationLevel] : null, request.major]
            .filter(Boolean)
            .join(' · ');
          const hidden = (
            <>
              <input type="hidden" name="userId" value={request.userId} />
              <input type="hidden" name="eventId" value={request.eventId} />
              <input type="hidden" name="requestedAt" value={request.requestedAt} />
            </>
          );
          return (
            <li key={`${request.userId}-${request.eventId}`} className="flex flex-col gap-4 rounded-panel border border-line bg-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
                  <p className="text-base font-semibold">
                    {request.fullName}
                    {profileLine && <span className="font-normal text-ink-muted"> · {profileLine}</span>}
                  </p>
                  <Link href={`/events/${request.slug}`} className="self-start text-sm text-ink-muted underline-offset-[3px] hover:text-ink hover:underline">
                    {request.title}
                  </Link>
                  <span className="text-[12.5px] text-ink-faint">Diminta {formatDateId(request.requestedAt)}</span>
                </div>

                <dl className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 rounded-card bg-panel-nested px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <dt className="text-[12.5px] text-ink-muted">Hasil yang diklaim</dt>
                    <dd className="text-[15px] font-semibold">{achievementLabel(request.achievement, request.eventType)}</dd>
                  </div>
                  {request.achievementNote && (
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <dt className="text-[12.5px] text-ink-muted">Catatan</dt>
                      <dd className="text-sm">{request.achievementNote}</dd>
                    </div>
                  )}
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <dt className="text-[12.5px] text-ink-muted">Bukti</dt>
                    <dd className="text-sm">
                      {proofUrl ? (
                        <a
                          href={proofUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow ugc"
                          className="inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-[3px] sm:min-h-0"
                        >
                          Buka tautan bukti <ArrowUpRight aria-hidden className="size-3.5" />
                          <span className="sr-only">dari {request.fullName} (tab baru)</span>
                        </a>
                      ) : (
                        <span className="text-ink-muted">Tidak dilampirkan — cocokkan dengan catatanmu sendiri</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-wrap items-start gap-2 border-t border-line pt-4">
                <form action={reviewVerificationAction}>
                  {hidden}
                  <input type="hidden" name="decision" value="VERIFIED" />
                  <SubmitButton className={buttonVariants({ variant: 'success', size: 'md' })}>
                    <Check aria-hidden className="size-4" /> Konfirmasi
                    <span className="sr-only"> hasil {request.fullName}</span>
                  </SubmitButton>
                </form>
                <details className="group">
                  <summary className={cn(buttonVariants({ variant: 'secondary', size: 'md' }), 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
                    <X aria-hidden className="size-4" /> Tidak sesuai
                    <span className="sr-only"> — {request.fullName}</span>
                  </summary>
                  <form action={reviewVerificationAction} className="mt-2 flex w-full max-w-md flex-col gap-2 rounded-card border border-line bg-panel p-3 text-sm shadow-overlay">
                    {hidden}
                    <input type="hidden" name="decision" value="DECLINED" />
                    <label htmlFor={`note-${request.userId}-${request.eventId}`} className="font-medium">
                      Alasan untuk {request.fullName} <span className="font-normal text-ink-muted">(opsional)</span>
                    </label>
                    <textarea
                      id={`note-${request.userId}-${request.eventId}`}
                      name="note"
                      rows={2}
                      maxLength={VERIFICATION_NOTE_MAX}
                      placeholder="Mis. Juara 3 kategori ini atas nama tim lain."
                      className="resize-y rounded-card border border-line-strong/70 bg-panel px-3 py-2 text-base hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:text-sm"
                    />
                    <p className="text-[12.5px] text-ink-muted">
                      Peserta dikabari dan bisa memperbaiki isiannya lalu meminta lagi.
                    </p>
                    <SubmitButton className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start')}>
                      Kirim: tidak sesuai
                    </SubmitButton>
                  </form>
                </details>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="flex items-start gap-2 text-[12.5px] text-ink-muted">
        <ShieldQuestion aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Kamu hanya melihat peserta yang meminta. Daftar lengkap orang yang menandai &ldquo;sudah daftar&rdquo; tidak pernah
        dibagikan.
      </p>
    </section>
  );
}
