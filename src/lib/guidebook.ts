import { safeHostname } from '@/lib/utils';

export interface GuidebookPreview {
  readonly url: string;
  readonly host: string;
  /** Hanya PDF yang disematkan; halaman web biasa cukup ditautkan. */
  readonly embeddable: boolean;
}

/**
 * Validasi ulang tautan buku panduan di titik render — sama dengan tautan
 * pendaftaran: data ini bisa berasal dari kiriman komunitas, jadi satu
 * lapis validasi (form/CHECK database) tidak dianggap cukup.
 *
 * https saja: PDF http di halaman https diblokir browser (mixed content),
 * dan tautan http ke berkas yang diunduh bisa disisipi di jaringan publik.
 * "PDF" ditentukan dari path (tanpa query/hash), bukan sekadar akhiran
 * string — `…/unduh?file=x.pdf` bukan berkas PDF langsung.
 */
export function guidebookPreview(raw: string | null): GuidebookPreview | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  const host = safeHostname(parsed.toString());
  if (!host) return null;
  return { url: parsed.toString(), host, embeddable: /\.pdf$/i.test(parsed.pathname) };
}
