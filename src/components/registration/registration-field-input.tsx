import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { answerInputName, REGISTRATION_FORM_LIMITS } from '@/lib/registration-form';
import { cn } from '@/lib/utils';
import type { FormField, FormFieldType } from '@/types/domain';

/**
 * Pola atribut `pattern` = `PHONE` di `readAnswers()`. Peramban mengompilasi
 * `pattern` dengan flag `v`, yang mewajibkan `-` di dalam kelas karakter
 * di-escape — tanpa itu polanya tidak sah dan diam-diam tidak diperiksa.
 */
const PHONE_PATTERN = String.raw`\+?[0-9][0-9\s\-]{6,18}[0-9]`;
const PHONE_MAX = 21;
const NUMBER_PATTERN = String.raw`-?[0-9]+([.,][0-9]+)?`;
const EMAIL_MAX = 254;
/** Lebih ketat dari `type=url` (yang menerima `ftp:` dsb.) — server hanya menerima http(s). */
const URL_PATTERN = 'https?://.+';

/** Pilihan tunggal sebanyak ini masih nyaman sebagai radio; lebih dari itu jadi daftar turun. */
const RADIO_MAX = 6;

const INVALID_MESSAGE: Record<FormFieldType, string> = {
  short_text: `Isi jawaban ini, maksimal ${REGISTRATION_FORM_LIMITS.shortTextMax} karakter.`,
  long_text: `Isi jawaban ini, maksimal ${REGISTRATION_FORM_LIMITS.longTextMax.toLocaleString('id-ID')} karakter.`,
  email: 'Tulis alamat email yang valid, mis. nama@contoh.com.',
  phone: 'Tulis nomor telepon minimal 8 digit, boleh diawali +62.',
  number: 'Tulis angka, mis. 3 atau 3,5.',
  date: 'Pilih tanggal yang valid.',
  url: 'Tulis tautan lengkap yang diawali https://.',
  select: 'Pilih salah satu.',
  multi_select: 'Pilih minimal satu dari daftar.',
  checkbox: 'Centang untuk melanjutkan.',
};

export function fieldInputId(field: Pick<FormField, 'id'>): string {
  return `q-${field.id}`;
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-[13px] font-medium leading-snug text-danger">
      <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
      {children}
    </p>
  );
}

function Optional() {
  return <span className="font-normal text-ink-muted"> (opsional)</span>;
}

/**
 * Satu pertanyaan formulir pendaftaran (ADR-056). Atribut HTML (`required`,
 * `maxLength`, `pattern`, `type`) mencerminkan `readAnswers()` supaya
 * kesalahan tertangkap peramban sebelum dikirim — pengalihan galat dari
 * server mengosongkan semua isian, jadi lapis peramban yang menjaga orang
 * dari mengetik ulang. Server tetap memeriksa ulang semuanya.
 */
export function RegistrationFieldInput({
  field,
  invalid = false,
  disabled = false,
}: {
  field: FormField;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const id = fieldInputId(field);
  const name = answerInputName(field);
  const helpId = field.help ? `${id}-help` : null;
  const errorId = invalid ? `${id}-error` : null;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const help = field.help && (
    <p id={helpId ?? undefined} className="text-[13px] leading-snug text-ink-muted">
      {field.help}
    </p>
  );
  const error = errorId && <FieldError id={errorId}>{INVALID_MESSAGE[field.type]}</FieldError>;

  if (field.type === 'checkbox') {
    return (
      <div className="flex flex-col gap-1.5">
        <label
          className={cn(
            'flex min-h-11 cursor-pointer items-start gap-3 rounded-card border border-line bg-panel px-3.5 py-3 text-[15px] leading-snug',
            invalid && 'border-danger',
          )}
        >
          <input
            id={id}
            type="checkbox"
            name={name}
            required={field.required}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            autoFocus={invalid}
            className="check mt-0.5"
          />
          <span>
            {field.label}
            {!field.required && <Optional />}
          </span>
        </label>
        {help}
        {error}
      </div>
    );
  }

  if (field.type === 'multi_select' || (field.type === 'select' && field.options.length <= RADIO_MAX)) {
    const single = field.type === 'select';
    return (
      <fieldset
        role={single ? 'radiogroup' : undefined}
        aria-required={single && field.required ? true : undefined}
        aria-invalid={single && invalid ? true : undefined}
        aria-describedby={describedBy}
        className="flex min-w-0 flex-col gap-2"
      >
        <legend className="mb-1 text-[15px] font-semibold leading-snug">
          {field.label}
          {!field.required && <Optional />}
        </legend>
        {help}
        <div className="flex flex-col gap-2">
          {field.options.map((option, index) => (
            <label key={option} className={cn('choice w-full', invalid && 'border-danger')}>
              <input
                type={single ? 'radio' : 'checkbox'}
                name={name}
                value={option}
                // Satu radio ber-`required` mewajibkan seluruh grup; kotak centang tidak punya padanan itu di HTML.
                required={single && field.required}
                disabled={disabled}
                aria-invalid={!single && invalid ? true : undefined}
                autoFocus={invalid && index === 0}
                className="check"
              />
              {option}
            </label>
          ))}
        </div>
        {!single && field.required && !invalid && <p className="text-[13px] text-ink-muted">Pilih minimal satu.</p>}
        {error}
      </fieldset>
    );
  }

  const common = {
    id,
    name,
    required: field.required,
    disabled,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    autoFocus: invalid,
  };

  const control = (() => {
    switch (field.type) {
      case 'long_text':
        return <TextArea {...common} rows={4} maxLength={REGISTRATION_FORM_LIMITS.longTextMax} />;
      case 'email':
        return <TextInput {...common} type="email" autoComplete="email" inputMode="email" maxLength={EMAIL_MAX} />;
      case 'phone':
        return (
          <TextInput
            {...common}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            pattern={PHONE_PATTERN}
            maxLength={PHONE_MAX}
            placeholder="08xx xxxx xxxx"
            title={INVALID_MESSAGE.phone}
          />
        );
      case 'number':
        return <TextInput {...common} inputMode="decimal" pattern={NUMBER_PATTERN} maxLength={20} title={INVALID_MESSAGE.number} />;
      case 'date':
        return <TextInput {...common} type="date" className="sm:max-w-[240px]" />;
      case 'url':
        return (
          <TextInput
            {...common}
            type="url"
            inputMode="url"
            pattern={URL_PATTERN}
            maxLength={REGISTRATION_FORM_LIMITS.urlMax}
            placeholder="https://"
            title={INVALID_MESSAGE.url}
          />
        );
      case 'select':
        return (
          <SelectInput {...common} defaultValue="">
            {/* Kolom opsional harus bisa dikosongkan lagi setelah sempat dipilih. */}
            <option value="" disabled={field.required}>
              Pilih…
            </option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectInput>
        );
      default:
        return <TextInput {...common} maxLength={REGISTRATION_FORM_LIMITS.shortTextMax} />;
    }
  })();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold leading-snug">
        {field.label}
        {!field.required && <Optional />}
      </label>
      {help}
      {control}
      {error}
    </div>
  );
}
