import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { privacyStatus, termsStatus } from '@/components/legal/legal-document';
import { formatDateId, jakartaDateKey } from '@/lib/deadline';
import { upcomingLegalChanges } from '@/lib/legal';

/**
 * Pengumuman dokumen hukum yang akan berlaku (ADR-061) — memenuhi janji
 * "perubahan penting diumumkan ≥ 14 hari sebelum berlaku" di Kebijakan privasi
 * dan S&K tanpa komponen admin: cukup tanggal berlaku di masa depan di env.
 * Hilang sendiri begitu tanggalnya tiba.
 */
export function LegalUpdateBanner() {
  const changes = upcomingLegalChanges(
    [
      { label: 'Syarat & Ketentuan', href: '/terms', status: termsStatus() },
      { label: 'Kebijakan privasi', href: '/privacy-policy', status: privacyStatus() },
    ],
    jakartaDateKey(new Date()),
  );
  if (changes.length === 0) return null;

  return (
    <div role="note" className="border-b border-line bg-panel-nested">
      <div className="container-page flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-xs text-ink-soft">
        <Megaphone aria-hidden className="size-3.5 shrink-0" />
        {changes.map((change, index) => (
          <span key={change.href}>
            {index > 0 && <span aria-hidden>· </span>}
            <Link href={change.href} className="font-semibold text-ink underline underline-offset-[3px]">
              {change.label}
            </Link>{' '}
            baru berlaku {formatDateId(`${change.effectiveDate}T00:00:00+07:00`)}
          </span>
        ))}
      </div>
    </div>
  );
}
