import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Share2 } from 'lucide-react';
import { AccountShell } from '@/components/layout/account-shell';
import { DetailCard, DetailRows } from '@/components/profile/detail-card';
import { DemoPrivacyControls, DownloadDataButton } from '@/components/profile/privacy-controls';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { demoFeaturesEnabled } from '@/lib/demo-features';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Privasi & data',
  robots: { index: false, follow: false },
};

/**
 * Privasi & data (kanvas Privasi). Bagian atas menyebut apa yang BENAR
 * terlihat oleh orang lain hari ini (dari RLS & view team_member_profiles);
 * kendali per kolom di bawahnya mode data contoh. Kanvas punya log "data
 * yang dibagikan ke penyelenggara" — aplikasi ini tidak meneruskan data ke
 * penyelenggara, jadi yang tampil adalah pernyataan itu, bukan log fiktif.
 */
export default async function PrivacyPage() {
  const user = await requireUser('/profile/privacy');
  const repository = await getEventRepository();
  const [saved, tracker] = await Promise.all([repository.listSavedEvents(user.id), repository.listTrackerItems(user.id)]);

  const snapshot = {
    account: {
      fullName: user.fullName,
      email: user.email,
      educationLevel: user.educationLevel,
      major: user.major,
      interests: user.interests,
      signInMethods: user.providers,
    },
    savedEvents: saved.map((event) => ({ title: event.title, url: `/events/${event.slug}` })),
    tracker: tracker.map((item) => ({ title: item.event.title, status: item.status, notes: item.notes, updatedAt: item.updatedAt })),
  };

  return (
    <AccountShell user={user} active="privasi">
      <div className="flex max-w-[980px] flex-col gap-5">
        <div className="enter flex flex-col gap-2.5 [animation-duration:800ms]">
          <h1 className="text-[36px] leading-[1.05] tracking-[-0.04em]">Privasi &amp; data</h1>
          <p className="max-w-[62ch] text-[15.5px] leading-relaxed text-ink-muted">
            Kamu yang menentukan siapa melihat apa. Di bawah ini apa yang terlihat oleh orang lain, dan salinan data yang kami simpan tentangmu.
          </p>
          <Link href="/privacy-policy" className="flex min-h-11 items-center gap-1.5 self-start text-[13.5px] font-semibold underline underline-offset-[3px]">
            Baca kebijakan privasi <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>

        <DetailCard
          id="terlihat"
          icon={<Share2 className="size-[18px]" />}
          title="Yang terlihat oleh orang lain"
          description="Berlaku untuk akunmu sekarang, di luar pengaturan demo."
          actions={<DownloadDataButton snapshot={snapshot} includeLocal={demoFeaturesEnabled} />}
          delay={60}
        >
          <DetailRows
            rows={[
              { label: 'Anggota tim yang sama', value: 'Nama dan peranmu di tim itu' },
              { label: 'Pengguna lain & tamu', value: 'Tidak ada data pribadimu' },
              { label: 'Penyelenggara kegiatan', value: 'Tidak ada — pendaftaran terjadi di situs mereka, kami tidak meneruskan datamu', wide: true },
              { label: 'Tersimpan di akunmu', value: `${saved.length} kegiatan tersimpan · ${tracker.length} catatan pendaftaran`, wide: true },
            ]}
          />
        </DetailCard>

        {demoFeaturesEnabled && <DemoPrivacyControls name={user.fullName} major={user.major} />}
      </div>
    </AccountShell>
  );
}
