import { deflateSync } from 'node:zlib';

/**
 * Gambar contoh untuk mode demo: "bukti transfer" bergaris (ADR-056) dan
 * poster/foto suasana acara (ADR-079), supaya alur verifikasi pembayaran dan
 * slide media bisa dicoba tanpa mengunggah apa pun. Dibangun dari kotak
 * berwarna, bukan foto — jelas terbaca sebagai contoh, dan tidak ada aset
 * biner di repo.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

type Rgb = readonly [number, number, number];
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: Rgb;
}

function renderPng(width: number, height: number, background: Rgb, rects: readonly Rect[]): Uint8Array {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      let color = background;
      for (const rect of rects) {
        if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) color = rect.color;
      }
      const [r, g, b] = color;
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const INK: Rgb = [40, 38, 33];
const MUTED: Rgb = [214, 210, 200];
const OK: Rgb = [46, 125, 82];

let receipt: Uint8Array | null = null;

/** Struk transfer contoh 300×420 — dibuat sekali per proses. */
export function demoReceiptPng(): Uint8Array {
  receipt ??= renderPng(300, 420, [250, 248, 244], [
    { x: 0, y: 0, w: 300, h: 64, color: INK },
    { x: 126, y: 92, w: 48, h: 48, color: OK },
    { x: 40, y: 168, w: 220, h: 14, color: INK },
    ...[214, 246, 278, 310].map((y) => ({ x: 40, y, w: 220, h: 10, color: MUTED })),
    { x: 40, y: 356, w: 140, h: 18, color: INK },
  ]);
  return receipt;
}

/** Warna dasar & aksen per poster contoh — berbeda supaya slide & kartu terlihat bergeser. */
const POSTER_PALETTES: readonly (readonly [Rgb, Rgb, Rgb])[] = [
  [[27, 46, 94], [242, 183, 5], [250, 248, 244]],
  [[22, 101, 74], [250, 248, 244], [180, 228, 196]],
  [[124, 31, 46], [250, 214, 165], [250, 248, 244]],
  [[34, 34, 40], [238, 92, 66], [222, 222, 230]],
];

const posters = new Map<number, Uint8Array>();
const scenes = new Map<number, Uint8Array>();

export const DEMO_POSTER_SIZE = { width: 480, height: 600 } as const;
export const DEMO_SCENE_SIZE = { width: 720, height: 480 } as const;

/** Poster contoh 4:5 (bentuk umum poster lomba di media sosial): judul, bidang gambar, baris info, tombol. */
export function demoPosterPng(variant: number): Uint8Array {
  const index = ((variant % POSTER_PALETTES.length) + POSTER_PALETTES.length) % POSTER_PALETTES.length;
  const cached = posters.get(index);
  if (cached) return cached;
  const [base, accent, soft] = POSTER_PALETTES[index] ?? POSTER_PALETTES[0]!;
  const { width, height } = DEMO_POSTER_SIZE;
  const png = renderPng(width, height, base, [
    { x: 40, y: 48, w: 180, h: 18, color: accent },
    { x: 40, y: 92, w: 400, h: 40, color: soft },
    { x: 40, y: 144, w: 300, h: 40, color: soft },
    { x: 40, y: 220, w: 400, h: 220, color: accent },
    { x: 96, y: 268, w: 120, h: 120, color: base },
    { x: 264, y: 300, w: 120, h: 88, color: soft },
    ...[468, 494].map((y) => ({ x: 40, y, w: 300, h: 12, color: soft })),
    { x: 40, y: 532, w: 170, h: 36, color: accent },
  ]);
  posters.set(index, png);
  return png;
}

/** "Foto suasana" contoh 3:2: panggung, layar, dan deretan penonton. */
export function demoScenePng(variant: number): Uint8Array {
  const index = ((variant % POSTER_PALETTES.length) + POSTER_PALETTES.length) % POSTER_PALETTES.length;
  const cached = scenes.get(index);
  if (cached) return cached;
  const [base, accent, soft] = POSTER_PALETTES[index] ?? POSTER_PALETTES[0]!;
  const { width, height } = DEMO_SCENE_SIZE;
  const png = renderPng(width, height, soft, [
    { x: 0, y: 300, w: width, h: 180, color: base },
    { x: 180, y: 70, w: 360, h: 190, color: base },
    { x: 200, y: 90, w: 320, h: 150, color: accent },
    ...[60, 170, 280, 390, 500, 610].map((x) => ({ x, y: 360, w: 56, h: 72, color: soft })),
  ]);
  scenes.set(index, png);
  return png;
}
