import type { Metadata } from 'next';
import Link from 'next/link';
import { KeyRound, LogOut, MonitorSmartphone, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import { changePasswordAction, signOutAction } from '@/app/auth/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { AuthField } from '@/components/auth/auth-field';
import { PasswordInput } from '@/components/auth/password-input';
import { AccountShell } from '@/components/layout/account-shell';
import { DemoNotificationCard, DemoResetCard } from '@/components/profile/demo-settings';
import { DetailCard, DetailRows, detailButton, detailFields, detailGhostButton, detailPrimaryButton } from '@/components/profile/detail-card';
import { requireUser } from '@/lib/auth';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { firstParam, type RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pengaturan',
  robots: { index: false, follow: false },
};

/**
 * Pengaturan (kanvas Pengaturan). Ganti kata sandi memakai aksi server
 * yang sudah ada (verifikasi ulang + keluarkan sesi lain). Daftar
 * perangkat dari kanvas tidak ditampilkan: Supabase tidak memberi daftar
 * sesi ke klien, dan daftar perangkat palsu justru menyesatkan soal
 * keamanan akun (ADR-039).
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const user = await requireUser('/profile/settings');
  const hasPassword = user.providers.includes('email');
  const hasGoogle = user.providers.includes('google');
  const editingPassword = hasPassword && firstParam(params.ubah) === 'sandi';

  return (
    <AccountShell user={user} active="pengaturan">
      <div className="flex max-w-[820px] flex-col gap-5">
        <div className="enter flex flex-col gap-2.5 [animation-duration:800ms]">
          <h1 className="text-[36px] leading-[1.05] tracking-[-0.04em]">Pengaturan</h1>
          <p className="max-w-[60ch] text-[15.5px] leading-relaxed text-ink-muted">Cara kamu masuk, kabar yang kamu terima, dan sesi di perangkat ini.</p>
        </div>

        <AuthFeedback params={params} />

        <DetailCard
          id="akun"
          icon={<UserRound className="size-[18px]" />}
          title="Akun"
          description="Cara kamu masuk ke StudentFo."
          editing={editingPassword}
          actions={
            editingPassword ? (
              <>
                <Link href="/profile/settings" scroll={false} className={detailGhostButton}>
                  Batal
                </Link>
                <button type="submit" form="form-sandi" className={detailPrimaryButton}>
                  Simpan kata sandi
                </button>
              </>
            ) : hasPassword ? (
              <Link href="/profile/settings?ubah=sandi#akun" className={detailButton}>
                <Pencil aria-hidden className="size-3.5" />
                Ganti kata sandi
              </Link>
            ) : undefined
          }
          delay={60}
        >
          <DetailRows
            rows={[
              { label: 'Email masuk', value: user.email, locked: true },
              {
                label: 'Kata sandi',
                value: hasPassword
                  ? 'Aktif · mengganti kata sandi mengeluarkan sesi di perangkat lain'
                  : hasGoogle
                    ? 'Tidak dipakai — kamu masuk lewat Google'
                    : 'Tidak dipakai — akun demo masuk tanpa kata sandi',
                empty: !hasPassword,
              },
              {
                label: 'Masuk dengan Google',
                value: hasGoogle ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck aria-hidden className="size-4" />
                    Terhubung · keamanan mengikuti akun Google-mu
                  </span>
                ) : (
                  'Tidak terhubung'
                ),
                empty: !hasGoogle,
              },
            ]}
          />
          {editingPassword && (
            <form id="form-sandi" action={changePasswordAction} className={`${detailFields} border-t border-line pt-5`}>
              <AuthField id="currentPassword" label="Kata sandi saat ini">
                <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" required maxLength={72} />
              </AuthField>
              <span aria-hidden className="hidden sm:block" />
              <AuthField id="password" label="Kata sandi baru" hint="Minimal 8 karakter, huruf dan angka.">
                <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} maxLength={72} aria-describedby="password-hint" />
              </AuthField>
              <AuthField id="confirmPassword" label="Ulangi kata sandi baru">
                <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required minLength={8} maxLength={72} />
              </AuthField>
            </form>
          )}
        </DetailCard>

        {demoFeaturesEnabled && <DemoNotificationCard delay={120} />}

        <DetailCard
          id="sesi"
          icon={<MonitorSmartphone className="size-[18px]" />}
          title="Sesi"
          description="Keluar dari akun di perangkat yang sedang kamu pakai."
          delay={180}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-5 py-4 sm:mx-6 sm:px-0">
            <span className="flex items-center gap-3">
              <KeyRound aria-hidden className="size-4 text-ink-muted" />
              <span className="text-[14.5px]">
                Masuk sebagai <strong className="font-semibold">{user.fullName}</strong>
              </span>
            </span>
            <form action={signOutAction}>
              <button type="submit" className={detailButton}>
                <LogOut aria-hidden className="size-3.5" />
                Keluar dari akun ini
              </button>
            </form>
          </div>
          {hasPassword && (
            <p className="px-5 pb-5 text-[12.5px] text-ink-muted sm:px-6">Kehilangan perangkat? Ganti kata sandi — semua sesi lain otomatis dikeluarkan.</p>
          )}
        </DetailCard>

        {demoFeaturesEnabled && <DemoResetCard delay={240} />}
      </div>
    </AccountShell>
  );
}
