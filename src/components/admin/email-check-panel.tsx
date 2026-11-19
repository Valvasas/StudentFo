import { MailCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';

/**
 * Cek pengiriman email Auth (ADR-093, audit 14 Nov §1 F5). Halaman lupa
 * sandi sengaja seragam — benar untuk keamanan, tetapi kegagalan SMTP 13 Nov
 * (535) jadi tak terlihat oleh siapa pun. Admin mengirim email uji ke
 * alamatnya SENDIRI dan melihat hasilnya terang-terangan.
 */
export function EmailCheckPanel({ action, available }: { action: () => Promise<void>; available: boolean }) {
  return (
    <section aria-labelledby="cek-email" className="mt-8 flex flex-col gap-3 rounded-panel border border-line bg-panel p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <MailCheck aria-hidden className="mt-1 size-5 shrink-0 text-ink-muted" />
        <div className="min-w-0">
          <h2 id="cek-email" className="text-xl">
            Cek pengiriman email
          </h2>
          <p className="mt-1 text-[13.5px] leading-snug text-ink-muted">
            {available
              ? 'Mengirim email atur ulang sandi ke alamatmu sendiri lewat SMTP Supabase — jalur yang sama dengan konfirmasi daftar. Abaikan tautan di dalamnya.'
              : 'Tersedia di mode Supabase. Mode demo tidak mengirim email sungguhan.'}
          </p>
        </div>
      </div>
      {available && (
        <form action={action} className="shrink-0">
          <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ variant: 'secondary', className: 'w-full sm:w-auto' })}>
            Kirim email uji
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
