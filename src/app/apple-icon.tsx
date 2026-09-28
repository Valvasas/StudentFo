import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Ikon layar utama iOS — tanpa sudut membulat; iOS memberi masker sendiri. */
export default function AppleIcon() {
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
          fontSize: 118,
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
