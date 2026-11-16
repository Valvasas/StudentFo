import { answerFields, DEFAULT_SCALE, isActiveRegistration } from '@/lib/registration-form';
import type { AnswerValue, EventRegistration, FormField } from '@/types/domain';

/**
 * "Ringkasan jawaban" ala Google Form (ADR-092) — agregat per pertanyaan dari
 * pendaftar AKTIF (dibatalkan/ditolak tidak dihitung). Isian yang bersifat
 * identitas (email, telepon, tautan, tanggal, jam) hanya DIHITUNG, tidak
 * dipajang ulang — datanya tetap ada di daftar per orang & CSV.
 */
export interface OptionCount {
  readonly label: string;
  readonly count: number;
  /** 0..1 terhadap yang menjawab pertanyaan ini. */
  readonly share: number;
}

export type QuestionSummary =
  | { readonly kind: 'choice'; readonly field: FormField; readonly answered: number; readonly multiple: boolean; readonly options: readonly OptionCount[]; readonly other: number }
  | { readonly kind: 'consent'; readonly field: FormField; readonly answered: number; readonly yes: number }
  | { readonly kind: 'scale'; readonly field: FormField; readonly answered: number; readonly options: readonly OptionCount[]; readonly mean: number | null }
  | {
      readonly kind: 'number';
      readonly field: FormField;
      readonly answered: number;
      readonly min: number | null;
      readonly max: number | null;
      readonly mean: number | null;
      readonly median: number | null;
    }
  /** Jawaban singkat: dikelompokkan seperti Google Form ("SMAN 1 Bandung" ×5). */
  | { readonly kind: 'grouped'; readonly field: FormField; readonly answered: number; readonly groups: readonly OptionCount[]; readonly more: number }
  /** Paragraf: beberapa jawaban terbaru — mengelompokkan paragraf tidak ada gunanya. */
  | { readonly kind: 'text'; readonly field: FormField; readonly answered: number; readonly samples: readonly string[] }
  | { readonly kind: 'count'; readonly field: FormField; readonly answered: number };

export const SUMMARY_TEXT_SAMPLES = 5;
export const SUMMARY_TEXT_GROUPS = 8;

const share = (count: number, total: number) => (total > 0 ? count / total : 0);

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

const tidy = (value: string) => value.trim().replace(/\s+/g, ' ');

/** "sman 1 bandung", "SMAN 1  Bandung" = satu kelompok; tampil dengan ejaan jawaban terbaru. */
function groupTexts(values: readonly string[]): OptionCount[] {
  const groups = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    const label = tidy(value);
    const key = label.toLocaleLowerCase('id-ID');
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { label, count: 1 });
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'id-ID'))
    .map((group) => ({ ...group, share: share(group.count, values.length) }));
}

/** Terbaru dulu, supaya contoh jawaban & ejaan kelompok yang tampil adalah yang paling baru. */
export function summarizeAnswers(fields: readonly FormField[], registrations: readonly EventRegistration[]): QuestionSummary[] {
  const active = registrations.filter((registration) => isActiveRegistration(registration.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return answerFields(fields).map((field): QuestionSummary => {
    const values = active.map((registration) => registration.answers[field.id]).filter((value): value is AnswerValue => value !== undefined);
    switch (field.type) {
      case 'select':
      case 'dropdown':
      case 'multi_select': {
        const counts = new Map(field.options.map((option) => [option, 0]));
        let other = 0;
        for (const value of values) {
          for (const choice of Array.isArray(value) ? value : [String(value)]) {
            if (counts.has(choice)) counts.set(choice, (counts.get(choice) ?? 0) + 1);
            else other += 1;
          }
        }
        return {
          kind: 'choice',
          field,
          answered: values.length,
          multiple: field.type === 'multi_select',
          options: [...counts].map(([label, count]) => ({ label, count, share: share(count, values.length) })),
          // Pilihan yang sudah dihapus/diganti nama dari formulir: tidak hilang diam-diam dari total.
          other,
        };
      }
      case 'checkbox':
        return { kind: 'consent', field, answered: values.length, yes: values.filter((value) => value === true).length };
      case 'scale': {
        const max = field.scale?.max ?? DEFAULT_SCALE.max;
        const numbers = values.filter((value): value is number => typeof value === 'number' && value >= 1 && value <= max);
        return {
          kind: 'scale',
          field,
          answered: numbers.length,
          options: Array.from({ length: max }, (_, index) => {
            const count = numbers.filter((value) => value === index + 1).length;
            return { label: String(index + 1), count, share: share(count, numbers.length) };
          }),
          mean: mean(numbers),
        };
      }
      case 'number': {
        const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        return {
          kind: 'number',
          field,
          answered: numbers.length,
          min: numbers.length ? Math.min(...numbers) : null,
          max: numbers.length ? Math.max(...numbers) : null,
          mean: mean(numbers),
          median: median(numbers),
        };
      }
      case 'short_text': {
        const texts = values.filter((value): value is string => typeof value === 'string' && value.trim() !== '');
        const groups = groupTexts(texts);
        return { kind: 'grouped', field, answered: texts.length, groups: groups.slice(0, SUMMARY_TEXT_GROUPS), more: Math.max(0, groups.length - SUMMARY_TEXT_GROUPS) };
      }
      case 'long_text': {
        const texts = values.filter((value): value is string => typeof value === 'string' && value.trim() !== '');
        return { kind: 'text', field, answered: texts.length, samples: texts.slice(0, SUMMARY_TEXT_SAMPLES) };
      }
      default:
        return { kind: 'count', field, answered: values.length };
    }
  });
}
