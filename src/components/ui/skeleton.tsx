import { cn } from '@/lib/utils';

/**
 * Placeholder pemuatan.
 *
 * `aria-hidden` + teks status terpisah: skeleton itu murni visual. Kalau
 * dibiarkan terbaca screen reader, pengguna hanya mendengar deretan elemen
 * kosong tanpa tahu bahwa halaman sedang memuat.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('shimmer rounded-sm', className)} />;
}

export function EventCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-panel p-6">
      <div className="flex items-start justify-between gap-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="size-12 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-5 w-full" />
      <Skeleton className="mt-2 h-5 w-3/4" />
      <Skeleton className="mt-4 h-4 w-1/2" />
    </div>
  );
}

export function EventGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        Memuat daftar kegiatan
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <EventCardSkeleton key={index} />
        ))}
      </div>
    </>
  );
}
