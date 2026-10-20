'use client';

import { useState } from 'react';
import { Lock, MapPin, ShieldCheck, Wifi } from 'lucide-react';
import { saveSeekerAction } from '@/app/teams/cocok/actions';
import { Avatar } from '@/components/ui/avatar';
import { SelectInput, TextArea } from '@/components/ui/field';
import { ChoiceGroup, FormStep } from '@/components/ui/form-step';
import { SubmitButton } from '@/components/ui/submit-button';
import { citiesByProvince } from '@/lib/geo';
import type { SeekerField } from '@/lib/matchmaking-schema';
import { cn } from '@/lib/utils';
import {
  EDUCATION_LEVEL_LABEL,
  SEEKER_LIMITS,
  SKILL_DOMAINS,
  SKILL_DOMAIN_LABEL,
  TEAM_SKILLS,
  skillLabel,
  type EducationLevel,
  type TeamSeekerProfile,
  type TeamSkillSlug,
} from '@/types/domain';

const PROVINCES = citiesByProvince();

function useSkillSet(initial: readonly TeamSkillSlug[]) {
  const [selected, setSelected] = useState<ReadonlySet<TeamSkillSlug>>(new Set(initial));
  const toggle = (slug: TeamSkillSlug) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  return [selected, toggle] as const;
}

/**
 * Pilihan keahlian berupa chip bergrup per bidang. Batas enam ditegakkan di
 * sini dengan menonaktifkan sisanya, dan DITEGAKKAN ULANG server
 * (`parseSeekerForm`) — kontrol klien hanya kenyamanan.
 */
function SkillPicker({
  legend,
  hint,
  name,
  selected,
  onToggle,
  invalid,
}: {
  legend: string;
  hint: string;
  name: 'skills' | 'seeking';
  selected: ReadonlySet<TeamSkillSlug>;
  onToggle: (slug: TeamSkillSlug) => void;
  invalid: boolean;
}) {
  const full = selected.size >= SEEKER_LIMITS[name];
  return (
    <ChoiceGroup legend={legend} hint={`${selected.size} dari ${SEEKER_LIMITS[name]} dipilih`}>
      <p className="-mt-1.5 text-[13px] text-ink-muted">{hint}</p>
      {invalid && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {name === 'skills' ? 'Pilih minimal satu keahlian untuk membuka kartu.' : `Pilih paling banyak ${SEEKER_LIMITS[name]}.`}
        </p>
      )}
      <div className="flex flex-col gap-4">
        {SKILL_DOMAINS.map((domain) => (
          <div key={domain} className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{SKILL_DOMAIN_LABEL[domain]}</span>
            <div className="flex flex-wrap gap-2">
              {TEAM_SKILLS.filter((skill) => skill.domain === domain).map((skill) => {
                const checked = selected.has(skill.slug);
                return (
                  <label key={skill.slug} className="choice">
                    <input
                      type="checkbox"
                      className="check"
                      name={name}
                      value={skill.slug}
                      checked={checked}
                      disabled={!checked && full}
                      onChange={() => onToggle(skill.slug)}
                    />
                    {skill.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ChoiceGroup>
  );
}

function CardPreview({
  person,
  city,
  skills,
  seeking,
  remoteOk,
  pitch,
  open,
}: {
  person: { id: string; name: string; major: string | null; level: EducationLevel | null };
  city: string;
  skills: ReadonlySet<TeamSkillSlug>;
  seeking: ReadonlySet<TeamSkillSlug>;
  remoteOk: boolean;
  pitch: string;
  open: boolean;
}) {
  const sub = [person.major, person.level ? EDUCATION_LEVEL_LABEL[person.level] : null].filter(Boolean).join(' · ');
  return (
    <aside aria-label="Pratinjau kartu pemain" className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[92px]">
      <p className="text-[13px] font-semibold text-ink-muted">Beginilah orang lain melihat kartumu</p>
      <div className={cn('flex flex-col gap-4 rounded-[24px] border bg-panel p-5 transition-colors duration-200', open ? 'border-brand shadow-raised' : 'border-line')}>
        <div className="dot-grid -mx-5 -mt-5 flex items-center justify-between rounded-t-[24px] bg-panel-nested px-5 py-3">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Kartu pemain</span>
          <span className={cn('inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11.5px] font-semibold', open ? 'bg-brand text-on-brand' : 'bg-panel text-ink-muted')}>
            {open ? 'Terbuka' : 'Tertutup'}
          </span>
        </div>
        <div className="flex items-center gap-3.5">
          <Avatar name={person.name} seed={person.id} size="lg" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-display text-[19px] font-bold tracking-[-0.025em]">{person.name}</span>
            {sub && <span className="truncate text-[13px] text-ink-muted">{sub}</span>}
          </div>
        </div>
        <p className="min-h-[3.2em] text-[14.5px] leading-relaxed text-ink-soft">{pitch.trim() ? <>&ldquo;{pitch.trim()}&rdquo;</> : <span className="text-ink-faint">Satu kalimat tentang gaya kerjamu tampil di sini.</span>}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-muted">
          <li className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden className="size-3.5" />
            {city || 'Kota belum dipilih'}
          </li>
          {remoteOk && (
            <li className="inline-flex items-center gap-1.5">
              <Wifi aria-hidden className="size-3.5" /> Bersedia kerja daring
            </li>
          )}
        </ul>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink-muted">Dibawa ke tim</span>
          <div className="flex flex-wrap gap-1.5">
            {skills.size === 0 ? (
              <span className="text-[13px] text-ink-faint">Belum ada keahlian</span>
            ) : (
              [...skills].map((slug) => (
                <span key={slug} className="rounded-pill border border-line bg-panel-nested px-2.5 py-1 text-[12.5px] text-ink-soft">
                  {skillLabel(slug)}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink-muted">Sedang dicari</span>
          <div className="flex flex-wrap gap-1.5">
            {seeking.size === 0 ? (
              <span className="text-[13px] text-ink-faint">Terbuka untuk siapa saja</span>
            ) : (
              [...seeking].map((slug) => (
                <span key={slug} className="rounded-pill border border-brand bg-accent-soft px-2.5 py-1 text-[12.5px] font-medium text-ink">
                  {skillLabel(slug)}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Form kartu pemain (ADR-057). Tetap `<form action={saveSeekerAction}>`
 * dengan nama kolom polos: tanpa JavaScript ia terkirim apa adanya dan
 * server (`parseSeekerForm`) yang memvalidasi. JS hanya menambah pratinjau
 * kartu yang hidup, hitungan pilihan, dan batas enam keahlian.
 */
export function SeekerForm({
  person,
  initial,
  invalidFields,
}: {
  person: { id: string; name: string; major: string | null; level: EducationLevel | null };
  initial: TeamSeekerProfile | null;
  invalidFields: readonly SeekerField[];
}) {
  const [skills, toggleSkill] = useSkillSet(initial?.skills ?? []);
  const [seeking, toggleSeeking] = useSkillSet(initial?.seeking ?? []);
  const [city, setCity] = useState(initial?.city ?? '');
  const [remoteOk, setRemoteOk] = useState(initial?.remoteOk ?? true);
  const [pitch, setPitch] = useState(initial?.pitch ?? '');
  const [open, setOpen] = useState(initial?.open ?? true);

  return (
    <form action={saveSeekerAction} className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-12">
      <div className="flex min-w-0 flex-col gap-5">
        <FormStep number={1} title="Apa kekuatanmu?" hint="Pilih sampai enam hal yang bisa kamu bawa ke tim.">
          <SkillPicker
            legend="Keahlianmu"
            hint="Pilih yang benar-benar kamu kerjakan, bukan yang ingin kamu pelajari."
            name="skills"
            selected={skills}
            onToggle={toggleSkill}
            invalid={invalidFields.includes('skills')}
          />
        </FormStep>

        <FormStep number={2} title="Rekan seperti apa yang kamu cari?" hint="Boleh kosong. Kalau diisi, peringkat memprioritaskan orang yang membawa keahlian ini.">
          <SkillPicker
            legend="Keahlian yang kamu cari"
            hint="Tim yang baik saling melengkapi — cari yang belum ada padamu."
            name="seeking"
            selected={seeking}
            onToggle={toggleSeeking}
            invalid={invalidFields.includes('seeking')}
          />
        </FormStep>

        <FormStep number={3} title="Di mana dan bagaimana kamu bekerja?" hint="Hanya nama kota yang disimpan. Alamat rumah tidak pernah diminta.">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="city" className="text-[13.5px] font-semibold">
              Kota
            </label>
            <SelectInput id="city" name="city" value={city} onChange={(event) => setCity(event.target.value)} className="h-12" aria-invalid={invalidFields.includes('city') || undefined}>
              <option value="">Belum dipilih</option>
              {PROVINCES.map(([province, cities]) => (
                <optgroup key={province} label={province}>
                  {cities.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectInput>
            {invalidFields.includes('city') && (
              <p role="alert" className="text-[13px] font-medium text-danger">
                Pilih kotamu, atau izinkan kerja daring supaya kartumu tetap bisa dijangkau.
              </p>
            )}
            <p className="text-[12.5px] text-ink-muted">Dipakai untuk memperkirakan jarak antarkota, kelipatan 5 km.</p>
          </div>

          <label className="choice self-start">
            <input type="checkbox" name="remoteOk" className="check" checked={remoteOk} onChange={(event) => setRemoteOk(event.target.checked)} />
            Bersedia kerja bareng secara daring
          </label>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pitch" className="text-[13.5px] font-semibold">
              Pengantar singkat <span className="font-normal text-ink-muted">(opsional)</span>
            </label>
            <TextArea
              id="pitch"
              name="pitch"
              rows={3}
              maxLength={SEEKER_LIMITS.pitchMax}
              value={pitch}
              onChange={(event) => setPitch(event.target.value)}
              placeholder="Mis. Suka backend dan presentasi, biasanya ambil bagian riset awal."
            />
            <span className="text-right text-[12px] tabular-nums text-ink-muted">
              {pitch.length}/{SEEKER_LIMITS.pitchMax}
            </span>
          </div>
        </FormStep>

        <FormStep number={4} title="Siap dicocokkan?" hint="Kamu yang menentukan kartu ini terlihat atau tidak, kapan saja.">
          <label className="choice self-start">
            <input type="checkbox" name="open" className="check" checked={open} onChange={(event) => setOpen(event.target.checked)} />
            Buka kartuku untuk dicocokkan
          </label>
          <ul className="flex flex-col gap-2.5 rounded-[16px] bg-panel-nested p-4 text-[13.5px] leading-relaxed text-ink-soft">
            <li className="flex gap-2.5">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-semibold">Yang terlihat oleh pengguna yang masuk:</strong> nama, jurusan, jenjang, kota, keahlian, pengantar, dan
                portofolio publikmu. Mereka juga bisa mengajakmu terhubung.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-semibold">Tidak pernah terlihat:</strong> email, nomor telepon, dan alamat. Tamu yang belum masuk tidak melihat apa pun.
              </span>
            </li>
          </ul>
          <SubmitButton pendingLabel="Menyimpan…" className="inline-flex h-12 w-full items-center justify-center rounded-pill bg-brand px-6 text-[15px] font-semibold text-on-brand hover:bg-brand-hover sm:w-fit">
            {open ? 'Simpan & mulai mencari' : 'Simpan kartu'}
          </SubmitButton>
        </FormStep>
      </div>

      <CardPreview person={person} city={city} skills={skills} seeking={seeking} remoteOk={remoteOk} pitch={pitch} open={open} />
    </form>
  );
}
