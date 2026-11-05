import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { signOutAction } from '@/app/auth/actions';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { dataMode } from '@/lib/env';

/**
 * Tombol "Keluar" — satu definisi untuk menu akun, menu samping, dan
 * Pengaturan, supaya ketiganya meminta konfirmasi yang sama (ADR-063).
 *
 * Tetap POST (Server Action), bukan tautan: dengan `<a href="/logout">`,
 * prefetch peramban atau sebuah `<img>` di situs lain sudah cukup untuk
 * mengeluarkan orang dari akunnya.
 *
 * Akun demo hanya hidup di cookie dan tidak bisa dipulihkan (ADR-029), jadi
 * kalimat konfirmasinya berbeda: di sana "keluar" berarti datanya hilang.
 */
export function SignOutForm({
  className,
  buttonClassName,
  title,
  children,
}: {
  className?: string;
  buttonClassName: string;
  title?: string;
  children: ReactNode;
}) {
  const demo = dataMode === 'seed';
  return (
    <form action={signOutAction} className={className}>
      <ConfirmSubmit
        title={title}
        className={buttonClassName}
        confirm={{
          title: demo ? 'Keluar dari akun demo?' : 'Keluar dari StudentFo?',
          description: demo
            ? 'Akun demo hanya tersimpan di perangkat ini. Setelah keluar, isinya hilang dan masuk lagi membuat akun demo baru yang kosong.'
            : 'Papan lamaran, simpanan, dan pengingat tenggatmu tetap aman. Kamu cukup masuk lagi untuk melanjutkan.',
          confirmLabel: 'Ya, keluar',
          tone: demo ? 'danger' : 'neutral',
          icon: <LogOut />,
        }}
      >
        {children}
      </ConfirmSubmit>
    </form>
  );
}
