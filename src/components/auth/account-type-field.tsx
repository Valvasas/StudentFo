import { Building2, GraduationCap } from 'lucide-react';
import type { AccountType } from '@/lib/auth-schema';

const OPTIONS = [
  { type: 'participant', label: 'Peserta', description: 'Pelajar & mahasiswa', icon: GraduationCap },
  { type: 'organizer', label: 'Penyelenggara', description: 'Organisasi, kampus, komunitas', icon: Building2 },
] as const satisfies readonly { type: AccountType; label: string; description: string; icon: typeof GraduationCap }[];

/**
 * Pilihan jenis akun di depan form daftar — dua kartu radio biasa, jadi
 * tetap jalan tanpa JavaScript. `values` memetakan jenis ke nilai yang
 * dikirim: `accountType` di mode Supabase, id persona di mode demo.
 */
export function AccountTypeField({
  name,
  selected,
  values = { participant: 'participant', organizer: 'organizer' },
}: {
  name: string;
  selected: AccountType;
  values?: Readonly<Record<AccountType, string>>;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13.5px] font-semibold">Daftar sebagai</legend>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map(({ type, label, description, icon: Icon }) => (
          <label key={type} className="choice relative flex-col items-start gap-2 p-3 pr-9">
            <input type="radio" name={name} value={values[type]} defaultChecked={type === selected} required className="check absolute right-3 top-3" />
            <Icon aria-hidden className="size-5 text-ink-muted" />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-ink">{label}</span>
              <span className="text-[12.5px] font-normal leading-snug text-ink-muted">{description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
