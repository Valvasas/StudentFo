import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { CelebrationBurst } from '@/components/feedback/celebration-burst';
import { FormAlert } from '@/components/ui/field';
import {
  AUTH_ERROR_MESSAGE,
  AUTH_NOTICE_MESSAGE,
  parseAuthErrorCode,
  parseAuthNoticeCode,
} from '@/lib/auth-messages';
import { celebrationFor } from '@/lib/celebration';
import { emailSchema } from '@/lib/auth-schema';
import type { RawSearchParams } from '@/lib/search-params';

const recoveryLink = 'font-semibold underline underline-offset-[3px]';

/**
 * Menampilkan hasil aksi sebelumnya yang dioper lewat query string.
 *
 * Kode yang tidak dikenal diabaikan diam-diam — URL bisa diketik siapa saja,
 * dan `?error=halo` seharusnya tidak menghasilkan apa pun, apalagi crash.
 */
export function AuthFeedback({ params, loginPath = '/login' }: { params: RawSearchParams; loginPath?: string }) {
  const error = parseAuthErrorCode(params.error);
  const notice = parseAuthNoticeCode(params.notice);

  if (!error && !notice) return null;
  const celebration = error ? null : celebrationFor(notice);

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <FormAlert tone="error">
          {AUTH_ERROR_MESSAGE[error]}
          {error === 'email_taken' && <EmailTakenLinks email={params.email} loginPath={loginPath} />}
        </FormAlert>
      )}
      {notice && <FormAlert tone="notice">{AUTH_NOTICE_MESSAGE[notice]}</FormAlert>}
      {celebration && <CelebrationBurst celebration={celebration} burstKey={randomUUID()} />}
    </div>
  );
}

/**
 * Jalan keluar langsung dari `email_taken`. Alamat hanya diteruskan bila
 * berbentuk email (pola /verify-email): `?email=` bisa diisi siapa saja.
 */
function EmailTakenLinks({ email, loginPath }: { email: RawSearchParams[string]; loginPath: string }) {
  const valid = emailSchema.safeParse(typeof email === 'string' ? email : '').data;
  const withEmail = (path: string) => (valid ? `${path}?email=${encodeURIComponent(valid)}` : path);
  return (
    <>
      {' '}
      <Link href={withEmail(loginPath)} className={recoveryLink}>
        Masuk
      </Link>
      {' · '}
      <Link href={withEmail('/forgot-password')} className={recoveryLink}>
        Lupa kata sandi
      </Link>
    </>
  );
}
