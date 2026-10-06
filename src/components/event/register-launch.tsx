'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { updateTrackerStatusAction } from '@/app/tracker/actions';
import { PaperPlaneDoodle } from '@/components/ui/illustrations';
import { SubmitButton } from '@/components/ui/submit-button';
import { loginHref } from '@/lib/safe-redirect';
import { TRACKER_STATUS_LABEL, type TrackerStatus } from '@/types/domain';

/** Tahap yang sudah melewati "Sudah daftar" — tombol "tandai terdaftar" tidak masuk akal lagi. */
const PAST_APPLYING: readonly TrackerStatus[] = ['APPLIED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'];

/**
 * Tautan "Daftar" ke formulir resmi + kartu "formulir dibuka" (ADR-055).
 *
 * Tautannya tetap `<a target="_blank">` biasa lewat `/daftar` (pencatatan
 * klik ADR-032 tidak berubah, jalan tanpa JS). Karena formulirnya terbuka di
 * tab BARU, tab StudentFo tetap di sini — saat orang kembali, kartu ini
 * menunggu dengan satu pertanyaan: sudah kirim? Satu ketukan mencatatnya ke
 * Pendaftaran (Server Action yang sama dengan papan) dan halaman merayakannya.
 * Sebelumnya langkah itu butuh membuka papan dan mencari kartunya sendiri,
 * dan kebanyakan orang tidak pernah melakukannya.
 *
 * Kartu tidak merebut fokus (orangnya sedang di tab lain) dan hanya ada
 * setelah klik; Esc atau ✕ menutupnya.
 */
export function RegisterLaunch({
  href,
  className,
  ariaLabel,
  children,
  eventId,
  returnTo,
  signedIn,
  status,
}: {
  href: string;
  className: string;
  ariaLabel?: string;
  children: ReactNode;
  eventId: string;
  returnTo: string;
  signedIn: boolean;
  status: TrackerStatus | null;
}) {
  const [launched, setLaunched] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!launched) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLaunched(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [launched]);

  const recordedLabel = status !== null && PAST_APPLYING.includes(status) ? TRACKER_STATUS_LABEL[status] : null;

  // Berhasil dicatat dari kartu ini → halaman dirender ulang dengan tahap baru
  // (dan perayaan). Kartu yang tetap terbuka berisi "sudah tercatat" hanya
  // mengulang kabar yang sama, jadi ia menutup sendiri.
  const [lastStatus, setLastStatus] = useState(status);
  if (status !== lastStatus) {
    setLastStatus(status);
    if (recordedLabel) setLaunched(false);
  }

  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" aria-label={ariaLabel} className={className} onClick={() => setLaunched(true)}>
        {children}
      </a>
      {launched &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[65] flex justify-center px-4 max-[959px]:bottom-24">
            <section
              aria-labelledby={titleId}
              className="celebrate-in pointer-events-auto relative flex w-full max-w-[440px] gap-4 rounded-[22px] border border-line bg-panel p-4 pr-5 shadow-overlay"
            >
              <span aria-hidden className="dot-grid relative flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-tint-mint text-ink">
                <svg viewBox="0 0 72 72" className="absolute inset-0 size-full" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 62 Q22 64 30 50" strokeDasharray="2 6" pathLength={1} className="ink-draw" style={{ '--d': '200ms' } as CSSProperties} />
                </svg>
                <PaperPlaneDoodle className="launch relative h-10 w-12" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <div aria-live="polite" className="flex flex-col gap-1">
                  <h2 id={titleId} className="pr-8 text-[16px] font-bold leading-snug tracking-[-0.015em]">
                    Formulir resmi dibuka di tab baru
                  </h2>
                  <p className="text-[13px] leading-relaxed text-ink-muted">
                    {recordedLabel
                      ? `Sudah tercatat di Pendaftaran: ${recordedLabel}.`
                      : 'Selesaikan di sana. Sudah terkirim? Catat di Pendaftaran supaya tahap berikutnya terlacak.'}
                  </p>
                </div>
                {!recordedLabel && (
                  <div className="flex flex-wrap items-center gap-2">
                    {signedIn ? (
                      <form action={updateTrackerStatusAction}>
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="status" value="APPLIED" />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <SubmitButton
                          pendingLabel="Mencatat…"
                          className="flex h-10 items-center gap-1.5 rounded-pill bg-brand px-4 text-[13.5px] font-semibold text-on-brand hover:bg-brand-hover active:pt-0.5"
                        >
                          <Check aria-hidden className="size-4" />
                          Sudah, tandai terdaftar
                        </SubmitButton>
                      </form>
                    ) : (
                      <Link
                        href={loginHref(returnTo)}
                        className="flex h-10 items-center rounded-pill bg-brand px-4 text-[13.5px] font-semibold text-on-brand hover:bg-brand-hover active:pt-0.5"
                      >
                        Masuk untuk mencatat
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setLaunched(false)}
                      className="flex h-10 items-center rounded-pill px-3.5 text-[13.5px] font-semibold text-ink-muted transition-colors duration-150 hover:bg-panel-nested hover:text-ink"
                    >
                      Nanti saja
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLaunched(false)}
                aria-label="Tutup kartu pendaftaran"
                className="absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-pill text-ink-muted transition-colors duration-150 hover:bg-panel-nested hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </button>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
