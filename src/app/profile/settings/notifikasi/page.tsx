import type { Metadata } from 'next';
import { BadgeCheck, Bell, BellOff, CalendarClock, Inbox, ReceiptText, Send, Users } from 'lucide-react';
import { updateNotificationPreferencesAction } from '@/app/profile/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { AccountShell } from '@/components/layout/account-shell';
import { DemoNotificationCard } from '@/components/profile/demo-settings';
import { DetailCard, detailButton } from '@/components/profile/detail-card';
import { SettingsHeader } from '@/components/profile/settings-list';
import { BackLink } from '@/components/ui/back-link';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { demoFeaturesEnabled } from '@/lib/demo-features';
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
 * dari Tersimpan + Papan lamaran (ADR-017); kanal email/WhatsApp belum
 * dikirim karena belum ada persetujuan kanal per pengguna (ADR-051), jadi
 * halaman ini tidak menawarkan sakelar yang tidak mengubah apa-apa.
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
  const preferences = await (await getEventRepository()).getNotificationPreferences(user.id);

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
                <span className="text-[12.5px] text-ink-muted">{preferences.deadlineReminders ? 'Sedang menyala' : 'Sedang mati — tenggat tidak diingatkan'}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                name="deadlineReminders"
                defaultChecked={preferences.deadlineReminders}
                className="relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-pill bg-line-strong transition-colors duration-200 ease-snap before:absolute before:left-[3px] before:top-[3px] before:size-[22px] before:rounded-pill before:bg-canvas before:shadow-sm before:transition-transform before:duration-300 before:ease-[var(--easing-spring)] before:content-[''] checked:bg-brand checked:before:translate-x-5 focus-visible:outline-none"
              />
            </label>
            {/* Mematikan = tenggat bisa terlewat tanpa kabar (kegagalan paling mahal, ADR-051): dikonfirmasi.
                Kotak centang yang dimatikan tidak masuk FormData (''). */}
            <ConfirmSubmit
              className={detailButton}
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
            Email dan WhatsApp belum dikirim. Kami baru akan mengirim lewat kanal itu setelah kamu sendiri menyalakannya — bukan diam-diam.
          </p>
        </DetailCard>
      </div>
    </AccountShell>
  );
}
