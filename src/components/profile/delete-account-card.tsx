import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { deleteOwnAccountAction } from '@/app/profile/actions';
import { DetailCard } from '@/components/profile/detail-card';
import { buttonVariants } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { ACCOUNT_DELETE_PHRASE } from '@/lib/trust-safety';
import { cn } from '@/lib/utils';

/**
 * Hapus akun sendiri (ADR-061, UU PDP Pasal 8). Tinggal di Privasi & data, di
 * bawah "Unduh salinan datamu" — hak penghapusan berdampingan dengan hak akses.
 * `<details>` + frasa ketik: wajib terkonfirmasi tanpa JavaScript (CONVENTIONS).
 */
export function DeleteAccountCard({ delay }: { delay: number }) {
  return (
    <DetailCard id="hapus-akun" icon={<Trash2 className="size-[18px]" />} title="Hapus akun" description="Permanen — tidak bisa dibatalkan atau dipulihkan." delay={delay}>
      <div className="flex flex-col gap-4 px-5 pb-6 sm:px-6">
        <ul className="flex max-w-[62ch] list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-ink-soft">
          <li>Profil, kegiatan tersimpan, Papan lamaran, portofolio, koneksi, kartu pemain, lobi, dan notifikasimu dihapus.</li>
          <li>Pendaftaran lewat formulir StudentFo beserta bukti bayarnya dihapus. Salinan yang sudah diunduh penyelenggara tunduk pada kebijakan mereka.</li>
          <li>Tim yang kamu buat dan kegiatan yang kamu kirim tetap ada, tanpa namamu.</li>
        </ul>
        <a href="/profile/privacy/ekspor" download className="-my-1 inline-flex min-h-11 items-center self-start text-[13.5px] font-semibold underline underline-offset-[3px]">
          Unduh salinan datamu dulu
        </a>
        <details className="group">
          <summary className={cn(buttonVariants({ variant: 'danger', size: 'sm' }), 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
            <Trash2 aria-hidden /> Hapus akunku…
          </summary>
          <form action={deleteOwnAccountAction} className="mt-4 flex max-w-md flex-col gap-3 rounded-card border border-danger-line bg-danger-soft/40 p-4">
            <label htmlFor="hapus-akun-konfirmasi" className="flex flex-col gap-1.5 text-[13.5px]">
              <span>
                Ketik <strong className="font-mono">{ACCOUNT_DELETE_PHRASE}</strong> untuk konfirmasi.
              </span>
              <TextInput id="hapus-akun-konfirmasi" name="confirm" autoComplete="off" required />
            </label>
            <SubmitButton pendingLabel="Menghapus…" className={buttonVariants({ variant: 'danger', className: 'self-start' })}>
              Hapus akun permanen
            </SubmitButton>
          </form>
        </details>
        <p className="text-[12.5px] text-ink-muted">
          Ingin berhenti sementara saja? <Link href="/profile/settings/keamanan" className="font-medium underline underline-offset-[3px]">Keluar dari semua perangkat</Link> tanpa menghapus data.
        </p>
      </div>
    </DetailCard>
  );
}
