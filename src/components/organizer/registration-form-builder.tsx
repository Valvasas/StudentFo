'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, Check, Eye, Plus, Trash2, Users, UserRound, Zap, ClipboardCheck } from 'lucide-react';
import { saveRegistrationFormAction } from '@/app/penyelenggara/registration-actions';
import { buttonVariants } from '@/components/ui/button';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { asksForSensitiveData, REGISTRATION_LIMITS } from '@/lib/registration-basics';
import { cn } from '@/lib/utils';
import type { RegistrationForm, RegistrationQuestionKind, RegistrationReviewMode } from '@/types/domain';

const SLOTS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;
type Slot = (typeof SLOTS)[number];

const KIND_LABEL: Record<RegistrationQuestionKind, string> = {
  SHORT: 'Jawaban singkat',
  LONG: 'Paragraf',
  CHOICE: 'Pilihan ganda',
  URL: 'Tautan (https)',
};

/** Pertanyaan yang paling sering dibutuhkan panitia kampus — satu klik, bukan mengetik dari nol. */
const IDEAS: readonly { label: string; kind: RegistrationQuestionKind; options?: string; required: boolean }[] = [
  { label: 'Dari mana kamu tahu acara ini?', kind: 'CHOICE', options: 'Instagram\nGrup WhatsApp\nTeman\nStudentFo', required: false },
  { label: 'Ukuran kaos', kind: 'CHOICE', options: 'S\nM\nL\nXL', required: true },
  { label: 'Tautan CV atau portofolio', kind: 'URL', required: true },
  { label: 'Apa yang ingin kamu pelajari?', kind: 'LONG', required: false },
  { label: 'Alergi atau kebutuhan khusus', kind: 'SHORT', required: false },
];

interface QuestionDraft {
  label: string;
  kind: RegistrationQuestionKind;
  required: boolean;
  options: string;
}

const EMPTY: QuestionDraft = { label: '', kind: 'SHORT', required: true, options: '' };

const FIELD_ERROR: Record<string, string> = {
  reviewMode: 'Pilih cara menerima pendaftar.',
  capacity: `Kuota 1–${REGISTRATION_LIMITS.capacityMax.toLocaleString('id-ID')} kursi, atau kosongkan untuk tanpa batas.`,
  teamSize: `Ukuran tim ${1}–${REGISTRATION_LIMITS.teamSizeMax} orang, dan minimal tidak boleh melebihi maksimal.`,
  intro: `Sapaan maksimal ${REGISTRATION_LIMITS.introMax} karakter dan tidak boleh meminta data sensitif.`,
  confirmationNote: `Pesan tiket maksimal ${REGISTRATION_LIMITS.confirmationMax} karakter dan tidak boleh meminta data sensitif.`,
};

function Card({ number, title, hint, children }: { number: number; title: string; hint: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`bagian-${number}`} className="rise flex flex-col gap-5 rounded-[24px] border border-line bg-panel p-5 sm:p-7" style={{ '--i': number } as CSSProperties}>
      <div className="flex items-start gap-4">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand font-display text-[15px] font-bold text-on-brand">
          {number}
        </span>
        <span className="flex flex-col gap-0.5">
          <h2 id={`bagian-${number}`} className="text-[19px] font-bold tracking-[-0.02em]">
            {title}
          </h2>
          <span className="text-[13.5px] text-ink-muted">{hint}</span>
        </span>
      </div>
      {children}
    </section>
  );
}

const NOSCRIPT_CSS = '<style>[data-slot]{display:flex!important}[data-js-only]{display:none!important}[data-options]{display:flex!important}</style>';

/**
 * Penyusun formulir pendaftaran (ADR-055).
 *
 * Satu `<form>` biasa dengan slot pertanyaan tetap `q1`…`q6` — tanpa JS
 * keenam slot tampil dan yang kosong diabaikan server. JS menambah:
 * menampilkan slot sesuai kebutuhan, ide pertanyaan sekali klik, kolom
 * pilihan hanya untuk pilihan ganda, peringatan data sensitif saat
 * mengetik (server tetap menolak), dan pratinjau langsung sudut pandang
 * peserta. Slot yang dihapus lalu diisi lagi memakai slot yang belum pernah
 * dipakai lebih dulu, supaya jawaban lama tidak tertaut ke pertanyaan baru.
 */
export function RegistrationFormBuilder({
  eventId,
  form,
  defaults,
  invalidFields,
}: {
  eventId: string;
  form: RegistrationForm | null;
  defaults: { reviewMode: RegistrationReviewMode; teamMode: boolean };
  invalidFields: readonly string[];
}) {
  const initial = Object.fromEntries(
    SLOTS.map((slot) => {
      const question = form?.questions.find((item) => item.id === slot);
      return [slot, question ? { label: question.label, kind: question.kind, required: question.required, options: question.options.join('\n') } : EMPTY];
    }),
  ) as Record<Slot, QuestionDraft>;
  const usedBefore = new Set(form?.questions.map((question) => question.id) ?? []);

  const [reviewMode, setReviewMode] = useState<RegistrationReviewMode>(form?.reviewMode ?? defaults.reviewMode);
  const [capacity, setCapacity] = useState(form?.capacity ? String(form.capacity) : '');
  const [waitlist, setWaitlist] = useState(form?.waitlist ?? true);
  const [teamMode, setTeamMode] = useState(form ? form.teamSize !== null : defaults.teamMode);
  const [teamMin, setTeamMin] = useState(String(form?.teamSize?.min ?? 2));
  const [teamMax, setTeamMax] = useState(String(form?.teamSize?.max ?? 4));
  const [questions, setQuestions] = useState(initial);
  const [shown, setShown] = useState<readonly Slot[]>(() => SLOTS.filter((slot) => initial[slot].label));
  const [intro, setIntro] = useState(form?.intro ?? '');
  const [confirmation, setConfirmation] = useState(form?.confirmationNote ?? '');
  const invalid = new Set(invalidFields);

  const update = (slot: Slot, patch: Partial<QuestionDraft>) => setQuestions((current) => ({ ...current, [slot]: { ...current[slot], ...patch } }));
  const freeSlot = () => {
    const free = SLOTS.filter((slot) => !shown.includes(slot));
    return free.find((slot) => !usedBefore.has(slot)) ?? free[0] ?? null;
  };
  const add = (draft: QuestionDraft = EMPTY) => {
    const slot = freeSlot();
    if (!slot) return;
    update(slot, draft);
    setShown((current) => [...current, slot]);
    window.setTimeout(() => document.getElementById(`${slot}_label`)?.focus(), 30);
  };
  const remove = (slot: Slot) => {
    update(slot, EMPTY);
    setShown((current) => current.filter((item) => item !== slot));
  };

  const capacityValue = Number.parseInt(capacity, 10);
  const limited = Number.isFinite(capacityValue) && capacityValue > 0;
  const previewQuestions = shown.map((slot) => ({ slot, ...questions[slot] })).filter((question) => question.label.trim());
  const status = form?.status ?? 'DRAFT';
  const error = (key: string, message: string) =>
    invalid.has(key) ? (
      <p id={`${key}-error`} className="text-[12.5px] font-medium text-danger">
        {message}
      </p>
    ) : null;
  const radioCard =
    'flex cursor-pointer items-start gap-3 rounded-[16px] border border-line bg-panel p-4 transition-colors duration-150 ease-snap hover:border-line-strong has-[:checked]:border-ink has-[:checked]:bg-highlight-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus';
  const radioDot = 'mt-0.5 size-[18px] shrink-0 cursor-pointer appearance-none rounded-pill border-2 border-line-strong bg-panel transition-[border-width,border-color] duration-150 ease-snap checked:border-[6px] checked:border-ink focus-visible:outline-none';

  return (
    <form action={saveRegistrationFormAction} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-10">
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_CSS }} />
      <input type="hidden" name="eventId" value={eventId} />

      <div className="flex min-w-0 flex-col gap-5">
        <Card number={1} title="Cara menerima pendaftar" hint="Bisa diubah kapan saja; berlaku untuk pendaftar berikutnya.">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Mode peninjauan</legend>
            <label className={radioCard}>
              <input type="radio" name="reviewMode" value="AUTO" checked={reviewMode === 'AUTO'} onChange={() => setReviewMode('AUTO')} className={radioDot} />
              <span className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                  <Zap aria-hidden className="size-4" /> Langsung diterima
                </span>
                <span className="text-[13px] leading-relaxed text-ink-muted">Tiket aktif begitu dikirim. Cocok untuk seminar, workshop, dan acara terbuka.</span>
              </span>
            </label>
            <label className={radioCard}>
              <input type="radio" name="reviewMode" value="MANUAL" checked={reviewMode === 'MANUAL'} onChange={() => setReviewMode('MANUAL')} className={radioDot} />
              <span className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                  <ClipboardCheck aria-hidden className="size-4" /> Ditinjau dulu
                </span>
                <span className="text-[13px] leading-relaxed text-ink-muted">Kamu memutuskan tiap pendaftar. Cocok untuk magang, beasiswa, dan seleksi lomba.</span>
              </span>
            </label>
          </fieldset>
        </Card>

        <Card number={2} title="Kuota & daftar tunggu" hint="Kosongkan kuota bila kursinya tidak dibatasi.">
          <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-start">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="capacity" className="text-[13.5px] font-semibold">
                Jumlah kursi
              </label>
              <TextInput
                id="capacity"
                name="capacity"
                type="number"
                inputMode="numeric"
                min={1}
                max={REGISTRATION_LIMITS.capacityMax}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                placeholder="Tanpa batas"
                aria-invalid={invalid.has('capacity') || undefined}
                aria-describedby={invalid.has('capacity') ? 'capacity-error' : 'capacity-hint'}
                className="h-12"
              />
            </div>
            <label className={cn(radioCard, 'items-center', !limited && 'opacity-60')}>
              <input
                type="checkbox"
                name="waitlist"
                checked={waitlist}
                onChange={(event) => setWaitlist(event.target.checked)}
                className="size-5 shrink-0 cursor-pointer accent-[var(--color-text-primary)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold">Buka daftar tunggu saat penuh</span>
                <span className="text-[12.5px] leading-relaxed text-ink-muted">Yang antre naik otomatis (urut kedatangan) saat ada yang batal atau kuota ditambah.</span>
              </span>
            </label>
          </div>
          <p id="capacity-hint" className="text-[12.5px] text-ink-muted">
            Menurunkan kuota tidak mengeluarkan pendaftar yang sudah memegang kursi — hanya pendaftar baru yang terdampak.
          </p>
          {error('capacity', FIELD_ERROR.capacity!)}
        </Card>

        <Card number={3} title="Perorangan atau tim" hint="Tim didaftarkan ketuanya, dengan anggota dari tim StudentFo.">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Bentuk peserta</legend>
            <label className={radioCard}>
              <input type="radio" name="teamMode" value="solo" checked={!teamMode} onChange={() => setTeamMode(false)} className={radioDot} />
              <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                <UserRound aria-hidden className="size-4" /> Perorangan
              </span>
            </label>
            <label className={radioCard}>
              <input type="radio" name="teamMode" value="team" checked={teamMode} onChange={() => setTeamMode(true)} className={radioDot} />
              <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                <Users aria-hidden className="size-4" /> Tim
              </span>
            </label>
          </fieldset>
          <div className={cn('grid grid-cols-2 gap-4 sm:max-w-[360px]', !teamMode && 'hidden')} data-options>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="teamMin" className="text-[13.5px] font-semibold">
                Minimal anggota
              </label>
              <TextInput id="teamMin" name="teamMin" type="number" inputMode="numeric" min={1} max={REGISTRATION_LIMITS.teamSizeMax} value={teamMin} onChange={(event) => setTeamMin(event.target.value)} className="h-12" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="teamMax" className="text-[13.5px] font-semibold">
                Maksimal anggota
              </label>
              <TextInput id="teamMax" name="teamMax" type="number" inputMode="numeric" min={1} max={REGISTRATION_LIMITS.teamSizeMax} value={teamMax} onChange={(event) => setTeamMax(event.target.value)} className="h-12" />
            </div>
          </div>
          {(error('teamSize', FIELD_ERROR.teamSize!) ?? error('teamSize_min', FIELD_ERROR.teamSize!)) ?? error('teamSize_max', FIELD_ERROR.teamSize!)}
        </Card>

        <Card number={4} title="Pertanyaan tambahan" hint={`Opsional, maksimal ${REGISTRATION_LIMITS.questionsMax}. Nama, email, WhatsApp, institusi, dan jenjang sudah ditanyakan otomatis.`}>
          <div className="flex flex-col gap-3">
            {SLOTS.map((slot, index) => {
              const question = questions[slot];
              const visible = shown.includes(slot);
              const sensitive = asksForSensitiveData(question.label) || asksForSensitiveData(question.options);
              const labelError = invalid.has(`${slot}_label`);
              const optionsError = invalid.has(`${slot}_options`);
              return (
                <div key={slot} data-slot className={cn('flex-col gap-3 rounded-[18px] border border-line bg-panel-nested/60 p-4', visible ? 'flex fade-in' : 'hidden')}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Pertanyaan {index + 1}</span>
                    <button
                      type="button"
                      data-js-only
                      onClick={() => remove(slot)}
                      aria-label={`Hapus pertanyaan ${index + 1}`}
                      className={buttonVariants({ variant: 'ghost', size: 'icon', className: '-my-2 -mr-2 text-ink-muted' })}
                    >
                      <Trash2 aria-hidden />
                    </button>
                  </div>
                  <label htmlFor={`${slot}_label`} className="sr-only">
                    Teks pertanyaan {index + 1}
                  </label>
                  <TextInput
                    id={`${slot}_label`}
                    name={`${slot}_label`}
                    value={question.label}
                    onChange={(event) => update(slot, { label: event.target.value })}
                    maxLength={REGISTRATION_LIMITS.labelMax}
                    placeholder="Tulis pertanyaannya, mis. Ukuran kaos"
                    aria-invalid={labelError || sensitive || undefined}
                    aria-describedby={sensitive ? `${slot}-sensitive` : labelError ? `${slot}-error` : undefined}
                    className="h-12 bg-panel"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor={`${slot}_kind`} className="sr-only">
                      Jenis jawaban pertanyaan {index + 1}
                    </label>
                    <SelectInput
                      id={`${slot}_kind`}
                      name={`${slot}_kind`}
                      value={question.kind}
                      onChange={(event) => update(slot, { kind: event.target.value as RegistrationQuestionKind })}
                      className="w-auto min-w-[190px] bg-panel"
                    >
                      {(Object.keys(KIND_LABEL) as RegistrationQuestionKind[]).map((kind) => (
                        <option key={kind} value={kind}>
                          {KIND_LABEL[kind]}
                        </option>
                      ))}
                    </SelectInput>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px] font-medium">
                      <input
                        type="checkbox"
                        name={`${slot}_required`}
                        checked={question.required}
                        onChange={(event) => update(slot, { required: event.target.checked })}
                        className="size-5 cursor-pointer accent-[var(--color-text-primary)]"
                      />
                      Wajib diisi
                    </label>
                  </div>
                  <div data-options className={cn('flex-col gap-1.5', question.kind === 'CHOICE' ? 'flex' : 'hidden')}>
                    <label htmlFor={`${slot}_options`} className="text-[13px] font-semibold">
                      Pilihan jawaban <span className="font-normal text-ink-muted">(satu per baris, 2–{REGISTRATION_LIMITS.optionsMax}; khusus pilihan ganda)</span>
                    </label>
                    <TextArea
                      id={`${slot}_options`}
                      name={`${slot}_options`}
                      rows={4}
                      value={question.options}
                      onChange={(event) => update(slot, { options: event.target.value })}
                      aria-invalid={optionsError || undefined}
                      aria-describedby={optionsError ? `${slot}-options-error` : undefined}
                      className="bg-panel"
                    />
                    {optionsError && (
                      <p id={`${slot}-options-error`} className="text-[12.5px] font-medium text-danger">
                        Pilihan ganda butuh 2–{REGISTRATION_LIMITS.optionsMax} pilihan (satu per baris), tanpa data sensitif.
                      </p>
                    )}
                  </div>
                  {sensitive && (
                    <p id={`${slot}-sensitive`} role="alert" className="flex items-start gap-2 rounded-[12px] bg-danger-soft p-3 text-[13px] text-danger">
                      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                      StudentFo tidak mengizinkan formulir meminta kata sandi, OTP, NIK/KTP, atau nomor rekening — formulir seperti ini akan ditolak saat disimpan.
                    </p>
                  )}
                  {labelError && !sensitive && (
                    <p id={`${slot}-error`} className="text-[12.5px] font-medium text-danger">
                      Pertanyaan 3–{REGISTRATION_LIMITS.labelMax} karakter dan tidak boleh meminta data sensitif.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {shown.length < SLOTS.length && (
            <div data-js-only className="flex flex-col gap-3">
              <button type="button" onClick={() => add()} className={buttonVariants({ variant: 'secondary', className: 'self-start border-dashed' })}>
                <Plus aria-hidden /> Tambah pertanyaan
              </button>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[12.5px] text-ink-muted">Ide cepat:</span>
                {IDEAS.filter((idea) => !shown.some((slot) => questions[slot].label === idea.label)).map((idea) => (
                  <button
                    key={idea.label}
                    type="button"
                    onClick={() => add({ label: idea.label, kind: idea.kind, required: idea.required, options: idea.options ?? '' })}
                    className="flex min-h-11 items-center gap-1 rounded-pill px-2 text-[12.5px] font-medium text-ink-soft underline decoration-line-strong decoration-dashed underline-offset-4 hover:text-ink hover:decoration-ink"
                  >
                    <Plus aria-hidden className="size-3" /> {idea.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card number={5} title="Pesan untuk peserta" hint="Dua kalimat yang membuat formulirmu terasa dari manusia, bukan sistem.">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="intro" className="text-[13.5px] font-semibold">
              Sapaan di atas formulir <span className="font-normal text-ink-muted">(opsional)</span>
            </label>
            <TextArea
              id="intro"
              name="intro"
              rows={3}
              maxLength={REGISTRATION_LIMITS.introMax}
              value={intro}
              onChange={(event) => setIntro(event.target.value)}
              placeholder="Mis. Kelas pemula — tidak perlu pengalaman. Bawa laptop sendiri."
              aria-invalid={invalid.has('intro') || undefined}
            />
            <span className="self-end font-mono text-[11.5px] text-ink-muted" aria-hidden>
              {intro.length}/{REGISTRATION_LIMITS.introMax}
            </span>
            {error('intro', FIELD_ERROR.intro!)}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmationNote" className="text-[13.5px] font-semibold">
              Pesan di tiket setelah terdaftar <span className="font-normal text-ink-muted">(opsional)</span>
            </label>
            <TextArea
              id="confirmationNote"
              name="confirmationNote"
              rows={3}
              maxLength={REGISTRATION_LIMITS.confirmationMax}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="Mis. Tautan grup koordinasi & jadwal teknis dikirim H-3 ke email terdaftar."
              aria-describedby="confirmation-hint"
              aria-invalid={invalid.has('confirmationNote') || undefined}
            />
            <p id="confirmation-hint" className="text-[12.5px] text-ink-muted">
              Hanya terlihat oleh peserta yang sudah terkonfirmasi — tempat yang tepat untuk tautan grup.
            </p>
            {error('confirmationNote', FIELD_ERROR.confirmationNote!)}
          </div>
        </Card>

        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-line bg-panel/95 p-3 pl-5 shadow-raised backdrop-blur-sm">
          <span className="text-[13px] text-ink-muted">
            {status === 'OPEN' ? 'Perubahan langsung berlaku untuk pendaftar baru.' : 'Disimpan sebagai draf sampai kamu membukanya.'}
          </span>
          <div className="flex flex-wrap gap-2">
            {status === 'OPEN' ? (
              <SubmitButton name="intent" value="save" className={buttonVariants({ size: 'lg' })}>
                <Check aria-hidden /> Simpan perubahan
              </SubmitButton>
            ) : (
              <>
                <SubmitButton name="intent" value="save" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
                  Simpan draf
                </SubmitButton>
                <SubmitButton name="intent" value="open" className={buttonVariants({ size: 'lg' })}>
                  Simpan & buka pendaftaran
                </SubmitButton>
              </>
            )}
          </div>
        </div>
      </div>

      <aside aria-label="Pratinjau untuk peserta" className="hidden flex-col gap-3 lg:sticky lg:top-24 lg:flex">
        <p className="flex items-center gap-2 px-1 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          <Eye aria-hidden className="size-4" /> Yang dilihat peserta
        </p>
        <div className="flex flex-col gap-4 rounded-[24px] border border-line bg-panel p-5">
          {intro.trim() && <p className="whitespace-pre-line rounded-[14px] bg-panel-nested p-3 text-[13px] leading-relaxed text-ink-soft">{intro.trim()}</p>}
          <ul className="flex flex-col gap-2 text-[13px]">
            <li className="flex items-center gap-2">
              <Check aria-hidden className="size-3.5 text-success" /> Data diri dari akun + WhatsApp, institusi, jenjang
            </li>
            {teamMode && (
              <li className="flex items-center gap-2">
                <Users aria-hidden className="size-3.5" /> Tim {teamMin || '?'}–{teamMax || '?'} orang, dikirim ketua
              </li>
            )}
          </ul>
          {previewQuestions.length > 0 && (
            <ol className="flex flex-col gap-3 border-t border-line pt-4">
              {previewQuestions.map((question) => (
                <li key={question.slot} className="flex flex-col gap-1.5">
                  <span className="flex items-start justify-between gap-2 text-[13px] font-semibold leading-snug">
                    {question.label}
                    <span className={cn('shrink-0 rounded-pill px-1.5 text-[10.5px]', question.required ? 'bg-highlight-soft text-on-highlight' : 'bg-panel-nested text-ink-muted')}>
                      {question.required ? 'Wajib' : 'Opsional'}
                    </span>
                  </span>
                  {question.kind === 'CHOICE' ? (
                    <span className="flex flex-wrap gap-1">
                      {question.options
                        .split('\n')
                        .map((option) => option.trim())
                        .filter(Boolean)
                        .slice(0, REGISTRATION_LIMITS.optionsMax)
                        .map((option) => (
                          <span key={option} className="rounded-pill border border-line px-2 py-0.5 text-[12px]">
                            {option}
                          </span>
                        ))}
                    </span>
                  ) : (
                    <span aria-hidden className={cn('rounded-[10px] border border-line bg-panel-nested/60', question.kind === 'LONG' ? 'h-14' : 'h-8')} />
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="flex items-start gap-2 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-muted">
            <ClipboardCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {reviewMode === 'AUTO' ? 'Setelah kirim: tiket langsung aktif' : 'Setelah kirim: menunggu keputusanmu, lalu dikabari'}
            {limited ? ` · ${capacityValue.toLocaleString('id-ID')} kursi${waitlist ? ', lalu daftar tunggu' : ''}` : ' · kursi tidak dibatasi'}
          </p>
        </div>
      </aside>
    </form>
  );
}
