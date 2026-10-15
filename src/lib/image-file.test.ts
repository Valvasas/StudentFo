import { describe, expect, it } from 'vitest';
import { exifOrientation, IMAGE_LIMITS, inspectImage, readImageUpload, stripImageMetadata } from './image-file';

const text = (value: string) => [...value].map((char) => char.charCodeAt(0));
const be16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const le32 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
const be32 = (value: number) => [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
const contains = (bytes: Uint8Array, needle: string) => Buffer.from(bytes).includes(Buffer.from(needle, 'latin1'));

function segment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...be16(payload.length + 2), ...payload];
}

/** JPEG sintetis: JFIF, EXIF (orientasi + "GPS"), komentar, SOF0, SOS, data. */
function jpeg({ width, height, orientation }: { width: number; height: number; orientation: number }): Uint8Array {
  const tiff = [
    ...text('II'), 0x2a, 0x00, ...le32(8),
    0x02, 0x00,
    0x12, 0x01, 0x03, 0x00, ...le32(1), orientation, 0x00, 0x00, 0x00,
    0x25, 0x88, 0x04, 0x00, ...le32(1), ...le32(0),
    ...le32(0),
    ...text('GPS-LINTANG-RAHASIA'),
  ];
  return Uint8Array.from([
    0xff, 0xd8,
    ...segment(0xe0, [...text('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...text('Exif'), 0, 0, ...tiff]),
    ...segment(0xfe, text('kamera milik Dinda')),
    ...segment(0xc0, [8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
    0x12, 0x34, 0x56, 0xff, 0xd9,
  ]);
}

function pngChunk(type: string, data: number[]): number[] {
  return [...be32(data.length), ...text(type), ...data, 0, 0, 0, 0];
}

function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk('IHDR', [...be32(width), ...be32(height), 8, 6, 0, 0, 0]),
    ...pngChunk('tEXt', text('Comment\0lokasi rumah')),
    ...pngChunk('IDAT', [1, 2, 3]),
    ...pngChunk('IEND', []),
  ]);
}

function webpChunk(type: string, data: number[]): number[] {
  return [...text(type), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])];
}

function webp(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  const body = [
    ...webpChunk('VP8X', [0x0c, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff]),
    ...webpChunk('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0, 0, 0, 0]),
    ...webpChunk('EXIF', text('GPS-RAHASIA')),
    ...webpChunk('XMP ', text('<x:xmpmeta/>')),
  ];
  return Uint8Array.from([...text('RIFF'), ...le32(body.length + 4), ...text('WEBP'), ...body]);
}

describe('inspectImage', () => {
  it('membaca jenis dari byte & menerapkan orientasi EXIF ke ukuran tampil', () => {
    expect(inspectImage(jpeg({ width: 400, height: 300, orientation: 1 }))).toEqual({ type: 'image/jpeg', width: 400, height: 300 });
    expect(inspectImage(jpeg({ width: 400, height: 300, orientation: 6 }))).toEqual({ type: 'image/jpeg', width: 300, height: 400 });
    expect(inspectImage(png(640, 480))).toEqual({ type: 'image/png', width: 640, height: 480 });
    expect(inspectImage(webp(1200, 800))).toEqual({ type: 'image/webp', width: 1200, height: 800 });
  });

  it('menolak SVG, berkas terpotong, gambar terlalu kecil, dan bom dekompresi', () => {
    expect(inspectImage(Uint8Array.from(text('<svg onload="alert(1)"/>')))).toBeNull();
    expect(inspectImage(jpeg({ width: 400, height: 300, orientation: 1 }).subarray(0, 30))).toBeNull();
    expect(inspectImage(png(16, 16))).toBeNull();
    expect(inspectImage(png(IMAGE_LIMITS.maxSide, IMAGE_LIMITS.maxSide))).toBeNull();
  });
});

describe('stripImageMetadata', () => {
  it('JPEG: EXIF, GPS, dan komentar hilang; orientasi & data gambar utuh', () => {
    const original = jpeg({ width: 400, height: 300, orientation: 6 });
    const clean = stripImageMetadata(original, 'image/jpeg');
    expect(contains(clean, 'GPS-LINTANG-RAHASIA')).toBe(false);
    expect(contains(clean, 'kamera milik Dinda')).toBe(false);
    expect(contains(clean, 'JFIF')).toBe(true);
    expect(inspectImage(clean)).toEqual({ type: 'image/jpeg', width: 300, height: 400 });
    expect([...clean.slice(-5)]).toEqual([0x12, 0x34, 0x56, 0xff, 0xd9]);
  });

  it('JPEG tegak tidak diberi segmen EXIF sama sekali', () => {
    const clean = stripImageMetadata(jpeg({ width: 400, height: 300, orientation: 1 }), 'image/jpeg');
    expect(contains(clean, 'Exif')).toBe(false);
  });

  it('PNG: potongan teks dibuang, potongan gambar tetap', () => {
    const clean = stripImageMetadata(png(640, 480), 'image/png');
    expect(contains(clean, 'lokasi rumah')).toBe(false);
    expect(contains(clean, 'IDAT')).toBe(true);
    expect(inspectImage(clean)).toEqual({ type: 'image/png', width: 640, height: 480 });
  });

  it('WebP: EXIF/XMP dibuang, bendera VP8X & ukuran RIFF diperbarui', () => {
    const clean = stripImageMetadata(webp(1200, 800), 'image/webp');
    expect(contains(clean, 'GPS-RAHASIA')).toBe(false);
    expect(contains(clean, 'xmpmeta')).toBe(false);
    expect(clean[20]! & 0x0c).toBe(0);
    expect(Buffer.from(clean).readUInt32LE(4)).toBe(clean.length - 8);
    expect(inspectImage(clean)).toEqual({ type: 'image/webp', width: 1200, height: 800 });
  });
});

describe('exifOrientation', () => {
  it('blok TIFF rusak dianggap tegak', () => {
    expect(exifOrientation(Uint8Array.from(text('XX')))).toBe(1);
  });
});

describe('readImageUpload', () => {
  it('nama & MIME palsu tidak dipercaya', async () => {
    const fake = new File([Uint8Array.from(text('<svg/>'))], 'foto.jpg', { type: 'image/jpeg' });
    expect(await readImageUpload(fake)).toEqual({ ok: false, error: 'image_invalid' });
    expect(await readImageUpload(null)).toEqual({ ok: false, error: 'image_missing' });
  });

  it('berkas di atas batas ditolak sebelum dibaca', async () => {
    const huge = new File([new Uint8Array(IMAGE_LIMITS.maxBytes + 1)], 'besar.png');
    expect(await readImageUpload(huge)).toEqual({ ok: false, error: 'image_too_large' });
  });

  it('gambar sah dikembalikan dalam keadaan bersih', async () => {
    const result = await readImageUpload(new File([png(640, 480)], 'bukti.png'));
    expect(result.ok && contains(result.image.bytes, 'lokasi rumah')).toBe(false);
  });
});
