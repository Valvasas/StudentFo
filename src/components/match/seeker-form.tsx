'use client';

import { useCallback, useMemo, useState } from 'react';
import { Info, Lock, ShieldCheck } from 'lucide-react';
import { saveSeekerAction } from '@/app/teams/cocok/actions';
import { CardBuilder } from '@/components/match/card-builder';
import { CardMiniBar } from '@/components/match/card-mini-bar';
import { SkillMatrix } from '@/components/match/skill-matrix';
import { useSeekerDraft, type SeekerDraft } from '@/components/match/use-seeker-draft';
import { SelectInput, TextArea } from '@/components/ui/field';
import { FormStep } from '@/components/ui/form-step';
import { SubmitButton } from '@/components/ui/submit-button';
import { citiesByProvince } from '@/lib/geo';
import type { SeekerField } from '@/lib/matchmaking-schema';
import { SEEKER_LIMITS, type EducationLevel, type TeamSeekerProfile, type TeamSkillSlug } from '@/types/domain';

const PROVINCES = citiesByProvince();

function useSkillSet(initial: readonly TeamSkillSlug[], limit: number) {
  const [selected, setSelected] = useState<ReadonlySet<TeamSkillSlug>>(() => new Set(initial));
  const toggle = useCallback(
    (slug: TeamSkillSlug) =>
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(slug)) next.delete(slug);
        else if (next.size < limit) next.add(slug);
        return next;
      }),
    [limit],
  );
  const replace = useCallback((slugs: readonly TeamSkillSlug[]) => setSelected(new Set(slugs)), []);
  return [selected, toggle, replace] as const;
}

/**
 * Pembuat kartu pemain (ADR-057/058). Tetap SATU `<form action={saveSeekerAction}>`
 * dengan nama kolom polos (skills, seeking, city, remoteOk, pitch, open): tanpa
 * JavaScript ia terkirim apa adanya dan server (`parseSeekerForm`) yang
 * memvalidasi. JS hanya menambah kartu hidup, hitungan, batas enam, dan
 * pemulihan draf setelah aksi simpan gagal.
 */
export function SeekerForm({
  person,
  initial,
  invalidFields,
  restoreDraft = false,
}: {
  person: { id: string; name: string; major: string | null; level: EducationLevel | null };
  initial: TeamSeekerProfile | null;
  invalidFields: readonly SeekerField[];
  /** URL membawa galat dari aksi simpan: isian terakhir dipulihkan dari draf tab ini. */
  restoreDraft?: boolean;
}) {
  const [skills, toggleSkill, replaceSkills] = useSkillSet(initial?.skills ?? [], SEEKER_LIMITS.skills);
  const [seeking, toggleSeeking, replaceSeeking] = useSkillSet(initial?.seeking ?? [], SEEKER_LIMITS.seeking);
  const [city, setCity] = useState(initial?.city ?? '');
  const [remoteOk, setRemoteOk] = useState(initial?.remoteOk ?? true);
  const [pitch, setPitch] = useState(initial?.pitch ?? '');
  const [open, setOpen] = useState(initial?.open ?? true);
  // Galat server datang dari URL dan tak berubah sendiri; begitu kolomnya disentuh DAN kini valid, peringatannya turun.
  const [touched, setTouched] = useState<ReadonlySet<SeekerField>>(() => new Set());
  const touch = useCallback((field: SeekerField) => setTouched((current) => (current.has(field) ? current : new Set(current).add(field))), []);
  const fixed: Record<'skills' | 'seeking' | 'city', boolean> = {
    skills: touched.has('skills') && (!open || skills.size > 0),
    seeking: touched.has('seeking') && seeking.size <= SEEKER_LIMITS.seeking,
    city: touched.has('city') && (!open || city !== '' || remoteOk),
  };
  const invalid = (field: 'skills' | 'seeking' | 'city') => invalidFields.includes(field) && !fixed[field];

  const draft = useMemo<SeekerDraft>(
    () => ({ skills: [...skills], seeking: [...seeking], city, remoteOk, pitch, open }),
    [skills, seeking, city, remoteOk, pitch, open],
  );
  const restore = useCallback(
    (saved: SeekerDraft) => {
      replaceSkills(saved.skills);
      replaceSeeking(saved.seeking);
      setCity(saved.city);
      setRemoteOk(saved.remoteOk);
      setPitch(saved.pitch);
      setOpen(saved.open);
    },
    [replaceSkills, replaceSeeking],
  );
  const { saveDraft, restored } = useSeekerDraft(person.id, draft, restore, restoreDraft);

  return (
    <form action={saveSeekerAction} onSubmit={saveDraft} className="seeker-form flex min-w-0 flex-col gap-5">
      <CardMiniBar person={person} skillCount={skills.size} seekingCount={seeking.size} open={open} />

      <div role="status" className="empty:-mt-5">
        {restored && (
          <p className="fade-in flex items-start gap-2.5 rounded-card border border-line bg-panel-nested px-3.5 py-3 text-sm leading-relaxed text-ink">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {invalidFields.length > 0 ? 'Isianmu kami kembalikan. Lengkapi yang kurang lalu simpan lagi.' : 'Isianmu kami kembalikan. Coba simpan lagi.'}
          </p>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-x-12">
        <FormStep
          number={1}
          title="Tempel keahlianmu, tandai yang kamu cari"
          hint="Tiap keahlian punya dua tombol: Bawa (kamu kerjakan) dan Cari (kamu butuh dari rekan). Maksimal enam di tiap sisi."
          className="p-4 sm:p-7 lg:col-start-1"
        >
          <SkillMatrix
            skills={skills}
            seeking={seeking}
            onToggleSkill={(slug) => {
              touch('skills');
              toggleSkill(slug);
            }}
            onToggleSeeking={(slug) => {
              touch('seeking');
              toggleSeeking(slug);
            }}
            invalid={{ skills: invalid('skills'), seeking: invalid('seeking') }}
          />
        </FormStep>

        <FormStep number={2} title="Di mana dan bagaimana kamu bekerja?" hint="Hanya nama kota yang disimpan. Alamat rumah tidak pernah diminta." className="p-4 sm:p-7 lg:col-start-1">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="city" className="text-[13.5px] font-semibold">
              Kota
            </label>
            <SelectInput
              id="city"
              name="city"
              value={city}
              onChange={(event) => {
                touch('city');
                setCity(event.target.value);
              }}
              className="h-12"
              aria-invalid={invalid('city') || undefined}
              aria-describedby="city-hint"
            >
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
            {invalid('city') && (
              <p role="alert" className="text-[13px] font-medium text-danger">
                Pilih kotamu, atau izinkan kerja daring supaya kartumu tetap bisa dijangkau.
              </p>
            )}
            <p id="city-hint" className="text-[12.5px] text-ink-muted">
              Dipakai untuk memperkirakan jarak antarkota, kelipatan 5 km.
            </p>
          </div>

          <label className="choice self-start">
            <input
              type="checkbox"
              name="remoteOk"
              className="check"
              checked={remoteOk}
              onChange={(event) => {
                touch('city');
                setRemoteOk(event.target.checked);
              }}
            />
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

        <div className="min-w-0 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:sticky lg:top-[92px] lg:self-start">
          <CardBuilder person={person} city={city} skills={skills} seeking={seeking} remoteOk={remoteOk} pitch={pitch} open={open} />
        </div>

        <FormStep number={3} title="Siap dicocokkan?" hint="Kamu yang menentukan kartu ini terlihat atau tidak, kapan saja." className="p-4 sm:p-7 lg:col-start-1">
          <ul className="flex flex-col gap-2.5 rounded-[16px] bg-panel-nested p-4 text-[13.5px] leading-relaxed text-ink-soft">
            <li className="flex gap-2.5">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-semibold">Yang terlihat oleh pengguna yang masuk:</strong> nama, jurusan, jenjang, kota, keahlian, pengantar, dan
                portofolio publikmu, serta minat yang sama dengan mereka. Selama kartu terbuka, halaman profilmu (headline, bidang minat, portofolio
                publik) juga bisa mereka buka, dan mereka bisa mengajakmu terhubung.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-semibold">Tidak pernah terlihat:</strong> email, nomor telepon, dan alamat. Tamu yang belum masuk tidak melihat apa pun.
              </span>
            </li>
          </ul>
          <label className="choice self-start">
            <input type="checkbox" name="open" className="check" checked={open} onChange={(event) => setOpen(event.target.checked)} />
            Buka kartuku untuk dicocokkan
          </label>
          <SubmitButton
            pendingLabel="Menyimpan…"
            className="inline-flex h-12 w-full items-center justify-center rounded-pill bg-brand px-6 text-[15px] font-semibold text-on-brand hover:bg-brand-hover sm:w-fit"
          >
            {open ? 'Simpan & mulai mencari' : 'Simpan kartu'}
          </SubmitButton>
        </FormStep>
      </div>
    </form>
  );
}
