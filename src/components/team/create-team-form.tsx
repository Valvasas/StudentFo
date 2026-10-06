'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Check, Lightbulb, Minus, Plus } from 'lucide-react';
import { createTeamAction } from '@/app/teams/actions';
import { EventTypeIcon } from '@/components/event/event-type-icon';
import { TeamCard } from '@/components/team/team-card';
import { Avatar } from '@/components/ui/avatar';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { FormStep } from '@/components/ui/form-step';
import { SubmitButton } from '@/components/ui/submit-button';
import { daysLeftLabel, daysUntil, formatDateId } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, EVENT_TYPES, type EventSummary, type Team } from '@/types/domain';

const TITLE_IDEAS = ['Cari 2 anggota untuk tim hackathon', 'Tim karya tulis butuh analis data', 'Cari desainer & presenter untuk lomba bisnis'] as const;
const ROLE_IDEAS = ['Frontend', 'Backend', 'UI/UX', 'Analis data', 'Penulis', 'Peneliti', 'Presenter'] as const;
const DESCRIPTION_MAX = 1000;
const SLOTS_MIN = 1;
const SLOTS_MAX = 50;
/** Ilustrasi kursi berhenti di sini; sisanya disebut sebagai angka. */
const SEATS_DRAWN = 12;

const roleLine = (role: string) => `• ${role}`;

/**
 * Form "Buka tim baru" di halamannya sendiri (ADR-054).
 *
 * Tetap `<form action={createTeamAction}>` dengan nama kolom yang sama: tanpa
 * JavaScript ia terkirim apa adanya dan server (Zod) yang memvalidasi. JS
 * hanya menambah: pratinjau kartu yang sama persis dengan yang akan tampil
 * di Cari Tim, tombol −/+ jumlah anggota, dan chip bantu-tulis. Chip peran
 * menulis ke keterangan — tidak ada kolom "peran" di database, jadi ia
 * tidak boleh berpura-pura jadi data terstruktur.
 */
export function CreateTeamForm({
  events,
  defaultEventId,
  returnTo,
  cancelHref,
  leader,
}: {
  events: readonly EventSummary[];
  defaultEventId: string;
  returnTo: string;
  cancelHref: string;
  leader: { readonly id: string; readonly name: string };
}) {
  const [eventId, setEventId] = useState(defaultEventId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [slotsText, setSlotsText] = useState('4');
  const slots = Math.min(SLOTS_MAX, Math.max(SLOTS_MIN, Number.parseInt(slotsText, 10) || SLOTS_MIN));
  const event = events.find((item) => item.id === eventId) ?? null;
  const grouped = EVENT_TYPES.map((type) => [type, events.filter((item) => item.eventType === type)] as const).filter(([, items]) => items.length > 0);

  const preview: Team = useMemo(
    () => ({
      id: `pratinjau-${leader.id}`,
      eventId,
      createdBy: leader.id,
      title: title.trim() || 'Judul timmu tampil di sini',
      description: description.trim() || null,
      slotsNeeded: slots,
      createdAt: new Date(0).toISOString(),
      event,
      memberCount: 1,
      members: [{ userId: leader.id, fullName: leader.name, role: 'leader', joinedAt: new Date(0).toISOString() }],
    }),
    [eventId, title, description, slots, event, leader],
  );

  const toggleRole = (role: string) => {
    const lines = description.split('\n');
    const line = roleLine(role);
    if (lines.includes(line)) {
      setDescription(lines.filter((item) => item !== line).join('\n'));
      return;
    }
    const next = description.trimEnd();
    const header = next.includes('Peran yang dicari:') ? '' : `${next ? '\n\n' : ''}Peran yang dicari:`;
    setDescription(`${next}${header}\n${line}`.slice(0, DESCRIPTION_MAX));
  };

  const step = (delta: number) => setSlotsText(String(Math.min(SLOTS_MAX, Math.max(SLOTS_MIN, slots + delta))));

  return (
    <form action={createTeamAction} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-12">
      <input type="hidden" name="returnTo" value={returnTo} />

      <div className="flex min-w-0 flex-col gap-5">
        <FormStep number={1} title="Untuk kegiatan apa?" hint="Hanya kegiatan yang pendaftarannya masih buka, urut dari tenggat terdekat.">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="eventId" className="text-[13.5px] font-semibold">
              Kegiatan
            </label>
            <SelectInput id="eventId" name="eventId" required defaultValue={defaultEventId} onChange={(change) => setEventId(change.target.value)} className="h-12">
              <option value="" disabled>
                Pilih kegiatan
              </option>
              {grouped.map(([type, items]) => (
                <optgroup key={type} label={EVENT_TYPE_LABEL[type]}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectInput>
          </div>
          {event ? (
            <div className="fade-in flex items-center gap-3.5 rounded-[16px] bg-panel-nested p-3.5" key={event.id}>
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-panel">
                <EventTypeIcon type={event.eventType} className="size-[18px]" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-semibold">{event.organizer}</span>
                <span className="text-[12.5px] text-ink-muted">
                  {EVENT_TYPE_LABEL[event.eventType]}
                  {event.primaryDeadlineAt
                    ? ` · tutup ${formatDateId(event.primaryDeadlineAt)} (${daysLeftLabel(daysUntil(event.primaryDeadlineAt))})`
                    : ' · tenggat belum diumumkan'}
                </span>
              </span>
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted">Tidak menemukan kegiatanmu? Tim hanya bisa dibuka untuk kegiatan yang sudah tayang di katalog.</p>
          )}
        </FormStep>

        <FormStep number={2} title="Kenalkan timmu" hint="Judul dibaca dalam sedetik — sebut peran yang kamu cari.">
          <div className="flex flex-col gap-2">
            <label htmlFor="title" className="text-[13.5px] font-semibold">
              Judul tim
            </label>
            <TextInput
              id="title"
              name="title"
              required
              minLength={4}
              maxLength={255}
              value={title}
              onChange={(change) => setTitle(change.target.value)}
              placeholder="Mis. Cari 2 anggota untuk tim hackathon"
              aria-describedby="title-hint"
              className="h-12"
            />
            <div id="title-hint" className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12.5px] text-ink-muted">Contoh:</span>
              {TITLE_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setTitle(idea)}
                  className="flex min-h-11 items-center rounded-pill px-1 text-[12.5px] font-medium text-ink-soft underline decoration-line-strong decoration-dashed underline-offset-4 hover:text-ink hover:decoration-ink"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="description" className="text-[13.5px] font-semibold">
                Keterangan <span className="font-normal text-ink-muted">(opsional)</span>
              </label>
              <span aria-hidden className={cn('font-mono text-[11.5px]', description.length > DESCRIPTION_MAX * 0.9 ? 'text-caution' : 'text-ink-muted')}>
                {description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
            <TextArea
              id="description"
              name="description"
              maxLength={DESCRIPTION_MAX}
              rows={6}
              value={description}
              onChange={(change) => setDescription(change.target.value)}
              placeholder="Siapa yang sudah ada, peran apa yang kurang, dan bagaimana kalian bekerja (daring/luring, jadwal rapat)."
              aria-describedby="desc-hint"
              className="resize-y leading-relaxed"
            />
            <div id="desc-hint" className="flex flex-col gap-2">
              <span className="text-[12.5px] text-ink-muted">Tambah peran yang dicari ke keterangan:</span>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_IDEAS.map((role) => {
                  const on = description.split('\n').includes(roleLine(role));
                  return (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleRole(role)}
                      className={cn(
                        'flex h-11 items-center gap-1.5 rounded-pill border px-3.5 text-[13px] font-medium transition-colors duration-150',
                        on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong/70 hover:border-ink hover:bg-panel-nested',
                      )}
                    >
                      {on ? <Check aria-hidden className="size-3.5" strokeWidth={2.6} /> : <Plus aria-hidden className="size-3.5" />}
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </FormStep>

        <FormStep number={3} title="Berapa orang?" hint="Termasuk kamu sebagai ketua. Tim 3–5 orang paling cepat terisi.">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="slotsNeeded" className="text-[13.5px] font-semibold">
                Total anggota yang dibutuhkan
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  disabled={slots <= SLOTS_MIN}
                  aria-controls="slotsNeeded"
                  className="flex size-12 items-center justify-center rounded-pill border border-line-strong/70 transition-colors duration-150 hover:bg-panel-nested disabled:opacity-40"
                >
                  <Minus aria-hidden className="size-4" />
                  <span className="sr-only">Kurangi satu anggota</span>
                </button>
                <TextInput
                  id="slotsNeeded"
                  name="slotsNeeded"
                  type="number"
                  inputMode="numeric"
                  min={SLOTS_MIN}
                  max={SLOTS_MAX}
                  required
                  value={slotsText}
                  onChange={(change) => setSlotsText(change.target.value)}
                  onBlur={() => setSlotsText(String(slots))}
                  aria-describedby="slots-hint"
                  className="h-12 w-20 text-center font-display text-xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => step(1)}
                  disabled={slots >= SLOTS_MAX}
                  aria-controls="slotsNeeded"
                  className="flex size-12 items-center justify-center rounded-pill border border-line-strong/70 transition-colors duration-150 hover:bg-panel-nested disabled:opacity-40"
                >
                  <Plus aria-hidden className="size-4" />
                  <span className="sr-only">Tambah satu anggota</span>
                </button>
              </div>
            </div>
            <div aria-hidden className="flex flex-wrap items-center gap-1.5">
              <Avatar name={leader.name} seed={leader.id} size="sm" />
              {Array.from({ length: Math.min(slots, SEATS_DRAWN) - 1 }, (_, index) => (
                <span key={index} className="rise flex size-9 items-center justify-center rounded-pill border-2 border-dashed border-line-strong text-xs text-ink-faint" style={{ '--i': index } as React.CSSProperties}>
                  +
                </span>
              ))}
              {slots > SEATS_DRAWN && <span className="ml-1 font-mono text-xs text-ink-muted">+{slots - SEATS_DRAWN}</span>}
            </div>
          </div>
          <p id="slots-hint" className="text-[13px] text-ink-muted">
            {slots === 1 ? 'Hanya kamu — tim langsung terhitung penuh.' : `Kamu + ${slots - 1} kursi kosong yang bisa diisi orang lain.`} Maksimal {SLOTS_MAX}.
          </p>
        </FormStep>

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center">
          <Link href={cancelHref} className="flex h-12 items-center justify-center rounded-pill px-5 text-[15px] font-semibold text-ink-muted hover:bg-panel-nested hover:text-ink">
            Batal
          </Link>
          <SubmitButton pendingLabel="Membuka tim…" className="flex h-12 items-center justify-center gap-2 rounded-pill bg-brand px-8 text-[15px] font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover sm:ml-auto">
            Buka tim
          </SubmitButton>
        </div>
      </div>

      <aside aria-label="Pratinjau kartu tim" className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
        <span className="hand text-[20px] text-ink-muted">begini timmu terlihat ↓</span>
        {/* `inert`: pratinjau memakai kartu sungguhan, tapi tautan & tombolnya belum menuju ke mana pun. */}
        <div inert className="pointer-events-none select-none">
          <TeamCard team={preview} currentUserId={leader.id} showEvent missingEventLabel="Kegiatan belum dipilih" />
        </div>
        <div className="flex flex-col gap-3 rounded-[20px] bg-panel-nested p-5">
          <span className="flex items-center gap-2 text-[14px] font-semibold">
            <Lightbulb aria-hidden className="size-4" /> Biar cepat terisi
          </span>
          <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-soft">
            <li>Sebut peran yang kurang, bukan sekadar &ldquo;cari anggota&rdquo;.</li>
            <li>Tulis cara kerja tim: daring/luring dan jadwal rapat.</li>
            <li>Bagikan tautan tim ke Koneksi yang minatnya cocok.</li>
          </ul>
        </div>
      </aside>
    </form>
  );
}
