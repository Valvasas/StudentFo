import type { CSSProperties } from 'react';
import { HIGHLIGHT, PAPER, PAPER_SHADE, PENCIL, Svg } from '@/components/ui/illustrations';
import { cn } from '@/lib/utils';
import type { Tint } from '@/lib/tint';

/**
 * Ilustrasi fitur unggulan (ADR-054): Cari tim, Koneksi, kotak masuk, buka
 * tim, dan perayaan — ditambah empat untuk pendaftaran langsung (ADR-055):
 * tiket, jam pasir antrean, papan klip formulir, dan grafik dasbor — serta
 * koper untuk papan magang. Aturan ADR-053 tetap: tinta `currentColor`, isian dari
 * token (ikut tema gelap), tanpa teks di SVG, `aria-hidden` lewat `Svg`.
 *
 * Yang baru: garis utama "tergambar" sekali saat tampil (`ink-draw`), dan
 * hiasan kecil (bintang, titik mengetik, kursi kosong) bergerak pelan. Semua
 * gerak itu jatuh ke gambar diam di `prefers-reduced-motion`.
 */

const tint = (name: Tint) => `var(--color-tint-${name})`;
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

function Ink({ d, fill = 'none', wait = 0, width }: { d: string; fill?: string; wait?: number; width?: number }) {
  return <path d={d} pathLength={1} fill={fill} strokeWidth={width} className="ink-draw" style={delay(wait)} />;
}

function Sparkle({ x, y, scale = 1, wait = 0 }: { x: number; y: number; scale?: number; wait?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0 -10 Q1.4 -1.4 10 0 Q1.4 1.4 0 10 Q-1.4 1.4 -10 0 Q-1.4 -1.4 0 -10 Z" fill={HIGHLIGHT} strokeWidth="1.6" className="twinkle" style={delay(wait)} />
    </g>
  );
}

function Face({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  const eye = 5.5 * size;
  return (
    <>
      <circle cx={x - eye} cy={y - 1} r={1.9 * size} fill="currentColor" stroke="none" />
      <circle cx={x + eye} cy={y - 1} r={1.9 * size} fill="currentColor" stroke="none" />
      <path d={`M${x - 4.5 * size} ${y + 5.5 * size} Q${x} ${y + 9.5 * size} ${x + 4.5 * size} ${y + 5.5 * size}`} strokeWidth={1.8} />
    </>
  );
}

type Hair = 'arc' | 'bun' | 'fringe';

/** Badan setengah lonjong + kepala. `base` = garis bawah badan (biasanya tertutup meja). */
function Person({ x, head, base, color, hair, wait = 0, r = 18 }: { x: number; head: number; base: number; color: Tint; hair: Hair; wait?: number; r?: number }) {
  const w = r * 1.75;
  const shoulder = head + r * 1.55;
  return (
    <g>
      <Ink d={`M${x - w} ${base} C${x - w} ${shoulder + 16} ${x - w * 0.55} ${shoulder} ${x} ${shoulder} C${x + w * 0.55} ${shoulder} ${x + w} ${shoulder + 16} ${x + w} ${base} Z`} fill={tint(color)} wait={wait} />
      <circle cx={x} cy={head} r={r} fill={PAPER} pathLength={1} className="ink-draw" style={delay(wait + 120)} />
      {hair === 'arc' && <path d={`M${x - r + 1} ${head - 3} C${x - r + 4} ${head - r - 5} ${x + r - 6} ${head - r - 6} ${x + r} ${head - 5}`} />}
      {hair === 'bun' && (
        <>
          <path d={`M${x - r + 2} ${head - 6} Q${x} ${head - r - 4} ${x + r - 2} ${head - 6}`} />
          <circle cx={x} cy={head - r - 5} r={6} fill="currentColor" stroke="none" />
        </>
      )}
      {hair === 'fringe' && <path d={`M${x - r} ${head - 2} Q${x - 6} ${head - r - 4} ${x + r - 2} ${head - r + 4} Q${x + 2} ${head - 8} ${x - 4} ${head - 4}`} fill="currentColor" />}
      <Face x={x} y={head + 2} size={r / 18} />
    </g>
  );
}

/** Kursi yang masih kosong: garis putus-putus + tanda tambah, "bernapas" pelan. */
function GhostSeat({ x, head, base, r = 18 }: { x: number; head: number; base: number; r?: number }) {
  const w = r * 1.75;
  const shoulder = head + r * 1.55;
  return (
    <g className="breathe" strokeDasharray="3 7">
      <path d={`M${x - w} ${base} C${x - w} ${shoulder + 16} ${x - w * 0.55} ${shoulder} ${x} ${shoulder} C${x + w * 0.55} ${shoulder} ${x + w} ${shoulder + 16} ${x + w} ${base}`} />
      <circle cx={x} cy={head} r={r} fill={PAPER} />
      <path d={`M${x} ${head - 7} L${x} ${head + 7} M${x - 7} ${head} L${x + 7} ${head}`} strokeDasharray="none" strokeWidth={2.6} />
    </g>
  );
}

interface IllustrationProps {
  className?: string;
}

/** Cari tim: tiga orang di satu meja, satu mengangkat bendera — dan satu kursi kosong menunggu. */
export function TeamHuddleSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 360 232" className={cn('h-auto w-full max-w-[360px]', className)}>
      <ellipse cx="180" cy="216" rx="152" ry="9" fill={PAPER_SHADE} stroke="none" />
      <GhostSeat x={316} head={104} base={170} />
      <Person x={66} head={100} base={170} color="mint" hair="arc" wait={100} />
      <Person x={234} head={100} base={170} color="sky" hair="fringe" wait={300} />
      <Person x={150} head={84} base={170} color="peach" hair="bun" wait={200} />
      <Ink d="M175 124 C190 110 196 90 194 70" wait={600} />
      <circle cx="194" cy="66" r="6" fill={PAPER} />
      <Ink d="M194 66 L194 18" wait={700} width={2.8} />
      <Ink d="M194 20 C206 13 218 27 234 20 L234 47 C218 54 206 40 194 47 Z" fill={HIGHLIGHT} wait={800} />
      <rect x="22" y="162" width="316" height="14" rx="7" fill={PAPER} pathLength={1} className="ink-draw" style={delay(400)} />
      <path d="M52 176 L47 208 M308 176 L313 208" />
      <path d="M124 162 L130 134 L176 134 L170 162 Z" fill={PAPER_SHADE} />
      <rect x="139" y="142" width="22" height="6" rx="2" fill={HIGHLIGHT} stroke="none" />
      <path d="M62 162 L66 152 L98 154 L96 162" fill={PAPER} />
      <path d="M72 157 L90 158" stroke={PENCIL} />
      <Sparkle x={34} y={42} scale={0.9} />
      <Sparkle x={110} y={30} scale={0.6} wait={900} />
      <Sparkle x={290} y={44} scale={1.1} wait={1700} />
    </Svg>
  );
}

/** Koneksi: dua orang saling melambai, disambung pesawat kertas dan satu minat yang sama. */
export function ConnectSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 360 232" className={cn('h-auto w-full max-w-[360px]', className)}>
      <ellipse cx="180" cy="218" rx="152" ry="9" fill={PAPER_SHADE} stroke="none" />
      <path d="M40 46 L66 26 M40 46 L28 80" stroke={PENCIL} />
      <path d="M320 40 L300 22 M320 40 L338 72" stroke={PENCIL} />
      {[
        [40, 46, 5.5],
        [66, 26, 4],
        [28, 80, 3.5],
        [320, 40, 5.5],
        [300, 22, 3.5],
        [338, 72, 4],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={PAPER} />
      ))}
      <Person x={80} head={120} base={208} color="peach" hair="fringe" r={22} wait={100} />
      <Person x={280} head={120} base={208} color="mint" hair="bun" r={22} wait={250} />
      <Ink d="M108 176 C122 156 126 138 122 120" wait={500} />
      <circle cx="121" cy="115" r="6.5" fill={PAPER} />
      <Ink d="M252 176 C238 156 234 138 238 120" wait={600} />
      <circle cx="239" cy="115" r="6.5" fill={PAPER} />
      <path d="M112 90 C152 22 208 22 248 90" strokeDasharray="2 9" strokeWidth="2.6" />
      <g className="drift" style={{ '--r0': '-4deg', '--r1': '3deg' } as CSSProperties}>
        <path d="M158 52 L204 30 L192 64 L182 53 Z" fill={PAPER} />
        <path d="M182 53 L204 30" />
      </g>
      <Ink d="M152 150 H208 Q222 150 222 165 Q222 180 208 180 H152 Q138 180 138 165 Q138 150 152 150 Z" fill="var(--color-highlight-soft)" wait={800} />
      <path d="M157 172 C149 166 149 158 154 157 C156 156.5 157 158 157 159 C157 158 158 156.5 160 157 C165 158 165 166 157 172 Z" fill="currentColor" strokeWidth="1.2" />
      <path d="M172 165 H208" stroke={PENCIL} strokeWidth="3" />
      <Sparkle x={140} y={112} scale={0.8} wait={400} />
      <Sparkle x={220} y={104} scale={0.65} wait={1500} />
    </Svg>
  );
}

/** Kotak masuk: gelembung pertanyaan, jawaban bercentang, dan seseorang yang sedang mengetik. */
export function ChatSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 300 212" className={cn('h-auto w-full max-w-[300px]', className)}>
      <ellipse cx="150" cy="200" rx="122" ry="8" fill={PAPER_SHADE} stroke="none" />
      <Ink d="M52 34 H158 Q180 34 180 56 V90 Q180 112 158 112 H92 L60 138 L66 112 H52 Q30 112 30 90 V56 Q30 34 52 34 Z" fill={PAPER} wait={0} />
      <path d="M54 62 H152 M54 84 H122" stroke={PENCIL} strokeWidth="3" />
      <Ink d="M150 94 H250 Q270 94 270 114 V142 Q270 162 250 162 H244 L250 186 L222 162 H150 Q130 162 130 142 V114 Q130 94 150 94 Z" fill={tint('mint')} wait={300} />
      <Ink d="M170 128 L182 140 L208 114" width={3.2} wait={900} />
      <path d="M226 24 H254 Q272 24 272 42 Q272 60 254 60 H226 Q208 60 208 42 Q208 24 226 24 Z" fill={PAPER_SHADE} />
      {[224, 240, 256].map((cx, index) => (
        <circle key={cx} cx={cx} cy="42" r="3.6" fill="currentColor" stroke="none" className="typing-dot" style={delay(index * 160)} />
      ))}
      <path d="M44 156 L40 182 M56 156 L52 182 M34 164 L62 164 M32 174 L60 174" stroke={PENCIL} />
      <Sparkle x={196} y={20} scale={0.7} wait={600} />
      <Sparkle x={112} y={168} scale={0.55} wait={1800} />
    </Svg>
  );
}

/** Buka tim: bendera ditancapkan di bukit, pensil siap, dan kursi yang menunggu diisi. */
export function PlantFlagSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 320 220" className={cn('h-auto w-full max-w-[320px]', className)}>
      <ellipse cx="160" cy="206" rx="134" ry="8" fill={PAPER_SHADE} stroke="none" />
      <Ink d="M24 198 Q106 116 190 198 Z" fill={PAPER_SHADE} wait={0} />
      <Ink d="M108 152 L108 34" width={3} wait={300} />
      <Ink d="M108 38 C128 28 144 48 170 38 L170 78 C144 88 128 68 108 78 Z" fill={HIGHLIGHT} wait={500} />
      <path d="M137 50 L137 66 M129 58 L145 58" strokeWidth="2.6" />
      <Person x={214} head={152} base={198} color="sun" hair="arc" r={12} wait={700} />
      <GhostSeat x={252} head={152} base={198} r={12} />
      <GhostSeat x={290} head={152} base={198} r={12} />
      <g className="drift" style={{ '--r0': '0deg', '--r1': '-6deg', '--d': '400ms' } as CSSProperties}>
        <path d="M228 66 L272 22 L282 32 L238 76 Z" fill={PAPER} />
        <path d="M228 66 L222 82 L238 76" fill={PAPER_SHADE} />
        <path d="M264 30 L274 40" />
      </g>
      <Sparkle x={58} y={50} scale={0.9} wait={300} />
      <Sparkle x={196} y={104} scale={0.6} wait={1400} />
    </Svg>
  );
}

/** Perayaan: terompet konfeti. Konfeti yang beterbangan dirender terpisah (`Confetti`). */
export function CelebrateSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 240 200" className={cn('h-auto w-full max-w-[220px]', className)}>
      <ellipse cx="116" cy="188" rx="92" ry="7" fill={PAPER_SHADE} stroke="none" />
      <Ink d="M56 178 L96 92 L144 140 Z" fill={HIGHLIGHT} wait={0} />
      <path d="M72 144 L92 163 M84 118 L118 151" />
      <Ink d="M96 92 Q132 98 144 140" wait={300} />
      <Ink d="M150 100 L172 82 M142 78 L150 52 M164 126 L192 124 M120 72 L118 46" wait={500} />
      <Ink d="M156 92 C170 64 188 90 202 58" wait={700} />
      <rect x="176" y="34" width="9" height="14" rx="2" fill={tint('mint')} transform="rotate(24 180 41)" />
      <rect x="200" y="96" width="9" height="14" rx="2" fill={tint('peach')} transform="rotate(-18 204 103)" />
      <rect x="128" y="30" width="8" height="12" rx="2" fill={tint('sky')} transform="rotate(-30 132 36)" />
      <circle cx="206" cy="146" r="5" fill={tint('lilac')} />
      <circle cx="98" cy="54" r="4.5" fill={HIGHLIGHT} />
      <Sparkle x={58} y={74} scale={0.8} wait={200} />
      <Sparkle x={214} y={20} scale={0.7} wait={1100} />
    </Svg>
  );
}

/* ---------------------------------------------------------------- */
/* Pendaftaran langsung (ADR-055)                                    */
/* ---------------------------------------------------------------- */

/** Stempel SVG berporos di pusatnya sendiri — `stamp` memakai scale + rotate. */
const stampBox = (wait: number) => ({ transformBox: 'fill-box', transformOrigin: 'center', ...delay(wait) }) as CSSProperties;

const TICKET_EDGE = 'M36 64 H304 V104 A14 14 0 0 0 304 132 V172 H36 V132 A14 14 0 0 0 36 104 Z';

/** Tiket bertakik dengan sobekan putus-putus dan cap stabilo — halaman daftar & tiket. */
export function TicketSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 340 230" className={cn('h-auto w-full max-w-[340px]', className)}>
      <ellipse cx="170" cy="214" rx="138" ry="8" fill={PAPER_SHADE} stroke="none" />
      <g transform="rotate(-7 170 118)">
        <Ink d={TICKET_EDGE} fill={PAPER} wait={0} />
        <path d="M233 65 H303 V104 A14 14 0 0 0 303 132 V171 H233 Z" fill={tint('sky')} stroke="none" />
        <Ink d={TICKET_EDGE} wait={0} />
        <path d="M232 72 V164" strokeDasharray="3 7" />
        <path d="M64 94 H176" stroke={PENCIL} strokeWidth="6" pathLength={1} className="ink-draw" style={delay(500)} />
        <path d="M64 116 H204" stroke={PENCIL} strokeWidth="6" pathLength={1} className="ink-draw" style={delay(650)} />
        <path d="M64 138 H136" stroke={PENCIL} strokeWidth="6" pathLength={1} className="ink-draw" style={delay(800)} />
        <Sparkle x={268} y={118} scale={1.05} wait={400} />
      </g>
      <g className="stamp" style={stampBox(1100)}>
        <circle cx="200" cy="164" r="27" fill={HIGHLIGHT} />
        <circle cx="200" cy="164" r="20" strokeDasharray="2 5" />
        <path d="M189 164 L197 172 L212 155" strokeWidth="3.2" />
      </g>
      <Sparkle x={34} y={36} scale={0.8} wait={200} />
      <Sparkle x={312} y={200} scale={0.6} wait={1500} />
    </Svg>
  );
}

/** Jam pasir: menunggu ditinjau atau di daftar tunggu — tenang, bukan alarm. */
export function HourglassSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 220 220" className={cn('h-auto w-full max-w-[200px]', className)}>
      <ellipse cx="110" cy="204" rx="78" ry="7" fill={PAPER_SHADE} stroke="none" />
      <Ink d="M62 28 H158 M62 188 H158" width={4} wait={0} />
      <Ink d="M74 32 C74 84 104 92 104 108 C104 124 74 132 74 184 H146 C146 132 116 124 116 108 C116 92 146 84 146 32 Z" fill={PAPER} wait={200} />
      <path d="M86 58 C92 82 104 88 110 98 C116 88 128 82 134 58 Z" fill={HIGHLIGHT} stroke="none" />
      <path d="M80 182 C84 158 98 150 110 146 C122 150 136 158 140 182 Z" fill={tint('peach')} stroke="none" />
      <path d="M110 108 V140" strokeDasharray="1 6" className="breathe" />
      <Sparkle x={176} y={70} scale={0.8} wait={600} />
      <Sparkle x={40} y={120} scale={0.6} wait={1300} />
    </Svg>
  );
}

/** Papan klip berisi daftar centang dan pensil — penyusun formulir penyelenggara. */
export function ClipboardSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 300 230" className={cn('h-auto w-full max-w-[300px]', className)}>
      <ellipse cx="150" cy="216" rx="116" ry="8" fill={PAPER_SHADE} stroke="none" />
      <Ink d="M78 30 H202 Q212 30 212 40 V198 Q212 206 202 206 H78 Q68 206 68 198 V40 Q68 30 78 30 Z" fill={tint('mint')} wait={0} />
      <Ink d="M84 46 H196 V192 H84 Z" fill={PAPER} wait={150} />
      <path d="M116 22 H164 V42 H116 Z" fill={PAPER_SHADE} />
      {[78, 112, 146].map((y, index) => (
        <g key={y}>
          <rect x="98" y={y - 8} width="16" height="16" rx="4" fill={index === 0 ? HIGHLIGHT : PAPER} />
          {index === 0 && <path d={`M101 ${y} L105 ${y + 4} L112 ${y - 4}`} strokeWidth="2.4" />}
          <path d={`M124 ${y} H${index === 1 ? 168 : 182}`} stroke={PENCIL} strokeWidth="5" pathLength={1} className="ink-draw" style={delay(400 + index * 160)} />
        </g>
      ))}
      <path d="M98 172 H150" stroke={PENCIL} strokeWidth="5" strokeDasharray="1 9" />
      <g className="drift" style={{ '--r0': '0deg', '--r1': '6deg', '--d': '300ms' } as CSSProperties}>
        <path d="M214 150 L262 102 L274 114 L226 162 Z" fill={tint('sun')} />
        <path d="M214 150 L208 168 L226 162" fill={PAPER} />
        <path d="M254 110 L266 122" />
      </g>
      <Sparkle x={42} y={60} scale={0.85} wait={500} />
      <Sparkle x={250} y={46} scale={0.6} wait={1200} />
    </Svg>
  );
}

/** Batang yang naik dan garis tren dengan bendera di puncak — dasbor performa pendaftaran. */
export function ChartRiseSketch({ className }: IllustrationProps) {
  const bars: readonly { x: number; h: number; color: Tint }[] = [
    { x: 64, h: 44, color: 'sky' },
    { x: 108, h: 70, color: 'lilac' },
    { x: 152, h: 62, color: 'peach' },
    { x: 196, h: 104, color: 'mint' },
  ];
  return (
    <Svg viewBox="0 0 300 220" className={cn('h-auto w-full max-w-[300px]', className)}>
      <ellipse cx="150" cy="206" rx="122" ry="7" fill={PAPER_SHADE} stroke="none" />
      <Ink d="M40 186 H262 M40 186 V40" wait={0} />
      {bars.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={186 - bar.h}
          width="30"
          height={bar.h}
          rx="5"
          fill={tint(bar.color)}
          className="grow-y"
          style={{ ...delay(200 + index * 120), transformBox: 'fill-box', transformOrigin: 'bottom' } as CSSProperties}
        />
      ))}
      <Ink d="M70 128 C100 116 118 96 138 104 C158 112 176 92 214 60" wait={700} />
      <Ink d="M214 60 L214 22" width={3} wait={1100} />
      <Ink d="M214 24 C228 18 238 32 254 24 L254 50 C238 58 228 44 214 50 Z" fill={HIGHLIGHT} wait={1250} />
      <Sparkle x={262} y={84} scale={0.75} wait={1500} />
      <Sparkle x={28} y={24} scale={0.6} wait={400} />
    </Svg>
  );
}

/** Koper kerja dengan label nama dan bintang — papan magang. */
export function BriefcaseSketch({ className }: IllustrationProps) {
  return (
    <Svg viewBox="0 0 300 220" className={cn('h-auto w-full max-w-[300px]', className)}>
      <ellipse cx="150" cy="204" rx="110" ry="8" fill={PAPER_SHADE} stroke="none" />
      <Ink d="M120 66 V50 Q120 40 130 40 H170 Q180 40 180 50 V66" width={3} wait={0} />
      <Ink d="M62 74 Q62 66 70 66 H230 Q238 66 238 74 V184 Q238 192 230 192 H70 Q62 192 62 184 Z" fill={tint('peach')} wait={150} />
      <Ink d="M62 114 Q150 140 238 114" wait={450} />
      <path d="M136 120 H164 V140 H136 Z" fill={HIGHLIGHT} />
      <g className="drift" style={{ '--r0': '-8deg', '--r1': '4deg', '--d': '300ms' } as CSSProperties}>
        <path d="M232 132 L270 150 L262 168 L224 150 Z" fill={PAPER} />
        <circle cx="236" cy="146" r="3" fill="currentColor" stroke="none" />
        <path d="M244 152 L258 158" stroke={PENCIL} strokeWidth="4" />
      </g>
      <Sparkle x={52} y={44} scale={0.9} wait={400} />
      <Sparkle x={262} y={60} scale={0.6} wait={1300} />
    </Svg>
  );
}

const CONFETTI: readonly { x: number; y: number; rot: number; left: string; color: Tint | 'highlight'; d: number; round?: boolean }[] = [
  { x: -90, y: 150, rot: 220, left: '18%', color: 'mint', d: 0 },
  { x: -40, y: 190, rot: -160, left: '30%', color: 'highlight', d: 80, round: true },
  { x: 20, y: 170, rot: 300, left: '44%', color: 'peach', d: 40 },
  { x: 70, y: 200, rot: -240, left: '56%', color: 'sky', d: 120 },
  { x: 110, y: 160, rot: 180, left: '68%', color: 'lilac', d: 20, round: true },
  { x: -120, y: 120, rot: -120, left: '24%', color: 'sun', d: 160 },
  { x: 140, y: 130, rot: 260, left: '76%', color: 'mint', d: 200 },
  { x: -10, y: 220, rot: 200, left: '50%', color: 'highlight', d: 240 },
  { x: 60, y: 120, rot: -300, left: '62%', color: 'peach', d: 280, round: true },
  { x: -70, y: 230, rot: 140, left: '36%', color: 'sky', d: 320 },
];

/**
 * Hujan konfeti sekali jalan (CSS murni, tanpa JS). Ditaruh di dalam wadah
 * `relative overflow-hidden`; di reduced-motion langsung tak terlihat.
 */
export function Confetti() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0">
      {CONFETTI.map((bit, index) => (
        <span
          key={index}
          className={cn('confetti-bit absolute top-6 block', bit.round ? 'size-2.5 rounded-pill' : 'h-3.5 w-2 rounded-[2px]')}
          style={
            {
              left: bit.left,
              background: bit.color === 'highlight' ? 'var(--color-highlight)' : tint(bit.color),
              boxShadow: 'inset 0 0 0 1.5px var(--color-text-primary)',
              '--x': `${bit.x}px`,
              '--y': `${bit.y}px`,
              '--rot': `${bit.rot}deg`,
              '--d': `${bit.d}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
