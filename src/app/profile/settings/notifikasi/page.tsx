import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, Bell, BellOff, BellRing, CalendarClock, Inbox, ReceiptText, Send, Users } from 'lucide-react';
import { setDeadlineEmailRemindersAction, updateNotificationPreferencesAction } from '@/app/profile/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { AccountShell } from '@/components/layout/account-shell';
import { DemoNotificationCard } from '@/components/profile/demo-settings';
import { BreakableEmail, DetailCard, detailButton, detailPrimaryButton } from '@/components/profile/detail-card';
import { SettingsHeader } from '@/components/profile/settings-list';
import { BackLink } from '@/components/ui/back-link';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SubmitButton } from '@/components/ui/submit-button';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { dataMode, emailRemindersConfigured } from '@/lib/env';
import { withFallback } from '@/lib/fallback';
import { sectionTitle } from '@/lib/page-title';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: sectionTitle('Notifikasi', 'Pengaturan'),
  robots: { index: false, follow: false },
};

/**
 * Isi lonceng — ditulis dari produsen yang benar-benar ada (trigger & RPC di
 * migration), bukan janji. Pengingat tenggat dibuat `create_deadline_notifications()`
 * dari Tersimpan + Papan lamaran (ADR-017). Email adalah salinan pengingat
 * yang sama (opt-in, ADR-062 #6), jadi saklar lonceng di atasnya tetap INDUK:
 * mati = tidak ada pengingat dibuat = tidak ada email. WhatsApp tidak
 * ditawarkan — belum ada pengirimnya.
 */
const BELL_TOPICS = [
  {
    icon: CalendarClock,
    title: 'Pengingat tenggat',
    body: 'H-3 dan H-1 sebelum tenggat kegiatan yang kamu simpan atau catat di Papan lamaran. Kegiatan yang sudah ditutup tidak diingatkan.',
  },
  {
    icon: ReceiptText,
    title: 'Pendaftaran & pembayaran',
    body: 'Saat panitia mengonfirmasi pendaftaranmu, menolak bukti bayar, atau menolak pendaftaran — lengkap dengan alasannya.',
  },
  {
    icon: Users,
    title: 'Koneksi',
    body: 'Ajakan terhubung yang masuk dan ajakanmu yang diterima. Orang yang kamu blokir tidak bisa mengajakmu lagi.',
  },
  {
    icon: Send,
    title: 'Kiriman kegiatan',
    body: 'Hasil moderasi kegiatan yang kamu kirim lewat “Kirim kegiatan”: tayang atau ditolak.',
  },
  {
    icon: BadgeCheck,
    title: 'Penyelenggara',
    body: 'Keputusan moderator atas pengajuan penyelenggara, klaim acara, dan usulan revisi — hanya bila kamu mengajukannya.',
  },
] as const;

export default async function NotificationSettingsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const user = await requireUser('/profile/settings/notifikasi');
  const repository = await getEventRepository();
  const preferences = await repository.getNotificationPreferences(user.id);
  // Tanpa penyedia email terkonfigurasi, kartu disembunyikan: menawarkan email yang tidak pernah terkirim lebih buruk daripada tidak menawarkannya.
  const emailOffered = emailRemindersConfigured || dataMode === 'seed';
  const emailOptIn = emailOffered ? await withFallback('pengingat email', () => repository.getDeadlineEmailOptIn(user.id), null) : null;

  return (
    <AccountShell user={user} active="pengaturan">
      <div className="flex max-w-[820px] flex-col gap-5">
        <BackLink href="/profile/settings" label="Pengaturan" className="-mb-3" />
        <SettingsHeader title="Notifikasi" description="Kabar apa saja yang sampai ke lonceng di kanan atas, dan kapan pengingat tenggat dikirim." />

        <ActionFeedback params={params} />

        <DetailCard
          id="pengingat"
          icon={<CalendarClock className="size-[18px]" />}
          title="Pengingat tenggat"
          description="H-3 dan H-1 sebelum tenggat kegiatan yang kamu simpan atau catat di Papan lamaran."
          delay={60}
        >
          <form action={updateNotificationPreferencesAction} className="flex flex-wrap items-center gap-3 border-t border-line/70 px-5 py-4 sm:mx-6 sm:px-0">
            <label className="flex min-h-11 min-w-[240px] flex-1 cursor-pointer items-center justify-between gap-3 rounded-[16px] bg-panel-nested px-4 py-3 transition-colors duration-200 ease-snap has-[:checked]:bg-tint-mint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
              <span className="flex flex-col">
                <span className="text-[14px] font-semibold">Ingatkan aku sebelum tenggat</span>
                <span className="text-[12.5px] text-ink-muted">
                  {!preferences.adjustable
                    ? 'Menyala untuk semua akun — saklarnya aktif setelah pembaruan server terpasang'
                    : preferences.deadlineReminders
                      ? 'Sedang menyala'
                      : 'Sedang mati — tenggat tidak diingatkan'}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                name="deadlineReminders"
                defaultChecked={preferences.deadlineReminders}
                disabled={!preferences.adjustable}
                className="relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-pill bg-line-strong transition-colors duration-200 ease-snap before:absolute before:left-[3px] before:top-[3px] before:size-[22px] before:rounded-pill before:bg-canvas before:shadow-sm before:transition-transform before:duration-300 before:ease-[var(--easing-spring)] before:content-[''] checked:bg-brand checked:before:translate-x-5 focus-visible:outline-none"
              />
            </label>
            {/* Mematikan = tenggat bisa terlewat tanpa kabar (kegagalan paling mahal, ADR-051): dikonfirmasi.
                Kotak centang yang dimatikan tidak masuk FormData (''). */}
            <ConfirmSubmit
              className={detailButton}
              disabled={!preferences.adjustable}
              when={{ field: 'deadlineReminders', values: preferences.deadlineReminders ? [''] : [] }}
              confirm={{
                title: 'Matikan pengingat tenggat?',
                description:
                  'Kamu tidak lagi diingatkan H-3 dan H-1 untuk kegiatan yang kamu simpan atau lacak — termasuk yang tenggatnya minggu ini. Tenggat yang terlewat tidak bisa diulang.',
                confirmLabel: 'Ya, matikan',
                icon: <BellOff />,
              }}
            >
              Simpan
            </ConfirmSubmit>
          </form>
        </DetailCard>

        {emailOffered && (
          <DetailCard
            id="pengingat-email"
            icon={<BellRing className="size-[18px]" />}
            title="Pengingat tenggat lewat email"
            description="Salinan pengingat H-3 dan H-1 di atas, dikirim juga ke kotak masukmu."
            delay={90}
          >
            <div className="flex flex-col gap-3 border-t border-line/70 px-5 py-4 sm:mx-6 sm:px-0">
              {emailOptIn ? (
                <>
                  <p className="text-[14.5px]">
                    <strong className="font-semibold">Aktif</strong> sejak {formatDateTimeId(emailOptIn)} · dikirim ke{' '}
                    <BreakableEmail email={user.email} />
                  </p>
                  <form action={setDeadlineEmailRemindersAction}>
                    <input type="hidden" name="mode" value="off" />
                    <SubmitButton className={detailButton}>Matikan pengingat email</SubmitButton>
                  </form>
                </>
              ) : (
                <>
                  {/* Kalimat persetujuan (UU PDP Pasal 20 & 22): apa, ke mana, lewat siapa, cara berhenti — sebelum tombol. */}
                  <p className="max-w-[62ch] text-[14px] leading-relaxed text-ink-soft">
                    Dengan menyalakan, kamu setuju StudentFo mengirim email pengingat ke <BreakableEmail email={user.email} /> melalui
                    penyedia email kami (Resend, server di luar Indonesia). Paling banyak dua email per kegiatan. Berhenti kapan saja dari
                    sini atau lewat tautan di setiap email.
                  </p>
                  <form action={setDeadlineEmailRemindersAction}>
                    <input type="hidden" name="mode" value="on" />
                    <SubmitButton className={detailPrimaryButton}>Nyalakan pengingat email</SubmitButton>
                  </form>
                </>
              )}
              <p className="text-[12.5px] text-ink-muted">
                {dataMode === 'seed' ? 'Mode data contoh: tidak ada email yang benar-benar dikirim. ' : ''}
                {preferences.deadlineReminders
                  ? 'Email mengikuti saklar pengingat di atas.'
                  : 'Saklar pengingat di atas sedang mati, jadi email juga tidak terkirim sampai kamu menyalakannya lagi.'}
              </p>
              <Link
                href="/privacy-policy"
                className="-mt-2 inline-flex min-h-11 items-center self-start text-[12.5px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink"
              >
                Cara kami memproses email ini (Kebijakan privasi)
              </Link>
            </div>
          </DetailCard>
        )}

        {demoFeaturesEnabled && <DemoNotificationCard delay={120} />}

        <DetailCard
          id="lonceng"
          icon={<Bell className="size-[18px]" />}
          title="Yang masuk ke lonceng"
          description="Dikirim otomatis untuk akunmu. Hanya pengingat tenggat yang bisa dimatikan; kabar lain adalah jawaban atas hal yang kamu ajukan atau terima langsung."
          delay={demoFeaturesEnabled ? 180 : 120}
        >
          <ul className="flex flex-col border-t border-line/70 sm:mx-6">
            {BELL_TOPICS.map((topic) => (
              <li key={topic.title} className="flex gap-3.5 border-b border-line/70 px-5 py-4 last:border-b-0 sm:px-0">
                <topic.icon aria-hidden className="mt-0.5 size-[18px] shrink-0 text-ink-muted" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[15px] font-semibold">{topic.title}</span>
                  <span className="text-[13.5px] leading-relaxed text-ink-muted">{topic.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mx-5 mb-5 mt-1 flex items-start gap-2 rounded-card bg-panel-nested px-3.5 py-3 text-[13.5px] sm:mx-6">
            <Inbox aria-hidden className="mt-0.5 size-4 shrink-0" />
            {emailOptIn
              ? 'Pengingat tenggat juga dikirim lewat email (kartu di atas). Kabar lain hanya di lonceng; WhatsApp belum dikirim.'
              : 'Email hanya dikirim untuk pengingat tenggat, dan hanya setelah kamu sendiri menyalakannya di atas — bukan diam-diam. WhatsApp belum dikirim.'}
          </p>
        </DetailCard>
      </div>
    </AccountShell>
  );
}
