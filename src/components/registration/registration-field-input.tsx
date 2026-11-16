import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { DateInput } from '@/components/ui/date-input';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { ANSWER_INPUT_PATTERN, answerInputName, DEFAULT_SCALE, REGISTRATION_FORM_LIMITS } from '@/lib/registration-form';
import { cn } from '@/lib/utils';
import type { FormField, FormFieldType } from '@/types/domain';
import { RequiredChoiceGroup } from './required-choice-group';

const PHONE_MAX = 21;
const EMAIL_MAX = 254;
/** Lebih ketat dari `type=url` (yang menerima `ftp:` dsb.) — server hanya menerima http(s). */
const URL_PATTERN = 'https?://.+';

/** Pilihan tunggal sebanyak ini masih nyaman sebagai radio; lebih dari itu jadi daftar turun. */
const RADIO_MAX = 6;

const INVALID_MESSAGE: Record<FormFieldType, string> = {
  short_text: `Isi jawaban ini, maksimal ${REGISTRATION_FORM_LIMITS.shortTextMax} karakter.`,
  long_text: `Isi jawaban ini, maksimal ${REGISTRATION_FORM_LIMITS.longTextMax.toLocaleString('id-ID')} karakter.`,
  email: 'Tulis alamat email lengkap, mis. nama@kampus.ac.id.',
  phone: 'Tulis nomor telepon minimal 8 digit, boleh diawali +62.',
  number: 'Tulis angka maksimal 12 digit, koma untuk desimal, mis. 3,5 atau 750.000.',
  date: 'Pilih tanggal yang valid.',
  url: 'Tulis tautan lengkap yang diawali https://.',
  select: 'Pilih salah satu.',
  multi_select: 'Pilih minimal satu dari daftar.',
  checkbox: 'Centang untuk melanjutkan.',
  dropdown: 'Pilih salah satu.',
  time: 'Pilih jam yang valid, mis. 13:30.',
  scale: 'Pilih salah satu angka.',
  section: '',
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
  radioMax = RADIO_MAX,
}: {
  field: FormField;
  invalid?: boolean;
  disabled?: boolean;
  /** Pendataan kinerja (ADR-073) menaikkan ini: satu ketukan lebih cepat daripada membuka daftar turun. */
  radioMax?: number;
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

  // Judul bagian (ADR-092): pemisah tampilan seperti "bagian" Google Form — tanpa isian.
  if (field.type === 'section') {
    return (
      <div className="flex flex-col gap-1 border-t border-line pt-5 first:border-t-0 first:pt-0">
        <h3 className="text-[17px] font-bold leading-snug tracking-[-0.01em] [overflow-wrap:anywhere]">{field.label}</h3>
        {field.help && <p className="text-[14px] leading-snug text-ink-muted">{field.help}</p>}
      </div>
    );
  }

  if (field.type === 'scale') {
    const scale = field.scale ?? DEFAULT_SCALE;
    const values = Array.from({ length: scale.max }, (_, index) => index + 1);
    const endsId = scale.lowLabel || scale.highLabel ? `${id}-ends` : null;
    return (
      <fieldset
        role="radiogroup"
        aria-required={field.required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={[helpId, endsId, errorId].filter(Boolean).join(' ') || undefined}
        className="flex min-w-0 flex-col gap-2"
      >
        <legend className="mb-1 text-[15px] font-semibold leading-snug">
          {field.label}
          {!field.required && <Optional />}
        </legend>
        {help}
        <div className="flex flex-wrap gap-2">
          {values.map((value, index) => (
            <label
              key={value}
              className={cn(
                'relative flex size-11 cursor-pointer items-center justify-center rounded-card border border-line bg-panel text-[15px] font-semibold tabular-nums transition-colors duration-150 ease-snap hover:border-line-strong has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-on-brand has-[:checked]:ring-2 has-[:checked]:ring-brand has-[:checked]:ring-offset-2 has-[:checked]:ring-offset-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                invalid && 'border-danger',
              )}
            >
              <input
                type="radio"
                name={name}
                value={value}
                required={field.required}
                disabled={disabled}
                autoFocus={invalid && index === 0}
                className="sr-only"
              />
              {value}
              {value === 1 && scale.lowLabel && <span className="sr-only">, {scale.lowLabel}</span>}
              {value === scale.max && scale.highLabel && <span className="sr-only">, {scale.highLabel}</span>}
            </label>
          ))}
        </div>
        {endsId && (
          <p id={endsId} className="flex flex-wrap justify-between gap-x-4 text-[13px] text-ink-muted">
            <span>{scale.lowLabel ? `1 = ${scale.lowLabel}` : ''}</span>
            <span>{scale.highLabel ? `${scale.max} = ${scale.highLabel}` : ''}</span>
          </p>
        )}
        {error}
      </fieldset>
    );
  }

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

  if (field.type === 'multi_select' || (field.type === 'select' && field.options.length <= radioMax)) {
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
                // Satu radio ber-`required` mewajibkan seluruh grup; kotak centang lewat `RequiredChoiceGroup`.
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
        {!single && field.required && <RequiredChoiceGroup name={name} message={INVALID_MESSAGE.multi_select} />}
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
        return (
          <TextInput
            {...common}
            type="email"
            autoComplete="email"
            inputMode="email"
            pattern={ANSWER_INPUT_PATTERN.email}
            maxLength={EMAIL_MAX}
            title={INVALID_MESSAGE.email}
          />
        );
      case 'phone':
        return (
          <TextInput
            {...common}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            pattern={ANSWER_INPUT_PATTERN.phone}
            maxLength={PHONE_MAX}
            placeholder="08xx xxxx xxxx"
            title={INVALID_MESSAGE.phone}
          />
        );
      case 'number':
        return (
          <TextInput {...common} inputMode="decimal" pattern={ANSWER_INPUT_PATTERN.number} maxLength={20} title={INVALID_MESSAGE.number} />
        );
      case 'date':
        return <DateInput {...common} className="sm:max-w-[240px]" />;
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
      case 'time':
        return <TextInput {...common} type="time" step={60} className="sm:max-w-[180px]" title={INVALID_MESSAGE.time} />;
      case 'select':
      case 'dropdown':
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
