'use client';

import { Check } from 'lucide-react';
import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { PasswordInput } from '@/components/auth/password-input';
import { PASSWORD_MAX_LENGTH } from '@/lib/password-rules';
import { cn } from '@/lib/utils';

type MatchState = 'empty' | 'match' | 'mismatch';

/**
 * Kolom "Ulangi kata sandi". Cocok-tidaknya dicek saat mengetik di KEDUA
 * kolom (mengubah sandi pertama setelah mengisi ulangannya juga dicek), dan
 * ketidakcocokan dipasang sebagai `setCustomValidity` — peramban menahan
 * kiriman dengan pesannya sendiri sebelum CAPTCHA & batas laju terpakai.
 * Tanpa JavaScript kolomnya tetap ada; server yang menolak (`password_mismatch`).
 */
export function ConfirmPasswordInput({
  id,
  matchId,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'aria-describedby'> & { id: string; matchId: string }) {
  const [state, setState] = useState<MatchState>('empty');

  useEffect(() => {
    const own = document.getElementById(id);
    const other = document.getElementById(matchId);
    if (!(own instanceof HTMLInputElement) || !(other instanceof HTMLInputElement)) return;

    const check = () => {
      const mismatch = own.value.length > 0 && own.value !== other.value;
      own.setCustomValidity(mismatch ? 'Kata sandi ini belum sama dengan kolom kata sandi di atas.' : '');
      setState(own.value.length === 0 ? 'empty' : mismatch ? 'mismatch' : 'match');
    };
    check();
    own.addEventListener('input', check);
    other.addEventListener('input', check);
    return () => {
      own.removeEventListener('input', check);
      other.removeEventListener('input', check);
    };
  }, [id, matchId]);

  return (
    <>
      <PasswordInput {...props} id={id} maxLength={PASSWORD_MAX_LENGTH} aria-describedby={`${id}-status`} aria-invalid={state === 'mismatch' || undefined} />
      <p id={`${id}-status`} aria-live="polite" className={cn('min-h-[18px] text-[12.5px] leading-snug', state === 'mismatch' ? 'text-danger' : 'text-ink-muted')}>
        {state === 'match' && (
          <span className="inline-flex items-center gap-1 text-ink">
            <Check aria-hidden className="size-3.5 text-success" strokeWidth={3} />
            Sama dengan kata sandi di atas
          </span>
        )}
        {state === 'mismatch' && 'Belum sama dengan kata sandi di atas.'}
        {state === 'empty' && 'Ketik ulang kata sandi yang sama.'}
      </p>
    </>
  );
}
