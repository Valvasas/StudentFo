import { z } from 'zod';
import { formText, formTrimmed } from '@/lib/form-data';
import { cleanText, formFieldsSchema, parseStoredFields, readAnswers } from '@/lib/registration-form';
import { isRegionCode, provinceName, regionLabel } from '@/lib/wilayah';
import {
  EDUCATION_LEVELS,
  SURVEY_ASK_MODES,
  type AnswerValue,
  type EducationLevel,
  type FormField,
  type FormFieldType,
  type OutboundSurveyConfig,
  type OutboundSurveyRecord,
  type SurveyAskMode,
} from '@/types/domain';

/**
 * Pendataan kinerja postingan (ADR-070, ADR-073) — logika murni.
 *
 * Sebelum keluar ke tautan pendaftaran resmi, pengunjung menjawab beberapa
 * pertanyaan yang disusun admin — atau menekan "Lewati". Jawabannya TIDAK
 * membawa identitas (tanpa user_id, tanpa email) dan tidak pernah dibaca
 * penyelenggara. Pertanyaan tambahan memakai `FormField` & `readAnswers()`
 * formulir pendaftaran (ADR-056), jadi validasinya satu sumber.
 */

export const OUTBOUND_LIMITS = {
  institutionMin: 2,
  institutionMax: 120,
  /** Bucket di bawah ini digabung — angka kecil bisa menunjuk satu orang (pola k-anonim ADR-043). */
  minBucket: 5,
  /** Cookie "sudah menjawab" menyimpan sebanyak ini acara terakhir. */
  rememberedEvents: 40,
  /** Layar ini berdiri di antara orang dan pendaftarannya: lebih dari 8 pertanyaan = orang menekan Lewati. */
  maxQuestions: 8,
} as const;

/**
 * Jenis yang boleh untuk pertanyaan tambahan. Tanpa email/telepon/tautan/
 * tanggal/paragraf: jawabannya harus bisa dihitung di dasbor dan tidak
 * mengundang data pribadi — janji "tanpa identitas" di layar pendataan.
 */
export const OUTBOUND_QUESTION_TYPES = ['select', 'multi_select', 'short_text', 'number'] as const satisfies readonly FormFieldType[];

export function isOutboundQuestionType(type: FormFieldType): boolean {
  return (OUTBOUND_QUESTION_TYPES as readonly FormFieldType[]).includes(type);
}

/**
 * Bawaan = isi baris tunggal di migration 20261108100002 (dikunci
 * `outbound-survey.test.ts` lewat `supabase/tests/110_*`). Mode memori dan
 * database yang belum dimigrasi memakai ini juga.
 */
export const DEFAULT_OUTBOUND_CONFIG: OutboundSurveyConfig = {
  askEducation: 'REQUIRED',
  askRegion: 'OPTIONAL',
  askInstitution: 'OPTIONAL',
  questions: [
    {
      id: 'f_sumber',
      type: 'select',
      label: 'Dari mana kamu tahu info ini?',
      help: null,
      required: true,
      options: ['Instagram', 'TikTok', 'Grup WhatsApp / Telegram', 'Teman, guru, atau dosen', 'Pencarian Google', 'Jelajah di StudentFo', 'Lainnya'],
    },
    {
      id: 'f_rencana',
      type: 'select',
      label: 'Rencanamu untuk acara ini?',
      help: null,
      required: false,
      options: ['Ikut sendiri', 'Bersama tim yang sudah ada', 'Masih mencari tim atau partner', 'Baru lihat-lihat'],
    },
  ],
  updatedAt: null,
};

export function isAskMode(value: unknown): value is SurveyAskMode {
  return typeof value === 'string' && (SURVEY_ASK_MODES as readonly string[]).includes(value);
}

/** Tidak ada yang ditanyakan sama sekali = layar pendataan dilewati otomatis. */
export function isSurveyEmpty(config: OutboundSurveyConfig): boolean {
  return config.askEducation === 'OFF' && config.askRegion === 'OFF' && config.askInstitution === 'OFF' && config.questions.length === 0;
}

/** Jumlah pertanyaan yang tampil — untuk kalimat "N pertanyaan, sekitar M detik". */
export function surveyQuestionCount(config: OutboundSurveyConfig): number {
  return [config.askEducation, config.askRegion, config.askInstitution].filter((mode) => mode !== 'OFF').length + config.questions.length;
}

/** Baris tersimpan → konfigurasi; pertanyaan rusak/berjenis terlarang dibuang, mode asing = bawaan. */
export function parseStoredOutboundConfig(row: {
  askEducation: unknown;
  askRegion: unknown;
  askInstitution: unknown;
  questions: unknown;
  updatedAt: string | null;
}): OutboundSurveyConfig {
  return {
    askEducation: isAskMode(row.askEducation) ? row.askEducation : DEFAULT_OUTBOUND_CONFIG.askEducation,
    askRegion: isAskMode(row.askRegion) ? row.askRegion : DEFAULT_OUTBOUND_CONFIG.askRegion,
    askInstitution: isAskMode(row.askInstitution) ? row.askInstitution : DEFAULT_OUTBOUND_CONFIG.askInstitution,
    questions: parseStoredFields(row.questions)
      .filter((field) => isOutboundQuestionType(field.type))
      .slice(0, OUTBOUND_LIMITS.maxQuestions),
    updatedAt: row.updatedAt,
  };
}

export type OutboundConfigInput = Omit<OutboundSurveyConfig, 'updatedAt'>;

/** Isian editor admin. Pertanyaan datang sebagai JSON dari `FormBuilder`, pola formulir pendaftaran. */
export function parseOutboundConfigInput(formData: FormData): { ok: true; value: OutboundConfigInput } | { ok: false } {
  const modes = ['askEducation', 'askRegion', 'askInstitution'].map((name) => formText(formData, name));
  if (!modes.every(isAskMode)) return { ok: false };
  let raw: unknown;
  try {
    raw = JSON.parse(formText(formData, 'fields') || '[]');
  } catch {
    return { ok: false };
  }
  const fields = formFieldsSchema.safeParse(raw);
  if (!fields.success || fields.data.length > OUTBOUND_LIMITS.maxQuestions) return { ok: false };
  if (fields.data.some((field) => !isOutboundQuestionType(field.type))) return { ok: false };
  const [askEducation, askRegion, askInstitution] = modes as [SurveyAskMode, SurveyAskMode, SurveyAskMode];
  return { ok: true, value: { askEducation, askRegion, askInstitution, questions: fields.data } };
}

export interface OutboundSurveyAnswers {
  readonly educationLevel: EducationLevel | null;
  readonly regionCode: string | null;
  readonly institutionId: string | null;
  readonly institution: string | null;
  readonly answers: Readonly<Record<string, AnswerValue>>;
}

export const SKIPPED_ANSWERS: OutboundSurveyAnswers = { educationLevel: null, regionCode: null, institutionId: null, institution: null, answers: {} };

const institutionText = z
  .string()
  .transform((value) => cleanText(value).replace(/\s+/g, ' '))
  .pipe(z.string().max(OUTBOUND_LIMITS.institutionMax));

export type OutboundAnswerProblem = 'educationLevel' | 'region' | 'institution' | `field:${string}`;

/**
 * Validasi jawaban terhadap konfigurasi SAAT INI. `resolveInstitution`
 * menerjemahkan id direktori ke nama resminya — nama dari peramban tidak
 * dipercaya bila id-nya ada; id yang tidak dikenal ditolak.
 */
export function parseOutboundAnswers(
  formData: FormData,
  config: OutboundSurveyConfig,
  resolveInstitution: (id: string) => string | null,
): { ok: true; value: OutboundSurveyAnswers } | { ok: false; problem: OutboundAnswerProblem } {
  let educationLevel: EducationLevel | null = null;
  if (config.askEducation !== 'OFF') {
    const raw = formText(formData, 'educationLevel');
    if (raw && !(EDUCATION_LEVELS as readonly string[]).includes(raw)) return { ok: false, problem: 'educationLevel' };
    if (!raw && config.askEducation === 'REQUIRED') return { ok: false, problem: 'educationLevel' };
    educationLevel = (raw || null) as EducationLevel | null;
  }

  let regionCode: string | null = null;
  if (config.askRegion !== 'OFF') {
    // Pendataan berhenti di kab/kota: kecamatan tidak menambah apa pun untuk menilai postingan.
    const raw = formTrimmed(formData, 'region').slice(0, 5);
    if (raw && !isRegionCode(raw)) return { ok: false, problem: 'region' };
    if (!raw && config.askRegion === 'REQUIRED') return { ok: false, problem: 'region' };
    regionCode = raw || null;
  }

  let institutionId: string | null = null;
  let institution: string | null = null;
  if (config.askInstitution !== 'OFF') {
    const id = formTrimmed(formData, 'institutionId');
    if (id) {
      const name = resolveInstitution(id);
      if (!name) return { ok: false, problem: 'institution' };
      institutionId = id;
      institution = name;
    } else {
      const text = institutionText.safeParse(formText(formData, 'institution'));
      if (!text.success || (text.data !== '' && text.data.length < OUTBOUND_LIMITS.institutionMin)) return { ok: false, problem: 'institution' };
      institution = text.data || null;
    }
    if (!institution && config.askInstitution === 'REQUIRED') return { ok: false, problem: 'institution' };
  }

  const answers = readAnswers(config.questions, formData);
  if (!answers.ok) return { ok: false, problem: `field:${answers.fieldId}` };
  return { ok: true, value: { educationLevel, regionCode, institutionId, institution, answers: answers.answers } };
}

/**
 * Isi cookie "sudah menjawab": id acara dipisah koma. Cookie bisa diubah
 * siapa pun — memalsukannya hanya melewati survei untuk diri sendiri, jadi
 * cukup dibersihkan, bukan ditandatangani. Bentuk id dibatasi supaya isi
 * aneh tidak ikut ditulis ulang.
 */
export function parseAnsweredEvents(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  const ids = raw.split(',').filter((id) => /^[a-z0-9-]{1,64}$/i.test(id));
  return [...new Set(ids)].slice(-OUTBOUND_LIMITS.rememberedEvents);
}

export function withAnsweredEvent(raw: string | undefined, eventId: string): string {
  const ids = parseAnsweredEvents(raw).filter((id) => id !== eventId);
  return [...ids, eventId].slice(-OUTBOUND_LIMITS.rememberedEvents).join(',');
}

export interface CountRow<K extends string = string> {
  readonly key: K;
  readonly count: number;
}

export interface OutboundEventSummary {
  readonly eventId: string;
  readonly eventTitle: string | null;
  readonly eventSlug: string | null;
  /** Semua yang sampai ke layar pendataan lalu lanjut (menjawab + melewati). */
  readonly visits: number;
  readonly skipped: number;
  readonly signedIn: number;
}

export type QuestionSummary =
  | { readonly field: FormField; readonly kind: 'choice'; readonly answered: number; readonly rows: readonly CountRow[] }
  | { readonly field: FormField; readonly kind: 'number'; readonly answered: number; readonly mean: number | null; readonly median: number | null; readonly min: number | null; readonly max: number | null }
  | { readonly field: FormField; readonly kind: 'text'; readonly answered: number; readonly rows: readonly CountRow[]; readonly hidden: number };

export interface OutboundSurveySummary {
  readonly visits: number;
  readonly answered: number;
  readonly skipped: number;
  readonly signedIn: number;
  readonly byLevel: readonly CountRow<EducationLevel>[];
  /** Bucket < `minBucket` digabung ke `hidden…` — tidak ditampilkan per nama. */
  readonly provinces: readonly CountRow[];
  readonly hiddenProvinces: number;
  readonly regencies: readonly CountRow[];
  readonly hiddenRegencies: number;
  readonly institutions: readonly CountRow[];
  readonly hiddenInstitutions: number;
  readonly questions: readonly QuestionSummary[];
  readonly events: readonly OutboundEventSummary[];
}

function tally<K extends string>(values: readonly K[]): CountRow<K>[] {
  const counts = new Map<K, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function anonymized(values: readonly string[], minBucket: number): { rows: CountRow[]; hidden: number } {
  const rows = tally(values);
  return { rows: rows.filter((row) => row.count >= minBucket), hidden: rows.reduce((sum, row) => sum + (row.count >= minBucket ? 0 : row.count), 0) };
}

/** Teks diketik bebas: "UI", "ui ", "Ui" dihitung sama. */
function textKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('id-ID');
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function summarizeQuestion(field: FormField, values: readonly AnswerValue[], minBucket: number): QuestionSummary {
  if (field.type === 'number') {
    const numbers = values.filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
    return {
      field,
      kind: 'number',
      answered: numbers.length,
      mean: numbers.length ? Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10 : null,
      median: median(numbers),
      min: numbers[0] ?? null,
      max: numbers.at(-1) ?? null,
    };
  }
  if (field.type === 'short_text') {
    const texts = values.filter((value): value is string => typeof value === 'string').map(textKey);
    const { rows, hidden } = anonymized(texts, minBucket);
    return { field, kind: 'text', answered: texts.length, rows, hidden };
  }
  // Pilihan yang sudah dihapus admin tetap dihitung apa adanya: jawaban lama tidak ditulis ulang.
  const chosen = values.flatMap((value) => (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []));
  const counts = tally(chosen);
  const ordered = [...field.options.map((option) => ({ key: option, count: counts.find((row) => row.key === option)?.count ?? 0 })), ...counts.filter((row) => !field.options.includes(row.key))];
  return { field, kind: 'choice', answered: values.length, rows: ordered };
}

/**
 * Ringkasan dasbor terhadap pertanyaan SAAT INI. Jawaban untuk pertanyaan
 * yang sudah dihapus tidak ditampilkan (tetap tersimpan sampai retensi).
 */
export function summarizeOutboundSurveys(
  records: readonly OutboundSurveyRecord[],
  config: OutboundSurveyConfig,
  minBucket: number = OUTBOUND_LIMITS.minBucket,
): OutboundSurveySummary {
  const answered = records.filter((record) => !record.skipped);
  const provinces = anonymized(answered.flatMap((record) => (record.regionCode ? [provinceName(record.regionCode) ?? record.regionCode.slice(0, 2)] : [])), minBucket);
  const regencies = anonymized(
    answered.flatMap((record) => (record.regionCode && record.regionCode.length === 5 ? [regionLabel(record.regionCode) ?? record.regionCode] : [])),
    minBucket,
  );
  const institutions = anonymized(answered.flatMap((record) => (record.institution ? [textKey(record.institution)] : [])), minBucket);

  const perEvent = new Map<string, OutboundSurveyRecord[]>();
  for (const record of records) perEvent.set(record.eventId, [...(perEvent.get(record.eventId) ?? []), record]);
  const events = [...perEvent.entries()]
    .map(([eventId, rows]): OutboundEventSummary => ({
      eventId,
      eventTitle: rows[0]?.eventTitle ?? null,
      eventSlug: rows[0]?.eventSlug ?? null,
      visits: rows.length,
      skipped: rows.filter((row) => row.skipped).length,
      signedIn: rows.filter((row) => row.signedIn).length,
    }))
    .sort((a, b) => b.visits - a.visits || (a.eventTitle ?? '').localeCompare(b.eventTitle ?? ''));

  return {
    visits: records.length,
    answered: answered.length,
    skipped: records.length - answered.length,
    signedIn: records.filter((record) => record.signedIn).length,
    byLevel: tally(answered.flatMap((record) => (record.educationLevel ? [record.educationLevel] : []))),
    provinces: provinces.rows,
    hiddenProvinces: provinces.hidden,
    regencies: regencies.rows,
    hiddenRegencies: regencies.hidden,
    institutions: institutions.rows,
    hiddenInstitutions: institutions.hidden,
    questions: config.questions.map((field) =>
      summarizeQuestion(
        field,
        answered.flatMap((record) => (record.answers[field.id] === undefined ? [] : [record.answers[field.id]!])),
        minBucket,
      ),
    ),
    events,
  };
}

/** Rentang dasbor admin dari `?rentang=` — daftar tertutup, bawaan 30 hari. */
export const OUTBOUND_RANGES = [7, 30, 90] as const;
export type OutboundRange = (typeof OUTBOUND_RANGES)[number];

export function parseOutboundRange(value: unknown): OutboundRange {
  const raw = Number(Array.isArray(value) ? value[0] : value);
  return (OUTBOUND_RANGES as readonly number[]).includes(raw) ? (raw as OutboundRange) : 30;
}
