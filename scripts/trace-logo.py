#!/usr/bin/env python3
"""Vektorkan logo StudentFo dari gambar sumbernya (ADR-080).

Logo dikirim pemilik sebagai JPEG berlatar putih. Supaya latarnya hilang dan
warnanya ikut tema, gambar itu ditelusuri jadi tiga lapis path SVG:
tinta (`currentColor`), stabilo, dan siluet kertas di bawah keduanya.
Hasilnya dibekukan di `src/components/ui/logo-paths.ts` — bukan dependensi
build, jadi perubahan logo terlihat sebagai diff yang bisa ditinjau.

    pip install --target /tmp/trace-lib potracer pillow numpy
    PYTHONPATH=/tmp/trace-lib python3 scripts/trace-logo.py docs/brand/logo-sumber.jpg src/components/ui/logo-paths.ts

Dua bobot dari satu sumber:
  - `bold`   — goresan ditebalkan, untuk ukuran kecil (navbar, footer, favicon);
               goresan asli tinggal ±0,4 px di 26 px.
  - `detail` — goresan asli + `sparkles` (kilau di sekeliling), untuk ≥ 48 px.
"""
import sys
from collections import deque

import numpy as np
import potrace
from PIL import Image

if len(sys.argv) != 3:
    sys.exit('Pakai: python3 scripts/trace-logo.py <gambar sumber> <keluaran .ts>')
SRC, OUT = sys.argv[1], sys.argv[2]
SIZE = 256
BOLD_GROW = 11
DETAIL_GROW = 2

pixels = np.asarray(Image.open(SRC).convert('RGB')).astype(np.int32)
r, g, b = pixels[..., 0], pixels[..., 1], pixels[..., 2]
ink = (299 * r + 587 * g + 114 * b) // 1000 < 120
yellow = (r > 190) & (g > 180) & ((r - b) > 45) & ~ink
H, W = ink.shape


def dilate(mask, radius):
    """Pelebaran mendekati cakram: selang-seling tetangga-4 dan tetangga-8."""
    out = mask.copy()
    for step in range(radius):
        nxt = out.copy()
        nxt[1:, :] |= out[:-1, :]
        nxt[:-1, :] |= out[1:, :]
        nxt[:, 1:] |= out[:, :-1]
        nxt[:, :-1] |= out[:, 1:]
        if step % 2 == 1:
            nxt[1:, 1:] |= out[:-1, :-1]
            nxt[1:, :-1] |= out[:-1, 1:]
            nxt[:-1, 1:] |= out[1:, :-1]
            nxt[:-1, :-1] |= out[1:, 1:]
        out = nxt
    return out


def erode(mask, radius):
    return ~dilate(~mask, radius)


def pool(mask, k):
    h, w = mask.shape
    return mask[: h - h % k, : w - w % k].reshape(h // k, k, w // k, k).any(axis=(1, 3))


def upsample(mask, k):
    big = np.kron(mask, np.ones((k, k), dtype=mask.dtype))
    return np.pad(big, ((0, H - big.shape[0]), (0, W - big.shape[1])))


def label(mask):
    """Komponen terhubung (tetangga-8): [(id, luas, x0, y0, x1, y1)]."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    boxes = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or labels[y, x]:
                continue
            ident = len(boxes) + 1
            queue = deque([(y, x)])
            labels[y, x] = ident
            x0 = x1 = x
            y0 = y1 = y
            count = 0
            while queue:
                cy, cx = queue.popleft()
                count += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = ident
                            queue.append((ny, nx))
            boxes.append((ident, count, x0, y0, x1, y1))
    return labels, boxes


def enclosed(ink_lo):
    """Sel yang tidak terjangkau dari tepi gambar tanpa menyeberangi tinta."""
    h, w = ink_lo.shape
    outside = np.zeros((h, w), dtype=bool)
    queue = deque()
    border = [(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)]
    for y, x in border:
        if not ink_lo[y, x] and not outside[y, x]:
            outside[y, x] = True
            queue.append((y, x))
    while queue:
        cy, cx = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not outside[ny, nx] and not ink_lo[ny, nx]:
                outside[ny, nx] = True
                queue.append((ny, nx))
    return ~outside & ~ink_lo


# Logo inti = komponen terbesar (map + toga + rumbai) dan apa pun yang
# terkurung di dalamnya (piala). Sisanya kilau lepas di sekeliling.
K = 4
labels, boxes = label(pool(ink, K))
boxes.sort(key=lambda item: -item[1])
main_id = boxes[0][0]
inside_main = enclosed(pool(dilate(ink & upsample(labels == main_id, K).astype(bool), 3), K))
core_ids = [main_id] + [ident for ident, _, x0, y0, x1, y1 in boxes[1:] if inside_main[(y0 + y1) // 2, (x0 + x1) // 2]]
labels_hi = upsample(labels, K)
ink_core = ink & dilate(np.isin(labels_hi, core_ids), 2)
ink_spark = ink & ~dilate(ink_core, 3)


def trace(mask, turd, tolerance, alphamax=1.0):
    # potracer membalik masukannya (menganggap True = putih), jadi topeng dibalik dulu.
    return potrace.Bitmap(~mask).trace(
        turdsize=turd, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=alphamax, opticurve=True, opttolerance=tolerance
    )


class Encoder:
    """Koordinat bilangan bulat relatif pada kotak 0..SIZE — ±40% lebih ringkas dari absolut."""

    def __init__(self, box):
        self.x0, self.y0, side = box
        self.scale = SIZE / side

    def point(self, p):
        return round((p.x - self.x0) * self.scale), round((p.y - self.y0) * self.scale)

    def curve(self, curve):
        px, py = self.point(curve.start_point)
        out = [f'M{px} {py}']

        def rel(points):
            text = ''
            for qx, qy in points:
                for value in (qx - px, qy - py):
                    text += str(value) if value < 0 or not text else f' {value}'
            return text

        for segment in curve.segments:
            if segment.is_corner:
                for target in (self.point(segment.c), self.point(segment.end_point)):
                    out.append('l' + rel([target]))
                    px, py = target
            else:
                end = self.point(segment.end_point)
                out.append('c' + rel([self.point(segment.c1), self.point(segment.c2), end]))
                px, py = end
        out.append('z')
        return ''.join(out)

    def all(self, path):
        return ''.join(self.curve(curve) for curve in path)

    def silhouette(self, path):
        """Kontur luar saja (arah putar sama dengan kontur terbesar) — alas isian kertas."""

        def area(curve):
            points = [curve.start_point] + [segment.end_point for segment in curve.segments]
            return sum(p.x * q.y - q.x * p.y for p, q in zip(points, points[1:] + points[:1])) / 2

        areas = [area(curve) for curve in path]
        sign = 1 if max(areas, key=abs) > 0 else -1
        return ''.join(self.curve(curve) for curve, value in zip(path, areas) if value * sign > 0)


def bounds(mask):
    ys, xs = np.where(mask)
    return xs.min(), ys.min(), xs.max(), ys.max()


def square(box, pad):
    x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0) * (1 + pad * 2)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return cx - side / 2, cy - side / 2, side


# Tepi stabilo berbulu (artefak JPEG) dirapikan sebelum ditelusuri.
yellow_smooth = erode(dilate(yellow, 8), 8)
highlight = dilate(yellow_smooth & dilate(ink_core, 60), 4)

ink_bold = dilate(ink_core, BOLD_GROW)
bold_box = Encoder(square(bounds(ink_bold | highlight), 0.03))
bold_path = trace(ink_bold, 40, 0.9)

ink_detail = dilate(ink_core, DETAIL_GROW)
ink_sparkles = dilate(ink_spark, DETAIL_GROW)
full_square = square(bounds(ink_detail | ink_sparkles | highlight), 0.03)
full_box = Encoder(full_square)
detail_path = trace(ink_detail, 12, 0.4)
# Kotak pandang logo inti di dalam kotak penuh (tanpa kilau).
core_x, core_y, core_side = square(bounds(ink_detail | highlight), 0.03)
core_view = [round((core_x - full_square[0]) * full_box.scale), round((core_y - full_square[1]) * full_box.scale), round(core_side * full_box.scale)]

layers = {
    'bold': {
        'paper': bold_box.silhouette(bold_path),
        'highlight': bold_box.all(trace(highlight, 200, 1.6, 1.2)),
        'ink': bold_box.all(bold_path),
    },
    'detail': {
        'paper': full_box.silhouette(detail_path),
        'highlight': full_box.all(trace(highlight, 200, 1.6, 1.2)),
        'ink': full_box.all(detail_path),
        'sparkles': full_box.all(trace(ink_sparkles, 12, 0.4)),
    },
}

lines = [
    '/**',
    ' * Geometri logo StudentFo (ADR-080) — HASIL `scripts/trace-logo.py` dari',
    ' * `docs/brand/logo-sumber.jpg`. JANGAN diedit tangan: ubah gambar sumbernya',
    ' * lalu jalankan ulang skripnya.',
    ' *',
    ' * Tiga lapis, digambar berurutan: `paper` (siluet, isi token permukaan),',
    ' * `highlight` (stabilo), `ink` (`currentColor`, fill-rule evenodd).',
    ' */',
    f'export const LOGO_SIZE = {SIZE};',
    '',
    '/** Goresan ditebalkan — untuk ukuran kecil (navbar, footer, favicon). */',
    'export const LOGO_BOLD = {',
]
for key in ('paper', 'highlight', 'ink'):
    lines.append(f"  {key}: '{layers['bold'][key]}',")
lines += [
    '} as const;',
    '',
    '/** Goresan asli + kilau di sekelilingnya — untuk ≥ 48 px. `coreViewBox` memotong kilaunya. */',
    'export const LOGO_DETAIL = {',
    f"  coreViewBox: '{core_view[0]} {core_view[1]} {core_view[2]} {core_view[2]}',",
]
for key in ('paper', 'highlight', 'ink', 'sparkles'):
    lines.append(f"  {key}: '{layers['detail'][key]}',")
lines += ['} as const;', '']

with open(OUT, 'w') as handle:
    handle.write('\n'.join(lines))
for variant, parts in layers.items():
    print(variant, {key: len(value) for key, value in parts.items()})
print('kotak inti:', core_view)
