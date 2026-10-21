import Link from 'next/link';
import { Plus } from 'lucide-react';
import { LonePieceSketch } from '@/components/ui/feature-illustrations';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PAGE } from '@/app/teams/cocok/shared';

/**
 * Tumpukan kosong. Dua keadaan: belum ada pemain lain sama sekali, atau
 * saringan terlalu ketat — yang kedua menawarkan tautan "Lepas …" beserta
 * berapa orang yang akan muncul (dihitung di server). Semua tautan GET.
 */
export function MatchEmpty({ candidateCount, removals }: { candidateCount: number; removals: readonly { label: string; href: string; gain: number }[] }) {
  const firstPlayer = candidateCount === 0;
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-6 rounded-[24px] border border-line bg-panel p-6 text-center sm:flex-row sm:p-8 sm:text-left">
      <div className="dot-grid flex w-full max-w-[220px] shrink-0 items-center justify-center rounded-[18px] bg-panel-nested px-4 py-4 text-ink sm:max-w-[260px]">
        <LonePieceSketch className="w-full" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-3 sm:items-start">
        <h3 className="font-display text-[22px] font-bold leading-tight tracking-[-0.025em]">{firstPlayer ? 'Kamu pemain pertama di sini' : 'Saringanmu terlalu ketat'}</h3>
        {firstPlayer ? (
          <>
            <p className="max-w-md text-sm text-ink-muted">Ajak temanmu membuka kartu pemain mereka — begitu ada yang bergabung, radar langsung menemukannya.</p>
            <Link href={`${PAGE}?ubah=1`} className={cn(buttonVariants({ variant: 'secondary' }), 'max-sm:w-full')}>
              Ubah kartuku
            </Link>
          </>
        ) : (
          <>
            {removals.length > 0 ? (
              <>
                <p className="max-w-md text-sm text-ink-muted">Coba longgarkan salah satu — ini yang paling berpengaruh:</p>
                <ul className="flex w-full flex-col gap-2">
                  {removals.map((removal) => (
                    <li key={removal.href}>
                      <Link href={removal.href} className={cn(buttonVariants({ variant: 'secondary' }), 'w-full justify-start whitespace-normal text-left sm:w-auto')}>
                        <Plus aria-hidden />
                        Lepas {removal.label} · +{removal.gain} orang
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="max-w-md text-sm text-ink-muted">Belum ada pemain yang lolos kombinasi saringan ini. Hapus saringan untuk melihat semua pemain.</p>
            )}
            <Link href={PAGE} className="inline-flex min-h-11 items-center px-1 text-[14px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
              Hapus semua saringan
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
