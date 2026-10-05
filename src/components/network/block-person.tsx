import { Ban } from 'lucide-react';
import { blockPersonAction } from '@/app/connections/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

/** Teks yang sama di setiap pintu blokir: orang harus tahu akibatnya sebelum menekan. */
export const BLOCK_CONSEQUENCE = 'Koneksi & ajakan di antara kalian dihapus, dan kalian tidak bisa saling menemukan atau mengajak lagi. Dia tidak diberi tahu.';

export const blockButton =
  'flex h-11 w-full items-center justify-center gap-1.5 rounded-pill border border-danger-line bg-danger-soft text-[13.5px] font-semibold text-danger';

export function BlockPersonForm({ targetId, name, returnTo }: { targetId: string; name: string; returnTo: string }) {
  return (
    <form action={blockPersonAction}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="targetId" value={targetId} />
      {/* aria-label, bukan span sr-only: nama persis di teks tersembunyi ikut cocok di pencarian teks halaman. */}
      <SubmitButton aria-label={`Ya, blokir ${name}`} className={blockButton}>
        <Ban aria-hidden className="size-4" /> Ya, blokir
      </SubmitButton>
    </form>
  );
}

/**
 * Blokir di balik `<details>`: satu langkah konfirmasi tanpa JavaScript,
 * dan tombol berbahaya tidak bersebelahan langsung dengan "Terima".
 * Tidak memakai hook, jadi bisa dirender Server Component (kartu) maupun
 * pulau klien (panel peta).
 */
export function BlockPersonDetails({
  targetId,
  name,
  returnTo,
  className,
}: {
  targetId: string;
  name: string;
  returnTo: string;
  className?: string;
}) {
  return (
    <details className={cn('group', className)}>
      <summary
        aria-label={`Blokir ${name}`}
        className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm px-1 text-[13px] font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <Ban aria-hidden className="size-3.5" /> Blokir
      </summary>
      <div className="flex flex-col gap-2 pt-1">
        <p className="text-[12.5px] leading-snug text-ink-muted">{BLOCK_CONSEQUENCE}</p>
        <BlockPersonForm targetId={targetId} name={name} returnTo={returnTo} />
      </div>
    </details>
  );
}
