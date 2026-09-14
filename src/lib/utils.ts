import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Gabung class Tailwind dengan resolusi konflik (`px-2 px-4` -> `px-4`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Bersihkan string dari whitespace ganda. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Ambil hostname yang enak dibaca dari sebuah URL.
 * Sengaja tidak melempar error: dipakai di render path, dan satu URL
 * rusak dari scraper tidak boleh menjatuhkan seluruh halaman.
 */
export function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Hanya izinkan URL http/https untuk atribut href.
 * Mencegah XSS lewat `javascript:` / `data:` pada data hasil scraping —
 * yang isinya per definisi berasal dari pihak ketiga yang tidak dipercaya.
 */
export function sanitizeExternalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function pluralizeId(count: number, word: string): string {
  return `${count.toLocaleString('id-ID')} ${word}`;
}
