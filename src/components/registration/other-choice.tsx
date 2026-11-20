'use client';

import { useEffect, useRef } from 'react';
import { OTHER_CHOICE_VALUE } from '@/lib/registration-form';
import { cn } from '@/lib/utils';

/**
 * Pilihan "Lainnya: ____" ala Google Form (ADR-094). Mengetik di isian ikut
 * mencentang pilihannya, dan pilihan yang dicentang tanpa isian ditahan
 * peramban — keduanya hanya kenyamanan: tanpa JavaScript server tetap
 * menolak "Lainnya" yang kosong.
 */
export function OtherChoice({
  name,
  textName,
  single,
  required,
  disabled,
  invalid,
  maxLength,
  id,
}: {
  name: string;
  textName: string;
  single: boolean;
  required: boolean;
  disabled: boolean;
  invalid: boolean;
  maxLength: number;
  id: string;
}) {
  const choice = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLInputElement>(null);

  const sync = () => {
    const box = choice.current;
    const input = text.current;
    if (!box || !input) return;
    input.setCustomValidity(box.checked && input.value.trim() === '' ? 'Tulis pilihanmu di kotak “Lainnya”.' : '');
  };

  // Memilih opsi lain di grup yang sama tidak memicu `change` pada "Lainnya" — dengarkan seluruh grup.
  useEffect(() => {
    const form = choice.current?.form;
    if (!form) return;
    const onChange = (event: Event) => {
      if (event.target instanceof HTMLInputElement && event.target.name === name) sync();
    };
    form.addEventListener('change', onChange);
    return () => form.removeEventListener('change', onChange);
  }, [name]);

  return (
    <div className={cn('choice w-full flex-wrap gap-y-2', invalid && 'border-danger')}>
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          ref={choice}
          type={single ? 'radio' : 'checkbox'}
          name={name}
          value={OTHER_CHOICE_VALUE}
          required={single && required}
          disabled={disabled}
          onChange={sync}
          className="check"
        />
        Lainnya:
      </label>
      <label htmlFor={id} className="sr-only">
        Tulis pilihan lainnya
      </label>
      <input
        ref={text}
        id={id}
        name={textName}
        maxLength={maxLength}
        disabled={disabled}
        autoComplete="off"
        onInput={(event) => {
          const box = choice.current;
          if (box && event.currentTarget.value.trim() !== '' && !box.checked) {
            box.checked = true;
            box.dispatchEvent(new Event('change', { bubbles: true }));
          }
          sync();
        }}
        className="min-h-11 min-w-0 flex-1 basis-40 border-b border-line-strong bg-transparent px-1 text-[15px] focus-visible:border-brand focus-visible:outline-none"
      />
    </div>
  );
}
