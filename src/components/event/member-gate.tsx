import Link from 'next/link';
import { Check, KeyRound } from 'lucide-react';
import { withNext } from '@/components/auth/auth-field';
import { buttonVariants } from '@/components/ui/button';
import { loginHref } from '@/lib/safe-redirect';
import { cn } from '@/lib/utils';

/** Yang dibuka satu akun di halaman kegiatan — konkret, bukan "fitur menarik lainnya". */
const PERKS = ['Syarat & berkas lengkap', 'Jadwal tiap tahap + pengingat tenggat', 'Tanya langsung ke penyelenggara', 'Tautan pendaftaran resmi'] as const;

/**
 * Gerbang anggota di halaman kegiatan (ADR-085). Tautan biasa ke halaman
 * masuk/daftar yang membawa `next` — tanpa JavaScript, tanpa modal yang
 * menutupi isi. Setelah masuk, pengunjung kembali ke bagian yang sama.
 */
export function MemberGate({
  returnTo,
  heading,
  lead,
  headingLevel = 2,
  className,
}: {
  /** Path internal yang dibuka lagi setelah masuk (mis. `/events/slug?tab=syarat`). */
  returnTo: string;
  heading: string;
  lead: string;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby="gerbang-anggota" className={cn('rounded-[20px] border border-line bg-panel p-5 shadow-card sm:p-6', className)}>
      <div className="flex items-start gap-4">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-tint-sun text-ink">
          <KeyRound className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Heading id="gerbang-anggota" className="text-[19px] font-bold leading-snug tracking-[-0.02em]">
            {heading}
          </Heading>
          <p className="text-[14.5px] leading-relaxed text-ink-muted">{lead}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {PERKS.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-[14px] leading-snug">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            {perk}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href={loginHref(returnTo)} className={buttonVariants({ size: 'lg' })}>
          Masuk
        </Link>
        <Link href={withNext('/register', returnTo)} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
          Daftar gratis
        </Link>
      </div>
    </section>
  );
}
