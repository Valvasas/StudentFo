import type { CSSProperties } from 'react';
import { HIGHLIGHT, PAPER, Svg } from '@/components/ui/illustrations';

const motion = (delayMs: number, from = 0, to = 0, travel = -90) =>
  ({ '--d': `${delayMs}ms`, '--r0': `${from}deg`, '--r1': `${to}deg`, '--py': `${travel}px` }) as CSSProperties;

/**
 * Latar "buku sketsa" seluruh situs (ADR-062): kertas bertitik yang memudar
 * ke bawah, plus coretan benda-benda produk (pesawat kertas = kiriman,
 * kalender = tenggat, trofi = lomba, penanda = simpanan) yang melayang pelan.
 *
 * Aturannya sama dengan ilustrasi lain (ADR-053/054): `aria-hidden`, tanpa
 * teks, warna dari token (ikut tema gelap), dan tidak pernah menangkap klik.
 * `fixed` + `-z-10`: dilukis di atas latar kanvas tapi di bawah SEMUA isi,
 * jadi kartu & panel (berlatar sendiri) menutupinya dan teks di atas kanvas
 * hanya bertemu garis berwarna `line-strong` — lebih pucat dari teks redup
 * mana pun. Coretan benda hanya di talang kiri-kanan mulai `xl` dan
 * ukurannya dijaga di bawah lebar talang 1366px (±115px) supaya tidak
 * menyenggol menu samping akun; di bawah `xl` tinggal kertas bertitik dan
 * bintang kecil di pojok — isi tetap yang paling menonjol.
 *
 * Gerak: `drift`/`twinkle` (waktu) di lapisan dalam, `parallax-y` (posisi
 * gulir, hanya peramban yang mendukung scroll-driven animation) di lapisan
 * luar — dua transform yang tidak saling menimpa. Keduanya berhenti di
 * reduced-motion maupun pilihan "Kurangi gerak".
 */
export function SiteBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden text-line-strong print:hidden">
      <div className="dot-grid absolute inset-0 opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent_62%)]" />

      <span className="parallax-y absolute left-[0.6%] top-[16%] hidden xl:block" style={motion(0, 0, 0, -140)}>
        <Svg viewBox="0 0 120 80" className="drift h-14 w-[84px]">
          <path d="M8 66 Q30 76 46 60 Q58 48 70 54" strokeDasharray="2 7" className="dash-flow" />
          <path d="M58 34 L112 10 L94 62 L82 44 Z" fill={PAPER} />
          <path d="M82 44 L112 10" />
        </Svg>
      </span>

      <span className="parallax-y absolute right-[1.5%] top-[11%]" style={motion(0, 0, 0, -60)}>
        <Svg viewBox="0 0 64 64" className="size-9 sm:size-12">
          <path className="twinkle" style={motion(0)} d="M22 6 Q23.5 18 36 20 Q23.5 22 22 34 Q20.5 22 8 20 Q20.5 18 22 6 Z" fill={HIGHLIGHT} strokeWidth="1.8" />
          <path className="twinkle" style={motion(900)} d="M48 34 Q49 42 57 43 Q49 44 48 52 Q47 44 39 43 Q47 42 48 34 Z" fill={PAPER} strokeWidth="1.6" />
          <circle className="twinkle" style={motion(1600)} cx="12" cy="50" r="3" strokeWidth="1.6" />
        </Svg>
      </span>

      <span className="parallax-y absolute right-[0.8%] top-[44%] hidden xl:block" style={motion(0, 0, 0, -180)}>
        <Svg viewBox="0 0 90 90" className="drift size-[72px]">
          <path d="M14 20 Q45 16 76 18 L78 78 Q46 82 16 80 Z" fill={PAPER} />
          <path d="M14 34 Q45 30 77 32" />
          <path d="M30 10 L30 24 M60 9 L60 23" strokeWidth="3" />
          <ellipse cx="52" cy="56" rx="11" ry="8" fill={HIGHLIGHT} stroke="none" opacity="0.8" />
          <path d="M41 53 C43 44 62 44 63 56 C64 66 44 68 41 58" />
          <path d="M26 48 h4 M26 62 h4" />
        </Svg>
      </span>

      <span className="parallax-y absolute left-[0.8%] top-[58%] hidden xl:block" style={motion(0, 0, 0, -110)}>
        <Svg viewBox="0 0 96 40" className="drift h-8 w-[76px]">
          <path d="M10 28 L70 8 L80 18 L20 38 Z" fill={PAPER} />
          <path d="M10 28 L4 36 L20 38" fill={HIGHLIGHT} />
          <path d="M70 8 L76 6 L86 16 L80 18" />
          <path d="M64 10 L74 20" />
        </Svg>
      </span>

      <span className="parallax-y absolute bottom-[7%] right-[1.6%] hidden xl:block" style={motion(0, 0, 0, -70)}>
        <Svg viewBox="0 0 48 48" className="drift size-12">
          <path d="M15 9 L33 9 Q33 25 24 28 Q15 25 15 9 Z" fill={HIGHLIGHT} fillOpacity="0.6" />
          <path d="M15 12 Q7 12 9 19 Q11 23 16.5 22.5 M33 12 Q41 12 39 19 Q37 23 31.5 22.5" />
          <path d="M24 28 L24 35 M17 39 Q24 36 31 39 L31 42 L17 42 Z" />
        </Svg>
      </span>

      <span className="parallax-y absolute bottom-[10%] left-[2.2%] hidden xl:block" style={motion(0, 0, 0, -50)}>
        <Svg viewBox="0 0 40 52" className="drift h-12 w-9">
          <path d="M8 4 L32 4 L32 46 L20 36 L8 46 Z" fill={PAPER} />
          <path d="M8 14 L32 14" stroke={HIGHLIGHT} strokeWidth="5" />
        </Svg>
      </span>

      <span className="twinkle absolute left-[46%] top-[6%] hidden size-2 rounded-pill border-2 border-current lg:block" style={motion(700)} />
      <span className="twinkle absolute right-[22%] top-[70%] hidden size-1.5 rounded-pill bg-current xl:block" style={motion(2100)} />
    </div>
  );
}
