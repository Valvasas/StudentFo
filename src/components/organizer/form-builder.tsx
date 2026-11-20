'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowDownAZ,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDot,
  Clock,
  Copy,
  Eye,
  Gauge,
  GripVertical,
  Hash,
  Heading,
  LayoutTemplate,
  Link2,
  ListChecks,
  Lock,
  Mail,
  PencilLine,
  Phone,
  Plus,
  SquareCheck,
  SquareChevronDown,
  Trash2,
  Type,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { FORM_BUILDER_CHANGE_EVENT } from '@/components/organizer/registration-settings';
import { RegistrationFieldInput } from '@/components/registration/registration-field-input';
import { buttonVariants } from '@/components/ui/button';
import { controlClass, SelectInput } from '@/components/ui/field';
import { DEFAULT_SCALE, hasOptions, newFieldId, REGISTRATION_FORM_LIMITS, supportsOther, TEAM_STATUSES } from '@/lib/registration-form';
import { FORM_TEMPLATES, QUICK_QUESTIONS, type FormTemplate } from '@/lib/form-templates';
import { cn } from '@/lib/utils';
import { FORM_FIELD_TYPE_LABEL, FORM_FIELD_TYPES, type FormField, type FormFieldType, type FormScale } from '@/types/domain';

const TYPE_ICON: Record<FormFieldType, LucideIcon> = {
  short_text: Type,
  long_text: AlignLeft,
  email: Mail,
  phone: Phone,
  number: Hash,
  date: CalendarDays,
  url: Link2,
  select: CircleDot,
  multi_select: ListChecks,
  checkbox: SquareCheck,
  dropdown: SquareChevronDown,
  time: Clock,
  scale: Gauge,
  section: Heading,
  team_status: Users,
};

const LIMITS = REGISTRATION_FORM_LIMITS;

interface DraftField {
  readonly id: string;
  readonly type: FormFieldType;
  readonly label: string;
  readonly help: string;
  readonly required: boolean;
  readonly options: readonly string[];
  readonly scale: FormScale;
  readonly allowOther: boolean;
}

type Problem = 'label' | 'options' | null;

function toDraft(field: FormField): DraftField {
  return {
    ...field,
    help: field.help ?? '',
    options: field.type === 'team_status' ? [] : [...field.options],
    scale: field.scale ?? DEFAULT_SCALE,
    allowOther: field.allowOther === true,
  };
}

/** Pertanyaan "sama" = jenis + judul sama (huruf besar-kecil & spasi diabaikan) — templat tidak menggandakannya. */
const sameQuestionKey = (field: { readonly type: FormFieldType; readonly label: string }) =>
  `${field.type}:${field.label.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')}`;

/** Isi yang terlihat, tanpa id: untuk tahu kolom awal formulir baru belum disentuh. */
const contentOf = (fields: readonly DraftField[]) =>
  JSON.stringify(fields.map((field) => [field.type, field.label.trim(), field.help.trim(), field.required, field.options, field.allowOther]));

function cleanOptions(options: readonly string[]): string[] {
  return [...new Set(options.map((option) => option.trim()).filter(Boolean))];
}

function toPayload(field: DraftField): FormField {
  return {
    id: field.id,
    type: field.type,
    label: field.label.trim(),
    help: field.help.trim() || null,
    required: field.type === 'section' ? false : field.required,
    options: hasOptions(field.type) ? cleanOptions(field.options) : [],
    ...(field.type === 'scale'
      ? { scale: { max: field.scale.max, lowLabel: field.scale.lowLabel?.trim() || null, highLabel: field.scale.highLabel?.trim() || null } }
      : {}),
    ...(supportsOther(field.type) && field.allowOther ? { allowOther: true } : {}),
  };
}

/** Pratinjau = komponen peserta yang sama persis; pertanyaan tanpa judul tetap terlihat tempatnya. */
function toPreview(field: DraftField): FormField {
  const payload = toPayload(field);
  return { ...payload, label: payload.label || titleOf(field), options: payload.options.length > 0 ? payload.options : hasOptions(field.type) ? ['Pilihan 1'] : [] };
}

function blankField(type: FormFieldType): DraftField {
  if (type === 'team_status') {
    // Pertanyaan pintar: judulnya sudah benar sejak ditambahkan.
    return {
      id: newFieldId(),
      type,
      label: 'Status tim',
      help: 'Belum punya tim atau masih kurang anggota? Pilih saja — StudentFo bantu carikan.',
      required: true,
      options: [],
      scale: DEFAULT_SCALE,
      allowOther: false,
    };
  }
  return {
    id: newFieldId(),
    type,
    label: '',
    help: '',
    required: type !== 'section',
    options: hasOptions(type) ? ['', ''] : [],
    scale: DEFAULT_SCALE,
    allowOther: false,
  };
}

const SCALE_MAX_OPTIONS = Array.from(
  { length: REGISTRATION_FORM_LIMITS.scaleMax - REGISTRATION_FORM_LIMITS.scaleMin + 1 },
  (_, index) => index + REGISTRATION_FORM_LIMITS.scaleMin,
);

function titleOf(field: DraftField): string {
  return field.label.trim() || (field.type === 'section' ? 'Bagian tanpa judul' : 'Pertanyaan tanpa judul');
}

/** Wilayah live tidak membacakan ulang teks yang persis sama (hapus kedua, gagal simpan kedua) — spasi tak terlihat bergantian membuatnya berubah. */
function freshAnnouncement(current: string, message: string): string {
  return current === message ? `${message} ` : message;
}

function problemOf(field: DraftField): Problem {
  if (!field.label.trim()) return 'label';
  if (hasOptions(field.type) && cleanOptions(field.options).length < LIMITS.optionsMin) return 'options';
  return null;
}

const PROBLEM_TEXT: Record<Exclude<Problem, null>, string> = {
  label: 'Tulis pertanyaannya.',
  options: `Isi minimal ${LIMITS.optionsMin} pilihan yang berbeda.`,
};

const noop = () => () => {};

/** Satu Status tim per formulir: dua pertanyaan yang sama hanya membingungkan pendaftar. */
const singleton = (type: FormFieldType) => type === 'team_status';

/**
 * Penyusun pertanyaan formulir pendaftaran (ADR-056, dirombak ADR-094).
 *
 * Hasilnya SATU input tersembunyi `fields` berisi JSON — isian penyusun
 * sendiri sengaja tanpa `name`, supaya tidak ikut terkirim sebagai kolom
 * lepas. Input tersembunyi itu ikut dirender server: tanpa JavaScript,
 * menyimpan halaman tidak menghapus pertanyaan yang sudah ada.
 *
 * Urutan bisa diubah tiga cara yang setara: seret pegangan ⠿ (tetikus &
 * sentuh), panah atas/bawah saat pegangan difokus (keyboard), atau pilihan
 * "Urutan" di dalam pertanyaan yang dibuka (pembaca layar di ponsel).
 *
 * Validasi di sini hanya untuk pesan yang cepat; `parseRegistrationFormInput`
 * di server tetap gerbangnya.
 */
export function FormBuilder({
  initialFields,
  types = FORM_FIELD_TYPES,
  maxFields = LIMITS.maxFields,
  emptyText = 'Belum ada pertanyaan tambahan. Pendaftar cukup mengirim nama & email akunnya.',
  templates = false,
  extraTemplates = [],
  quickAdd = false,
  fresh = false,
}: {
  initialFields: readonly FormField[];
  /** Jenis yang boleh dipilih — pendataan kinerja (ADR-073) membatasinya ke jenis yang bisa dihitung & anonim. */
  types?: readonly FormFieldType[];
  maxFields?: number;
  emptyText?: string;
  /** Tawarkan templat siap pakai (formulir pendaftaran; ADR-092). */
  templates?: boolean;
  /** Formulir acara lain milik pengelola yang sama, tampil sebagai templat (ADR-094). */
  extraTemplates?: readonly FormTemplate[];
  /** Tombol "Tambah cepat" pertanyaan umum (ADR-094). */
  quickAdd?: boolean;
  /**
   * Formulir belum pernah disimpan: selama kolom awalnya belum disentuh, templat
   * MENGGANTINYA (seperti "mulai dari templat"). Formulir tersimpan selalu
   * ditambah saja — jawaban pendaftar terikat ke id pertanyaan lama.
   */
  fresh?: boolean;
}) {
  const [fields, setFields] = useState<DraftField[]>(() => initialFields.map(toDraft));
  const [starterContent] = useState(() => contentOf(initialFields.map(toDraft)));
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [removed, setRemoved] = useState<{ field: DraftField; index: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [dragId, setDragId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const fieldsRef = useRef(fields);
  const focusAfterRender = useRef<string | null>(null);
  const firstRender = useRef(true);
  const drag = useRef<{ id: string; pointerId: number; moved: boolean; startY: number; y: number; frame: number } | null>(null);
  // Server & hidrasi = false: tombol penyusun nonaktif sampai benar-benar
  // bisa bekerja, bukan tombol yang diam saat diklik (atau selamanya, tanpa JS).
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const allTemplates = [...FORM_TEMPLATES, ...extraTemplates];

  useEffect(() => {
    fieldsRef.current = fields;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    rootRef.current?.closest('form')?.dispatchEvent(new Event(FORM_BUILDER_CHANGE_EVENT));
  }, [fields]);

  useEffect(() => {
    const target = focusAfterRender.current;
    if (!target) return;
    focusAfterRender.current = null;
    document.getElementById(target)?.focus();
  });

  // Dipasang langsung di <form>: berjalan sebelum pendengar React di dokumen,
  // jadi `preventDefault()` di sini benar-benar membatalkan Server Action.
  useEffect(() => {
    const form = rootRef.current?.closest('form');
    if (!form) return;
    const onSubmit = (event: SubmitEvent) => {
      const invalid = fieldsRef.current.find((field) => problemOf(field) !== null);
      if (!invalid) return;
      event.preventDefault();
      setView('edit');
      setAttempted(true);
      setOpenId(invalid.id);
      focusAfterRender.current = problemOf(invalid) === 'label' ? `${invalid.id}-label` : `${invalid.id}-option-0`;
      setAnnouncement((current) => freshAnnouncement(current, 'Ada pertanyaan yang belum lengkap.'));
    };
    form.addEventListener('submit', onSubmit);
    return () => form.removeEventListener('submit', onSubmit);
  }, []);

  const announce = (message: string) => setAnnouncement((current) => freshAnnouncement(current, message));

  const update = (id: string, patch: Partial<DraftField>) => {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  };

  const add = (type: FormFieldType) => {
    const field = blankField(type);
    setFields((current) => [...current, field]);
    setOpenId(field.id);
    setPicking(false);
    setRemoved(null);
    setView('edit');
    focusAfterRender.current = `${field.id}-label`;
  };

  /** "Tambah cepat": pertanyaan jadi, langsung tertutup — biasanya tidak perlu diubah. */
  const addQuick = (question: FormField | Omit<FormField, 'id'>, name: string) => {
    if (fieldsRef.current.length >= maxFields) return;
    const field = toDraft({ ...question, id: newFieldId() });
    setFields((current) => [...current, field]);
    setOpenId(null);
    setRemoved(null);
    focusAfterRender.current = `${field.id}-toggle`;
    announce(`“${name}” ditambahkan di urutan ${fieldsRef.current.length + 1}.`);
  };

  /** "Duplikat" Google Form: salinan tepat di bawahnya, id baru (jawaban tidak tertukar). */
  const duplicate = (index: number) => {
    const field = fields[index];
    if (!field || fields.length >= maxFields || singleton(field.type)) return;
    const copy: DraftField = { ...field, id: newFieldId(), label: field.label.trim() ? `${field.label.trim()} (salinan)`.slice(0, LIMITS.labelMax) : '' };
    const next = [...fields];
    next.splice(index + 1, 0, copy);
    setFields(next);
    setOpenId(copy.id);
    setRemoved(null);
    focusAfterRender.current = `${copy.id}-label`;
    announce(`Salinan “${titleOf(field)}” ditambahkan di urutan ${index + 2}.`);
  };

  const applyTemplate = (template: FormTemplate) => {
    setPickingTemplate(false);
    const replace = fresh && contentOf(fields) === starterContent;
    const base = replace ? [] : fields;
    const existing = new Set(base.map(sameQuestionKey));
    const hasSingleton = new Set(base.filter((field) => singleton(field.type)).map((field) => field.type));
    const fresher = template.fields.filter((field) => !existing.has(sameQuestionKey(field)) && !hasSingleton.has(field.type));
    const additions = fresher.slice(0, maxFields - base.length).map((field) => toDraft({ ...field, id: newFieldId() }));
    const skipped = template.fields.length - fresher.length;
    if (additions.length === 0) {
      announce(`Semua kolom templat “${template.name}” sudah ada di formulir ini.`);
      return;
    }
    setFields([...base, ...additions]);
    setOpenId(null);
    setRemoved(null);
    setView('edit');
    focusAfterRender.current = `${additions[0]!.id}-toggle`;
    const note = [
      skipped > 0 ? `${skipped} dilewati karena sudah ada` : null,
      additions.length < fresher.length ? `batas ${maxFields} pertanyaan tercapai` : null,
    ].filter(Boolean);
    announce(
      replace
        ? `Formulir disusun dari templat “${template.name}” — ${additions.length} kolom.`
        : `${additions.length} kolom dari templat “${template.name}” ditambahkan di bawah${note.length ? ` (${note.join('; ')})` : ''}.`,
    );
  };

  const moveTo = (from: number, target: number, focus: 'up' | 'down' | 'grip' | 'position') => {
    const field = fields[from];
    if (!field || target < 0 || target >= fields.length || target === from) return;
    const next = [...fields];
    next.splice(from, 1);
    next.splice(target, 0, field);
    setFields(next);
    // Tombol yang ditekan bisa jadi nonaktif di posisi baru (sudah paling atas/bawah).
    const edge = target === 0 ? 'down' : target === next.length - 1 ? 'up' : focus;
    focusAfterRender.current = `${field.id}-${focus === 'grip' || focus === 'position' ? focus : next.length > 1 ? edge : 'label'}`;
    announce(`“${titleOf(field)}” dipindah ke urutan ${target + 1} dari ${next.length}.`);
  };

  const move = (index: number, delta: -1 | 1) => moveTo(index, index + delta, delta < 0 ? 'up' : 'down');

  // Seret pegangan ⠿ (pointer events: tetikus, sentuh, pena). Posisi tujuan =
  // jumlah kartu LAIN yang titik tengahnya di atas penunjuk — tidak bergantung
  // pada posisi kartu yang diseret, jadi aman dipanggil berulang sebelum render.
  const reposition = (id: string, clientY: number) => {
    const cards = [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > li[data-field]') ?? [])];
    let target = 0;
    for (const card of cards) {
      if (card.dataset.field === id) continue;
      const rect = card.getBoundingClientRect();
      if (clientY > rect.top + rect.height / 2) target += 1;
    }
    setFields((list) => {
      const from = list.findIndex((field) => field.id === id);
      if (from < 0 || from === target) return list;
      if (drag.current) drag.current.moved = true;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(target, 0, item!);
      return next;
    });
  };

  // Gulir otomatis selama penunjuk DITAHAN di tepi layar — formulir 25 pertanyaan
  // lebih tinggi dari layar ponsel, dan menunggu penunjuk bergerak membuatnya macet.
  const EDGE = 72;
  const DRAG_THRESHOLD = 8;
  const autoScroll = () => {
    const current = drag.current;
    if (!current) return;
    // Baru setelah penunjuk benar-benar bergerak: kartu yang baru ditambahkan sering berada di tepi
    // bawah layar, dan menekan pegangannya saja tidak boleh langsung menggulir halaman.
    if (Math.abs(current.y - current.startY) < DRAG_THRESHOLD) {
      current.frame = requestAnimationFrame(autoScroll);
      return;
    }
    const bottom = window.innerHeight - EDGE;
    const speed = current.y < EDGE ? -Math.ceil((EDGE - current.y) / 5) : current.y > bottom ? Math.ceil((current.y - bottom) / 5) : 0;
    if (speed !== 0) {
      window.scrollBy(0, speed);
      reposition(current.id, current.y);
    }
    current.frame = requestAnimationFrame(autoScroll);
  };

  const onGripDown = (id: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, pointerId: event.pointerId, moved: false, startY: event.clientY, y: event.clientY, frame: requestAnimationFrame(autoScroll) };
    setDragId(id);
  };

  const onGripMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.y = event.clientY;
    if (Math.abs(event.clientY - current.startY) < DRAG_THRESHOLD) return;
    reposition(current.id, event.clientY);
  };

  const onGripUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    cancelAnimationFrame(current.frame);
    drag.current = null;
    setDragId(null);
    if (!current.moved) return;
    const list = fieldsRef.current;
    const index = list.findIndex((field) => field.id === current.id);
    const field = list[index];
    if (field) announce(`“${titleOf(field)}” dipindah ke urutan ${index + 1} dari ${list.length}.`);
  };

  useEffect(() => () => cancelAnimationFrame(drag.current?.frame ?? 0), []);

  const remove = (index: number) => {
    const field = fields[index];
    if (!field) return;
    setFields((current) => current.filter((item) => item.id !== field.id));
    setRemoved({ field, index });
    setOpenId(null);
    focusAfterRender.current = 'form-builder-undo';
    announce(`“${titleOf(field)}” dihapus.`);
  };

  const undo = () => {
    if (!removed) return;
    setFields((current) => {
      const next = [...current];
      next.splice(Math.min(removed.index, next.length), 0, removed.field);
      return next;
    });
    setOpenId(removed.field.id);
    focusAfterRender.current = `${removed.field.id}-label`;
    setRemoved(null);
    announce(`“${titleOf(removed.field)}” dikembalikan.`);
  };

  const full = fields.length >= maxFields;
  const present = new Set(fields.map(sameQuestionKey));
  const presentTypes = new Set(fields.map((field) => field.type));
  const quickQuestions = quickAdd ? QUICK_QUESTIONS.filter((question) => types.includes(question.field.type)) : [];
  const invalidCount = fields.filter((field) => problemOf(field) !== null).length;

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <input type="hidden" name="fields" value={JSON.stringify(fields.map(toPayload))} />
      <noscript>
        <p className="rounded-card bg-panel-nested px-4 py-3 text-sm text-ink-muted">
          Menyusun pertanyaan butuh JavaScript. Pertanyaan di bawah tetap tersimpan saat kamu menyimpan pengaturan lain.
        </p>
      </noscript>

      {fields.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Tampilan penyusun" className="inline-flex rounded-card border border-line bg-panel-nested p-1">
            {(
              [
                { key: 'edit', label: 'Sunting', icon: PencilLine },
                { key: 'preview', label: 'Pratinjau', icon: Eye },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={view === option.key}
                disabled={!hydrated}
                onClick={() => setView(option.key)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-[9px] px-3 text-sm font-semibold transition-colors duration-150 ease-snap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  view === option.key ? 'bg-panel text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
                )}
              >
                <option.icon aria-hidden className="size-4" />
                {option.label}
              </button>
            ))}
          </div>
          {view === 'edit' && (
            <p className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
              <GripVertical aria-hidden className="size-4 shrink-0" />
              Seret pegangan untuk mengubah urutan.
            </p>
          )}
        </div>
      )}

      {view === 'preview' && fields.length > 0 ? (
        <PreviewPane fields={fields} />
      ) : fields.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">{emptyText}</p>
      ) : (
        <ol ref={listRef} className="flex flex-col gap-2.5">
          {fields.map((field, index) => (
            <QuestionCard
              key={field.id}
              field={field}
              index={index}
              total={fields.length}
              open={openId === field.id}
              dragging={dragId === field.id}
              interactive={hydrated}
              showProblem={attempted}
              types={types}
              onToggle={() => setOpenId((current) => (current === field.id ? null : field.id))}
              onDone={() => {
                setOpenId(null);
                focusAfterRender.current = `${field.id}-toggle`;
              }}
              onChange={(patch) => update(field.id, patch)}
              onMove={(delta) => move(index, delta)}
              onMoveTo={(target) => moveTo(index, target, 'position')}
              onGripKey={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                event.preventDefault();
                moveTo(index, index + (event.key === 'ArrowUp' ? -1 : 1), 'grip');
              }}
              grip={{ onPointerDown: onGripDown(field.id), onPointerMove: onGripMove, onPointerUp: onGripUp, onPointerCancel: onGripUp }}
              onRemove={() => remove(index)}
              onDuplicate={fields.length < maxFields && !singleton(field.type) ? () => duplicate(index) : null}
              typeTaken={(type) => singleton(type) && type !== field.type && presentTypes.has(type)}
            />
          ))}
        </ol>
      )}

      {removed && (
        <p className="fade-in flex flex-wrap items-center justify-between gap-2 rounded-card bg-panel-nested px-4 py-1.5 text-sm text-ink-soft">
          <span id="form-builder-removed" className="min-w-0 truncate">
            “{titleOf(removed.field)}” dihapus.
          </span>
          <button
            id="form-builder-undo"
            type="button"
            onClick={undo}
            aria-describedby="form-builder-removed"
            className="min-h-11 px-2 font-semibold text-ink underline underline-offset-[3px] hover:no-underline"
          >
            Urungkan
          </button>
        </p>
      )}

      {attempted && invalidCount > 0 && view === 'edit' && (
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-danger">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {invalidCount} pertanyaan belum lengkap — ditandai merah di atas.
        </p>
      )}

      {picking ? (
        <div
          className="fade-in flex flex-col gap-3 rounded-card border border-line bg-panel p-3 sm:p-4"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setPicking(false);
              focusAfterRender.current = 'form-builder-add';
            }
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id="pilih-jenis" className="text-sm font-semibold">Pilih jenis jawaban</h3>
            <button
              type="button"
              onClick={() => {
                setPicking(false);
                focusAfterRender.current = 'form-builder-add';
              }}
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            >
              <X aria-hidden />
              <span className="sr-only">Tutup pilihan jenis</span>
            </button>
          </div>
          <ul aria-labelledby="pilih-jenis" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {types.map((type, typeIndex) => {
              const Icon = TYPE_ICON[type];
              const taken = singleton(type) && presentTypes.has(type);
              return (
                <li key={type}>
                  <button
                    id={typeIndex === 0 ? 'form-builder-first-type' : undefined}
                    type="button"
                    disabled={taken}
                    aria-describedby={taken ? 'form-builder-type-taken' : undefined}
                    onClick={() => add(type)}
                    className="press flex min-h-12 w-full items-center gap-2.5 rounded-card border border-line bg-panel px-3 text-left text-sm font-medium transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    {FORM_FIELD_TYPE_LABEL[type]}
                  </button>
                </li>
              );
            })}
          </ul>
          {presentTypes.has('team_status') && types.includes('team_status') && (
            <p id="form-builder-type-taken" className="text-[12.5px] text-ink-muted">
              Status tim sudah ada di formulir ini — cukup satu.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            id="form-builder-add"
            type="button"
            disabled={full || !hydrated}
            onClick={() => {
              setPicking(true);
              setPickingTemplate(false);
              focusAfterRender.current = 'form-builder-first-type';
            }}
            className={buttonVariants({ variant: 'secondary' })}
          >
            <Plus aria-hidden /> Tambah pertanyaan
          </button>
          {templates && (
            <button
              id="form-builder-template"
              type="button"
              disabled={full || !hydrated}
              aria-expanded={pickingTemplate}
              aria-controls="form-builder-templates"
              onClick={() => {
                setPickingTemplate((current) => !current);
                focusAfterRender.current = pickingTemplate ? null : 'form-builder-first-template';
              }}
              className={buttonVariants({ variant: 'ghost' })}
            >
              <LayoutTemplate aria-hidden /> Pakai templat
            </button>
          )}
          <span className="text-[12.5px] text-ink-muted">
            {full ? `Batas ${maxFields} pertanyaan tercapai.` : `${fields.length} dari ${maxFields} pertanyaan`}
          </span>
        </div>
      )}

      {quickQuestions.length > 0 && !picking && !full && (
        <div className="flex flex-col gap-2 rounded-card border border-dashed border-line px-3 py-3 sm:px-4">
          <p id="tambah-cepat" className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft">
            <Zap aria-hidden className="size-4 text-ink-muted" /> Tambah cepat
            <span className="font-normal text-ink-muted">— pertanyaan siap pakai, jenis jawabannya sudah benar</span>
          </p>
          <ul aria-labelledby="tambah-cepat" className="flex flex-wrap gap-2">
            {quickQuestions.map((question) => {
              const added = present.has(sameQuestionKey(question.field)) || (singleton(question.field.type) && presentTypes.has(question.field.type));
              return (
                <li key={question.key}>
                  <button
                    type="button"
                    disabled={added || !hydrated}
                    onClick={() => addQuick(question.field, question.name)}
                    className="press inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-line bg-panel px-3.5 text-[13.5px] font-medium transition-colors duration-150 ease-snap hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default disabled:border-transparent disabled:bg-panel-nested disabled:text-ink-muted"
                  >
                    {added ? <Check aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
                    {question.name}
                    {added && <span className="sr-only"> (sudah ada)</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {templates && pickingTemplate && !picking && (
        <div
          id="form-builder-templates"
          className="fade-in flex flex-col gap-3 rounded-card border border-line bg-panel p-3 sm:p-4"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setPickingTemplate(false);
              focusAfterRender.current = 'form-builder-template';
            }
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <h3 id="pilih-templat" className="text-sm font-semibold">Mulai dari templat</h3>
              <p className="text-[12.5px] text-ink-muted">Kolomnya ditambahkan di bawah pertanyaan yang sudah ada — semua bisa diubah atau dihapus.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPickingTemplate(false);
                focusAfterRender.current = 'form-builder-template';
              }}
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            >
              <X aria-hidden />
              <span className="sr-only">Tutup pilihan templat</span>
            </button>
          </div>
          <TemplateList id="form-builder-first-template" templates={FORM_TEMPLATES} onPick={applyTemplate} labelledBy="pilih-templat" />
          {extraTemplates.length > 0 && (
            <>
              <h4 id="salin-acara" className="mt-1 text-[13px] font-semibold text-ink-soft">
                Salin dari formulir acaramu yang lain
              </h4>
              <TemplateList templates={extraTemplates} onPick={applyTemplate} labelledBy="salin-acara" />
            </>
          )}
          {allTemplates.length === 0 && <p className="text-sm text-ink-muted">Belum ada templat.</p>}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function TemplateList({
  id,
  templates,
  onPick,
  labelledBy,
}: {
  id?: string;
  templates: readonly FormTemplate[];
  onPick: (template: FormTemplate) => void;
  labelledBy: string;
}) {
  return (
    <ul aria-labelledby={labelledBy} className="grid gap-2 sm:grid-cols-3">
      {templates.map((template, index) => (
        <li key={template.key} className="min-w-0">
          <button
            id={index === 0 ? id : undefined}
            type="button"
            onClick={() => onPick(template)}
            className="press flex h-full min-h-12 w-full flex-col items-start gap-1 rounded-card border border-line bg-panel px-3 py-2.5 text-left transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">{template.name}</span>
            <span className="text-[12.5px] leading-snug text-ink-muted">{template.description}</span>
            <span className="text-[12px] font-medium text-ink-soft">{template.fields.length} kolom</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Pratinjau langsung (ADR-094): komponen peserta yang SAMA, di dalam
 * `<fieldset disabled>` — tidak ikut terkirim bersama pengaturan dan tidak
 * menahan tombol Simpan dengan `required`-nya.
 */
function PreviewPane({ fields }: { fields: readonly DraftField[] }) {
  return (
    <div className="fade-in flex flex-col gap-4 rounded-card border border-line bg-canvas p-4 sm:p-6">
      <p className="flex items-center gap-2 text-[12.5px] text-ink-muted">
        <Eye aria-hidden className="size-4 shrink-0" />
        Begini pendaftar melihatnya. Isian di pratinjau tidak bisa diisi.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {['Nama lengkap', 'Email'].map((label) => (
          <div key={label} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[13.5px] font-semibold">{label}</span>
            <span className="flex min-h-11 items-center gap-2 rounded-card bg-panel-nested px-3.5 text-sm text-ink-muted">
              <Lock aria-hidden className="size-3.5" /> Dari akun pendaftar
            </span>
          </div>
        ))}
      </div>
      <fieldset disabled className="flex min-w-0 flex-col gap-7 border-t border-line pt-5">
        <legend className="sr-only">Pratinjau pertanyaan</legend>
        {fields.map((field) => (
          <RegistrationFieldInput key={field.id} field={toPreview(field)} disabled />
        ))}
      </fieldset>
    </div>
  );
}

function QuestionCard({
  field,
  index,
  total,
  open,
  dragging,
  interactive,
  showProblem,
  types,
  onToggle,
  onDone,
  onChange,
  onMove,
  onMoveTo,
  onGripKey,
  grip,
  onRemove,
  onDuplicate,
  typeTaken,
}: {
  field: DraftField;
  index: number;
  total: number;
  open: boolean;
  dragging: boolean;
  interactive: boolean;
  showProblem: boolean;
  types: readonly FormFieldType[];
  /** null = batas jumlah pertanyaan tercapai / jenis yang cukup satu. */
  onDuplicate: (() => void) | null;
  onToggle: () => void;
  /** "Selesai" menutup editor tempat tombolnya berada — fokus harus dipindah ke kepala kartu, bukan jatuh ke <body>. */
  onDone: () => void;
  onChange: (patch: Partial<DraftField>) => void;
  onMove: (delta: -1 | 1) => void;
  onMoveTo: (target: number) => void;
  onGripKey: (event: KeyboardEvent<HTMLButtonElement>) => void;
  grip: {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  };
  onRemove: () => void;
  /** Jenis yang cukup satu per formulir dan sudah dipakai pertanyaan lain. */
  typeTaken: (type: FormFieldType) => boolean;
}) {
  const Icon = TYPE_ICON[field.type];
  const problem = problemOf(field);
  const editorId = `${field.id}-editor`;
  const name = titleOf(field);
  const optionCount = cleanOptions(field.options).length;
  const isSection = field.type === 'section';
  const meta = [
    FORM_FIELD_TYPE_LABEL[field.type],
    ...(isSection ? [] : [field.required ? 'Wajib' : 'Opsional']),
    ...(hasOptions(field.type) ? [`${optionCount} pilihan${field.allowOther && supportsOther(field.type) ? ' + Lainnya' : ''}`] : []),
    ...(field.type === 'scale' ? [`1–${field.scale.max}`] : []),
  ].join(' · ');

  return (
    <li
      data-field={field.id}
      className={cn(
        'rounded-card border bg-panel transition-[border-color,box-shadow] duration-150 ease-snap',
        open ? 'border-line-strong shadow-card' : 'border-line',
        !open && problem && showProblem && 'border-danger-line',
        dragging && 'relative z-10 border-brand shadow-card ring-2 ring-brand/40',
      )}
    >
      <div className="flex items-center gap-1 py-1 pl-0.5 pr-1 sm:gap-1.5 sm:pl-1">
        <button
          id={`${field.id}-grip`}
          type="button"
          disabled={!interactive}
          aria-label={`Seret untuk memindah “${name}”, atau tekan panah atas/bawah`}
          aria-describedby={`${field.id}-rank`}
          onKeyDown={onGripKey}
          {...grip}
          className={cn(
            'flex size-11 shrink-0 touch-none items-center justify-center rounded-sm text-ink-faint transition-colors duration-150 ease-snap hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
            interactive && (dragging ? 'cursor-grabbing text-brand' : 'cursor-grab'),
          )}
        >
          <GripVertical aria-hidden className="size-5" />
        </button>
        <span id={`${field.id}-rank`} className="sr-only">
          Urutan {index + 1} dari {total}
        </span>
        <span aria-hidden className="hidden size-9 shrink-0 items-center justify-center rounded-card bg-panel-nested text-ink-muted sm:flex">
          <Icon className="size-4" />
        </span>
        <button
          id={`${field.id}-toggle`}
          type="button"
          aria-expanded={open}
          aria-controls={editorId}
          disabled={!interactive}
          onClick={onToggle}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:px-2"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cn('truncate font-medium', !field.label.trim() && 'text-ink-muted')}>
              <span className="sr-only">Pertanyaan {index + 1}: </span>
              <span aria-hidden className="mr-1.5 tabular-nums text-ink-muted">
                {index + 1}.
              </span>
              {name}
            </span>
            <span className="truncate text-[12.5px] text-ink-muted">{meta}</span>
          </span>
          {problem && !open && (
            <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-danger">
              <CircleAlert aria-hidden className="size-4" />
              <span className="hidden sm:inline">Belum lengkap</span>
              <span className="sr-only sm:hidden">Belum lengkap</span>
            </span>
          )}
          <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-ink-muted transition-transform duration-200 ease-snap', open && 'rotate-180')} />
        </button>
        {!open && (
          <span className="hidden shrink-0 sm:flex">
            <MoveButtons field={field} index={index} total={total} onMove={onMove} disabled={!interactive} />
          </span>
        )}
      </div>

      {open && (
        <div id={editorId} className="flex flex-col gap-4 border-t border-line p-3 sm:p-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
            <EditorField id={`${field.id}-label`} label={isSection ? 'Judul bagian' : 'Pertanyaan'} error={showProblem && problem === 'label' ? (isSection ? 'Tulis judul bagiannya.' : PROBLEM_TEXT.label) : null}>
              <input
                id={`${field.id}-label`}
                value={field.label}
                maxLength={LIMITS.labelMax}
                onChange={(event) => onChange({ label: event.target.value })}
                onKeyDown={blockImplicitSubmit}
                placeholder={
                  field.type === 'checkbox'
                    ? 'Mis. Saya bersedia mengikuti seluruh rangkaian acara'
                    : isSection
                      ? 'Mis. Data anggota tim'
                      : field.type === 'scale'
                        ? 'Mis. Seberapa siap timmu?'
                        : 'Mis. Asal sekolah / kampus'
                }
                aria-invalid={showProblem && problem === 'label' ? true : undefined}
                aria-describedby={showProblem && problem === 'label' ? `${field.id}-label-error` : undefined}
                className={controlClass}
              />
            </EditorField>
            <EditorField id={`${field.id}-type`} label="Jenis jawaban">
              <SelectInput
                id={`${field.id}-type`}
                value={field.type}
                aria-describedby={field.type === 'number' ? `${field.id}-type-hint` : undefined}
                onChange={(event) => {
                  const type = event.target.value as FormFieldType;
                  const options = hasOptions(type) && field.options.length === 0 ? ['', ''] : field.options;
                  onChange({ type, options, ...(type === 'section' ? { required: false } : {}) });
                }}
              >
                {types.map((type) => (
                  <option key={type} value={type} disabled={typeTaken(type)}>
                    {FORM_FIELD_TYPE_LABEL[type]}
                  </option>
                ))}
              </SelectInput>
              {/* NIK/rekening di kolom Angka kehilangan nol di depan & ditolak di atas 12 digit. */}
              {field.type === 'number' && (
                <p id={`${field.id}-type-hint`} className="text-[12.5px] text-ink-muted">
                  Maks. 12 digit, koma untuk desimal. NIK atau nomor rekening: pakai Jawaban singkat; nomor HP: pakai Nomor telepon.
                </p>
              )}
            </EditorField>
          </div>

          <EditorField id={`${field.id}-help`} label={isSection ? 'Keterangan bagian (opsional)' : 'Keterangan (opsional)'}>
            <input
              id={`${field.id}-help`}
              value={field.help}
              maxLength={LIMITS.helpMax}
              onChange={(event) => onChange({ help: event.target.value })}
              onKeyDown={blockImplicitSubmit}
              placeholder="Mis. contoh format jawaban"
              className={controlClass}
            />
          </EditorField>

          {hasOptions(field.type) && (
            <OptionsEditor field={field} error={showProblem && problem === 'options' ? PROBLEM_TEXT.options : null} onChange={onChange} />
          )}

          {field.type === 'team_status' && <TeamStatusInfo />}

          {field.type === 'scale' && <ScaleEditor field={field} onChange={onChange} />}

          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {isSection ? (
                <p className="text-[12.5px] text-ink-muted">Judul bagian hanya pemisah — pendaftar tidak mengisinya.</p>
              ) : (
                <label className="choice">
                  <input
                    type="checkbox"
                    className="check"
                    checked={field.required}
                    onChange={(event) => onChange({ required: event.target.checked })}
                  />
                  {field.type === 'checkbox' ? 'Wajib dicentang' : 'Wajib diisi'}
                </label>
              )}
              {total > 1 && (
                <label htmlFor={`${field.id}-position`} className="flex items-center gap-2 text-[13.5px] font-semibold">
                  Urutan
                  <SelectInput
                    id={`${field.id}-position`}
                    value={index}
                    onChange={(event) => onMoveTo(Number(event.target.value))}
                    className="w-auto min-w-[5.5rem]"
                  >
                    {Array.from({ length: total }, (_, position) => (
                      <option key={position} value={position}>
                        {position + 1} dari {total}
                      </option>
                    ))}
                  </SelectInput>
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <MoveButtons field={field} index={index} total={total} onMove={onMove} />
              {onDuplicate && (
                <button type="button" onClick={onDuplicate} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                  <Copy aria-hidden /> Duplikat
                </button>
              )}
              <button type="button" onClick={onRemove} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'text-danger hover:bg-danger-soft hover:text-danger' })}>
                <Trash2 aria-hidden /> Hapus
              </button>
              <button type="button" onClick={onDone} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function TeamStatusInfo() {
  return (
    <div className="flex flex-col gap-2 rounded-card bg-info-soft px-4 py-3 text-[13px] leading-snug text-ink-soft">
      <p className="font-semibold text-ink">Pilihan tetap — dipahami StudentFo</p>
      <ul className="flex flex-col gap-1 pl-1">
        {TEAM_STATUSES.map((status) => (
          <li key={status.key} className="flex items-center gap-2">
            <span aria-hidden className="size-3.5 shrink-0 rounded-pill border-[1.5px] border-line-strong" />
            {status.label}
          </li>
        ))}
      </ul>
      <p>
        Pendaftar yang belum punya tim atau masih kurang anggota langsung ditawari pencocokan partner, daftar tim terbuka, dan lobi lomba — kamu
        bisa melihat jumlahnya di Ringkasan jawaban.
      </p>
    </div>
  );
}

function MoveButtons({
  field,
  index,
  total,
  onMove,
  disabled = false,
}: {
  field: DraftField;
  index: number;
  total: number;
  onMove: (delta: -1 | 1) => void;
  disabled?: boolean;
}) {
  const name = field.label.trim() || `pertanyaan ${index + 1}`;
  const className = buttonVariants({ variant: 'ghost', size: 'icon' });
  return (
    <>
      <button
        id={`${field.id}-up`}
        type="button"
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
        className={className}
      >
        <ArrowUp aria-hidden />
        <span className="sr-only">Naikkan “{name}”</span>
      </button>
      <button
        id={`${field.id}-down`}
        type="button"
        disabled={disabled || index === total - 1}
        onClick={() => onMove(1)}
        className={className}
      >
        <ArrowDown aria-hidden />
        <span className="sr-only">Turunkan “{name}”</span>
      </button>
    </>
  );
}

function OptionsEditor({
  field,
  error,
  onChange,
}: {
  field: DraftField;
  error: string | null;
  onChange: (patch: Partial<DraftField>) => void;
}) {
  const options = field.options;
  const full = options.length >= LIMITS.optionsMax;
  const errorId = `${field.id}-options-error`;
  const pendingFocus = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (pendingFocus.current === null) return;
    document.getElementById(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  const setOption = (index: number, value: string) => onChange({ options: options.map((option, i) => (i === index ? value : option)) });
  const insertAfter = (index: number) => {
    if (full) return;
    const next = [...options];
    next.splice(index + 1, 0, '');
    onChange({ options: next });
    pendingFocus.current = `${field.id}-option-${index + 1}`;
  };
  const removeAt = (index: number) => {
    onChange({ options: options.filter((_, i) => i !== index) });
    pendingFocus.current = `${field.id}-option-${Math.max(0, index - 1)}`;
  };
  const moveOption = (index: number, delta: -1 | 1, focus: 'input' | 'up' | 'down') => {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item ?? '');
    onChange({ options: next });
    const edge = focus === 'input' ? 'input' : target === 0 ? 'down' : target === next.length - 1 ? 'up' : focus;
    pendingFocus.current = edge === 'input' ? `${field.id}-option-${target}` : `${field.id}-option-${target}-${edge}`;
    setAnnouncement((current) => freshAnnouncement(current, `Pilihan dipindah ke urutan ${target + 1} dari ${next.length}.`));
  };
  const sortAlphabetically = () => {
    const filled = options.filter((option) => option.trim());
    const blanks = options.length - filled.length;
    onChange({ options: [...[...filled].sort((a, b) => a.localeCompare(b, 'id-ID', { numeric: true })), ...Array.from({ length: blanks }, () => '')] });
    setAnnouncement((current) => freshAnnouncement(current, 'Pilihan diurutkan A–Z.'));
  };

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      insertAfter(index);
    } else if (event.key === 'Backspace' && options[index] === '' && options.length > 1) {
      event.preventDefault();
      removeAt(index);
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      moveOption(index, event.key === 'ArrowUp' ? -1 : 1, 'input');
    }
  };

  const iconButton = 'hidden size-11 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-panel-nested hover:text-ink disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus sm:flex';

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? errorId : `${field.id}-options-hint`}>
      <legend className="mb-1.5 text-[13.5px] font-semibold">Pilihan jawaban</legend>
      <ol className="flex flex-col gap-2">
        {options.map((option, index) => (
          <li key={index} className="flex items-center gap-1.5 sm:gap-2">
            <span
              aria-hidden
              className={cn('size-4 shrink-0 border-[1.5px] border-line-strong', field.type === 'multi_select' ? 'rounded-[4px]' : 'rounded-pill')}
            />
            <input
              id={`${field.id}-option-${index}`}
              value={option}
              maxLength={LIMITS.optionMax}
              onChange={(event) => setOption(index, event.target.value)}
              onKeyDown={onKeyDown(index)}
              placeholder={`Pilihan ${index + 1}`}
              aria-label={`Pilihan ${index + 1}`}
              aria-invalid={error && !option.trim() ? true : undefined}
              className={cn(controlClass, 'min-w-0 flex-1')}
            />
            <button
              id={`${field.id}-option-${index}-up`}
              type="button"
              disabled={index === 0}
              onClick={() => moveOption(index, -1, 'up')}
              className={iconButton}
            >
              <ArrowUp aria-hidden className="size-4" />
              <span className="sr-only">Naikkan pilihan {index + 1}</span>
            </button>
            <button
              id={`${field.id}-option-${index}-down`}
              type="button"
              disabled={index === options.length - 1}
              onClick={() => moveOption(index, 1, 'down')}
              className={iconButton}
            >
              <ArrowDown aria-hidden className="size-4" />
              <span className="sr-only">Turunkan pilihan {index + 1}</span>
            </button>
            <button
              type="button"
              disabled={options.length <= 1}
              onClick={() => removeAt(index)}
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            >
              <X aria-hidden />
              <span className="sr-only">Hapus pilihan {index + 1}</span>
            </button>
          </li>
        ))}
        {field.allowOther && supportsOther(field.type) && (
          <li className="flex items-center gap-2 pl-0.5 text-sm text-ink-muted">
            <span
              aria-hidden
              className={cn('size-4 shrink-0 border-[1.5px] border-line-strong', field.type === 'multi_select' ? 'rounded-[4px]' : 'rounded-pill')}
            />
            Lainnya: <span className="flex-1 border-b border-dashed border-line-strong">&nbsp;</span>
            <span className="text-[12px]">(diisi pendaftar)</span>
          </li>
        )}
      </ol>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
        <button
          type="button"
          disabled={full}
          onClick={() => insertAfter(options.length - 1)}
          className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink underline-offset-[3px] hover:underline disabled:text-ink-faint disabled:no-underline"
        >
          <Plus aria-hidden className="size-4" /> Tambah pilihan
        </button>
        {options.filter((option) => option.trim()).length > 2 && (
          <button
            type="button"
            onClick={sortAlphabetically}
            className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-[3px] hover:text-ink hover:underline"
          >
            <ArrowDownAZ aria-hidden className="size-4" /> Urutkan A–Z
          </button>
        )}
        <span id={`${field.id}-options-hint`} className="text-[12.5px] text-ink-muted">
          {full ? `Maksimal ${LIMITS.optionsMax} pilihan.` : 'Enter untuk pilihan berikutnya · Alt + ↑/↓ memindah urutan.'}
        </span>
      </div>
      {supportsOther(field.type) && (
        <label className="choice self-start">
          <input type="checkbox" className="check" checked={field.allowOther} onChange={(event) => onChange({ allowOther: event.target.checked })} />
          Tambahkan pilihan “Lainnya” yang bisa diisi sendiri
        </label>
      )}
      {error && <ProblemText id={errorId}>{error}</ProblemText>}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </fieldset>
  );
}

function ScaleEditor({ field, onChange }: { field: DraftField; onChange: (patch: Partial<DraftField>) => void }) {
  const update = (patch: Partial<FormScale>) => onChange({ scale: { ...field.scale, ...patch } });
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-[13.5px] font-semibold">Rentang skala</legend>
      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
        <EditorField id={`${field.id}-scale-max`} label="Dari 1 sampai">
          <SelectInput id={`${field.id}-scale-max`} value={field.scale.max} onChange={(event) => update({ max: Number(event.target.value) })}>
            {SCALE_MAX_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectInput>
        </EditorField>
        <EditorField id={`${field.id}-scale-low`} label="Label untuk 1 (opsional)">
          <input
            id={`${field.id}-scale-low`}
            value={field.scale.lowLabel ?? ''}
            maxLength={LIMITS.scaleLabelMax}
            onChange={(event) => update({ lowLabel: event.target.value })}
            onKeyDown={blockImplicitSubmit}
            placeholder="Mis. Belum siap"
            className={controlClass}
          />
        </EditorField>
        <EditorField id={`${field.id}-scale-high`} label={`Label untuk ${field.scale.max} (opsional)`}>
          <input
            id={`${field.id}-scale-high`}
            value={field.scale.highLabel ?? ''}
            maxLength={LIMITS.scaleLabelMax}
            onChange={(event) => update({ highLabel: event.target.value })}
            onKeyDown={blockImplicitSubmit}
            placeholder="Mis. Sangat siap"
            className={controlClass}
          />
        </EditorField>
      </div>
    </fieldset>
  );
}

function EditorField({ id, label, error, children }: { id: string; label: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-semibold">
        {label}
      </label>
      {children}
      {error && <ProblemText id={`${id}-error`}>{error}</ProblemText>}
    </div>
  );
}

function ProblemText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-[12.5px] font-medium text-danger">
      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}

/** Enter di isian penyusun tidak boleh mengirim seluruh formulir pengaturan. */
function blockImplicitSubmit(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.preventDefault();
}
