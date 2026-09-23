/**
 * Audit kontras token warna terhadap WCAG 2.1.
 *
 * KENAPA INI ADA SEBAGAI BERKAS, BUKAN CATATAN DI README:
 * README sempat mengklaim "18/18 pasangan lolos AA" dengan angka yang
 * diketik tangan. Begitu palet diganti, angka itu jadi salah tanpa ada yang
 * gagal — klaim aksesibilitas yang basi lebih berbahaya daripada tidak ada
 * klaim sama sekali, karena ia menghentikan orang dari memeriksa ulang.
 *
 * Skrip ini MEMBACA nilai langsung dari `src/app/globals.css`, jadi ia tidak
 * bisa ikut basi: ganti token, jalankan ulang, angkanya ikut berubah.
 *
 * Jalankan: npm run check:contrast
 * Keluar dengan kode 1 kalau ada pasangan yang gagal — aman dipakai di CI.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, '..', 'src', 'app', 'globals.css');
const css = readFileSync(cssPath, 'utf8');

/** Ambil isi satu blok `selector { ... }` dari CSS. */
function block(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Blok ${selector} tidak ditemukan di globals.css`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  return css.slice(open, close);
}

/**
 * Peta nama token -> nilai MENTAH (hex atau `rgb(... / a)`).
 *
 * Nilai mentah, bukan hanya hex: beberapa token containernya semi-transparan
 * (`rgb(46 158 119 / 0.18)`). Versi pertama skrip ini cuma menangkap hex,
 * sehingga token yang di dark mode ditimpa nilai rgb() diam-diam jatuh
 * kembali ke nilai LIGHT-nya — dan skripnya melaporkan 6 kegagalan palsu.
 * Warna transparan harus dikomposit dulu ke latarnya, bukan dilewati.
 */
function tokens(source) {
  const map = new Map();
  for (const m of source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

const light = tokens(block(':root {'));
const darkOverrides = tokens(block(":root[data-theme='dark']"));
// Dark mewarisi light, lalu menimpanya — persis seperti cascade CSS.
const dark = new Map([...light, ...darkOverrides]);

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** `#abc` / `#aabbcc` / `rgb(r g b)` / `rgb(r g b / a)` -> {r,g,b,a} atau null. */
function parseColor(raw) {
  const value = raw.trim();

  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value);
  if (hex) {
    const h =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((c) => c + c)
            .join('')
        : hex[1];
    return {
      r: Number.parseInt(h.slice(0, 2), 16),
      g: Number.parseInt(h.slice(2, 4), 16),
      b: Number.parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = /^rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/.exec(value);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }

  return null;
}

/** Komposit `over` di atas `under` (keduanya {r,g,b,a}), hasil selalu opak. */
function composite(over, under) {
  const a = over.a;
  return {
    r: over.r * a + under.r * (1 - a),
    g: over.g * a + under.g * (1 - a),
    b: over.b * a + under.b * (1 - a),
    a: 1,
  };
}

function luminance(c) {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function describe(c) {
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}

/**
 * `min` mengikuti ambang WCAG yang relevan, bukan satu angka untuk semua:
 *  - 4.5  = 1.4.3 teks normal
 *  - 3.0  = 1.4.11 komponen non-teks (titik urgensi, focus ring)
 */
const PAIRS = [
  ['Teks utama / latar', '--color-text-primary', '--color-bg', 4.5],
  ['Teks utama / kartu', '--color-text-primary', '--color-surface', 4.5],
  ['Teks sekunder / latar', '--color-text-secondary', '--color-bg', 4.5],
  ['Teks redup / latar', '--color-text-muted', '--color-bg', 4.5],
  ['Placeholder / latar', '--color-text-placeholder', '--color-bg', 4.5],
  ['Placeholder / kartu', '--color-text-placeholder', '--color-surface', 4.5],
  ['Accent sbg teks / latar', '--color-accent-text', '--color-bg', 4.5],
  ['Accent sbg teks / kartu', '--color-accent-text', '--color-surface', 4.5],
  ['Teks di atas accent', '--color-accent-foreground', '--color-accent', 4.5],
  ['Teks di atas accent (hover)', '--color-accent-foreground', '--color-accent-hover', 4.5],
  ['Sukses / containernya', '--color-success', '--color-success-container', 4.5],
  ['Error / containernya', '--color-error', '--color-error-container', 4.5],
  ['Peringatan / containernya', '--color-warning', '--color-warning-container', 4.5],
  ['Info / containernya', '--color-info', '--color-info-container', 4.5],
  // Tiga pasangan berikut lolos lewat audit token lama tapi gagal di axe
  // (tests/a11y): teks redup dipakai di atas panel bersarang dan panel info
  // beranda, dan label "aman" dipakai di atas latar softnya sendiri.
  ['Teks redup / panel bersarang', '--color-text-muted', '--color-surface-nested', 4.5],
  ['Teks redup / panel info', '--color-text-muted', '--color-info-container', 4.5],
  ['Tenggat aman / latar', '--color-deadline-safe', '--color-bg', 4.5],
  ['Tenggat aman / softnya', '--color-deadline-safe', '--color-deadline-safe-soft', 4.5],
  ['Tenggat warning / latar', '--color-deadline-warning', '--color-bg', 4.5],
  ['Tenggat warning / softnya', '--color-deadline-warning', '--color-deadline-warning-soft', 4.5],
  ['Tenggat urgent / latar', '--color-deadline-urgent', '--color-bg', 4.5],
  ['Tenggat urgent / softnya', '--color-deadline-urgent', '--color-deadline-urgent-soft', 4.5],
  ['Focus ring / latar (1.4.11)', '--focus-ring', '--color-bg', 3],
  ['Focus ring / kartu (1.4.11)', '--focus-ring', '--color-surface', 3],
  ['Titik urgensi / latar (1.4.11)', '--color-deadline-warning', '--color-surface', 3],
  ['Teks inverse / panel inverse', '--color-inverse-text', '--color-inverse-surface', 4.5],
  ['Teks inverse redup / panel', '--color-inverse-text-muted', '--color-inverse-surface', 4.5],
];

let failures = 0;
let skipped = 0;

for (const [themeName, theme] of [
  ['TERANG', light],
  ['GELAP', dark],
]) {
  console.log(`\n== Tema ${themeName} ==`);

  // Latar paling bawah halaman. Semua warna semi-transparan dikomposit ke
  // sini (atau ke kartu), karena itulah yang benar-benar dilihat mata.
  const page = parseColor(theme.get('--color-bg') ?? '');
  const surface = parseColor(theme.get('--color-surface') ?? '');

  for (const [label, fgToken, bgToken, min] of PAIRS) {
    const rawFg = theme.get(fgToken);
    const rawBg = theme.get(bgToken);
    const fgColor = rawFg ? parseColor(rawFg) : null;
    const bgColor = rawBg ? parseColor(rawBg) : null;

    // Token yang belum bisa diurai TIDAK dianggap lulus — dilaporkan sebagai
    // dilewati, supaya yang belum diperiksa tetap terlihat.
    if (!fgColor || !bgColor || !page || !surface) {
      skipped += 1;
      console.log(`  LEWAT   ${label} (nilai belum bisa diurai: ${rawFg ?? '?'} / ${rawBg ?? '?'})`);
      continue;
    }

    // Container semi-transparan duduk di atas kartu, bukan di atas halaman.
    const backdrop = bgColor.a < 1 ? composite(bgColor, surface) : bgColor;
    const fg = fgColor.a < 1 ? composite(fgColor, backdrop) : fgColor;

    const ratio = contrast(fg, backdrop);
    const ok = ratio >= min;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'LULUS' : 'GAGAL'}  ${ratio.toFixed(2).padStart(6)}:1 (min ${min})  ${label}  ` +
        `${describe(fg)} / ${describe(backdrop)}`,
    );
  }
}

if (skipped > 0) console.log(`\n${skipped} pasangan dilewati (nilai belum bisa diurai).`);

if (failures > 0) {
  console.error(`\n${failures} pasangan GAGAL memenuhi ambang WCAG.`);
  process.exit(1);
}
console.log('\nSemua pasangan yang diperiksa lolos ambangnya.');
