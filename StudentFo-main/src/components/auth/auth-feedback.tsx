import { FormAlert } from '@/components/ui/field';
import {
  AUTH_ERROR_MESSAGE,
  AUTH_NOTICE_MESSAGE,
  parseAuthErrorCode,
  parseAuthNoticeCode,
} from '@/lib/auth-messages';
import type { RawSearchParams } from '@/lib/search-params';

/**
 * Menampilkan hasil aksi sebelumnya yang dioper lewat query string.
 *
 * Kode yang tidak dikenal diabaikan diam-diam — URL bisa diketik siapa saja,
 * dan `?error=halo` seharusnya tidak menghasilkan apa pun, apalagi crash.
 */
export function AuthFeedback({ params }: { params: RawSearchParams }) {
  const error = parseAuthErrorCode(params.error);
  const notice = parseAuthNoticeCode(params.notice);

  if (!error && !notice) return null;

  return (
    <div className="flex flex-col gap-2">
      {error && <FormAlert tone="error">{AUTH_ERROR_MESSAGE[error]}</FormAlert>}
      {notice && <FormAlert tone="notice">{AUTH_NOTICE_MESSAGE[notice]}</FormAlert>}
    </div>
  );
}
