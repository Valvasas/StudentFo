import { HIGHLIGHT, PAPER } from '@/components/ui/illustrations';
import { LOGO_BOLD, LOGO_DETAIL, LOGO_SIZE } from '@/components/ui/logo-paths';
import { cn } from '@/lib/utils';

/**
 * Logo StudentFo (ADR-080): toga di atas map berisi piala — "prestasi yang
 * tersimpan rapi". Digambar pemilik; di sini sudah berupa vektor tanpa latar:
 * tinta `currentColor` (ikut warna teks & tema gelap), stabilo & kertas dari
 * token, jadi tidak ada salinan kedua untuk tema gelap.
 *
 * Dua bobot dari gambar yang sama (`logo-paths.ts`): `LogoMark` bergores
 * tebal untuk ukuran kecil, `LogoEmblem` bergores asli untuk ≥ 48 px.
 */

const SPRITE_ID = 'sf-logo';
const VIEW_BOX = `0 0 ${LOGO_SIZE} ${LOGO_SIZE}`;

function Layers({ paper, highlight, ink }: { paper: string; highlight: string; ink: string }) {
  return (
    <>
      <path d={paper} fill={PAPER} />
      <path d={highlight} fill={HIGHLIGHT} />
      <path d={ink} fill="currentColor" fillRule="evenodd" />
    </>
  );
}

/**
 * Geometri `LogoMark`, dipasang SEKALI di root layout. Logo tampil di navbar
 * dan footer setiap halaman; tanpa ini ±4,6 KB path terkirim dua kali di HTML
 * (dan dua kali lagi di muatan RSC) pada setiap permintaan.
 */
export function LogoSprite() {
  return (
    <svg aria-hidden focusable="false" width="0" height="0" className="absolute">
      <symbol id={SPRITE_ID} viewBox={VIEW_BOX}>
        <Layers {...LOGO_BOLD} />
      </symbol>
    </svg>
  );
}

/** Logo ukuran kecil (navbar, footer). Butuh `LogoSprite` di dokumen yang sama. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden focusable="false" viewBox={VIEW_BOX} className={cn('shrink-0', className)}>
      <use href={`#${SPRITE_ID}`} />
    </svg>
  );
}

/**
 * Logo ukuran besar dengan goresan asli. `sparkles` menambah kilau di
 * sekelilingnya — hanya untuk ≥ 64 px; di bawah itu kilaunya tinggal noda.
 */
export function LogoEmblem({ className, sparkles = false }: { className?: string; sparkles?: boolean }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={sparkles ? VIEW_BOX : LOGO_DETAIL.coreViewBox}
      fill="none"
      className={cn('shrink-0', className)}
    >
      <Layers paper={LOGO_DETAIL.paper} highlight={LOGO_DETAIL.highlight} ink={LOGO_DETAIL.ink} />
      {sparkles && <path d={LOGO_DETAIL.sparkles} fill="currentColor" fillRule="evenodd" />}
    </svg>
  );
}
