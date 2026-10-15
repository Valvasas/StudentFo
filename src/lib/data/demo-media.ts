import { deflateSync } from 'node:zlib';

/**
 * Gambar contoh untuk mode demo (ADR-056): "bukti transfer" bergaris
 * sederhana supaya alur verifikasi pembayaran di studio bisa dicoba tanpa
 * mengunggah apa pun. Dibangun dari kotak berwarna, bukan foto — jelas
 * terbaca sebagai contoh, dan tidak ada aset biner di repo.
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
