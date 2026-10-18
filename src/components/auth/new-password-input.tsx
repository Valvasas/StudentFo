'use client';

import { Check } from 'lucide-react';
import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { PasswordInput } from '@/components/auth/password-input';
import {
  assessPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordByteLength,
  type PasswordStrength,
} from '@/lib/password-rules';
import { cn } from '@/lib/utils';

const STRENGTH: Record<Exclude<PasswordStrength, 'empty'>, { label: string; bars: number; tone: string }> = {
  weak: { label: 'Lemah', bars: 1, tone: 'bg-danger' },
  fair: { label: 'Cukup', bars: 2, tone: 'bg-caution' },
  strong: { label: 'Kuat', bars: 3, tone: 'bg-success' },
};

/**
 * Isian kata sandi BARU dengan syarat yang tercentang saat diketik dan
 * indikator kekuatan. Tanpa JavaScript daftar syaratnya tetap tampil sebagai
 * petunjuk statis — validasi sesungguhnya tetap di server (`passwordSchema`).
 */
export function NewPasswordInput({ id, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'aria-describedby'> & { id: string }) {
  const [ready, setReady] = useState(false);
  const [value, setValue] = useState('');
  useEffect(() => setReady(true), []);

  const assessment = assessPassword(value);
  const rules = [
    {
      met: assessment.length,
      // `maxLength` menghitung karakter, batasnya byte: tanpa label ini centang
      // "8+ karakter" hilang begitu saja saat huruf beraksen/emoji melewatinya.
      label: passwordByteLength(value) > PASSWORD_MAX_LENGTH ? 'terlalu panjang' : `${PASSWORD_MIN_LENGTH}+ karakter`,
    },
    { met: assessment.letter, label: 'huruf' },
    { met: assessment.digit, label: 'angka' },
  ];
  const strength = assessment.strength === 'empty' ? null : STRENGTH[assessment.strength];

  return (
    <>
      <PasswordInput
        {...props}
        id={id}
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        aria-describedby={`${id}-rules`}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <ul id={`${id}-rules`} aria-label="Syarat kata sandi" className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
          {rules.map((rule) => {
            const met = ready && rule.met;
            return (
              <li key={rule.label} className={cn('inline-flex items-center gap-1', met && 'text-ink')}>
                {met ? (
                  <Check aria-hidden className="size-3.5 text-success" strokeWidth={3} />
                ) : (
                  <span aria-hidden className="mx-[3px] size-2 rounded-pill border border-line-strong" />
                )}
                {rule.label}
                {met && <span className="sr-only"> (terpenuhi)</span>}
              </li>
            );
          })}
        </ul>
        {ready && strength && (
          <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
            <span aria-hidden className="flex gap-1">
              {[1, 2, 3].map((bar) => (
                <span key={bar} className={cn('h-1 w-5 rounded-pill transition-colors duration-150', bar <= strength.bars ? strength.tone : 'bg-line')} />
              ))}
            </span>
            <span aria-live="polite">{strength.label}</span>
          </span>
        )}
      </div>
    </>
  );
}
