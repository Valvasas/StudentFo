import type { Metadata } from 'next';
import Link from 'next/link';
import { BellOff, CircleCheck } from 'lucide-react';
import { stopDeadlineEmailsAction } from '@/app/berhenti-email/actions';
import { buttonVariants } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import { env } from '@/lib/env';
import { firstParam, type RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Berhenti menerima pengingat email',
  robots: { index: false, follow: false },
};

/**
 * Tujuan tautan "Berhenti menerima" di email pengingat (ADR-062 #6). Membuka
 * halaman ini TIDAK menghentikan apa pun — pemindai tautan email membuka
 * setiap URL; yang menghentikan adalah tombol (POST).
 */
export default async function StopEmailPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const done = firstParam(params.selesai) === '1';
  const token = firstParam(params.token) ?? '';
  const valid = !done && verifyUnsubscribeToken(token, env.EMAIL_LINK_SECRET) !== null;

  return (
    <div className="container-page flex max-w-xl flex-col gap-5 py-12 sm:py-16">
      <h1 className="flex items-center gap-2 text-3xl">
        {done ? <CircleCheck aria-hidden className="size-7 text-success" /> : <BellOff aria-hidden className="size-7 text-ink-muted" />}
        {done ? 'Pengingat email dihentikan' : 'Berhenti menerima pengingat email?'}
      </h1>
      {done ? (
        <p className="text-ink-soft">
          Kamu tidak akan menerima email pengingat tenggat lagi. Pengingat di lonceng notifikasi akunmu tetap berjalan, dan email bisa
          dinyalakan lagi kapan saja dari Pengaturan.
        </p>
      ) : valid ? (
        <>
          {firstParam(params.gagal) === '1' && <FormAlert tone="error">Belum berhasil. Coba tekan tombolnya sekali lagi.</FormAlert>}
          <p className="text-ink-soft">
            Email pengingat H-3 dan H-1 untuk kegiatan yang kamu simpan atau lacak akan berhenti. Akunmu dan pengingat di lonceng
            notifikasi tidak berubah.
          </p>
          <form action={stopDeadlineEmailsAction}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton className={buttonVariants()}>
              <BellOff aria-hidden className="size-4" /> Ya, hentikan email pengingat
            </SubmitButton>
          </form>
        </>
      ) : (
        <p className="text-ink-soft">
          Tautan ini tidak valid atau tidak lengkap. Masuk ke akunmu lalu matikan pengingat email dari Pengaturan.
        </p>
      )}
      <Link href="/profile/settings#pengingat-email" className="inline-flex min-h-11 items-center self-start text-sm font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
        Buka Pengaturan
      </Link>
    </div>
  );
}
