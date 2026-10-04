import { cn } from '@/lib/utils';

/**
 * Coretan tangan (ADR-052): panah melengkung & garis bergelombang.
 *
 * SVG inline dengan `currentColor`, bukan gambar: ikut tema gelap tanpa aset
 * kedua, dan tetap tajam di layar 3×. Semuanya dekoratif — `aria-hidden`
 * dan tidak pernah satu-satunya pembawa makna; teks di sebelahnya yang
 * menyampaikan isinya.
 */
export function SketchArrow({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-8 w-12', flip && '-scale-x-100', className)}
    >
      <path d="M60 6C44 4 22 10 10 30" />
      <path d="M8 18l2 13 12-4" />
    </svg>
  );
}

/** Garis bawah bergelombang ala spidol — ditaruh absolut di bawah satu kata. */
export function Scribble({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 14"
      fill="none"
      preserveAspectRatio="none"
      className={cn('pointer-events-none', className)}
    >
      <path
        d="M3 9c22-6 41-6 60-2s38 5 58 0 47-6 76-1"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Catatan pinggir bertulisan tangan, sedikit miring. */
export function HandNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('hand inline-block -rotate-2 text-ink-soft', className)}>{children}</span>;
}
