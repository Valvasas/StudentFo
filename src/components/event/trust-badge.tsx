import Link from 'next/link';
import { Newspaper, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VERIFICATION_LEVEL_DESCRIPTION, VERIFICATION_LEVEL_LABEL, type VerificationLevel } from '@/types/domain';

/** Ikon khusus dua tingkat ini — tidak dipakai untuk arti lain di kartu & halaman kegiatan (CONVENTIONS § satu ikon = satu arti). */
const ICON = { MODERATOR_VERIFIED: ShieldCheck, PUBLIC_SOURCE: Newspaper } as const;

export const TRUST_EXPLAINER_HREF = '/sumber-data#tingkat-verifikasi';

/**
 * Label kepercayaan kegiatan (ADR-096). Dua tingkat, teks + ikon (warna
 * bukan satu-satunya pembeda). `level` null = belum diketahui → tidak
 * menampilkan klaim apa pun, termasuk "Dari sumber publik".
 */
export function TrustBadge({ level, className }: { level: VerificationLevel | null | undefined; className?: string }) {
  if (!level) return null;
  const Icon = ICON[level];
  return (
    <span
      title={VERIFICATION_LEVEL_DESCRIPTION[level]}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap font-medium',
        level === 'MODERATOR_VERIFIED' ? 'text-success' : 'text-ink-muted',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {VERIFICATION_LEVEL_LABEL[level]}
    </span>
  );
}

/** Versi halaman detail: label, apa yang sudah diperiksa, dan tautan penjelasan dua tingkat. */
export function TrustNote({ level, className }: { level: VerificationLevel | null | undefined; className?: string }) {
  if (!level) return null;
  const Icon = ICON[level];
  return (
    <p className={cn('flex max-w-[60ch] items-start gap-2 text-[13.5px] leading-relaxed text-ink-soft', className)}>
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', level === 'MODERATOR_VERIFIED' ? 'text-success' : 'text-ink-muted')} />
      <span>
        <strong className={cn('font-semibold', level === 'MODERATOR_VERIFIED' ? 'text-success' : 'text-ink')}>{VERIFICATION_LEVEL_LABEL[level]}.</strong>{' '}
        {VERIFICATION_LEVEL_DESCRIPTION[level]}{' '}
        <Link href={TRUST_EXPLAINER_HREF} className="font-medium text-ink underline underline-offset-[3px]">
          Beda dua label ini
        </Link>
      </span>
    </p>
  );
}
