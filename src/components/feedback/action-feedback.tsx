import { randomUUID } from 'node:crypto';
import { CelebrationBurst } from '@/components/feedback/celebration-burst';
import { FormAlert } from '@/components/ui/field';
import {
  ACTION_ERROR_MESSAGE,
  ACTION_NOTICE_MESSAGE,
  parseActionErrorCode,
  parseActionNoticeCode,
} from '@/lib/action-feedback';
import { celebrationFor } from '@/lib/celebration';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';

/**
 * Hasil Server Action non-akun yang dioper lewat query string.
 *
 * Hanya kode dari daftar tertutup yang ditampilkan; `?error=<teks bebas>`
 * tidak menghasilkan apa pun. Pasangan untuk alur akun: `AuthFeedback`.
 *
 * Notice yang ada di daftar perayaan (`lib/celebration.ts`) juga memicu
 * `CelebrationBurst`; kuncinya dibuat baru di setiap render server supaya
 * aksi yang sama dua kali berturut-turut tetap dirayakan dua kali.
 */
export function ActionFeedback({ params, className }: { params: RawSearchParams; className?: string }) {
  const error = parseActionErrorCode(params.error);
  const notice = parseActionNoticeCode(params.notice);

  if (!error && !notice) return null;
  const celebration = error ? null : celebrationFor(notice);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {error && <FormAlert tone="error">{ACTION_ERROR_MESSAGE[error]}</FormAlert>}
      {notice && <FormAlert tone="notice">{ACTION_NOTICE_MESSAGE[notice]}</FormAlert>}
      {celebration && <CelebrationBurst celebration={celebration} burstKey={randomUUID()} />}
    </div>
  );
}
