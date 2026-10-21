'use client';

import { useSyncExternalStore } from 'react';
import { SEEKER_LIMITS, SKILL_DOMAINS, SKILL_DOMAIN_LABEL, TEAM_SKILLS, type TeamSkillSlug } from '@/types/domain';

type Side = 'skills' | 'seeking';

const subscribeNothing = () => () => {};

const SIDE_WORD: Record<Side, string> = { skills: 'Bawa', seeking: 'Cari' };
const COUNTER_LABEL: Record<Side, string> = { skills: 'Dibawa', seeking: 'Dicari' };

function CapacityCounter({ side, count }: { side: Side; count: number }) {
  const limit = SEEKER_LIMITS[side];
  const full = count >= limit;
  return (
    <div className="cap flex min-w-0 flex-1 basis-[11.5rem] flex-col gap-1.5 rounded-[14px] bg-panel-nested px-3 py-2.5" data-side={side} data-full={full ? '' : undefined}>
      <p aria-live="polite" className="text-[13px] font-semibold leading-snug text-ink">
        <span>{`${COUNTER_LABEL[side]}: ${count} dari ${limit} dipilih`}</span>
        {full && <span className="block pt-0.5 text-[12.5px] font-normal text-ink-muted">Slot penuh. Lepas satu untuk menukar.</span>}
      </p>
      <span aria-hidden className="flex gap-1.5">
        {Array.from({ length: limit }, (_, index) => (
          <span key={index} className="cap-tick" data-on={index < count ? '' : undefined} />
        ))}
      </span>
    </div>
  );
}

function ToggleCell({
  side,
  slug,
  label,
  checked,
  disabled,
  onToggle,
}: {
  side: Side;
  slug: TeamSkillSlug;
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (slug: TeamSkillSlug) => void;
}) {
  return (
    <td className="px-1 py-1 text-center">
      <label className="choice choice-mini" data-side={side}>
        <input type="checkbox" className="check" name={side} value={slug} checked={checked} disabled={disabled} onChange={() => onToggle(slug)} />
        <span aria-hidden>{SIDE_WORD[side]}</span>
        <span className="sr-only">{`${SIDE_WORD[side]}: ${label}`}</span>
      </label>
    </td>
  );
}

/**
 * Satu tabel, satu baris per keahlian, supaya "bawa" dan "cari" untuk hal yang sama
 * terbaca berdampingan: tiap keahlian punya dua
 * kotak centang native, Bawa (`skills`) dan Cari (`seeking`). Batas enam
 * ditegakkan di sini dengan menonaktifkan sisa kotak sisi yang penuh — TIDAK
 * pernah yang sudah tercentang, karena `disabled` menghilangkannya dari
 * FormData — dan DITEGAKKAN ULANG server (`parseSeekerForm`). Penonaktifan
 * hanya setelah hidrasi: tanpa JS sisi yang penuh akan terkunci (tak bisa
 * menukar dalam satu kiriman), jadi di sana server saja yang menolak.
 */
export function SkillMatrix({
  skills,
  seeking,
  onToggleSkill,
  onToggleSeeking,
  invalid,
}: {
  skills: ReadonlySet<TeamSkillSlug>;
  seeking: ReadonlySet<TeamSkillSlug>;
  onToggleSkill: (slug: TeamSkillSlug) => void;
  onToggleSeeking: (slug: TeamSkillSlug) => void;
  invalid: { skills: boolean; seeking: boolean };
}) {
  const live = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const skillsFull = live && skills.size >= SEEKER_LIMITS.skills;
  const seekingFull = live && seeking.size >= SEEKER_LIMITS.seeking;

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap gap-2.5">
        <CapacityCounter side="skills" count={skills.size} />
        <CapacityCounter side="seeking" count={seeking.size} />
      </div>

      {invalid.skills && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {`Pilih minimal satu keahlian untuk membuka kartu. Paling banyak ${SEEKER_LIMITS.skills}.`}
        </p>
      )}
      {invalid.seeking && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {`Pilih paling banyak ${SEEKER_LIMITS.seeking}.`}
        </p>
      )}

      <table className="skill-matrix">
        <caption className="sr-only">Pilih keahlian yang kamu bawa dan yang kamu cari. Maksimal enam di tiap sisi.</caption>
        <colgroup>
          <col />
          <col className="skill-matrix-toggle" />
          <col className="skill-matrix-toggle" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Keahlian</th>
            <th scope="col">Bawa</th>
            <th scope="col">Cari</th>
          </tr>
        </thead>
        {SKILL_DOMAINS.map((domain) => (
          <tbody key={domain}>
            <tr>
              <td colSpan={3} className="skill-matrix-domain">
                {SKILL_DOMAIN_LABEL[domain]}
              </td>
            </tr>
            {TEAM_SKILLS.filter((skill) => skill.domain === domain).map((skill) => {
              const carried = skills.has(skill.slug);
              const wanted = seeking.has(skill.slug);
              return (
                <tr key={skill.slug} className="skill-matrix-row" data-carried={carried ? '' : undefined} data-wanted={wanted ? '' : undefined}>
                  <th scope="row">{skill.label}</th>
                  <ToggleCell side="skills" slug={skill.slug} label={skill.label} checked={carried} disabled={!carried && skillsFull} onToggle={onToggleSkill} />
                  <ToggleCell side="seeking" slug={skill.slug} label={skill.label} checked={wanted} disabled={!wanted && seekingFull} onToggle={onToggleSeeking} />
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
