import { z } from 'zod';
import { formText } from '@/lib/form-data';
import { REGIONS } from '@/lib/regions';
import {
  EDUCATION_LEVELS,
  OUTBOUND_PLANS,
  OUTBOUND_SOURCES,
  type EducationLevel,
  type EventType,
  type OutboundPlan,
  type OutboundSource,
  type OutboundSurveyRecord,
} from '@/types/domain';

/**
 * Pendataan kinerja postingan (ADR-070) — logika murni.
 *
 * Sebelum keluar ke tautan pendaftaran resmi, pengunjung menjawab 3–5
 * pertanyaan singkat untuk pemilik StudentFo: siapa yang benar-benar menuju
 * pendaftaran dan dari mana mereka tahu. Jawabannya TIDAK membawa identitas
 * (tanpa user_id, tanpa email) dan tidak pernah dibaca penyelenggara.
 */

export const OUTBOUND_LIMITS = {
  institutionMin: 2,
  institutionMax: 120,
  /** Bucket provinsi/institusi di bawah ini digabung — angka kecil bisa menunjuk satu orang (pola k-anonim ADR-043). */
  minBucket: 5,
  /** Cookie "sudah menjawab" menyimpan sebanyak ini acara terakhir. */
  rememberedEvents: 40,
} as const;

export const PROVINCES: readonly string[] = REGIONS.map(([province]) => province);

/** Pertanyaan rencana hanya untuk lomba (lihat `OUTBOUND_PLANS`). */
export function asksPlan(eventType: EventType): boolean {
  return eventType === 'LOMBA';
}

const optionalText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ' '))
    .pipe(z.union([z.literal('').transform(() => null), z.string().min(min).max(max)]));

export function outboundSurveySchema(eventType: EventType) {
  return z.object({
    educationLevel: z.enum(EDUCATION_LEVELS),
    source: z.enum(OUTBOUND_SOURCES),
    plan: asksPlan(eventType) ? z.enum(OUTBOUND_PLANS) : z.literal('').transform(() => null),
    province: z.union([z.literal('').transform(() => null), z.string().refine((value) => PROVINCES.includes(value))]),
    institution: optionalText(OUTBOUND_LIMITS.institutionMin, OUTBOUND_LIMITS.institutionMax),
  });
}

export interface OutboundSurveyAnswers {
  readonly educationLevel: EducationLevel;
  readonly source: OutboundSource;
  readonly plan: OutboundPlan | null;
  readonly province: string | null;
  readonly institution: string | null;
}

export function parseOutboundSurvey(formData: FormData, eventType: EventType) {
  return outboundSurveySchema(eventType).safeParse({
    educationLevel: formText(formData, 'educationLevel'),
    source: formText(formData, 'source'),
    plan: asksPlan(eventType) ? formText(formData, 'plan') : '',
    province: formText(formData, 'province'),
    institution: formText(formData, 'institution'),
  });
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

export interface CountRow<K extends string> {
  readonly key: K;
  readonly count: number;
}

export interface OutboundEventSummary {
  readonly eventId: string;
  readonly eventTitle: string | null;
  readonly eventSlug: string | null;
  readonly responses: number;
  readonly signedIn: number;
  readonly topSource: OutboundSource | null;
  readonly lookingForTeam: number;
}

export interface OutboundSurveySummary {
  readonly total: number;
  readonly signedIn: number;
  readonly bySource: readonly CountRow<OutboundSource>[];
  readonly byLevel: readonly CountRow<EducationLevel>[];
  readonly byPlan: readonly CountRow<OutboundPlan>[];
  /** Bucket < `minBucket` digabung ke `hiddenProvinces` — tidak ditampilkan per nama. */
  readonly provinces: readonly CountRow<string>[];
  readonly hiddenProvinces: number;
  readonly institutions: readonly CountRow<string>[];
  readonly hiddenInstitutions: number;
  readonly events: readonly OutboundEventSummary[];
}

function tally<K extends string>(values: readonly K[]): CountRow<K>[] {
  const counts = new Map<K, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function anonymized(values: readonly string[], minBucket: number): { rows: CountRow<string>[]; hidden: number } {
  const rows = tally(values);
  const shown = rows.filter((row) => row.count >= minBucket);
  return { rows: shown, hidden: rows.reduce((sum, row) => sum + (row.count >= minBucket ? 0 : row.count), 0) };
}

/** Nama institusi diketik bebas: "UI", "ui ", "Ui" dihitung sama. */
function institutionKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('id-ID');
}

export function summarizeOutboundSurveys(records: readonly OutboundSurveyRecord[], minBucket: number = OUTBOUND_LIMITS.minBucket): OutboundSurveySummary {
  const provinces = anonymized(
    records.flatMap((record) => (record.province ? [record.province] : [])),
    minBucket,
  );
  const institutions = anonymized(
    records.flatMap((record) => (record.institution ? [institutionKey(record.institution)] : [])),
    minBucket,
  );

  const perEvent = new Map<string, OutboundSurveyRecord[]>();
  for (const record of records) perEvent.set(record.eventId, [...(perEvent.get(record.eventId) ?? []), record]);

  const events = [...perEvent.entries()]
    .map(([eventId, rows]): OutboundEventSummary => ({
      eventId,
      eventTitle: rows[0]?.eventTitle ?? null,
      eventSlug: rows[0]?.eventSlug ?? null,
      responses: rows.length,
      signedIn: rows.filter((row) => row.signedIn).length,
      topSource: tally(rows.map((row) => row.source))[0]?.key ?? null,
      lookingForTeam: rows.filter((row) => row.plan === 'CARI_TIM').length,
    }))
    .sort((a, b) => b.responses - a.responses || (a.eventTitle ?? '').localeCompare(b.eventTitle ?? ''));

  return {
    total: records.length,
    signedIn: records.filter((record) => record.signedIn).length,
    bySource: tally(records.map((record) => record.source)),
    byLevel: tally(records.map((record) => record.educationLevel)),
    byPlan: tally(records.flatMap((record) => (record.plan ? [record.plan] : []))),
    provinces: provinces.rows,
    hiddenProvinces: provinces.hidden,
    institutions: institutions.rows,
    hiddenInstitutions: institutions.hidden,
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
