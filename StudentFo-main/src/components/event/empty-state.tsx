import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Keadaan kosong.
 *
 * Bukan sekadar "Tidak ada hasil". Layar kosong adalah titik user paling
 * mungkin menutup tab, jadi ia harus melakukan tiga hal: menjelaskan
 * penyebabnya, menawarkan satu jalan keluar yang konkret, dan tidak
 * membuat user merasa salah.
 */
export function EmptyState({
  title = 'Belum ada yang cocok',
  description = 'Coba longgarkan filternya, atau pakai kata kunci yang lebih umum.',
  actionHref = '/events',
  actionLabel = 'Hapus semua filter',
}: {
  title?: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-panel px-6 py-16 text-center">
      <SearchX aria-hidden className="size-8 text-ink-faint" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-ink-muted">{description}</p>
      <Button asChild variant="secondary" size="sm" className="mt-2">
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    </div>
  );
}
