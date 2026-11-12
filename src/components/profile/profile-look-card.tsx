import { ImagePlus, Images, ShieldAlert, Trash2 } from 'lucide-react';
import { removeProfileImageAction, setBannerPresetAction, uploadProfileImageAction } from '@/app/profile/actions';
import { DetailCard, detailButton, detailPrimaryButton } from '@/components/profile/detail-card';
import { ProfileBanner } from '@/components/profile/profile-banner';
import { SelfAvatar } from '@/components/ui/avatar';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { PROFILE_MEDIA_LIMITS } from '@/lib/profile-media';
import { BANNER_PRESETS, BANNER_PRESET_LABEL, type OwnProfileMedia } from '@/types/domain';

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Kartu "Foto & banner" di Data diri (ADR-083). Tiga form kecil yang berdiri
 * sendiri (foto, banner bawaan, banner unggahan) alih-alih satu form besar:
 * tiap aksi langsung tersimpan, dan gagal di satu tidak membuang yang lain.
 * Semuanya `<form>` Server Action — jalan tanpa JavaScript; dengan JavaScript
 * gambar diperkecil di peramban sebelum dikirim.
 */
export function ProfileLookCard({ media, fullName, subtitle, delay }: { media: OwnProfileMedia; fullName: string; subtitle: string; delay: number }) {
  const hasUploadedBanner = media.bannerId !== null;
  return (
    <DetailCard
      id="tampilan"
      icon={<Images className="size-[18px]" />}
      title="Foto & banner"
      description="Wajah kartu profilmu di menu akun, Koneksi, tim, lobi, dan Komunitas."
      delay={delay}
    >
      {!media.available ? (
        <p role="status" className="mx-5 mb-6 rounded-card bg-panel-nested px-4 py-3 text-[13.5px] text-ink-muted sm:mx-6">
          Foto profil & banner aktif setelah pembaruan server terpasang. Sampai saat itu inisial namamu yang tampil.
        </p>
      ) : (
        <div className="flex flex-col gap-7 px-5 pb-6 sm:px-6">
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] text-ink-muted">Pratinjau kartu profilmu</span>
            <div className="w-full max-w-[340px] overflow-hidden rounded-[18px] border border-line bg-panel">
              <ProfileBanner media={media} className="h-[76px]" />
              <div className="flex items-end gap-3 px-4 pb-4">
                <SelfAvatar name={fullName} photo={media.avatarId} className="-mt-7 size-16 text-[19px] ring-[3px] ring-panel" />
                <span className="flex min-w-0 flex-col gap-0.5 pt-2">
                  <span className="truncate text-[15px] font-semibold">{fullName}</span>
                  <span className="truncate text-[12.5px] text-ink-muted">{subtitle}</span>
                </span>
              </div>
            </div>
          </div>

          <section aria-labelledby="foto-profil-title" className="flex flex-col gap-3 border-t border-line/70 pt-5">
            <h3 id="foto-profil-title" className="text-[15px] font-semibold">
              Foto profil
            </h3>
            <form action={uploadProfileImageAction} className="flex flex-col gap-3">
              <input type="hidden" name="kind" value="avatar" />
              <ImageUploadField
                id="foto-profil"
                name="image"
                label={media.avatarId ? 'Ganti foto' : 'Pilih foto'}
                hint={`Fotomu sendiri, wajah terlihat jelas. Maks. ${megabytes(PROFILE_MEDIA_LIMITS.avatar.maxBytes)} — diperkecil otomatis sebelum dikirim.`}
                maxEdge={PROFILE_MEDIA_LIMITS.avatar.uploadEdge}
                required
              />
              <SubmitButton pendingLabel="Mengunggah…" className={`${detailPrimaryButton} self-start`}>
                <ImagePlus aria-hidden className="mr-1.5 size-4" />
                Pasang foto
              </SubmitButton>
            </form>
            {media.avatarId && (
              <form action={removeProfileImageAction}>
                <input type="hidden" name="kind" value="avatar" />
                <ConfirmSubmit
                  className={detailButton}
                  confirm={{
                    title: 'Hapus foto profil?',
                    description: 'Fotomu dihapus dari StudentFo dan inisial namamu tampil lagi. Kamu bisa memasang foto baru kapan saja.',
                    confirmLabel: 'Ya, hapus foto',
                    icon: <Trash2 />,
                  }}
                >
                  <Trash2 aria-hidden className="size-3.5" />
                  Hapus foto
                </ConfirmSubmit>
              </form>
            )}
          </section>

          <section aria-labelledby="banner-title" className="flex flex-col gap-3 border-t border-line/70 pt-5">
            <h3 id="banner-title" className="text-[15px] font-semibold">
              Banner kartu profil
            </h3>
            <form action={setBannerPresetAction} className="flex flex-col gap-3">
              <fieldset>
                <legend className="mb-2 text-[13px] text-ink-muted">
                  Pilih salah satu gaya{hasUploadedBanner ? ' — banner unggahanmu tetap tampil di atasnya sampai kamu menghapusnya' : ''}.
                </legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {BANNER_PRESETS.map((preset) => (
                    <label
                      key={preset}
                      className="group flex min-h-11 cursor-pointer flex-col overflow-hidden rounded-card border border-line bg-panel transition-colors duration-150 ease-snap hover:border-line-strong has-[:checked]:border-brand has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
                    >
                      <ProfileBanner media={{ bannerId: null, bannerPreset: preset }} className="h-11" />
                      <span className="flex items-center gap-2 px-2.5 py-2 text-[12.5px] font-medium">
                        <input type="radio" name="preset" value={preset} defaultChecked={(media.bannerPreset ?? 'kertas') === preset} className="check shrink-0" />
                        <span className="min-w-0 truncate">{BANNER_PRESET_LABEL[preset]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <SubmitButton pendingLabel="Menyimpan…" className={`${detailPrimaryButton} self-start`}>
                Simpan banner
              </SubmitButton>
            </form>

            <details open={hasUploadedBanner} className="group rounded-card border border-dashed border-line-strong/70 open:border-solid open:border-line">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-[13.5px] font-semibold [&::-webkit-details-marker]:hidden">
                {hasUploadedBanner ? 'Banner unggahanmu' : 'Atau unggah banner sendiri'}
                <ImagePlus aria-hidden className="size-4 text-ink-muted" />
              </summary>
              <div className="flex flex-col gap-3 border-t border-line/70 p-3.5">
                <form action={uploadProfileImageAction} className="flex flex-col gap-3">
                  <input type="hidden" name="kind" value="banner" />
                  <ImageUploadField
                    id="banner-unggahan"
                    name="image"
                    label={hasUploadedBanner ? 'Ganti banner' : 'Pilih gambar banner'}
                    hint={`Gambar melebar (sekitar 4:1) paling pas; bagian tengahnya yang tampil. Maks. ${megabytes(PROFILE_MEDIA_LIMITS.banner.maxBytes)}.`}
                    maxEdge={PROFILE_MEDIA_LIMITS.banner.uploadEdge}
                    required
                  />
                  <SubmitButton pendingLabel="Mengunggah…" className={`${detailPrimaryButton} self-start`}>
                    Pasang banner
                  </SubmitButton>
                </form>
                {hasUploadedBanner && (
                  <form action={removeProfileImageAction}>
                    <input type="hidden" name="kind" value="banner" />
                    <ConfirmSubmit
                      className={detailButton}
                      confirm={{
                        title: 'Hapus banner unggahan?',
                        description: 'Gambarnya dihapus dari StudentFo dan banner bawaan pilihanmu tampil lagi.',
                        confirmLabel: 'Ya, hapus banner',
                        icon: <Trash2 />,
                      }}
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                      Hapus banner unggahan
                    </ConfirmSubmit>
                  </form>
                )}
              </div>
            </details>
          </section>

          <p className="flex items-start gap-2 rounded-card bg-panel-nested px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-muted">
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Terlihat oleh orang yang boleh membuka profilmu (atur di “Profil publik”) — tamu dan mesin pencari tidak pernah. Jangan memakai foto orang lain,
              gambar tidak pantas, atau gambar yang memuat data pribadi; moderator bisa mencabutnya.
            </span>
          </p>
        </div>
      )}
    </DetailCard>
  );
}
