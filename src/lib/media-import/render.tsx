import { ImageResponse } from 'next/og';
import { LOGO_BOLD, LOGO_SIZE } from '@/components/ui/logo-paths';
import type { EventType } from '@/types/domain';
import { MEDIA_FONT_WOFF_BASE64 } from './fonts.generated';
import type { SlideContent } from './spec';

/**
 * Penggambar poster & slide penjelas (ADR-095) — Satori lewat `next/og`, jadi
 * hanya subset CSS flexbox: setiap <div> beranak > 1 wajib `display: flex`,
 * warna nilai mentah (tanpa token CSS). Palet = tema terang situs (kertas
 * krem, tinta, stabilo kuning) supaya slide terasa bagian dari StudentFo,
 * dan setiap gambar menyebut dirinya RINGKASAN, bukan poster resmi.
 *
 * 1080×1350 (4:5): rasio poster Instagram — sumber info lomba utama
 * pengguna — dan pas di slider halaman acara tanpa terpotong.
 */
export const MEDIA_IMAGE_SIZE = { width: 1080, height: 1350 } as const;

const INK = '#1d1b17';
const INK_SOFT = '#3e3a33';
const MUTED = '#605a50';
const PAPER = '#faf8f3';
const SURFACE = '#ffffff';
const LINE = '#e6e1d6';
const HIGHLIGHT = '#ffd95a';

const TINT: Record<EventType, string> = {
  LOMBA: '#fbe7a1',
  BEASISWA: '#cdebd9',
  MAGANG: '#cdebd9',
  WORKSHOP: '#cde0f2',
  PELATIHAN: '#cde0f2',
  KONFERENSI: '#f9d6c1',
  VOLUNTEER: '#f9d6c1',
};

const LOGO_SRC = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}" fill="none">` +
    `<path d="${LOGO_BOLD.paper}" fill="${SURFACE}"/>` +
    `<path d="${LOGO_BOLD.highlight}" fill="${HIGHLIGHT}"/>` +
    `<path d="${LOGO_BOLD.ink}" fill="${INK}" fill-rule="evenodd"/>` +
    '</svg>',
).toString('base64')}`;

/**
 * Plus Jakarta Sans (font isi situs, OFL) dari @fontsource — WOFF karena
 * Satori tidak membaca WOFF2. Ditanam sebagai base64 di bundle, bukan dibaca
 * dari node_modules: Cloudflare Workers tidak punya sistem berkas (ADR-104).
 */
const FONT_WEIGHTS = [500, 700, 800] as const;
let fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: 'normal' }[] | null = null;

function loadFonts() {
  fonts ??= FONT_WEIGHTS.map((weight) => {
    const file = Buffer.from(MEDIA_FONT_WOFF_BASE64[weight], 'base64');
    return { name: 'Jakarta', data: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, weight, style: 'normal' as const };
  });
  return fonts;
}

function titleSize(title: string): number {
  if (title.length <= 28) return 92;
  if (title.length <= 44) return 80;
  if (title.length <= 64) return 68;
  return 58;
}

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function Header({ right }: { right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- dirender Satori menjadi PNG, bukan elemen DOM */}
        <img src={LOGO_SRC} width={72} height={72} alt="" />
        <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em' }}>StudentFo</div>
      </div>
      {right}
    </div>
  );
}

function Footer({ domain, note }: { domain: string | null; note: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginTop: 40, fontSize: 26, color: INK_SOFT }}>
      {domain ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex' }}>Info & daftar resmi</div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, color: INK }}>{clamp(domain, 34)}</div>
        </div>
      ) : (
        <div style={{ display: 'flex' }} />
      )}
      <div style={{ display: 'flex', maxWidth: 440, textAlign: 'right', color: MUTED, lineHeight: 1.3 }}>{note}</div>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '72px 80px 64px',
        background: PAPER,
        color: INK,
        fontFamily: 'Jakarta',
      }}
    >
      {children}
    </div>
  );
}

function Poster({ content, tint }: { content: Extract<SlideContent, { template: 'poster' }>; tint: string }) {
  const title = clamp(content.title, 110);
  return (
    <Frame>
      <Header
        right={
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '14px 28px',
              border: `3px solid ${INK}`,
              borderRadius: 999,
              background: tint,
            }}
          >
            {content.typeLabel}
          </div>
        }
      />
      <div style={{ display: 'flex', marginTop: 80, fontSize: 36, fontWeight: 700, color: INK_SOFT }}>{clamp(content.organizer, 60)}</div>
      <div style={{ display: 'flex', marginTop: 20, fontSize: titleSize(title), fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.04 }}>{title}</div>
      {content.highlight ? (
        <div style={{ display: 'flex', marginTop: 34 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 40,
              fontWeight: 800,
              padding: '0 8px',
              backgroundImage: `linear-gradient(transparent 52%, ${HIGHLIGHT} 52%, ${HIGHLIGHT} 92%, transparent 92%)`,
            }}
          >
            {content.highlight}
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexGrow: 1 }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: tint,
          border: `3px solid ${INK}`,
          borderRadius: 36,
          padding: '38px 48px',
          boxShadow: `10px 10px 0 ${INK}`,
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_SOFT }}>
          {content.deadlineLabel}
        </div>
        <div style={{ display: 'flex', marginTop: 10, fontSize: 74, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{content.deadlineDate}</div>
        {content.deadlineTime ? <div style={{ display: 'flex', marginTop: 6, fontSize: 36, fontWeight: 700, color: INK_SOFT }}>{content.deadlineTime}</div> : null}
      </div>
      <div style={{ display: 'flex', gap: 20, marginTop: 44 }}>
        {content.facts.map((fact) => (
          <div
            key={fact.label}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, background: SURFACE, border: `2px solid ${LINE}`, borderRadius: 24, padding: '22px 24px' }}
          >
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{fact.label}</div>
            <div style={{ display: 'flex', marginTop: 8, fontSize: 30, fontWeight: 700, lineHeight: 1.15 }}>{clamp(fact.value, 40)}</div>
          </div>
        ))}
      </div>
      <Footer domain={content.domain} note="Ringkasan dari StudentFo, bukan poster resmi penyelenggara." />
    </Frame>
  );
}

function SlideShell({ eventTitle, heading, children, domain }: { eventTitle: string; heading: string; children: React.ReactNode; domain: string | null }) {
  return (
    <Frame>
      <Header right={<div style={{ display: 'flex' }} />} />
      <div style={{ display: 'flex', marginTop: 64, fontSize: 32, fontWeight: 700, color: MUTED, lineHeight: 1.25 }}>{clamp(eventTitle, 80)}</div>
      <div style={{ display: 'flex', marginTop: 18, fontSize: 88, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.02 }}>{heading}</div>
      {children}
      <div style={{ display: 'flex', flexGrow: 1 }} />
      <Footer domain={domain} note="Cek ulang syarat & jadwal di laman resmi." />
    </Frame>
  );
}

function ListSlide({ content, tint }: { content: Extract<SlideContent, { template: 'syarat' | 'cara-daftar' }>; tint: string }) {
  const numbered = content.template === 'cara-daftar';
  return (
    <SlideShell eventTitle={content.eventTitle} heading={content.heading} domain={numbered ? null : content.domain}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 60 }}>
        {content.items.map((item, index) => (
          <div
            key={item}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 28,
              background: SURFACE,
              border: `2px solid ${LINE}`,
              borderRadius: 28,
              padding: '28px 34px',
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1.22,
            }}
          >
            {numbered ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 62,
                  height: 62,
                  flexShrink: 0,
                  borderRadius: 999,
                  border: `3px solid ${INK}`,
                  background: tint,
                  fontSize: 32,
                  fontWeight: 800,
                }}
              >
                {String(index + 1)}
              </div>
            ) : (
              <div style={{ display: 'flex', width: 22, height: 22, flexShrink: 0, marginTop: 14, borderRadius: 999, background: INK, boxShadow: `0 0 0 8px ${tint}` }} />
            )}
            <div style={{ display: 'flex', flex: 1 }}>{clamp(item, 90)}</div>
          </div>
        ))}
      </div>
      {numbered ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 44,
            border: `3px solid ${INK}`,
            borderRadius: 28,
            background: tint,
            padding: '28px 36px',
            boxShadow: `8px 8px 0 ${INK}`,
          }}
        >
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: INK_SOFT }}>Daftar di laman resmi</div>
          <div style={{ display: 'flex', fontSize: 38, fontWeight: 800 }}>{clamp(content.domain, 34)}</div>
        </div>
      ) : null}
    </SlideShell>
  );
}

function ScheduleSlide({ content, tint }: { content: Extract<SlideContent, { template: 'jadwal' }>; tint: string }) {
  return (
    <SlideShell eventTitle={content.eventTitle} heading={content.heading} domain={content.domain}>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 60, background: SURFACE, border: `2px solid ${LINE}`, borderRadius: 32, overflow: 'hidden' }}>
        {content.rows.map(([label, value], index) => (
          <div
            key={`${label}-${value}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 32,
              padding: '32px 40px',
              fontSize: 36,
              borderTop: index === 0 ? 'none' : '2px solid #efebe1',
              background: index === 0 ? tint : SURFACE,
            }}
          >
            <div style={{ display: 'flex', color: INK_SOFT, fontWeight: 700 }}>{label}</div>
            <div style={{ display: 'flex', fontWeight: 800, textAlign: 'right' }}>{value}</div>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

/** PNG 1080×1350 untuk satu poster/slide. */
export async function renderMediaImage(content: SlideContent, eventType: EventType): Promise<Uint8Array> {
  const tint = TINT[eventType];
  const element =
    content.template === 'poster' ? (
      <Poster content={content} tint={tint} />
    ) : content.template === 'jadwal' ? (
      <ScheduleSlide content={content} tint={tint} />
    ) : (
      <ListSlide content={content} tint={tint} />
    );
  const response = new ImageResponse(element, { ...MEDIA_IMAGE_SIZE, fonts: loadFonts() });
  return new Uint8Array(await response.arrayBuffer());
}
