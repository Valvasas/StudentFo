import { BadgeCheck, ChevronRight, GraduationCap, ShieldCheck, Sprout } from 'lucide-react';
import { demoSignInAction } from '@/app/auth/actions';
import { DEMO_PERSONA_IDS, DEMO_PERSONAS, type DemoPersonaId } from '@/lib/demo/personas';

const ICON: Record<DemoPersonaId, typeof GraduationCap> = {
  mahasiswa: GraduationCap,
  'siswa-baru': Sprout,
  admin: ShieldCheck,
  penyelenggara: BadgeCheck,
};

/**
 * Pemilih akun demo (mode seed).
 *
 * Satu <form> per persona, tanpa JavaScript klien: tetap berfungsi saat JS
 * mati, dan setiap tombol adalah target sentuh penuh (≥ 44px) dengan nama
 * aksesibel yang menyebut personanya — bukan empat tombol "Masuk" kembar.
 * Awalan "Masuk sebagai <label>:" dipakai helper e2e; jangan diubah.
 *
 * Persona Admin TIDAK ikut daftar kecuali pemanggil membawa kunci yang sudah
 * lolos `isDemoAdminPersonaAllowed` (`adminKey`). Kunci dikirim ulang sebagai
 * isian tersembunyi dan diperiksa lagi di `demoSignInAction`.
 */
export function DemoLogin({ next, adminKey }: { next: string; adminKey?: string }) {
  const personaIds = DEMO_PERSONA_IDS.filter((id) => id !== 'admin' || adminKey !== undefined);
  return (
    <section aria-labelledby="demo-login-title" className="flex flex-col gap-3">
      <h2 id="demo-login-title" className="text-center text-sm text-ink-muted">
        Pilih peran untuk mencoba.
      </h2>

      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line">
        {personaIds.map((id) => {
          const persona = DEMO_PERSONAS[id];
          const Icon = ICON[id];
          return (
            <li key={id}>
              <form action={demoSignInAction}>
                <input type="hidden" name="persona" value={id} />
                <input type="hidden" name="next" value={next} />
                {id === 'admin' && <input type="hidden" name="akses" value={adminKey ?? ''} />}
                <button
                  type="submit"
                  aria-label={`Masuk sebagai ${persona.label}: ${persona.fullName}`}
                  className="group flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-150 ease-snap hover:bg-panel-nested focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                >
                  <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-panel-nested text-ink group-hover:bg-panel">
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold">{persona.label}</span>
                    <span className="truncate text-[13px] text-ink-muted">{persona.summary}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint transition-transform duration-150 ease-snap group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
