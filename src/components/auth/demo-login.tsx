import { GraduationCap, ShieldCheck, Sprout } from 'lucide-react';
import { demoSignInAction } from '@/app/auth/actions';
import { DEMO_PERSONA_IDS, DEMO_PERSONAS, type DemoPersonaId } from '@/lib/demo/personas';

const ICON: Record<DemoPersonaId, typeof GraduationCap> = {
  mahasiswa: GraduationCap,
  'siswa-baru': Sprout,
  admin: ShieldCheck,
};

/**
 * Pemilih akun demo (mode seed).
 *
 * Satu <form> per persona, tanpa JavaScript klien: tetap berfungsi saat JS
 * mati, dan setiap tombol adalah target sentuh penuh (≥ 44px) dengan nama
 * aksesibel yang menyebut personanya — bukan tiga tombol "Masuk" kembar.
 */
export function DemoLogin({ next }: { next: string }) {
  return (
    <section aria-labelledby="demo-login-title" className="flex flex-col gap-3">
      <div>
        <h2 id="demo-login-title" className="text-lg font-semibold">
          Coba sebagai akun demo
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Setiap pilihan membuat akun sementara khusus untukmu. Data yang kamu simpan tidak terlihat
          pengunjung lain dan hilang saat data demo diatur ulang.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {DEMO_PERSONA_IDS.map((id) => {
          const persona = DEMO_PERSONAS[id];
          const Icon = ICON[id];
          return (
            <li key={id}>
              <form action={demoSignInAction}>
                <input type="hidden" name="persona" value={id} />
                <input type="hidden" name="next" value={next} />
                <button
                  type="submit"
                  aria-label={`Masuk sebagai ${persona.label}: ${persona.fullName}`}
                  className="flex min-h-11 w-full items-start gap-3 rounded-card border border-line bg-panel p-4 text-left transition-colors duration-150 ease-snap hover:border-brand hover:bg-panel-nested"
                >
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-brand-text"
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">
                      {persona.label} <span className="font-normal text-ink-muted">· {persona.fullName}</span>
                    </span>
                    <span className="text-sm text-ink-muted">{persona.summary}</span>
                  </span>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
