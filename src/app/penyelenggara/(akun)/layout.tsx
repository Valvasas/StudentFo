import Link from 'next/link';
import { ArrowRight, BadgeCheck } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';

const STEPS = [
  { title: 'Buat akun atau masuk', body: 'Akun yang sama dipakai untuk ikut kegiatan, jadi tidak perlu akun kedua.' },
  { title: 'Ajukan verifikasi lembaga', body: 'Moderator mencocokkan nama lembaga dengan bukti peranmu.' },
  { title: 'Pasang & kelola acara', body: 'Formulir pendaftaran, bukti bayar, dan analitik di satu studio.' },
] as const;

/**
 * Pintu akun penyelenggara (ADR-063): form yang sama dengan pintu peserta,
 * ditambah urutan langkah sampai acara tayang — penyelenggara yang baru
 * datang perlu tahu bahwa akun saja belum cukup (verifikasi dulu), bukan
 * hiasan. Di ponsel langkahnya turun ke bawah form: yang datang untuk masuk
 * tidak perlu menggulir melewatinya.
 */
export default function OrganizerAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // `minmax(0,1fr)`: kolom grid bawaan (`auto`) ikut melebar mengikuti isi
    // terpanjang dan mendorong kartu keluar layar 320px. Gutter 10px di bawah
    // 360px seperti layout (auth): widget Turnstile lebarnya tetap 300px.
    <div className="mx-auto grid w-full max-w-[980px] grid-cols-[minmax(0,1fr)] items-start gap-10 px-2.5 py-8 min-[360px]:px-4 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16">
      <div className="flex justify-center lg:col-start-2 lg:row-start-1">
        <AuthCard>{children}</AuthCard>
      </div>
      <aside aria-labelledby="langkah-penyelenggara" className="mx-auto w-full max-w-[440px] lg:col-start-1 lg:row-start-1 lg:max-w-none lg:pt-10">
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          <BadgeCheck aria-hidden className="size-4" />
          Studio Penyelenggara
        </p>
        <h2 id="langkah-penyelenggara" className="mt-3 max-w-[18ch] text-[clamp(24px,3.2vw,32px)] font-bold leading-[1.15] tracking-[-0.03em]">
          Tiga langkah sampai acaramu tayang.
        </h2>
        <ol className="mt-7 flex flex-col">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
              {index < STEPS.length - 1 && <span aria-hidden className="absolute left-[15px] top-9 h-[calc(100%-36px)] w-px bg-line-strong/60" />}
              <span className="flex size-8 shrink-0 items-center justify-center rounded-pill border border-ink font-mono text-xs">0{index + 1}</span>
              <span className="flex flex-col gap-1 pt-1">
                <span className="text-[15.5px] font-semibold tracking-[-0.01em]">{step.title}</span>
                <span className="max-w-[40ch] text-[14px] leading-relaxed text-ink-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <Link href="/penyelenggara" className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-ink underline-offset-[3px] hover:underline">
          Lihat cara kerja studio
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </aside>
    </div>
  );
}
