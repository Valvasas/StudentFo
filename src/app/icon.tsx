import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * Favicon digambar di build (tanpa berkas biner di repo). Sebelumnya tidak
 * ada ikon sama sekali: tab browser kosong dan setiap kunjungan pertama
 * menghasilkan 404 `/favicon.ico` di konsol.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#191919',
          color: '#ffffff',
          borderRadius: 8,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.06em',
        }}
      >
        S
      </div>
    ),
    size,
  );
}
