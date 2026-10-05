import { cn } from '@/lib/utils';

/**
 * Ilustrasi "buku sketsa" (ADR-052, ADR-053): tinta `currentColor` + satu
 * aksen stabilo. Sama seperti coretan di `sketch.tsx`, semuanya hiasan —
 * `aria-hidden`, tanpa teks di dalam SVG (teks di SVG tidak ikut font
 * proyek dan tidak terjemahkan pembaca layar), dan kalimat di sebelahnya
 * yang membawa maknanya.
 *
 * Isian kertas memakai token permukaan, bukan putih literal, supaya
 * ilustrasi yang sama berlaku di tema gelap tanpa salinan kedua.
 *
 * Dipakai hemat: satu ilustrasi per layar, hanya di titik di mana pengguna
 * berhenti (kosong, tersesat, gagal) — bukan sebagai hiasan di setiap kartu.
 */

const PAPER = 'var(--color-surface)';
const PAPER_SHADE = 'var(--color-surface-nested)';
const HIGHLIGHT = 'var(--color-highlight)';
const PENCIL = 'var(--color-border-strong)';

interface IllustrationProps {
  className?: string;
}

function Svg({ viewBox, className, children }: { viewBox: string; className?: string; children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
    >
      {children}
    </svg>
  );
}

/** Tersesat: peta lipat dengan rute putus-putus yang berakhir di tanda silang. 404. */
export function LostMapSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 240 170" className={cn('h-[150px] w-[212px]', className)}>
      <ellipse cx="122" cy="152" rx="92" ry="7" fill={PAPER_SHADE} stroke="none" />
      <path d="M34 44 Q58 36 82 31 Q107 38 132 44 Q156 37 182 31 L190 122 Q165 128 140 134 Q114 127 90 121 Q64 128 40 134 Z" fill={PAPER} />
      <path d="M82 31 Q85 76 90 121" />
      <path d="M132 44 Q136 89 140 134" />
      <path d="M82 31 Q107 38 132 44 Q136 89 140 134 Q114 127 90 121 Q85 76 82 31 Z" fill={PAPER_SHADE} stroke="none" />
      <path d="M52 112 C60 86 84 102 98 82 S128 58 150 70" strokeDasharray="1 7" strokeWidth="2.6" />
      <ellipse cx="160" cy="73" rx="15" ry="11" fill={HIGHLIGHT} stroke="none" opacity="0.85" />
      <path d="M153 66 L167 80 M167 66 L153 80" strokeWidth="2.8" />
      <path d="M48 116 l8 0" />
      <path d="M199 12 c5 -9 22 -6 20 5 c-1 7 -10 8 -11 17" strokeWidth="2.6" />
      <circle cx="207.5" cy="44" r="1.8" fill="currentColor" />
      <path d="M58 58 Q62 54 66 58" stroke={PENCIL} />
      <path d="M152 100 Q160 96 170 100" stroke={PENCIL} />
    </Svg>
  );
}

/** Gagal: benang kusut dari pensil yang patah — bukan ikon peringatan yang menakutkan. */
export function TangledSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 220 160" className={cn('h-[140px] w-[192px]', className)}>
      <ellipse cx="108" cy="146" rx="82" ry="7" fill={PAPER_SHADE} stroke="none" />
      <path d="M66 70 Q110 52 150 76 Q132 116 88 112 Q60 100 66 70 Z" fill={HIGHLIGHT} stroke="none" opacity="0.35" />
      <path d="M30 128 C24 90 70 62 96 84 S150 124 150 82 S98 40 78 76 S118 132 150 116 S186 80 170 64" />
      <path d="M150 116 Q160 124 176 120" />
      <path d="M140 52 L178 18 L188 29 L150 63 Z" fill={PAPER} />
      <path d="M140 52 L133 68 L150 63" fill={PAPER_SHADE} />
      <path d="M171 24 L181 35" />
      <path d="M58 46 l-6 -9 M72 38 l-1 -11 M86 42 l6 -9" />
    </Svg>
  );
}

/** Kosong: buku catatan terbuka dan kaca pembesar — "belum ada yang cocok", bukan "error". */
export function EmptyNotebookSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 230 160" className={cn('h-[124px] w-[178px]', className)}>
      <ellipse cx="114" cy="146" rx="90" ry="7" fill={PAPER_SHADE} stroke="none" />
      <path d="M26 40 Q68 28 112 42 L112 132 Q68 120 26 128 Z" fill={PAPER} />
      <path d="M116 42 Q160 28 202 40 L202 128 Q160 120 116 132 Z" fill={PAPER} />
      <path d="M114 42 L114 134" />
      <path d="M40 62 Q70 56 98 62 M40 80 Q70 74 98 80 M40 98 Q62 93 82 97" stroke={PENCIL} />
      <path d="M132 62 Q152 57 170 61" stroke={PENCIL} />
      <circle cx="160" cy="88" r="21" fill={HIGHLIGHT} fillOpacity="0.45" />
      <path d="M175 103 L194 123" strokeWidth="5" />
      <path d="M150 80 Q156 74 164 78" />
      <path d="M58 16 l0 10 M53 21 l10 0" />
      <path d="M190 18 l0 7 M186.5 21.5 l7 0" />
    </Svg>
  );
}

/** Tenang: halaman kalender dengan satu tanggal dilingkari stabilo. */
export function CalendarSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 200 160" className={cn('h-[112px] w-[140px]', className)}>
      <ellipse cx="100" cy="148" rx="70" ry="6" fill={PAPER_SHADE} stroke="none" />
      <path d="M46 36 Q100 31 154 33 L158 132 Q104 136 50 136 Z" fill={PAPER} />
      <path d="M46 58 Q100 53 155 55" />
      <path d="M72 24 L73 44 M128 22 L129 42" strokeWidth="3" />
      {[0, 1, 2, 3].map((col) =>
        [0, 1, 2].map((row) => (
          <circle key={`${col}-${row}`} cx={68 + col * 22} cy={76 + row * 20} r="2.2" fill="currentColor" stroke="none" />
        )),
      )}
      <ellipse cx="112" cy="96" rx="13" ry="10" fill={HIGHLIGHT} stroke="none" opacity="0.9" />
      <path d="M100 92 C102 82 124 82 126 94 C127 106 104 108 100 98" />
    </Svg>
  );
}

/** Logo: halaman bertelinga dengan satu baris ditandai stabilo — "info yang rapi". */
export function LogoMark({ className }: IllustrationProps) {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      <path
        d="M6.2 2.8h8.6l4.4 4.4v12.6c0 .8-.6 1.4-1.4 1.4H6.2c-.8 0-1.4-.6-1.4-1.4V4.2c0-.8.6-1.4 1.4-1.4Z"
        fill={PAPER}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14.8 2.8v4.4h4.4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="7.2" y="12.2" width="9.6" height="3.6" rx="1" fill={HIGHLIGHT} />
      <path d="M8 10h5M8 14h8M8 18h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* Coretan kecil di sekitar judul beranda (hanya ≥ lg). Masing-masing satu
   simbol dari isi produk: lomba, beasiswa/kampus, pengiriman berkas. */

export function TrophyDoodle({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 48 48" className={cn('size-12', className)}>
      <path d="M15 9 L33 9 Q33 25 24 28 Q15 25 15 9 Z" fill={HIGHLIGHT} fillOpacity="0.55" />
      <path d="M15 12 Q7 12 9 19 Q11 23 16.5 22.5 M33 12 Q41 12 39 19 Q37 23 31.5 22.5" />
      <path d="M24 28 L24 35 M17 39 Q24 36 31 39 L31 42 L17 42 Z" />
    </Svg>
  );
}

export function GradCapDoodle({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 48 48" className={cn('size-12', className)}>
      <path d="M4 19 L24 10 L44 19 L24 28 Z" fill={PAPER} />
      <path d="M12 23 L12 32 Q24 39 36 32 L36 23" />
      <path d="M44 19 L44 31" />
      <circle cx="44" cy="33.5" r="2.5" fill={HIGHLIGHT} />
    </Svg>
  );
}

export function PaperPlaneDoodle({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 56 48" className={cn('h-12 w-14', className)}>
      <path d="M14 23 L52 6 L38 42 L30 29 Z" fill={PAPER} />
      <path d="M30 29 L52 6" />
      <path d="M2 38 Q9 44 17 39 Q21 36 25 38" strokeDasharray="2 5" />
    </Svg>
  );
}

export function SparkleDoodle({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 24 24" className={cn('size-6', className)}>
      <path d="M12 3 Q13 11 21 12 Q13 13 12 21 Q11 13 3 12 Q11 11 12 3 Z" fill={HIGHLIGHT} strokeWidth="1.6" />
    </Svg>
  );
}
