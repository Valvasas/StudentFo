/**
 * Pemeriksa & pembersih unggahan gambar (galeri acara, bukti bayar — ADR-056).
 *
 * Jenis berkas dibaca dari BYTE-nya, tidak pernah dari nama berkas atau
 * `File.type` kiriman klien: keduanya dikarang pengirim. Hanya JPEG, PNG,
 * dan WebP — SVG ditolak karena bisa membawa skrip, GIF karena tidak perlu.
 *
 * Metadata dibuang sebelum disimpan. Foto dari ponsel membawa EXIF berisi
 * koordinat GPS (rumah peserta yang memotret bukti transfer di kamarnya),
 * model perangkat, dan jam. Satu-satunya yang dipertahankan adalah tag
 * Orientation: tanpanya foto potret dari ponsel tampil miring. Unggahan dari
 * peramban ber-JavaScript sudah diperkecil & digambar ulang di kanvas
 * (tanpa metadata sama sekali); pembersih ini jaring pengaman untuk jalur
 * tanpa JS dan klien yang tidak kita tulis.
 */

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

export const IMAGE_EXTENSION: Record<ImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const IMAGE_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  minSide: 32,
  maxSide: 10_000,
  /** Bom dekompresi: 40 MP sudah di atas kamera ponsel mana pun. */
  maxPixels: 40_000_000,
} as const;

export interface ImageInfo {
  readonly type: ImageMime;
  /** Ukuran TAMPIL (orientasi EXIF sudah diterapkan) — dipakai untuk rasio tata letak. */
  readonly width: number;
  readonly height: number;
}

export interface UploadedImage extends ImageInfo {
  readonly bytes: Uint8Array;
}

export type ImageUploadError = 'image_missing' | 'image_too_large' | 'image_invalid';

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) => (u16be(b, i) * 0x10000 + u16be(b, i + 2)) >>> 0;
const u32le = (b: Uint8Array, i: number) => (u16le(b, i) + u16le(b, i + 2) * 0x10000) >>> 0;
const ascii = (b: Uint8Array, start: number, length: number) => String.fromCharCode(...b.subarray(start, start + length));

function startsWith(b: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => b[offset + index] === value);
}

function withinLimits(info: ImageInfo): ImageInfo | null {
  const { width, height } = info;
  if (width < IMAGE_LIMITS.minSide || height < IMAGE_LIMITS.minSide) return null;
  if (width > IMAGE_LIMITS.maxSide || height > IMAGE_LIMITS.maxSide) return null;
  if (width * height > IMAGE_LIMITS.maxPixels) return null;
  return info;
}

// ------------------------------------------------------------------
// JPEG
// ------------------------------------------------------------------

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const ICC_HEADER = 'ICC_PROFILE\0';

interface JpegSegment {
  readonly marker: number;
  readonly start: number;
  readonly end: number;
}

/** Segmen sampai SOS (data gambar). null = struktur rusak. */
function jpegSegments(b: Uint8Array): { segments: JpegSegment[]; scanStart: number } | null {
  if (!startsWith(b, [0xff, 0xd8])) return null;
  const segments: JpegSegment[] = [];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = u16be(b, i + 2);
    const end = i + 2 + length;
    if (length < 2 || end > b.length) return null;
    if (marker === 0xda) return { segments, scanStart: i };
    segments.push({ marker, start: i, end });
    i = end;
  }
  return null;
}

/** Tag Orientation (0x0112) dari blok TIFF EXIF; 1 bila tidak ada/rusak. */
export function exifOrientation(tiff: Uint8Array): number {
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return 1;
  const u16 = order === 'II' ? u16le : u16be;
  const u32 = order === 'II' ? u32le : u32be;
  const ifd = u32(tiff, 4);
  const count = u16(tiff, ifd);
  for (let entry = 0; entry < count; entry += 1) {
    const at = ifd + 2 + entry * 12;
    if (at + 12 > tiff.length) break;
    if (u16(tiff, at) === 0x0112) {
      const value = u16(tiff, at + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function jpegOrientation(b: Uint8Array, segments: readonly JpegSegment[]): number {
  for (const segment of segments) {
    if (segment.marker === 0xe1 && startsWith(b, EXIF_HEADER, segment.start + 4)) {
      return exifOrientation(b.subarray(segment.start + 10, segment.end));
    }
  }
  return 1;
}

function inspectJpeg(b: Uint8Array): ImageInfo | null {
  const parsed = jpegSegments(b);
  if (!parsed) return null;
  const frame = parsed.segments.find((segment) => SOF_MARKERS.has(segment.marker));
  if (!frame) return null;
  const height = u16be(b, frame.start + 5);
  const width = u16be(b, frame.start + 7);
  // Orientasi 5–8 = diputar 90°: lebar & tinggi tampil tertukar.
  const rotated = jpegOrientation(b, parsed.segments) >= 5;
  return { type: 'image/jpeg', width: rotated ? height : width, height: rotated ? width : height };
}

/** APP1 EXIF minimal: satu entri Orientation, big-endian. */
function orientationSegment(orientation: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22,
    ...EXIF_HEADER,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

function keepJpegSegment(b: Uint8Array, segment: JpegSegment): boolean {
  const { marker } = segment;
  // APP0 (JFIF) dan APP14 (Adobe: transformasi warna CMYK/YCCK) dibutuhkan dekoder.
  if (marker === 0xe0 || marker === 0xee) return true;
  // APP2 hanya bila profil warna ICC — tanpanya warna foto bergeser.
  if (marker === 0xe2) return ascii(b, segment.start + 4, ICC_HEADER.length) === ICC_HEADER;
  // APP1 (EXIF/XMP), APP3–APP15 lain (IPTC, Photoshop, maker notes), COM.
  if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) return false;
  return true;
}

function stripJpeg(b: Uint8Array): Uint8Array {
  const parsed = jpegSegments(b);
  if (!parsed) return b;
  const orientation = jpegOrientation(b, parsed.segments);
  const kept = parsed.segments.filter((segment) => keepJpegSegment(b, segment));
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let index = 0;
  if (kept[0]?.marker === 0xe0) {
    parts.push(b.subarray(kept[0].start, kept[0].end));
    index = 1;
  }
  if (orientation !== 1) parts.push(orientationSegment(orientation));
  for (const segment of kept.slice(index)) parts.push(b.subarray(segment.start, segment.end));
  parts.push(b.subarray(parsed.scanStart));
  return concat(parts);
}

// ------------------------------------------------------------------
// PNG
// ------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_METADATA_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function pngChunks(b: Uint8Array): { type: string; start: number; end: number }[] | null {
  if (!startsWith(b, PNG_SIGNATURE)) return null;
  const chunks: { type: string; start: number; end: number }[] = [];
  let i = 8;
  while (i + 12 <= b.length) {
    const length = u32be(b, i);
    const end = i + 12 + length;
    if (end > b.length) return null;
    const type = ascii(b, i + 4, 4);
    chunks.push({ type, start: i, end });
    i = end;
    if (type === 'IEND') return chunks;
  }
  return null;
}

function inspectPng(b: Uint8Array): ImageInfo | null {
  const chunks = pngChunks(b);
  if (!chunks || chunks[0]?.type !== 'IHDR') return null;
  return { type: 'image/png', width: u32be(b, 16), height: u32be(b, 20) };
}

function stripPng(b: Uint8Array): Uint8Array {
  const chunks = pngChunks(b);
  if (!chunks) return b;
  return concat([
    b.subarray(0, 8),
    ...chunks.filter((chunk) => !PNG_METADATA_CHUNKS.has(chunk.type)).map((chunk) => b.subarray(chunk.start, chunk.end)),
  ]);
}

// ------------------------------------------------------------------
// WebP
// ------------------------------------------------------------------

function webpChunks(b: Uint8Array): { type: string; start: number; end: number; data: number }[] | null {
  if (ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunks: { type: string; start: number; end: number; data: number }[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const size = u32le(b, i + 4);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > b.length) return null;
    chunks.push({ type: ascii(b, i, 4), start: i, end: Math.min(end, b.length), data: i + 8 });
    i = end;
  }
  return chunks.length > 0 ? chunks : null;
}

function inspectWebp(b: Uint8Array): ImageInfo | null {
  const chunks = webpChunks(b);
  const first = chunks?.[0];
  if (!first) return null;
  const d = first.data;
  if (first.type === 'VP8X') return { type: 'image/webp', width: u24le(b, d + 4) + 1, height: u24le(b, d + 7) + 1 };
  if (first.type === 'VP8 ' && startsWith(b, [0x9d, 0x01, 0x2a], d + 3)) {
    return { type: 'image/webp', width: u16le(b, d + 6) & 0x3fff, height: u16le(b, d + 8) & 0x3fff };
  }
  if (first.type === 'VP8L' && b[d] === 0x2f) {
    const bits = u32le(b, d + 1);
    return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

function stripWebp(b: Uint8Array): Uint8Array {
  const chunks = webpChunks(b);
  if (!chunks) return b;
  const kept = chunks
    .filter((chunk) => chunk.type !== 'EXIF' && chunk.type !== 'XMP ')
    .map((chunk) => {
      const bytes = b.slice(chunk.start, chunk.end);
      // Bendera VP8X: bit 3 = ada EXIF, bit 2 = ada XMP — harus ikut padam.
      if (chunk.type === 'VP8X') bytes[8] = (bytes[8] ?? 0) & ~0x0c;
      return bytes;
    });
  const body = concat(kept);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  const riffSize = body.length + 4;
  header[4] = riffSize & 0xff;
  header[5] = (riffSize >>> 8) & 0xff;
  header[6] = (riffSize >>> 16) & 0xff;
  header[7] = (riffSize >>> 24) & 0xff;
  return concat([header, body]);
}

// ------------------------------------------------------------------

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Jenis + ukuran dari byte; null = bukan gambar yang diterima atau di luar batas. */
export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  const info = startsWith(bytes, [0xff, 0xd8, 0xff])
    ? inspectJpeg(bytes)
    : startsWith(bytes, PNG_SIGNATURE)
      ? inspectPng(bytes)
      : ascii(bytes, 0, 4) === 'RIFF'
        ? inspectWebp(bytes)
        : null;
  return info ? withinLimits(info) : null;
}

export function stripImageMetadata(bytes: Uint8Array, type: ImageMime): Uint8Array {
  if (type === 'image/jpeg') return stripJpeg(bytes);
  if (type === 'image/png') return stripPng(bytes);
  return stripWebp(bytes);
}

/** Satu `File` dari FormData → gambar bersih, atau alasan penolakan. */
export async function readImageUpload(
  value: FormDataEntryValue | null,
): Promise<{ ok: true; image: UploadedImage } | { ok: false; error: ImageUploadError }> {
  if (!value || typeof value === 'string' || value.size === 0) return { ok: false, error: 'image_missing' };
  if (value.size > IMAGE_LIMITS.maxBytes) return { ok: false, error: 'image_too_large' };
  const bytes = new Uint8Array(await value.arrayBuffer());
  const info = inspectImage(bytes);
  if (!info) return { ok: false, error: 'image_invalid' };
  return { ok: true, image: { ...info, bytes: stripImageMetadata(bytes, info.type) } };
}

/** Semua berkas di satu nama kolom (unggah banyak), berkas kosong dari input tanpa pilihan dilewati. */
export function formFiles(formData: FormData, name: string): File[] {
  return formData.getAll(name).filter((value): value is File => typeof value !== 'string' && value.size > 0);
}
