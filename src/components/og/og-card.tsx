/**
 * Kartu pratinjau tautan (Open Graph) — digambar Satori lewat `next/og`, jadi
 * hanya subset CSS flexbox yang didukung dan warna harus nilai mentah (tidak
 * ada token CSS di sini). Palet mengikuti tema gelap StudentHub: kartu gelap
 * paling terbaca di antara gelembung obrolan terang maupun gelap.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

const INK = '#ededeb';
const MUTED = '#a3a29c';
const CANVAS = '#111110';
const LINE = '#2e2e2c';

/** Satori tidak memotong teks dengan elipsis; dipotong di sini supaya judul panjang tidak meluber. */
export function clampText(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function OgCard({
  eyebrow,
  title,
  subtitle,
  footnote,
}: {
  eyebrow: string;
  title: string;
  subtitle: string | null;
  footnote: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        background: CANVAS,
        color: INK,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em' }}>StudentFo</div>
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            color: MUTED,
            border: `2px solid ${LINE}`,
            borderRadius: 999,
            padding: '6px 18px',
          }}
        >
          {eyebrow}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: title.length > 60 ? 58 : 70, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.035em' }}>
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 32, color: MUTED }}>{subtitle}</div>}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `2px solid ${LINE}`,
          paddingTop: 28,
          fontSize: 26,
        }}
      >
        <div style={{ display: 'flex' }}>{footnote}</div>
        <div style={{ display: 'flex', color: MUTED }}>Diverifikasi manual sebelum tayang</div>
      </div>
    </div>
  );
}
