import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Download, Share2 } from 'lucide-react';
import { AccountShell } from '@/components/layout/account-shell';
import { DetailCard, DetailRows, detailButton } from '@/components/profile/detail-card';
import { DemoPrivacyControls } from '@/components/profile/privacy-controls';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { demoFeaturesEnabled } from '@/lib/demo-features';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Privasi & data',
  robots: { index: false, follow: false },
};

const actionLink = 'inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-semibold text-ink underline underline-offset-[3px]';

/**
 * Privasi & data (kanvas Privasi). Bagian atas menyebut apa yang BENAR
 * terlihat oleh orang lain untuk akun ini sekarang — dihitung dari pilihan
 * Koneksi, kartu pemain, dan pendaftaran internal, bukan kalimat tetap.
 * Versi lama menulis "penyelenggara: tidak ada" dan "pengguna lain: tidak ada"
 * apa pun keadaannya; sejak formulir internal (ADR-056) dan kartu pemain
 * (ADR-057) itu tidak lagi benar (ADR-060). Kendali per kolom di bawahnya
 * hanya mode data contoh.
 */
export default async function PrivacyPage() {
  const user = await requireUser('/profile/privacy');
  const repository = await getEventRepository();
  const [saved, tracker, registrations, network, seeker] = await Promise.all([
    repository.listSavedEvents(user.id),
    repository.listTrackerItems(user.id),
    repository.listMyRegistrations(user.id),
    repository.getNetworkProfile(user.id),
    repository.getSeekerProfile(user.id),
  ]);

  const visibleBecause = [network.discoverable && 'profilmu terlihat di Koneksi', seeker?.open && 'kartu pemainmu terbuka'].filter(Boolean);
  const activeRegistrations = registrations.filter((registration) => registration.status !== 'CANCELLED');

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
          description="Berlaku untuk akunmu sekarang."
          actions={
            <a href="/profile/privacy/ekspor" download className={detailButton}>
              <Download aria-hidden className="size-3.5" />
              Unduh salinan dataku
            </a>
          }
          delay={60}
        >
          <DetailRows
            rows={[
              { label: 'Tamu yang belum masuk', value: 'Tidak ada data pribadimu' },
              { label: 'Anggota tim yang sama', value: 'Nama dan peranmu di tim itu' },
              {
                label: 'Pengguna lain yang masuk',
                value:
                  visibleBecause.length > 0 ? (
                    <>
                      <span className="block">
                        Profil publikmu tanpa email (nama, headline, jurusan, jenjang, minat, portofolio publik), karena {visibleBecause.join(' dan ')}.
                      </span>
                      <span className="flex flex-wrap gap-x-5">
                        <Link href="/connections?tab=pengaturan" className={actionLink}>
                          Atur visibilitas Koneksi
                        </Link>
                        <Link href="/teams/cocok" className={actionLink}>
                          Atur kartu pemain
                        </Link>
                      </span>
                    </>
                  ) : (
                    'Tidak ada — profilmu tersembunyi dan kartu pemainmu tertutup'
                  ),
                wide: true,
              },
              {
                label: 'Penyelenggara kegiatan',
                value:
                  activeRegistrations.length > 0
                    ? `Nama, email, jawaban formulir, dan bukti bayarmu — hanya untuk ${activeRegistrations.length} acara yang kamu daftari lewat formulir StudentFo`
                    : 'Tidak ada. Data dirimu baru sampai ke penyelenggara bila kamu mendaftar lewat formulir StudentFo mereka',
                wide: true,
              },
              {
                label: 'Tersimpan di akunmu',
                value: `${saved.length} kegiatan tersimpan · ${tracker.length} catatan di Papan lamaran · ${registrations.length} pendaftaran`,
                wide: true,
              },
            ]}
          />
          <div className="flex flex-col gap-1 border-t border-line/70 px-5 pb-2 pt-3.5 sm:px-6">
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              Salinan berformat JSON memuat akun, kegiatan tersimpan, Papan lamaran, portofolio, pendaftaran, tim, koneksi, kartu pemain, kiriman,
              dan notifikasi.
            </p>
            <Link href="/privacy-policy#kp-9" className={`${actionLink} self-start`}>
              Hapus akun &amp; hak lain atas datamu <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>
        </DetailCard>

        {demoFeaturesEnabled && <DemoPrivacyControls name={user.fullName} major={user.major} />}
      </div>
    </AccountShell>
  );
}
