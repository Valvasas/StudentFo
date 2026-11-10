import { ImageResponse } from 'next/og';
import { LOGO_BOLD, LOGO_SIZE } from '@/components/ui/logo-paths';

/**
 * Favicon & ikon layar utama digambar dari geometri logo yang sama dengan
 * navbar (`LOGO_BOLD`, ADR-080) — satu sumber, jadi logo di tab browser tidak
 * pernah tertinggal dari logo di halaman.
 *
 * Warna literal, bukan token CSS: ikon dirender di luar halaman, tanpa tema.
 * Siluet kertas putih di bawah tinta membuatnya terbaca di bilah tab terang
 * maupun gelap (tinta saja hilang di tab gelap).
 */
const INK = '#1d1b17';
const PAPER = '#ffffff';
const HIGHLIGHT = '#ffd95a';
const CANVAS = '#faf8f3';

function logoSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}" fill="none">` +
    `<path d="${LOGO_BOLD.paper}" fill="${PAPER}"/>` +
    `<path d="${LOGO_BOLD.highlight}" fill="${HIGHLIGHT}"/>` +
    `<path d="${LOGO_BOLD.ink}" fill="${INK}" fill-rule="evenodd"/>` +
    '</svg>'
  );
}

/**
 * `tile`: latar krem penuh untuk ikon layar utama — iOS mengisi area
 * transparan dengan hitam, dan launcher memberi masker sudutnya sendiri
 * (glif 68% = di dalam zona aman masker lingkaran Android).
 * Tanpa `tile`: transparan dan memenuhi kotak (favicon).
 */
export function brandIcon(size: number, { tile }: { tile: boolean }): ImageResponse {
  const glyph = Math.round(size * (tile ? 0.68 : 1));
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: tile ? CANVAS : 'transparent',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dirender satori menjadi PNG, bukan elemen DOM */}
        <img src={`data:image/svg+xml;base64,${Buffer.from(logoSvg()).toString('base64')}`} width={glyph} height={glyph} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
