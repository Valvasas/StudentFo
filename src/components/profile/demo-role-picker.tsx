'use client';

import { Check } from 'lucide-react';
import { useDemoStore } from '@/components/demo/use-demo-store';
import { DEFAULT_PROFILE_EXTRAS, PROFILE_EXTRAS_KEY, TEAM_ROLE_OPTIONS, parseProfileExtras, type ProfileExtras } from '@/lib/demo/profile-extras';
import { cn } from '@/lib/utils';

/** Peran di tim (kanvas Peminatan). Belum ada kolomnya di database — mode data contoh saja, tersimpan otomatis. */
export function DemoRolePicker() {
  const [extras, save, loaded] = useDemoStore<ProfileExtras>(PROFILE_EXTRAS_KEY, DEFAULT_PROFILE_EXTRAS, parseProfileExtras);
  return (
    <fieldset className="flex flex-col gap-2" disabled={!loaded}>
      <legend className="mb-2 text-[13px] text-ink-muted">Peran yang biasa kamu ambil di tim · tersimpan otomatis</legend>
      <div className="flex flex-wrap gap-1.5">
        {TEAM_ROLE_OPTIONS.map((role) => {
          const on = extras.roles.includes(role);
          return (
            <button
              key={role}
              type="button"
              aria-pressed={on}
              onClick={() => save({ ...extras, roles: on ? extras.roles.filter((item) => item !== role) : [...extras.roles, role] })}
              className={cn(
                'relative flex h-8 items-center gap-1.5 rounded-sm border px-3 text-[13.5px] font-medium transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[""]',
                on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong/70 bg-panel hover:border-line-strong',
              )}
            >
              {on && <Check aria-hidden className="size-[13px]" strokeWidth={2.4} />}
              {role}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
