'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, Award, Check, FileText, MapPin, Pencil, Phone, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useDemoStore } from '@/components/demo/use-demo-store';
import {
  DEFAULT_DOCUMENTS,
  DEFAULT_PROFILE_EXTRAS,
  DOCUMENT_ACCEPT,
  DOCUMENTS_KEY,
  PROFILE_EXTRAS_KEY,
  documentError,
  isAchievementYear,
  normalizePhone,
  parseDocuments,
  parseProfileExtras,
  toExternalUrl,
  type DemoDocument,
  type ProfileExtras,
} from '@/lib/demo/profile-extras';
import { REGIONS } from '@/lib/regions';
import { Picker } from '@/components/ui/picker';
import {
  DetailCard,
  DetailRows,
  detailButton,
  detailFields,
  detailGhostButton,
  detailInput,
  detailPrimaryButton,
} from '@/components/profile/detail-card';
import { cn } from '@/lib/utils';

type Editing = 'publik' | 'kontak' | null;
type Draft = Pick<ProfileExtras, 'headline' | 'bio' | 'city' | 'phone' | 'whatsapp' | 'linkedin' | 'portfolio'>;
type Errors = Partial<Record<keyof Draft, string>>;

const CITY_OPTIONS = REGIONS.flatMap(([group, cities]) => cities.map((label) => ({ label, group })));
const HEADLINE_MAX = 90;
const BIO_MAX = 280;

const todayLabel = () => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date());

function validate(section: Exclude<Editing, null>, draft: Draft): Errors {
  const errors: Errors = {};
  if (section === 'publik') {
    if (draft.headline.length > HEADLINE_MAX) errors.headline = `Maksimal ${HEADLINE_MAX} karakter.`;
    if (draft.bio.length > BIO_MAX) errors.bio = `Maksimal ${BIO_MAX} karakter.`;
  } else {
    if (draft.phone.trim() && !normalizePhone(draft.phone)) errors.phone = 'Nomor belum valid. Contoh: 0812 3456 7890.';
    if (draft.linkedin.trim() && !toExternalUrl(draft.linkedin)) errors.linkedin = 'Tulis alamat web, misalnya linkedin.com/in/nama.';
    if (draft.portfolio.trim() && !toExternalUrl(draft.portfolio)) errors.portfolio = 'Tulis alamat web, misalnya behance.net/nama.';
  }
  return errors;
}

/**
 * Bagian Data diri yang belum punya kolom database (ADR-039): profil
 * publik, kontak, pencapaian, dokumen. Satu komponen supaya aturan kanvas
 * "hanya satu bagian yang bisa diubah sekaligus" cukup satu state.
 */
export function DemoDetailCards({ baseDelay = 0 }: { baseDelay?: number }) {
  const [extras, saveExtras, loaded] = useDemoStore<ProfileExtras>(PROFILE_EXTRAS_KEY, DEFAULT_PROFILE_EXTRAS, parseProfileExtras);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<Draft>(extras);
  const [errors, setErrors] = useState<Errors>({});
  const [toast, setToast] = useState('');
  const editButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (editing) formRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
  }, [editing]);

  const start = (section: Exclude<Editing, null>) => {
    setDraft(extras);
    setErrors({});
    setEditing(section);
  };
  const stop = (section: Exclude<Editing, null>) => {
    setEditing(null);
    setErrors({});
    // Kembalikan fokus ke tombol "Ubah" bagian yang sama — tanpa ini
    // fokus hilang ke <body> saat form dilepas dari DOM.
    requestAnimationFrame(() => editButtons.current[section]?.focus());
  };
  const submit = (section: Exclude<Editing, null>, title: string) => (event: FormEvent) => {
    event.preventDefault();
    const found = validate(section, draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const phone = draft.phone.trim() ? (normalizePhone(draft.phone) ?? '') : '';
    saveExtras({ ...extras, ...draft, headline: draft.headline.trim(), bio: draft.bio.trim(), phone, linkedin: draft.linkedin.trim(), portfolio: draft.portfolio.trim() });
    setToast(`${title} disimpan.`);
    stop(section);
  };

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const header = (section: Exclude<Editing, null>) =>
    editing === section ? (
      <>
        <button type="button" onClick={() => stop(section)} className={detailGhostButton}>
          Batal
        </button>
        <button type="submit" form={`form-${section}`} className={detailPrimaryButton}>
          Simpan
        </button>
      </>
    ) : (
      <button
        ref={(node) => {
          editButtons.current[section] = node;
        }}
        type="button"
        onClick={() => start(section)}
        disabled={!loaded || (editing !== null && editing !== section)}
        className={detailButton}
      >
        <Pencil aria-hidden className="size-3.5" />
        Ubah<span className="sr-only"> {section === 'publik' ? 'profil publik' : 'kontak'}</span>
      </button>
    );

  const linkValue = (value: string) => {
    const href = toExternalUrl(value);
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
        {value.replace(/^https?:\/\//i, '')}
        <span className="sr-only"> (tab baru)</span>
      </a>
    ) : (
      'Belum diisi'
    );
  };

  return (
    <>
      <DetailCard
        id="profil-publik"
        icon={<Sparkles className="size-[18px]" />}
        title="Profil publik"
        description="Headline, bio, dan kota yang tampil saat tim melihat profilmu."
        editing={editing === 'publik'}
        actions={header('publik')}
        delay={baseDelay}
      >
        {editing === 'publik' ? (
          <form id="form-publik" ref={formRef} onSubmit={submit('publik', 'Profil publik')} noValidate className={detailFields}>
            <TextField label="Headline" value={draft.headline} onChange={set('headline')} max={HEADLINE_MAX} error={errors.headline} placeholder="Contoh: Suka riset pengguna dan merapikan antarmuka." wide />
            <TextField label="Bio" value={draft.bio} onChange={set('bio')} max={BIO_MAX} error={errors.bio} placeholder="Ceritakan singkat pengalaman dan yang sedang kamu cari." area wide />
            <div className="flex flex-col gap-[7px]">
              <span id="kota-label" className="text-[13.5px] font-semibold">
                Kota domisili
              </span>
              <Picker
                id="kota-picker"
                labelledBy="kota-label"
                title="Kota domisili"
                placeholder="Pilih kota"
                searchPlaceholder="Cari kota atau provinsi"
                icon={<MapPin aria-hidden className="size-4" />}
                value={draft.city}
                options={CITY_OPTIONS}
                onChange={(value, kind) => kind !== 'group' && set('city')(value)}
              />
            </div>
          </form>
        ) : (
          <DetailRows
            rows={[
              { label: 'Headline', value: extras.headline || 'Belum diisi', empty: !extras.headline, wide: true },
              { label: 'Bio', value: extras.bio || 'Belum diisi', empty: !extras.bio, wide: true },
              { label: 'Kota domisili', value: extras.city || 'Belum diisi', empty: !extras.city },
            ]}
          />
        )}
      </DetailCard>

      <DetailCard
        id="kontak"
        icon={<Phone className="size-[18px]" />}
        title="Kontak"
        description="Dipakai tim untuk menghubungimu setelah kamu menerima ajakan."
        editing={editing === 'kontak'}
        actions={header('kontak')}
        delay={baseDelay + 60}
      >
        {editing === 'kontak' ? (
          <form id="form-kontak" ref={formRef} onSubmit={submit('kontak', 'Kontak')} noValidate className={detailFields}>
            <div className="flex flex-col gap-2">
              <TextField label="Nomor HP" value={draft.phone} onChange={set('phone')} error={errors.phone} placeholder="0812 3456 7890" type="tel" autoComplete="tel" />
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 self-start text-sm">
                <input type="checkbox" checked={draft.whatsapp} onChange={(event) => set('whatsapp')(event.target.checked)} className="peer sr-only" />
                <span
                  aria-hidden
                  className="relative h-[18px] w-[30px] rounded-[9px] bg-line-strong transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,.2)] after:transition-transform after:duration-200 after:content-[''] peer-checked:bg-brand peer-checked:after:translate-x-3 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
                />
                Nomor ini aktif di WhatsApp
              </label>
            </div>
            <TextField label="LinkedIn" value={draft.linkedin} onChange={set('linkedin')} error={errors.linkedin} placeholder="linkedin.com/in/nama" type="url" autoComplete="url" />
            <TextField label="Portofolio" value={draft.portfolio} onChange={set('portfolio')} error={errors.portfolio} placeholder="behance.net/nama" type="url" autoComplete="url" />
          </form>
        ) : (
          <DetailRows
            rows={[
              {
                label: 'Nomor HP',
                value: extras.phone ? `${extras.phone}${extras.whatsapp ? ' · WhatsApp' : ''}` : 'Belum diisi',
                empty: !extras.phone,
              },
              { label: 'LinkedIn', value: linkValue(extras.linkedin), empty: !toExternalUrl(extras.linkedin) },
              { label: 'Portofolio', value: linkValue(extras.portfolio), empty: !toExternalUrl(extras.portfolio) },
            ]}
          />
        )}
      </DetailCard>

      <AchievementsCard extras={extras} save={saveExtras} loaded={loaded} onSaved={setToast} delay={baseDelay + 120} />
      <DocumentsCard onSaved={setToast} delay={baseDelay + 180} />

      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <span className="pop flex items-center gap-2 rounded-card bg-inverse px-4 py-3 text-sm font-medium text-on-inverse shadow-overlay">
            <Check aria-hidden className="size-4" strokeWidth={2.4} />
            {toast}
          </span>
        )}
      </div>
    </>
  );
}

function TextField({
  label,
  value,
  onChange,
  error,
  max,
  placeholder,
  area = false,
  wide = false,
  type = 'text',
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  max?: number;
  placeholder?: string;
  area?: boolean;
  wide?: boolean;
  type?: 'text' | 'tel' | 'url';
  autoComplete?: string;
}) {
  const id = useId();
  const described = [error && `${id}-error`, max && `${id}-count`].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    value,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': described,
  } as const;
  return (
    <div className={cn('flex flex-col gap-[7px]', wide && 'col-span-full')}>
      <span className="flex justify-between gap-2">
        <label htmlFor={id} className="text-[13.5px] font-semibold">
          {label}
        </label>
        {max && (
          <span id={`${id}-count`} className={cn('text-xs', value.length > max ? 'font-semibold text-danger' : 'text-ink-muted')}>
            {value.length}/{max}
          </span>
        )}
      </span>
      {area ? (
        <textarea {...common} rows={4} onChange={(event) => onChange(event.target.value)} className={cn(detailInput, 'h-auto resize-y py-3 leading-[1.55]')} />
      ) : (
        <input {...common} type={type} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} className={detailInput} />
      )}
      {error && (
        <span id={`${id}-error`} className="flex items-center gap-1.5 text-[12.5px] font-medium text-danger">
          <AlertCircle aria-hidden className="size-3.5" />
          {error}
        </span>
      )}
    </div>
  );
}

function AchievementsCard({
  extras,
  save,
  loaded,
  onSaved,
  delay,
}: {
  extras: ProfileExtras;
  save: (next: ProfileExtras) => void;
  loaded: boolean;
  onSaved: (message: string) => void;
  delay: number;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', event: '', year: '' });
  const [errors, setErrors] = useState<{ title?: string; year?: string }>({});
  const addRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) firstField.current?.focus();
  }, [adding]);

  const close = () => {
    setAdding(false);
    setErrors({});
    setDraft({ title: '', event: '', year: '' });
    requestAnimationFrame(() => addRef.current?.focus());
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = {
      title: draft.title.trim() ? undefined : 'Isi nama pencapaian.',
      year: isAchievementYear(draft.year.trim()) ? undefined : 'Tahun 4 digit, misalnya 2025.',
    };
    setErrors(found);
    if (found.title || found.year) return;
    const item = { title: draft.title.trim().slice(0, 120), event: draft.event.trim().slice(0, 120), year: draft.year.trim() };
    save({ ...extras, achievements: [item, ...extras.achievements].slice(0, 20) });
    onSaved('Pencapaian ditambahkan.');
    close();
  };

  return (
    <DetailCard
      id="pencapaian"
      icon={<Award className="size-[18px]" />}
      title="Pencapaian"
      description="Juara, finalis, atau sertifikat yang ingin dilihat tim dan penyelenggara."
      delay={delay}
    >
      <h3 ref={headingRef} tabIndex={-1} className="sr-only">
        Daftar pencapaian
      </h3>
      <ol className="flex flex-col px-5 sm:px-6">
        {extras.achievements.map((item, index) => (
          <li key={`${item.title}-${item.year}-${index}`} className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line/70 py-3">
            <span className="font-mono text-sm font-medium text-ink-muted">{item.year}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{item.title}</span>
              {item.event && <span className="text-[13px] text-ink-muted">{item.event}</span>}
            </span>
            <button
              type="button"
              disabled={!loaded}
              onClick={() => {
                save({ ...extras, achievements: extras.achievements.filter((_, at) => at !== index) });
                onSaved('Pencapaian dihapus.');
                headingRef.current?.focus();
              }}
              className="flex size-11 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150 hover:bg-panel-nested hover:text-ink"
            >
              <Trash2 aria-hidden className="size-4" />
              <span className="sr-only">Hapus {item.title}</span>
            </button>
          </li>
        ))}
        {extras.achievements.length === 0 && <li className="border-t border-line/70 py-3.5 text-sm text-ink-muted">Belum ada pencapaian.</li>}
      </ol>
      {adding ? (
        <form onSubmit={submit} noValidate aria-label="Tambah pencapaian" className={cn(detailFields, 'mt-2 border-t border-line pt-5')}>
          <AchievementInput ref={firstField} label="Nama pencapaian" value={draft.title} error={errors.title} placeholder="Juara 2 UI/UX Competition" onChange={(title) => setDraft({ ...draft, title })} />
          <AchievementInput label="Kegiatan / penyelenggara" value={draft.event} placeholder="Nama lomba atau lembaga" onChange={(value) => setDraft({ ...draft, event: value })} />
          <AchievementInput label="Tahun" value={draft.year} error={errors.year} placeholder="2025" inputMode="numeric" maxLength={4} onChange={(year) => setDraft({ ...draft, year })} />
          <div className="col-span-full flex gap-2">
            <button type="submit" className={detailPrimaryButton}>
              Tambahkan
            </button>
            <button type="button" onClick={close} className={detailGhostButton}>
              Batal
            </button>
          </div>
        </form>
      ) : (
        <button
          ref={addRef}
          type="button"
          disabled={!loaded}
          onClick={() => setAdding(true)}
          className="mx-5 mb-5 mt-2 flex h-11 items-center gap-1.5 self-start rounded-card border border-dashed border-line-strong px-3.5 text-[13.5px] font-semibold transition-colors duration-150 hover:border-brand sm:mx-6"
        >
          <Plus aria-hidden className="size-3.5" />
          Tambah pencapaian
        </button>
      )}
    </DetailCard>
  );
}

function AchievementInput({
  label,
  value,
  onChange,
  error,
  placeholder,
  inputMode,
  maxLength = 120,
  ref,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  inputMode?: 'numeric';
  maxLength?: number;
  ref?: React.Ref<HTMLInputElement>;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-[7px]">
      <label htmlFor={id} className="text-[13.5px] font-semibold">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={detailInput}
      />
      {error && (
        <span id={`${id}-error`} className="flex items-center gap-1.5 text-[12.5px] font-medium text-danger">
          <AlertCircle aria-hidden className="size-3.5" />
          {error}
        </span>
      )}
    </div>
  );
}

function DocumentsCard({ onSaved, delay }: { onSaved: (message: string) => void; delay: number }) {
  const [docs, save, loaded] = useDemoStore<readonly DemoDocument[]>(DOCUMENTS_KEY, DEFAULT_DOCUMENTS, parseDocuments);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ready = docs.filter((doc) => doc.file).length;

  const pick = (name: string, file: File | undefined) => {
    if (!file) return;
    const error = documentError(file);
    setErrors((current) => ({ ...current, [name]: error ?? '' }));
    if (error) return;
    save(docs.map((doc) => (doc.name === name ? { ...doc, file: file.name.slice(0, 120), date: todayLabel() } : doc)));
    onSaved(`${name} tersimpan.`);
  };

  return (
    <DetailCard
      id="dokumen"
      icon={<FileText className="size-[18px]" />}
      title="Dokumen siap pakai"
      description={`Unggah sekali, pakai berulang saat mendaftar. ${ready} dari ${docs.length} siap.`}
      delay={delay}
    >
      <ul className="flex flex-col px-5 pb-3 sm:px-6">
        {docs.map((doc) => {
          const inputId = `dok-${doc.name.replace(/\W+/g, '-').toLowerCase()}`;
          const error = errors[doc.name];
          return (
            <li key={doc.name} className="flex flex-wrap items-center gap-3 border-t border-line/70 py-3">
              <span
                aria-hidden
                className={cn('flex size-9 shrink-0 items-center justify-center rounded-[9px]', doc.file ? 'bg-brand text-on-brand' : 'border border-dashed border-line-strong text-ink-muted')}
              >
                {doc.file ? <Check className="size-4" strokeWidth={2.4} /> : <FileText className="size-4" />}
              </span>
              <span className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold">{doc.name}</span>
                <span className="truncate text-[12.5px] text-ink-muted">{doc.file ? `${doc.file} · ${doc.date}` : 'Belum diunggah'}</span>
                {error && (
                  <span role="alert" className="flex items-center gap-1.5 text-[12.5px] font-medium text-danger">
                    <AlertCircle aria-hidden className="size-3.5" />
                    {error}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <label
                  htmlFor={inputId}
                  className={cn(
                    detailButton,
                    'cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                    !loaded && 'pointer-events-none opacity-40',
                  )}
                >
                  <Upload aria-hidden className="size-3.5" />
                  {doc.file ? 'Ganti' : 'Unggah'}
                  <span className="sr-only"> {doc.name}</span>
                  <input
                    id={inputId}
                    type="file"
                    accept={DOCUMENT_ACCEPT}
                    disabled={!loaded}
                    className="sr-only"
                    onChange={(event) => {
                      pick(doc.name, event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
                {doc.file && (
                  <button
                    type="button"
                    onClick={() => {
                      save(docs.map((item) => (item.name === doc.name ? { ...item, file: '', date: '' } : item)));
                      onSaved(`${doc.name} dihapus.`);
                    }}
                    className="flex size-11 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150 hover:bg-panel-nested hover:text-ink"
                  >
                    <X aria-hidden className="size-4" />
                    <span className="sr-only">Hapus {doc.name}</span>
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-5 py-3.5 text-[12.5px] leading-relaxed text-ink-muted sm:px-6">
        Mode demo: hanya nama berkas yang dicatat di perangkat ini. Isi berkas tidak dibaca dan tidak dikirim ke mana pun. PDF, JPG, atau PNG, maksimal 5 MB.
      </p>
    </DetailCard>
  );
}

/** Ringkasan dokumen siap pakai untuk halaman status & persiapan. */
export function DemoDocumentsSummary() {
  const [docs] = useDemoStore<readonly DemoDocument[]>(DOCUMENTS_KEY, DEFAULT_DOCUMENTS, parseDocuments);
  return (
    <ul className="flex flex-col">
      {docs.map((doc) => (
        <li key={doc.name} className="flex items-center gap-3 border-t border-line/70 py-2.5 first:border-t-0">
          <span
            aria-hidden
            className={cn('flex size-6 shrink-0 items-center justify-center rounded-[6px]', doc.file ? 'bg-brand text-on-brand' : 'border border-dashed border-line-strong')}
          >
            {doc.file && <Check className="size-3" strokeWidth={2.6} />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13.5px] font-semibold">{doc.name}</span>
            <span className="truncate text-[12px] text-ink-muted">{doc.file || 'Belum diunggah'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Kontak & kota dari profil demo, untuk ditinjau sebelum mendaftar. */
export function DemoContactRows() {
  const [extras] = useDemoStore<ProfileExtras>(PROFILE_EXTRAS_KEY, DEFAULT_PROFILE_EXTRAS, parseProfileExtras);
  return (
    <DetailRows
      rows={[
        { label: 'Nomor HP', value: extras.phone || 'Belum diisi', empty: !extras.phone },
        { label: 'Kota domisili', value: extras.city || 'Belum diisi', empty: !extras.city },
      ]}
    />
  );
}
