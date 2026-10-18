'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  CircleDot,
  Hash,
  Link2,
  ListChecks,
  Mail,
  Phone,
  Plus,
  SquareCheck,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { controlClass, SelectInput } from '@/components/ui/field';
import { hasOptions, newFieldId, REGISTRATION_FORM_LIMITS } from '@/lib/registration-form';
import { cn } from '@/lib/utils';
import { FORM_FIELD_TYPE_LABEL, FORM_FIELD_TYPES, type FormField, type FormFieldType } from '@/types/domain';

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
};

const LIMITS = REGISTRATION_FORM_LIMITS;

/** Event yang dikirim ke `<form>` induk setiap kali susunan berubah — bilah simpan memakainya untuk tanda "belum disimpan". */
export const FORM_BUILDER_CHANGE_EVENT = 'sf:form-builder-change';

interface DraftField {
  readonly id: string;
  readonly type: FormFieldType;
  readonly label: string;
  readonly help: string;
  readonly required: boolean;
  readonly options: readonly string[];
}

type Problem = 'label' | 'options' | null;

function toDraft(field: FormField): DraftField {
  return { ...field, help: field.help ?? '', options: [...field.options] };
}

function cleanOptions(options: readonly string[]): string[] {
  return [...new Set(options.map((option) => option.trim()).filter(Boolean))];
}

function toPayload(field: DraftField) {
  return {
    id: field.id,
    type: field.type,
    label: field.label.trim(),
    help: field.help.trim() || null,
    required: field.required,
    options: hasOptions(field.type) ? cleanOptions(field.options) : [],
  };
}

function titleOf(field: DraftField): string {
  return field.label.trim() || 'Pertanyaan tanpa judul';
}

/** Wilayah live tidak membacakan ulang teks yang persis sama (hapus kedua, gagal simpan kedua) — spasi tak terlihat bergantian membuatnya berubah. */
function freshAnnouncement(current: string, message: string): string {
  return current === message ? `${message}\u00A0` : message;
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

/**
 * Penyusun pertanyaan formulir pendaftaran (ADR-056).
 *
 * Hasilnya SATU input tersembunyi `fields` berisi JSON — isian penyusun
 * sendiri sengaja tanpa `name`, supaya tidak ikut terkirim sebagai kolom
 * lepas. Input tersembunyi itu ikut dirender server: tanpa JavaScript,
 * menyimpan halaman tidak menghapus pertanyaan yang sudah ada.
 *
 * Validasi di sini hanya untuk pesan yang cepat; `parseRegistrationFormInput`
 * di server tetap gerbangnya.
 */
export function FormBuilder({ initialFields }: { initialFields: readonly FormField[] }) {
  const [fields, setFields] = useState<DraftField[]>(() => initialFields.map(toDraft));
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [removed, setRemoved] = useState<{ field: DraftField; index: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef(fields);
  const focusAfterRender = useRef<string | null>(null);
  const firstRender = useRef(true);
  // Server & hidrasi = false: tombol penyusun nonaktif sampai benar-benar
  // bisa bekerja, bukan tombol yang diam saat diklik (atau selamanya, tanpa JS).
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

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
    const field: DraftField = { id: newFieldId(), type, label: '', help: '', required: true, options: hasOptions(type) ? ['', ''] : [] };
    setFields((current) => [...current, field]);
    setOpenId(field.id);
    setPicking(false);
    setRemoved(null);
    focusAfterRender.current = `${field.id}-label`;
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    const field = fields[index];
    if (!field || target < 0 || target >= fields.length) return;
    const next = [...fields];
    next.splice(index, 1);
    next.splice(target, 0, field);
    setFields(next);
    // Tombol yang ditekan bisa jadi nonaktif di posisi baru (sudah paling atas/bawah).
    const edge = target === 0 ? 'down' : target === next.length - 1 ? 'up' : delta < 0 ? 'up' : 'down';
    focusAfterRender.current = `${field.id}-${next.length > 1 ? edge : 'label'}`;
    announce(`Dipindah ke urutan ${target + 1} dari ${next.length}.`);
  };

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

  const full = fields.length >= LIMITS.maxFields;

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <input type="hidden" name="fields" value={JSON.stringify(fields.map(toPayload))} />
      <noscript>
        <p className="rounded-card bg-panel-nested px-4 py-3 text-sm text-ink-muted">
          Menyusun pertanyaan butuh JavaScript. Pertanyaan di bawah tetap tersimpan saat kamu menyimpan pengaturan lain.
        </p>
      </noscript>

      {fields.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
          Belum ada pertanyaan tambahan. Pendaftar cukup mengirim nama & email akunnya.
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {fields.map((field, index) => (
            <QuestionCard
              key={field.id}
              field={field}
              index={index}
              total={fields.length}
              open={openId === field.id}
              interactive={hydrated}
              showProblem={attempted}
              onToggle={() => setOpenId((current) => (current === field.id ? null : field.id))}
              onDone={() => {
                setOpenId(null);
                focusAfterRender.current = `${field.id}-toggle`;
              }}
              onChange={(patch) => update(field.id, patch)}
              onMove={(delta) => move(index, delta)}
              onRemove={() => remove(index)}
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
            {FORM_FIELD_TYPES.map((type, typeIndex) => {
              const Icon = TYPE_ICON[type];
              return (
                <li key={type}>
                  <button
                    id={typeIndex === 0 ? 'form-builder-first-type' : undefined}
                    type="button"
                    onClick={() => add(type)}
                    className="press flex min-h-12 w-full items-center gap-2.5 rounded-card border border-line bg-panel px-3 text-left text-sm font-medium transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <Icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    {FORM_FIELD_TYPE_LABEL[type]}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            id="form-builder-add"
            type="button"
            disabled={full || !hydrated}
            onClick={() => {
              setPicking(true);
              focusAfterRender.current = 'form-builder-first-type';
            }}
            className={buttonVariants({ variant: 'secondary' })}
          >
            <Plus aria-hidden /> Tambah pertanyaan
          </button>
          <span className="text-[12.5px] text-ink-muted">
            {full ? `Batas ${LIMITS.maxFields} pertanyaan tercapai.` : `${fields.length} dari ${LIMITS.maxFields} pertanyaan`}
          </span>
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function QuestionCard({
  field,
  index,
  total,
  open,
  interactive,
  showProblem,
  onToggle,
  onDone,
  onChange,
  onMove,
  onRemove,
}: {
  field: DraftField;
  index: number;
  total: number;
  open: boolean;
  interactive: boolean;
  showProblem: boolean;
  onToggle: () => void;
  /** "Selesai" menutup editor tempat tombolnya berada — fokus harus dipindah ke kepala kartu, bukan jatuh ke <body>. */
  onDone: () => void;
  onChange: (patch: Partial<DraftField>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const Icon = TYPE_ICON[field.type];
  const problem = problemOf(field);
  const editorId = `${field.id}-editor`;
  const name = titleOf(field);
  const optionCount = cleanOptions(field.options).length;
  const meta = [
    FORM_FIELD_TYPE_LABEL[field.type],
    field.required ? 'Wajib' : 'Opsional',
    ...(hasOptions(field.type) ? [`${optionCount} pilihan`] : []),
  ].join(' · ');

  return (
    <li
      className={cn(
        'rounded-card border bg-panel transition-[border-color,box-shadow] duration-150 ease-snap',
        open ? 'border-line-strong shadow-card' : 'border-line',
        !open && problem && showProblem && 'border-danger-line',
      )}
    >
      <div className="flex items-center gap-1 py-1 pl-2 pr-1 sm:gap-2 sm:pl-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-card bg-panel-nested text-ink-muted">
          <Icon className="size-4" />
        </span>
        <button
          id={`${field.id}-toggle`}
          type="button"
          aria-expanded={open}
          aria-controls={editorId}
          disabled={!interactive}
          onClick={onToggle}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cn('truncate font-medium', !field.label.trim() && 'text-ink-muted')}>
              <span className="sr-only">Pertanyaan {index + 1}: </span>
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
            <EditorField id={`${field.id}-label`} label="Pertanyaan" error={showProblem && problem === 'label' ? PROBLEM_TEXT.label : null}>
              <input
                id={`${field.id}-label`}
                value={field.label}
                maxLength={LIMITS.labelMax}
                onChange={(event) => onChange({ label: event.target.value })}
                onKeyDown={blockImplicitSubmit}
                placeholder={field.type === 'checkbox' ? 'Mis. Saya bersedia mengikuti seluruh rangkaian acara' : 'Mis. Asal sekolah / kampus'}
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
                  onChange({ type, options });
                }}
              >
                {FORM_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {FORM_FIELD_TYPE_LABEL[type]}
                  </option>
                ))}
              </SelectInput>
              {/* NIK/rekening di kolom Angka kehilangan nol di depan & ditolak di atas 12 digit. */}
              {field.type === 'number' && (
                <p id={`${field.id}-type-hint`} className="text-[12.5px] text-ink-muted">
                  Maks. 12 digit, koma untuk desimal. NIK, nomor rekening, atau telepon: pakai Jawaban singkat.
                </p>
              )}
            </EditorField>
          </div>

          <EditorField id={`${field.id}-help`} label="Keterangan (opsional)">
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <label className="choice">
              <input
                type="checkbox"
                className="check"
                checked={field.required}
                onChange={(event) => onChange({ required: event.target.checked })}
              />
              {field.type === 'checkbox' ? 'Wajib dicentang' : 'Wajib diisi'}
            </label>
            <div className="flex flex-wrap items-center gap-1">
              <MoveButtons field={field} index={index} total={total} onMove={onMove} />
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
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    if (pendingFocus.current === null) return;
    document.getElementById(`${field.id}-option-${pendingFocus.current}`)?.focus();
    pendingFocus.current = null;
  });

  const setOption = (index: number, value: string) => onChange({ options: options.map((option, i) => (i === index ? value : option)) });
  const insertAfter = (index: number) => {
    if (full) return;
    const next = [...options];
    next.splice(index + 1, 0, '');
    onChange({ options: next });
    pendingFocus.current = index + 1;
  };
  const removeAt = (index: number) => {
    onChange({ options: options.filter((_, i) => i !== index) });
    pendingFocus.current = Math.max(0, index - 1);
  };

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      insertAfter(index);
    } else if (event.key === 'Backspace' && options[index] === '' && options.length > 1) {
      event.preventDefault();
      removeAt(index);
    }
  };

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? errorId : `${field.id}-options-hint`}>
      <legend className="mb-1.5 text-[13.5px] font-semibold">Pilihan jawaban</legend>
      <ol className="flex flex-col gap-2">
        {options.map((option, index) => (
          <li key={index} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn('size-4 shrink-0 border-[1.5px] border-line-strong', field.type === 'select' ? 'rounded-pill' : 'rounded-[4px]')}
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
        <span id={`${field.id}-options-hint`} className="text-[12.5px] text-ink-muted">
          {full ? `Maksimal ${LIMITS.optionsMax} pilihan.` : 'Enter untuk pilihan berikutnya.'}
        </span>
      </div>
      {error && <ProblemText id={errorId}>{error}</ProblemText>}
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
