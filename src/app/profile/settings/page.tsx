import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, ChevronRight, Cookie, FileText, Heart, IdCard, Info, KeyRound, Lock, LogOut, Palette, Scale, Send } from 'lucide-react';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { SignOutForm } from '@/components/auth/sign-out-form';
import { loadAccountRole } from '@/components/home/account-role';
import { accountSubtitle } from '@/components/layout/account-menu';
import { AccountShell } from '@/components/layout/account-shell';
import { SettingsGroup, SettingsHeader, SettingsRow } from '@/components/profile/settings-list';
import { BackLink } from '@/components/ui/back-link';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import { initialsOf } from '@/lib/initials';
import { profileCompleteness } from '@/lib/profile-completeness';
import { isColdStart } from '@/lib/recommendation';
import type { RawSearchParams } from '@/lib/search-params';
import { EDUCATION_LEVEL_LABEL } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pengaturan',
  robots: { index: false, follow: false },
};

/**
 * Pengaturan = DAFTAR, bukan satu halaman berisi semua kartu (ADR-067).
 * Versi lama menumpuk cara masuk, notifikasi, sesi, dan hapus data di satu
 * layar — konteks yang tidak berhubungan, dan di produksi isinya tinggal dua
 * kartu yang terasa kosong. Sekarang setiap konteks punya halamannya sendiri
 * (dengan tombol kembali ke sini), dan setiap baris menyebut keadaan akunmu
 * saat ini supaya halaman ini sendiri sudah berguna sebagai ringkasan.
 *
 * Tujuan lama `/profile/settings?notice=password_updated` (tautan yang
 * mungkin tersimpan) tetap menampilkan kabarnya lewat `AuthFeedback`.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const user = await requireUser('/profile/settings');
  const repository = await getEventRepository();
  const [context, network, notifications] = await Promise.all([
    loadAccountRole(user),
    repository.getNetworkProfile(user.id),
    // Pendukung ringkasan saja: gagal dimuat = kalimat bawaan, bukan seluruh halaman jatuh.
    withFallback('preferensi notifikasi', () => repository.getNotificationPreferences(user.id), { deadlineReminders: true, adjustable: true }),
  ]);
  const hasPassword = user.providers.includes('email');
  const hasGoogle = user.providers.includes('google');
  const { percent } = profileCompleteness(user);
  const personal = !isColdStart({ educationLevel: user.educationLevel, interests: user.interests });

  const signIn = user.providers.includes('demo')
    ? 'Akun demo di perangkat ini'
    : [hasPassword && 'Email & kata sandi', hasGoogle && 'Google'].filter(Boolean).join(' · ') || 'Masuk lewat email';
  const interests = user.interests.length > 0 ? `${user.interests.length} bidang dipilih` : 'Belum ada bidang yang dipilih';
  const level = user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : 'jenjang belum diisi';

  return (
    <AccountShell user={user} active="pengaturan">
      <div className="flex max-w-[720px] flex-col gap-6">
        <BackLink href="/profile" label="Profil" className="-mb-4" />
        <SettingsHeader title="Pengaturan" description="Akun, kabar yang kamu terima, tampilan, dan privasi — masing-masing di halamannya sendiri." />

        <AuthFeedback params={params} />
        <ActionFeedback params={params} />

        <Link
          href="/profile"
          className="enter group flex items-center gap-4 rounded-[18px] border border-line bg-panel p-4 transition-colors duration-150 ease-snap [animation-duration:600ms] hover:bg-panel-nested sm:p-5"
        >
          <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-pill bg-brand text-[17px] font-semibold text-on-brand">
            {initialsOf(user.fullName)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[17px] font-semibold tracking-[-0.01em]">{user.fullName}</span>
            <span className="truncate text-[13.5px] text-ink-muted">{user.email}</span>
            <span className="truncate text-[12.5px] text-ink-muted">{accountSubtitle(user, context)}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold">
            <span className="max-sm:sr-only">Lihat profil</span>
            <ChevronRight aria-hidden className="size-4 transition-transform duration-150 ease-snap group-hover:translate-x-0.5" />
          </span>
        </Link>

        <SettingsGroup id="grup-akun" title="Akun">
          <SettingsRow
            href="/profile/settings/keamanan"
            icon={KeyRound}
            label="Akun & keamanan"
            summary={`${signIn}${hasPassword ? ' · kata sandi aktif' : ''}`}
          />
          <SettingsRow
            href="/profile/details"
            icon={IdCard}
            label="Data diri"
            summary={percent < 100 ? `Profil ${percent}% lengkap` : 'Nama, program studi, dan jenjang lengkap'}
            attention={percent < 100 ? 'Belum lengkap' : undefined}
          />
          <SettingsRow href="/profile/interests" icon={Heart} label="Peminatan" summary={`${interests} · ${level}`} />
        </SettingsGroup>

        <SettingsGroup id="grup-preferensi" title="Preferensi">
          <SettingsRow
            href="/profile/settings/notifikasi"
            icon={Bell}
            label="Notifikasi"
            summary={
              notifications.deadlineReminders
                ? 'Pengingat tenggat H-3 & H-1 menyala · kabar pendaftaran di lonceng'
                : 'Pengingat tenggat dimatikan · kabar pendaftaran tetap di lonceng'
            }
            attention={notifications.deadlineReminders ? undefined : 'Pengingat mati'}
          />
          <SettingsRow
            href="/profile/personalization"
            icon={Palette}
            label="Tampilan & rekomendasi"
            summary={personal ? 'Tema & gerak per perangkat · rekomendasi personal aktif' : 'Tema & gerak per perangkat · rekomendasi belum personal'}
          />
          <SettingsRow
            href="/profile/privacy"
            icon={Lock}
            label="Privasi & data"
            summary={network.discoverable ? 'Profilmu bisa ditemukan di Koneksi · unduh salinan data' : 'Profilmu tidak muncul di Koneksi · unduh salinan data'}
          />
        </SettingsGroup>

        <SettingsGroup id="grup-bantuan" title="Bantuan & informasi">
          <SettingsRow href="/about" icon={Info} label="Tentang StudentFo" summary="Cara kami mengumpulkan dan memeriksa kegiatan" />
          <SettingsRow href="/submit" icon={Send} label="Kirim kegiatan" summary="Bagikan lomba atau beasiswa yang belum ada di sini" />
          <SettingsRow href="/terms" icon={Scale} label="Syarat & ketentuan" />
          <SettingsRow href="/privacy-policy" icon={FileText} label="Kebijakan privasi" />
          <SettingsRow href="/cookie-policy" icon={Cookie} label="Kebijakan cookie" />
        </SettingsGroup>

        <SignOutForm
          className="flex"
          buttonClassName="press flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[18px] border border-line bg-panel px-5 text-[15px] font-semibold text-danger transition-colors duration-150 ease-snap hover:border-danger-line hover:bg-danger-soft"
        >
          <LogOut aria-hidden className="size-[18px]" />
          Keluar
        </SignOutForm>
      </div>
    </AccountShell>
  );
}
