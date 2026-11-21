import { z } from 'zod';
import { DEADLINE_LABEL_TEXT, EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, type DeadlineLabel, type EventDetail } from '@/types/domain';
import { formatDateId, formatTimeId } from '@/lib/deadline';

/**
 * Poster & slide penjelas buatan server (ADR-095). Daftar templat HARUS sama
 * dengan `stage_event_media()` di migration 20261121100001 (dikunci tes).
 *
 * Isi slide boleh ditulis kurator di `spec` (mis. syarat yang hanya ada di
 * panduan resmi); yang kosong diturunkan dari data kegiatan itu sendiri —
 * pipeline cukup meminta templatnya, tanpa mengarang teks.
 */
export const MEDIA_TEMPLATES = ['poster', 'syarat', 'jadwal', 'cara-daftar'] as const;
export type MediaTemplate = (typeof MEDIA_TEMPLATES)[number];

/** Cermin CHECK `position BETWEEN 0 AND 7`. */
export const MEDIA_IMPORTS_PER_EVENT = 8;

const line = z.string().trim().min(1).max(90);

export const mediaSpecSchema = z.object({
  template: z.enum(MEDIA_TEMPLATES),
  highlight: z.string().trim().min(1).max(60).optional(),
  items: z.array(line).min(1).max(5).optional(),
  rows: z
    .array(z.tuple([z.string().trim().min(1).max(40), z.string().trim().min(1).max(40)]))
    .min(1)
    .max(6)
    .optional(),
  steps: z.array(line).min(1).max(5).optional(),
});
export type MediaSpec = z.infer<typeof mediaSpecSchema>;

export interface PosterContent {
  readonly template: 'poster';
  readonly typeLabel: string;
  readonly title: string;
  readonly organizer: string;
  readonly highlight: string | null;
  readonly deadlineLabel: string;
  readonly deadlineDate: string;
  readonly deadlineTime: string | null;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly domain: string;
}

export interface ListContent {
  readonly template: 'syarat' | 'cara-daftar';
  readonly eventTitle: string;
  readonly heading: string;
  readonly items: readonly string[];
  readonly domain: string;
}

export interface ScheduleContent {
  readonly template: 'jadwal';
  readonly eventTitle: string;
  readonly heading: string;
  readonly rows: readonly (readonly [string, string])[];
  readonly domain: string;
}

export type SlideContent = PosterContent | ListContent | ScheduleContent;

type MediaEvent = Pick<
  EventDetail,
  'title' | 'organizer' | 'eventType' | 'educationLevels' | 'categorySlugs' | 'location' | 'isOnline' | 'registrationLink' | 'deadlines' | 'primaryDeadlineAt' | 'primaryDeadlineLabel'
>;

const PRIMARY_LABEL: Record<DeadlineLabel, string> = {
  registration: 'Pendaftaran ditutup',
  submission: 'Batas kirim karya',
  final: 'Babak final',
  announcement: 'Pengumuman',
};

const mediumDate = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'laman resmi';
  }
}

/**
 * Huruf di luar subset Latin font poster (Plus Jakarta Sans) tampil kosong di
 * gambar. Simbol yang biasa dipakai kurator diganti kata; sisanya dibiarkan.
 */
export function toRenderableText(value: string): string {
  return value
    .replace(/\s*≤\s*/g, ' maks. ')
    .replace(/\s*≥\s*/g, ' min. ')
    .replace(/\s*[→⇒]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function primaryDeadline(event: MediaEvent): { label: DeadlineLabel; at: string } | null {
  const primary = event.deadlines.find((deadline) => deadline.isPrimary);
  if (primary) return { label: primary.label, at: primary.deadlineAt };
  if (event.primaryDeadlineAt) return { label: event.primaryDeadlineLabel ?? 'registration', at: event.primaryDeadlineAt };
  return null;
}

function levelsText(event: MediaEvent): string | null {
  return event.educationLevels.length > 0 ? event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(', ') : null;
}

function placeText(event: MediaEvent): string | null {
  return event.isOnline ? 'Daring' : event.location;
}

function fieldsText(event: MediaEvent, categoryNames: Readonly<Record<string, string>>): string | null {
  const names = event.categorySlugs.map((slug) => categoryNames[slug] ?? slug).slice(0, 2);
  return names.length > 0 ? names.join(', ') : null;
}

function dateTimeShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak valid';
  return `${mediumDate.format(date).replace('.', '')}, ${formatTimeId(iso)}`;
}

/** Isi satu gambar: dari `spec` kurator bila ada, sisanya dari data kegiatan. */
export function buildSlideContent(event: MediaEvent, spec: MediaSpec, categoryNames: Readonly<Record<string, string>>): SlideContent {
  const domain = hostOf(event.registrationLink);
  const deadline = primaryDeadline(event);
  const title = toRenderableText(event.title);

  if (spec.template === 'poster') {
    return {
      template: 'poster',
      typeLabel: EVENT_TYPE_LABEL[event.eventType],
      title,
      organizer: toRenderableText(event.organizer),
      highlight: spec.highlight ? toRenderableText(spec.highlight) : null,
      deadlineLabel: deadline ? PRIMARY_LABEL[deadline.label] : 'Tenggat',
      deadlineDate: deadline ? formatDateId(deadline.at) : 'Belum diumumkan',
      deadlineTime: deadline ? formatTimeId(deadline.at) : null,
      facts: [
        { label: 'Lokasi', value: placeText(event) ?? 'Lihat laman resmi' },
        { label: 'Jenjang', value: levelsText(event) ?? 'Lihat syarat' },
        { label: 'Bidang', value: fieldsText(event, categoryNames) ?? 'Umum' },
      ],
      domain,
    };
  }

  if (spec.template === 'jadwal') {
    const derived = [...event.deadlines]
      .sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt))
      .slice(0, 6)
      .map((item) => [DEADLINE_LABEL_TEXT[item.label], dateTimeShort(item.deadlineAt)] as const);
    const rows = spec.rows?.map(([label, value]) => [toRenderableText(label), toRenderableText(value)] as const) ?? derived;
    return {
      template: 'jadwal',
      eventTitle: title,
      heading: 'Tanggal penting',
      rows: rows.length > 0 ? rows : [['Tenggat', 'Belum diumumkan']],
      domain,
    };
  }

  if (spec.template === 'syarat') {
    const derived = [
      levelsText(event) && `Jenjang: ${levelsText(event)}`,
      placeText(event) && `Pelaksanaan: ${placeText(event)}`,
      fieldsText(event, categoryNames) && `Bidang: ${fieldsText(event, categoryNames)}`,
      'Syarat lengkap ada di panduan resmi penyelenggara',
    ].filter((item): item is string => Boolean(item));
    return {
      template: 'syarat',
      eventTitle: title,
      heading: 'Siapa yang bisa ikut',
      items: (spec.items ?? derived).map(toRenderableText),
      domain,
    };
  }

  const derivedSteps = [
    'Buka laman resmi penyelenggara',
    'Baca panduan & syarat lengkap',
    deadline ? `Daftar sebelum ${formatDateId(deadline.at)}` : 'Daftar sebelum pendaftaran ditutup',
  ];
  return {
    template: 'cara-daftar',
    eventTitle: title,
    heading: 'Cara daftar',
    items: (spec.steps ?? derivedSteps).map(toRenderableText),
    domain,
  };
}

/** Keterangan bawaan (≤ 140) bila kurator/pipeline tidak menulisnya. */
export function defaultCaption(content: SlideContent): string {
  const text =
    content.template === 'poster'
      ? `${content.title} · ${content.deadlineLabel.toLowerCase()} ${content.deadlineDate}. Info resmi: ${content.domain}`
      : content.template === 'jadwal'
        ? `Tanggal penting: ${content.rows.map(([label, value]) => `${label} ${value}`).join('; ')}`
        : `${content.heading}: ${content.items.join('; ')}`;
  return text.length <= 140 ? text : `${text.slice(0, 139).trimEnd()}…`;
}
