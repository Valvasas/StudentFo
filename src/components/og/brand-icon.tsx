import { ImageResponse } from 'next/og';
import { LOGO_MARK } from '@/components/ui/illustrations';

/**
 * Favicon & ikon layar utama digambar dari geometri logo navbar
 * (`LOGO_MARK`) — sebelumnya huruf "S" hitam peninggalan palet ADR-039 yang
 * tidak lagi mirip merek di tab browser maupun di layar utama ponsel.
 *
 * Warna literal, bukan token CSS: ikon dirender di luar halaman, tanpa tema.
 * Kertas putih bergaris tinta terbaca di bilah tab terang maupun gelap.
 */
const INK = '#1d1b17';
const PAPER = '#ffffff';
const HIGHLIGHT = '#ffd95a';
const CANVAS = '#faf8f3';

function logoSvg(): string {
  const { page, fold, lines, highlight: h, strokeWidth } = LOGO_MARK;
  // Kotak batas kertas + setengah goresan (x 3.9–20.1, y 1.9–22.1), dijadikan
  // bujur sangkar berpusat di 12 supaya glif memenuhi 16–32 px.
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="1.9 1.9 20.2 20.2" fill="none">' +
    `<path d="${page}" fill="${PAPER}" stroke="${INK}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>` +
    `<path d="${fold}" stroke="${INK}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>` +
    `<rect x="${h.x}" y="${h.y}" width="${h.width}" height="${h.height}" rx="${h.rx}" fill="${HIGHLIGHT}"/>` +
    `<path d="${lines}" stroke="${INK}" stroke-width="${strokeWidth}" stroke-linecap="round"/>` +
    '</svg>'
  );
}

/**
 * `tile`: latar krem penuh untuk ikon layar utama — iOS mengisi area
 * transparan dengan hitam, dan launcher memberi masker sudutnya sendiri.
 * Tanpa `tile`: transparan dan dipangkas rapat (favicon).
 */
export function brandIcon(size: number, { tile }: { tile: boolean }): ImageResponse {
  const glyph = Math.round(size * (tile ? 0.62 : 1));
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
