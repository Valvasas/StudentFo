import type { Metadata } from 'next';
import { BadgeCheck, Bell, CalendarClock, Inbox, ReceiptText, Send, Users } from 'lucide-react';
import { AccountShell } from '@/components/layout/account-shell';
import { DemoNotificationCard } from '@/components/profile/demo-settings';
import { DetailCard } from '@/components/profile/detail-card';
import { SettingsHeader } from '@/components/profile/settings-list';
import { BackLink } from '@/components/ui/back-link';
import { requireUser } from '@/lib/auth';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { sectionTitle } from '@/lib/page-title';

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

export default async function NotificationSettingsPage() {
  const user = await requireUser('/profile/settings/notifikasi');

  return (
    <AccountShell user={user} active="pengaturan">
      <div className="flex max-w-[820px] flex-col gap-5">
        <BackLink href="/profile/settings" label="Pengaturan" className="-mb-3" />
        <SettingsHeader title="Notifikasi" description="Kabar apa saja yang sampai ke lonceng di kanan atas, dan kapan pengingat tenggat dikirim." />

        {demoFeaturesEnabled && <DemoNotificationCard delay={60} />}

        <DetailCard
          id="lonceng"
          icon={<Bell className="size-[18px]" />}
          title="Yang masuk ke lonceng"
          description="Dikirim otomatis untuk akunmu; tidak perlu dinyalakan."
          delay={demoFeaturesEnabled ? 120 : 60}
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
