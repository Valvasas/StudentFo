import { FormAlert } from '@/components/ui/field';
import {
  ACTION_ERROR_MESSAGE,
  ACTION_NOTICE_MESSAGE,
  parseActionErrorCode,
  parseActionNoticeCode,
} from '@/lib/action-feedback';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';

/**
 * Hasil Server Action non-akun yang dioper lewat query string.
 *
 * Hanya kode dari daftar tertutup yang ditampilkan; `?error=<teks bebas>`
 * tidak menghasilkan apa pun. Pasangan untuk alur akun: `AuthFeedback`.
 */
export function ActionFeedback({ params, className }: { params: RawSearchParams; className?: string }) {
  const error = parseActionErrorCode(params.error);
  const notice = parseActionNoticeCode(params.notice);

  if (!error && !notice) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {error && <FormAlert tone="error">{ACTION_ERROR_MESSAGE[error]}</FormAlert>}
      {notice && <FormAlert tone="notice">{ACTION_NOTICE_MESSAGE[notice]}</FormAlert>}
    </div>
  );
}
