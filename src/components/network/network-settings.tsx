import Link from 'next/link';
import { ChevronDown, EyeOff, Lock } from 'lucide-react';
import { updateNetworkProfileAction } from '@/app/connections/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { NETWORK_LIMITS, personMeta } from '@/lib/network';
import type { NetworkProfile } from '@/types/domain';
import type { NetworkViewer } from '@/lib/network';
import { PersonAvatar } from './person-cards';

/**
 * Opt-in "bisa ditemukan" + headline. Pratinjau kartu di bawahnya
 * menampilkan PERSIS kolom yang dibuka view `network_directory` — orang
 * berhak tahu apa yang terlihat sebelum menyalakannya.
 */
export function NetworkSettings({
  viewer,
  profile,
  categoryName,
  returnTo,
}: {
  viewer: NetworkViewer;
  profile: NetworkProfile;
  categoryName: (slug: string) => string;
  returnTo: string;
}) {
  const meta = personMeta(viewer);
  return (
    <section id="pengaturan-jaringan" aria-labelledby="pengaturan-jaringan-title" className="scroll-mt-28 rounded-[18px] border border-line">
      {/* Terbuka sendiri hanya saat profil masih tersembunyi (ada yang perlu
          diputuskan, dan banner "Atur sekarang" menautkan ke sini). Setelah
          diatur, form penuh tidak perlu terus memakan tempat di samping daftar. */}
      <details open={!profile.discoverable} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col gap-0.5">
            <h2 id="pengaturan-jaringan-title" className="text-base font-semibold">
              Cara orang menemukanmu
            </h2>
            <span className="text-[13px] text-ink-muted">
              {profile.discoverable ? 'Terlihat di Cari Koneksi' : 'Tersembunyi dari Cari Koneksi'}
            </span>
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-snap group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 px-5 pb-5">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Mati secara bawaan. Kamu tetap bisa mengajak orang lain, dan yang sudah terhubung tetap melihatmu.
          </p>

          <form action={updateNetworkProfileAction} className="flex flex-col gap-4">
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-card bg-panel-nested px-3.5 py-2.5">
              <span className="flex flex-col">
                <span className="text-[13.5px] font-semibold">Tampilkan aku di Cari Koneksi</span>
                <span className="text-[12px] text-ink-muted">{profile.discoverable ? 'Sedang aktif' : 'Sedang tersembunyi'}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                name="discoverable"
                defaultChecked={profile.discoverable}
                className="relative h-6 w-10 shrink-0 cursor-pointer appearance-none rounded-pill bg-line-strong transition-colors duration-150 ease-snap before:absolute before:left-[3px] before:top-[3px] before:size-[18px] before:rounded-pill before:bg-canvas before:transition-transform before:duration-150 before:content-[''] checked:bg-brand checked:before:translate-x-4"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="headline" className="text-[13.5px] font-semibold">
                Headline
              </label>
              <input
                id="headline"
                name="headline"
                defaultValue={profile.headline ?? ''}
                maxLength={NETWORK_LIMITS.headlineMax}
                aria-describedby="headline-hint"
                placeholder="Mis. Frontend, sedang cari tim hackathon"
                className="h-11 w-full rounded-card border border-line-strong/70 bg-panel px-3.5 text-base transition-colors duration-150 hover:border-line-strong focus-visible:border-brand sm:text-sm"
              />
              <p id="headline-hint" className="text-[12px] text-ink-muted">
                Satu kalimat tentang apa yang kamu kerjakan atau cari. Maks. {NETWORK_LIMITS.headlineMax} karakter.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-ink-muted">Yang dilihat orang lain</span>
              <div className="flex flex-col gap-2 rounded-card border border-dashed border-line-strong p-3.5">
                <span className="flex items-center gap-2.5">
                  <PersonAvatar name={viewer.fullName} solid={false} size="sm" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{viewer.fullName}</span>
                    <span className="truncate text-[12px] text-ink-muted">{meta || 'Jurusan & jenjang belum diisi'}</span>
                  </span>
                </span>
                {profile.headline && <span className="text-[12.5px] text-ink-soft">{profile.headline}</span>}
                {viewer.interests.length > 0 && (
                  <span className="text-[12px] text-ink-muted">Minat: {viewer.interests.map(categoryName).join(', ')}</span>
                )}
              </div>
              <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-muted">
                <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                Email, kegiatan yang kamu simpan, dan status pendaftaranmu tidak pernah ditampilkan.
              </p>
            </div>

            <SubmitButton className="flex h-11 items-center justify-center rounded-card bg-brand text-sm font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover">
              Simpan pengaturan
            </SubmitButton>
          </form>
        </div>
      </details>
    </section>
  );
}

export function HiddenProfileBanner() {
  return (
    <div className="enter flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-panel-nested px-4 py-3.5 [animation-duration:500ms]">
      <EyeOff aria-hidden className="size-5 shrink-0" />
      <p className="min-w-[220px] flex-1 text-sm leading-relaxed">
        <span className="font-semibold">Profilmu belum bisa ditemukan.</span> Kamu tetap bisa mengajak orang, tapi orang lain belum bisa mengajakmu lebih dulu.
      </p>
      <Link href="/connections?tab=pengaturan#pengaturan-jaringan" className="flex min-h-11 items-center rounded-sm bg-brand px-3.5 text-[13.5px] font-semibold text-on-brand hover:bg-brand-hover">
        Atur sekarang
      </Link>
    </div>
  );
}
