'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Hourglass, Lock, PencilLine, ShieldCheck, Users } from 'lucide-react';
import { submitRegistrationAction } from '@/app/events/[slug]/pendaftaran/actions';
import { SeatMeter } from '@/components/registration/seat-meter';
import { Ticket, type TicketProps } from '@/components/registration/ticket';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { TextArea, TextInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { displayPhone, normalizePhone, REGISTRATION_LIMITS } from '@/lib/registration-basics';
import { cn } from '@/lib/utils';
import type { EducationLevel, RegistrationForm, RegistrationQuestion, RegistrationSeats } from '@/types/domain';

export interface LevelOption {
  readonly value: EducationLevel;
  readonly label: string;
  readonly eligible: boolean;
}

export interface TeamOption {
  readonly id: string;
  readonly title: string;
  readonly members: readonly { readonly name: string; readonly seed: string }[];
  /** Alasan tim belum bisa didaftarkan (ukuran), `null` = siap. */
  readonly problem: string | null;
}

type Prediction = 'CONFIRMED' | 'PENDING' | 'WAITLISTED';
type StepKey = 'diri' | 'pertanyaan' | 'tim' | 'kirim';

interface StepDef {
  readonly key: StepKey;
  readonly title: string;
  readonly hint: string;
  readonly fields: readonly string[];
}

const PREDICTION: Record<Prediction, { title: string; text: string }> = {
  CONFIRMED: { title: 'Langsung terdaftar', text: 'Begitu dikirim, tiketmu langsung aktif — tidak perlu menunggu.' },
  PENDING: { title: 'Ditinjau panitia', text: 'Panitia meninjau tiap pendaftar. Keputusannya dikabarkan lewat lonceng notifikasi.' },
  WAITLISTED: { title: 'Masuk daftar tunggu', text: 'Kursi sedang penuh. Kamu naik otomatis begitu ada yang batal — tanpa daftar ulang.' },
};

const FIELD_ERROR: Record<string, string> = {
  phone: 'Nomor WhatsApp belum valid. Contoh: 0812-3456-7890.',
  institution: `Tulis nama sekolah, kampus, atau instansimu (2–${REGISTRATION_LIMITS.institutionMax} karakter).`,
  major: `Jurusan maksimal ${REGISTRATION_LIMITS.majorMax} karakter.`,
  educationLevel: 'Pilih jenjang pendidikanmu.',
  teamId: 'Pilih tim yang kamu ketuai dan ukurannya sudah sesuai.',
  consent: 'Centang persetujuan supaya pendaftaran bisa dikirim.',
};

function questionError(question: RegistrationQuestion): string {
  switch (question.kind) {
    case 'URL':
      return 'Tautan harus lengkap dan diawali https://.';
    case 'CHOICE':
      return 'Pilih salah satu jawaban.';
    case 'LONG':
      return `Jawaban wajib diisi, maksimal ${REGISTRATION_LIMITS.longAnswerMax} karakter.`;
    case 'SHORT':
      return `Jawaban wajib diisi, maksimal ${REGISTRATION_LIMITS.shortAnswerMax} karakter.`;
  }
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isControl = (element: Element): element is Control =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;

function readForm(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value === 'string') values[key] = value;
  });
  return values;
}

/** Tanpa JS: semua langkah tampil berurutan dan navigasi wizard disembunyikan — tetap satu <form> utuh. */
const NOSCRIPT_CSS = '<style>[data-step]{display:flex!important}[data-wizard-only]{display:none!important}[data-noscript-only]{display:block!important}</style>';

/**
 * Formulir pendaftaran bertahap (ADR-055).
 *
 * Server merender langkah yang aktif saja — tidak ada kilatan "semua
 * langkah lalu menciut" saat hidrasi — dan `<noscript>` membuka semuanya
 * untuk peramban tanpa JS. Isian tetap kolom biasa dengan validasi HTML
 * (required, maxLength, pattern); JS menambah: validasi per langkah,
 * pratinjau tiket yang terisi sambil mengetik, ringkasan sebelum kirim,
 * dan draf di sessionStorage supaya isian tidak hilang ketika server
 * menolak (kuota berubah, nomor salah) dan halaman dimuat ulang. Draf
 * sengaja per-tab (bukan localStorage): data pribadi tidak tertinggal di
 * perangkat bersama setelah tab ditutup.
 */
export function RegistrationWizard({
  slug,
  draftKey,
  organizer,
  form,
  account,
  defaults,
  levels,
  levelHint,
  teams,
  memberOf,
  newTeamHref,
  invalidFields,
  prediction,
  waitlistAhead,
  ticket,
  seats,
  waitlist,
}: {
  slug: string;
  draftKey: string;
  organizer: string;
  form: Pick<RegistrationForm, 'questions' | 'teamSize'>;
  account: { readonly id: string; readonly fullName: string; readonly email: string };
  defaults: { readonly phone: string; readonly institution: string; readonly major: string; readonly educationLevel: EducationLevel | null };
  levels: readonly LevelOption[];
  levelHint: string | null;
  teams: readonly TeamOption[];
  /** Tim acara ini tempat pengguna jadi anggota biasa — ketuanya yang mendaftarkan. */
  memberOf: readonly string[];
  newTeamHref: string;
  invalidFields: readonly string[];
  prediction: Prediction;
  waitlistAhead: number;
  ticket: Pick<TicketProps, 'eventTitle' | 'organizer' | 'eventType' | 'when' | 'where' | 'tint'>;
  seats: RegistrationSeats;
  waitlist: boolean;
}) {
  const steps: StepDef[] = [
    { key: 'diri', title: 'Data diri', hint: 'Nama & email dari akunmu; sisanya untuk panitia menghubungimu.', fields: ['phone', 'institution', 'major', 'educationLevel'] },
    ...(form.questions.length > 0
      ? [{ key: 'pertanyaan' as const, title: 'Pertanyaan panitia', hint: `${form.questions.length} pertanyaan singkat dari ${organizer}.`, fields: form.questions.map((question) => question.id) }]
      : []),
    ...(form.teamSize
      ? [{ key: 'tim' as const, title: 'Tim', hint: `Didaftarkan ketua tim · ${form.teamSize.min}–${form.teamSize.max} orang.`, fields: ['teamId'] }]
      : []),
    { key: 'kirim', title: 'Tinjau & kirim', hint: 'Periksa sekali lagi, lalu kirim.', fields: ['consent'] },
  ];
  const initialStep = Math.max(
    0,
    steps.findIndex((step) => step.fields.some((field) => invalidFields.includes(field))),
  );

  const formRef = useRef<HTMLFormElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const headingRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const [active, setActive] = useState(initialStep);
  const [furthest, setFurthest] = useState(invalidFields.length > 0 ? steps.length - 1 : initialStep);
  const [errors, setErrors] = useState<ReadonlySet<string>>(() => new Set(invalidFields));
  const [values, setValues] = useState<Record<string, string>>(() => ({
    phone: defaults.phone,
    institution: defaults.institution,
    major: defaults.major,
    ...(defaults.educationLevel ? { educationLevel: defaults.educationLevel } : {}),
  }));
  const focusStep = useRef<number | null>(null);
  const last = steps.length - 1;
  // Belum memimpin tim yang memenuhi syarat: langkah Tim tidak bisa dilewati, alasannya tertulis di langkah itu.
  const teamBlocked = Boolean(form.teamSize) && !teams.some((team) => team.problem === null);
  const blocked = (index: number) => teamBlocked && steps[index]?.key === 'tim';

  const syncPhoneValidity = useCallback(() => {
    const phone = formRef.current?.elements.namedItem('phone');
    if (phone instanceof HTMLInputElement) {
      phone.setCustomValidity(phone.value.trim() && !normalizePhone(phone.value) ? FIELD_ERROR.phone! : '');
    }
  }, []);

  // Pulihkan draf tab ini (mis. setelah server menolak dan halaman dimuat ulang).
  useEffect(() => {
    const element = formRef.current;
    if (!element) return;
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      const draft: unknown = raw ? JSON.parse(raw) : null;
      if (draft && typeof draft === 'object') {
        for (const [name, value] of Object.entries(draft as Record<string, unknown>)) {
          if (typeof value !== 'string' || name === 'consent' || name === 'slug') continue;
          for (const control of Array.from(element.elements).filter(isControl)) {
            if (control.name !== name || control.type === 'hidden' || control.disabled) continue;
            if (control instanceof HTMLInputElement && (control.type === 'radio' || control.type === 'checkbox')) control.checked = control.value === value;
            else control.value = value;
          }
        }
      }
    } catch {
      // Penyimpanan diblokir (mode privat, kebijakan peramban): formulir tetap jalan tanpa draf.
    }
    syncPhoneValidity();
    setValues(readForm(element));
  }, [draftKey, syncPhoneValidity]);

  useEffect(() => {
    if (focusStep.current === null) return;
    const index = focusStep.current;
    focusStep.current = null;
    // Gulir ke bilah langkah (bukan ke kartunya) hanya bila sudah lewat dari layar — progresnya ikut terlihat.
    const top = topRef.current;
    if (top && top.getBoundingClientRect().top < 72) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      top.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }
    headingRefs.current[index]?.focus({ preventScroll: true });
  }, [active]);

  const onInput = (event: FormEvent<HTMLFormElement>) => {
    const element = event.currentTarget;
    const target = event.target;
    if (target instanceof Element && isControl(target) && errors.has(target.name)) {
      setErrors((current) => {
        const next = new Set(current);
        next.delete(target.name);
        return next;
      });
    }
    syncPhoneValidity();
    const snapshot = readForm(element);
    setValues(snapshot);
    try {
      const { consent: _consent, slug: _slug, ...draft } = snapshot;
      window.sessionStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Lihat catatan di atas: tanpa draf bukan kegagalan.
    }
  };

  /** Kolom pertama yang tidak valid di langkah ini, sudah ditandai & diberi gelembung peramban. */
  const firstInvalid = (index: number): Control | null => {
    const section = sectionRefs.current[index];
    if (!section) return null;
    syncPhoneValidity();
    return Array.from(section.querySelectorAll('input, select, textarea')).filter(isControl).find((control) => !control.checkValidity()) ?? null;
  };

  const stopAt = (index: number, invalid: Control | null) => {
    setErrors((current) => new Set(current).add(invalid?.name ?? 'teamId'));
    if (index !== active) {
      focusStep.current = index;
      setActive(index);
    } else {
      headingRefs.current[index]?.focus();
    }
    if (invalid) window.setTimeout(() => invalid.reportValidity(), index !== active ? 60 : 0);
  };

  const goTo = (target: number) => {
    if (target > active) {
      for (let index = active; index < target; index += 1) {
        if (blocked(index)) {
          stopAt(index, null);
          return;
        }
        const invalid = firstInvalid(index);
        if (invalid) {
          stopAt(index, invalid);
          return;
        }
      }
    }
    focusStep.current = target;
    setActive(target);
    setFurthest((current) => Math.max(current, target));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Enter di langkah awal = "Lanjut", bukan kirim diam-diam dengan langkah berikutnya belum dilihat.
    if (active < last) {
      event.preventDefault();
      goTo(active + 1);
      return;
    }
    for (let index = 0; index <= last; index += 1) {
      const invalid = blocked(index) ? null : firstInvalid(index);
      if (!invalid && !blocked(index)) continue;
      event.preventDefault();
      stopAt(index, invalid);
      return;
    }
  };

  const fieldError = (name: string, message: string) =>
    errors.has(name) ? (
      <p id={`${name}-error`} className="fade-in text-[12.5px] font-medium text-danger">
        {message}
      </p>
    ) : null;
  const describedBy = (name: string, hint?: string) => [hint, errors.has(name) ? `${name}-error` : null].filter(Boolean).join(' ') || undefined;

  const selectedTeam = teams.find((team) => team.id === values.teamId) ?? null;
  const levelLabel = levels.find((level) => level.value === values.educationLevel)?.label ?? null;
  const phonePreview = values.phone ? normalizePhone(values.phone) : null;
  const preview: TicketProps = {
    ...ticket,
    holder: account.fullName,
    institution: values.institution?.trim() || 'Sekolah / kampusmu',
    team: form.teamSize ? (selectedTeam?.title ?? 'Pilih timmu') : null,
    code: null,
    status: 'PREVIEW',
    stampLabel: 'Pratinjau',
  };

  const stepShell = (index: number, body: ReactNode) => {
    const step = steps[index]!;
    return (
      <section
        key={step.key}
        ref={(node) => {
          sectionRefs.current[index] = node;
        }}
        data-step
        aria-labelledby={`langkah-${step.key}`}
        className={cn('flex-col gap-6 rounded-[24px] border border-line bg-panel p-5 sm:p-7', index === active ? 'flex fade-in' : 'hidden')}
      >
        <div className="flex items-start gap-4">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand font-display text-[15px] font-bold text-on-brand">
            {index + 1}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <h2
              id={`langkah-${step.key}`}
              tabIndex={-1}
              ref={(node) => {
                headingRefs.current[index] = node;
              }}
              className="text-[20px] font-bold tracking-[-0.02em] outline-none"
            >
              <span className="sr-only">
                Langkah {index + 1} dari {steps.length}:{' '}
              </span>
              {step.title}
            </h2>
            <span className="text-[13.5px] text-ink-muted">{step.hint}</span>
          </span>
        </div>
        {body}
        {index < last && (
          <div data-wizard-only className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            {index > 0 ? (
              <button type="button" onClick={() => goTo(index - 1)} className={buttonVariants({ variant: 'ghost', className: '-ml-3' })}>
                <ArrowLeft aria-hidden /> Kembali
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => goTo(index + 1)} className={buttonVariants({ size: 'lg', className: 'group' })}>
              Lanjut: {steps[index + 1]!.title}
              <ArrowRight aria-hidden className="transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
            </button>
          </div>
        )}
      </section>
    );
  };

  const requiredPill = (question: RegistrationQuestion, id: string) => (
    <span
      id={id}
      className={cn(
        'shrink-0 rounded-pill px-2 py-0.5 text-[11.5px] font-semibold',
        question.required ? 'bg-highlight-soft text-on-highlight' : 'bg-panel-nested text-ink-muted',
      )}
    >
      {question.required ? 'Wajib' : 'Opsional'}
    </span>
  );

  const choiceCard = 'flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border border-line bg-panel px-3.5 py-2.5 text-[14.5px] transition-colors duration-150 ease-snap hover:border-line-strong has-[:checked]:border-ink has-[:checked]:bg-highlight-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55';
  const radioDot = 'peer size-[18px] shrink-0 cursor-[inherit] appearance-none rounded-pill border-2 border-line-strong bg-panel transition-[border-width,border-color] duration-150 ease-snap checked:border-[6px] checked:border-ink focus-visible:outline-none';

  const sections: ReactNode[] = steps.map((step, index) => {
    if (step.key === 'diri') {
      return stepShell(
        index,
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3.5 rounded-[16px] bg-panel-nested p-3.5">
            <Avatar name={account.fullName} seed={account.id} size="md" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-semibold">{account.fullName}</span>
              <span className="truncate text-[13px] text-ink-muted">{account.email}</span>
            </span>
            <Link href="/profile" className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-card px-2.5 text-[13px] font-medium text-ink-soft hover:bg-panel hover:text-ink">
              <PencilLine aria-hidden className="size-3.5" /> Ubah
              <span className="sr-only">nama di profil</span>
            </Link>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-[13.5px] font-semibold">
              Nomor WhatsApp
            </label>
            <TextInput
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              maxLength={20}
              defaultValue={defaults.phone}
              placeholder="0812-3456-7890"
              aria-invalid={errors.has('phone') || undefined}
              aria-describedby={describedBy('phone', 'phone-hint')}
              className="h-12"
            />
            <p id="phone-hint" className="text-[12.5px] text-ink-muted">
              {phonePreview ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <Check aria-hidden className="size-3.5" /> Tersimpan sebagai {displayPhone(phonePreview)}
                </span>
              ) : (
                'Nomor Indonesia aktif — panitia memakainya untuk info teknis acara.'
              )}
            </p>
            {fieldError('phone', FIELD_ERROR.phone!)}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="institution" className="text-[13.5px] font-semibold">
                Sekolah / kampus / instansi
              </label>
              <TextInput
                id="institution"
                name="institution"
                autoComplete="organization"
                required
                minLength={2}
                maxLength={REGISTRATION_LIMITS.institutionMax}
                defaultValue={defaults.institution}
                placeholder="Mis. Universitas Gadjah Mada"
                aria-invalid={errors.has('institution') || undefined}
                aria-describedby={describedBy('institution')}
                className="h-12"
              />
              {fieldError('institution', FIELD_ERROR.institution!)}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="major" className="text-[13.5px] font-semibold">
                Jurusan <span className="font-normal text-ink-muted">(opsional)</span>
              </label>
              <TextInput
                id="major"
                name="major"
                maxLength={REGISTRATION_LIMITS.majorMax}
                defaultValue={defaults.major}
                placeholder="Mis. Statistika"
                aria-invalid={errors.has('major') || undefined}
                aria-describedby={describedBy('major')}
                className="h-12"
              />
              {fieldError('major', FIELD_ERROR.major!)}
            </div>
          </div>

          <fieldset className="flex flex-col gap-2" aria-describedby={describedBy('educationLevel', levelHint ? 'level-hint' : undefined)}>
            <legend className="mb-1 text-[13.5px] font-semibold">Jenjang pendidikan saat ini</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {levels.map((level) => (
                <label key={level.value} className={choiceCard}>
                  <input
                    type="radio"
                    name="educationLevel"
                    value={level.value}
                    required
                    disabled={!level.eligible}
                    defaultChecked={defaults.educationLevel === level.value && level.eligible}
                    className={radioDot}
                  />
                  <span className="font-medium">{level.label}</span>
                </label>
              ))}
            </div>
            {levelHint && (
              <p id="level-hint" className="text-[12.5px] text-ink-muted">
                {levelHint}
              </p>
            )}
            {fieldError('educationLevel', FIELD_ERROR.educationLevel!)}
          </fieldset>
        </div>,
      );
    }

    if (step.key === 'pertanyaan') {
      return stepShell(
        index,
        <div className="flex flex-col gap-6">
          {form.questions.map((question, number) => {
            const hintId = `${question.id}-meta`;
            const value = values[question.id] ?? '';
            return (
              <div key={question.id} className="rise flex flex-col gap-2" style={{ '--i': number } as CSSProperties}>
                {question.kind !== 'CHOICE' && (
                  <div className="flex items-start justify-between gap-3">
                    <label htmlFor={question.id} className="text-[14.5px] font-semibold leading-snug">
                      {question.label}
                    </label>
                    {requiredPill(question, hintId)}
                  </div>
                )}
                {question.kind === 'SHORT' && (
                  <TextInput
                    id={question.id}
                    name={question.id}
                    required={question.required}
                    maxLength={REGISTRATION_LIMITS.shortAnswerMax}
                    aria-invalid={errors.has(question.id) || undefined}
                    aria-describedby={describedBy(question.id, hintId)}
                    className="h-12"
                  />
                )}
                {question.kind === 'URL' && (
                  <TextInput
                    id={question.id}
                    name={question.id}
                    type="url"
                    inputMode="url"
                    required={question.required}
                    pattern="https://.+"
                    maxLength={500}
                    placeholder="https://"
                    aria-invalid={errors.has(question.id) || undefined}
                    aria-describedby={describedBy(question.id, hintId)}
                    className="h-12"
                  />
                )}
                {question.kind === 'LONG' && (
                  <>
                    <TextArea
                      id={question.id}
                      name={question.id}
                      rows={5}
                      required={question.required}
                      maxLength={REGISTRATION_LIMITS.longAnswerMax}
                      aria-invalid={errors.has(question.id) || undefined}
                      aria-describedby={describedBy(question.id, hintId)}
                    />
                    <span
                      aria-hidden
                      data-wizard-only
                      className={cn('self-end font-mono text-[11.5px]', value.length > REGISTRATION_LIMITS.longAnswerMax * 0.9 ? 'text-caution' : 'text-ink-muted')}
                    >
                      {value.length}/{REGISTRATION_LIMITS.longAnswerMax}
                    </span>
                  </>
                )}
                {question.kind === 'CHOICE' && (
                  <fieldset aria-describedby={describedBy(question.id, hintId)} className="flex flex-col gap-2">
                    <legend className="mb-2 flex w-full items-start justify-between gap-3">
                      <span className="text-[14.5px] font-semibold leading-snug">{question.label}</span>
                      {requiredPill(question, hintId)}
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {question.options.map((option) => (
                        <label key={option} className={choiceCard}>
                          <input type="radio" name={question.id} value={option} required={question.required} className={radioDot} />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                {fieldError(question.id, questionError(question))}
              </div>
            );
          })}
        </div>,
      );
    }

    if (step.key === 'tim' && form.teamSize) {
      const size = form.teamSize;
      return stepShell(
        index,
        <div className="flex flex-col gap-4">
          {teams.length > 0 ? (
            <fieldset className="flex flex-col gap-2.5" aria-describedby={describedBy('teamId', 'team-hint')}>
              <legend className="sr-only">Pilih tim yang didaftarkan</legend>
              {teams.map((team) => (
                <label key={team.id} className={cn(choiceCard, 'items-start gap-3.5 p-4')}>
                  <input type="radio" name="teamId" value={team.id} required disabled={team.problem !== null} className={cn(radioDot, 'mt-1')} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="text-[15px] font-semibold leading-snug">{team.title}</span>
                    <span className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-ink-muted">
                      <AvatarStack people={team.members} size="xs" />
                      {team.members.length} orang · {team.members.map((member) => member.name.split(' ')[0]).join(', ')}
                    </span>
                    {team.problem && <span className="text-[12.5px] font-medium text-caution">{team.problem}</span>}
                  </span>
                </label>
              ))}
              <p id="team-hint" className="text-[12.5px] text-ink-muted">
                Anggota tim disalin saat kamu mengirim. Anggota yang bergabung setelahnya tidak otomatis ikut terdaftar.
              </p>
              {fieldError('teamId', FIELD_ERROR.teamId!)}
            </fieldset>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-[18px] border border-dashed border-line-strong p-5">
              <span aria-hidden className="flex size-11 items-center justify-center rounded-[14px] bg-tint-mint">
                <Users className="size-5" />
              </span>
              <p className="text-[15px] font-semibold">Lomba ini didaftarkan per tim ({size.min}–{size.max} orang) oleh ketuanya.</p>
              <p className="max-w-[52ch] text-[13.5px] leading-relaxed text-ink-muted">
                {memberOf.length > 0
                  ? `Kamu anggota ${memberOf.join(', ')} — minta ketuamu yang mengirim pendaftaran. Kalau ingin memimpin tim sendiri, buka tim baru.`
                  : 'Kamu belum memimpin tim untuk lomba ini. Buka tim, ajak anggotanya lewat tautan tim, lalu kembali ke sini — isianmu tersimpan selama tab ini terbuka.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={newTeamHref} className={buttonVariants({ size: 'md' })}>
                  Buka tim baru
                </Link>
                <Link href={`/teams?kegiatan=${encodeURIComponent(slug)}`} className={buttonVariants({ variant: 'secondary' })}>
                  Cari tim yang sudah ada
                </Link>
              </div>
              {fieldError('teamId', 'Pendaftaran lomba ini butuh tim yang kamu ketuai.')}
            </div>
          )}
        </div>,
      );
    }

    // kirim
    const summary: { step: number; label: string; value: string }[] = [
      { step: 0, label: 'WhatsApp', value: phonePreview ? displayPhone(phonePreview) : '—' },
      { step: 0, label: 'Institusi', value: values.institution?.trim() || '—' },
      { step: 0, label: 'Jurusan', value: values.major?.trim() || '—' },
      { step: 0, label: 'Jenjang', value: levelLabel ?? '—' },
      ...form.questions.map((question) => ({
        step: steps.findIndex((item) => item.key === 'pertanyaan'),
        label: question.label,
        value: values[question.id]?.trim() || (question.required ? '—' : 'Tidak diisi'),
      })),
      ...(form.teamSize ? [{ step: steps.findIndex((item) => item.key === 'tim'), label: 'Tim', value: selectedTeam?.title ?? '—' }] : []),
    ];
    const outcome = PREDICTION[prediction];
    return stepShell(
      index,
      <div className="flex flex-col gap-6">
        <Ticket {...preview} className="lg:hidden" />

        <dl data-wizard-only className="divide-y divide-line rounded-[18px] border border-line">
          {summary.map((item) => (
            <div
              key={`${item.step}-${item.label}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-4 py-3 sm:grid-cols-[38%_minmax(0,1fr)_auto]"
            >
              <dt className="text-[13px] leading-snug text-ink-muted">{item.label}</dt>
              <dd className="col-start-1 row-start-2 min-w-0 whitespace-pre-line break-words text-[14px] font-medium leading-snug sm:col-start-2 sm:row-start-1">
                {item.value}
              </dd>
              <dd className="col-start-2 row-span-2 row-start-1 self-center sm:col-start-3 sm:row-span-1">
                <button
                  type="button"
                  onClick={() => goTo(item.step)}
                  className="-my-2 flex min-h-11 items-center rounded-card px-2 text-[12.5px] font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink"
                >
                  Ubah<span className="sr-only"> {item.label}</span>
                </button>
              </dd>
            </div>
          ))}
        </dl>
        <p data-noscript-only className="hidden text-[13.5px] text-ink-muted">
          Periksa kembali isianmu di atas sebelum mengirim.
        </p>

        <div className="flex gap-3.5 rounded-[18px] bg-panel-nested p-4">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-highlight text-on-highlight">
            <Check className="size-5" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[14.5px] font-semibold">
              {outcome.title}
              {prediction === 'WAITLISTED' && ` · urutan ke-${waitlistAhead + 1}`}
            </span>
            <span className="text-[13px] leading-relaxed text-ink-muted">{outcome.text}</span>
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-line p-4 transition-colors duration-150 ease-snap has-[:checked]:border-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
            <input
              type="checkbox"
              name="consent"
              required
              aria-invalid={errors.has('consent') || undefined}
              aria-describedby={describedBy('consent')}
              className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[var(--color-text-primary)]"
            />
            <span className="text-[13.5px] leading-relaxed">
              Saya setuju data di atas — nama, email, WhatsApp, institusi, jenjang, dan jawaban — dibagikan ke <strong>{organizer}</strong> khusus untuk
              keperluan kegiatan ini.{' '}
              <Link href="/privacy-policy" className="font-medium underline underline-offset-[3px]">
                Kebijakan privasi
              </Link>
            </span>
          </label>
          {fieldError('consent', FIELD_ERROR.consent!)}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          {index > 0 ? (
            <button type="button" data-wizard-only onClick={() => goTo(index - 1)} className={buttonVariants({ variant: 'ghost', className: '-ml-3' })}>
              <ArrowLeft aria-hidden /> Kembali
            </button>
          ) : (
            <span />
          )}
          <SubmitButton className={buttonVariants({ size: 'lg', className: 'min-w-[220px]' })}>
            Kirim pendaftaran <ArrowRight aria-hidden />
          </SubmitButton>
        </div>
      </div>,
    );
  });

  return (
    <form
      ref={formRef}
      action={submitRegistrationAction}
      onInput={onInput}
      onSubmit={onSubmit}
      className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-12"
    >
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_CSS }} />
      <input type="hidden" name="slug" value={slug} />

      <div ref={topRef} className="flex min-w-0 scroll-mt-24 flex-col gap-5">
        <nav data-wizard-only aria-label="Langkah pendaftaran">
          <ol className="flex gap-2">
            {steps.map((step, index) => {
              const reachable = index <= furthest;
              return (
                <li key={step.key} className="min-w-0 flex-1">
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => goTo(index)}
                    aria-current={index === active ? 'step' : undefined}
                    className="group flex min-h-11 w-full flex-col justify-center gap-2 text-left disabled:cursor-default"
                  >
                    <span aria-hidden className="h-1.5 overflow-hidden rounded-pill bg-panel-nested">
                      <span
                        className={cn(
                          'block h-full origin-left rounded-pill bg-ink transition-transform duration-500 ease-snap',
                          index <= active ? 'scale-x-100' : 'scale-x-0',
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        'truncate text-[12.5px]',
                        index === active ? 'font-semibold text-ink' : 'font-medium text-ink-muted max-sm:sr-only',
                        reachable && index !== active && 'group-hover:text-ink',
                      )}
                    >
                      <span className="font-mono">{index + 1}</span> {step.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        {sections}
      </div>

      <aside aria-label="Pratinjau tiket" className="hidden flex-col gap-4 lg:sticky lg:top-24 lg:flex">
        <Ticket {...preview} />
        <p className="flex items-center gap-2 px-1 text-[12.5px] text-ink-muted">
          <Lock aria-hidden className="size-3.5 shrink-0" />
          Kode tiket terbit setelah pendaftaran terkirim.
        </p>
        <div className="flex flex-col gap-4 rounded-[18px] border border-line bg-panel p-4">
          <SeatMeter seats={seats} waitlist={waitlist} />
          {prediction === 'WAITLISTED' && (
            <p className="flex items-start gap-2 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-muted">
              <Hourglass aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Kamu akan antre di urutan ke-{waitlistAhead + 1} dan naik otomatis begitu ada kursi kosong.
            </p>
          )}
        </div>
        <div className="flex gap-3 rounded-[18px] border border-line p-4">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            StudentFo tidak pernah meminta kata sandi, OTP, NIK, atau nomor rekening di formulir pendaftaran — formulir yang memintanya ditolak sistem.
          </p>
        </div>
      </aside>
    </form>
  );
}
