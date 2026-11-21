import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { IMAGE_LIMITS, inspectImage, stripImageMetadata, type UploadedImage } from '@/lib/image-file';

/**
 * Unduh gambar dari tautan resmi untuk impor media (ADR-095).
 *
 * Tautannya ditulis pipeline atau admin, tapi isinya dikendalikan situs
 * orang lain — termasuk ke mana ia mengalihkan. Karena itu setiap hop
 * (termasuk redirect dan og:image) diperiksa ulang: hanya https, port
 * bawaan, tanpa kredensial di URL, dan SEMUA alamat hasil DNS harus publik.
 * Server yang bisa disuruh membuka `http://169.254.169.254/` atau
 * `https://localhost:5432/` adalah lubang SSRF klasik.
 *
 * Sisa risiko yang diterima: DNS rebinding di antara pemeriksaan dan koneksi
 * (fetch bawaan tidak bisa dipaku ke IP). Dibatasi dengan sumber tepercaya
 * (service_role) dan jawaban yang hanya diterima bila byte-nya gambar sah.
 *
 * Bila tautannya halaman HTML, gambar `og:image`/`twitter:image` halaman itu
 * yang diambil — persis yang dilakukan WhatsApp/Telegram saat membuat
 * pratinjau tautan, satu permintaan per halaman.
 */

export const REMOTE_IMAGE_ERRORS = ['url_blocked', 'fetch_failed', 'not_found', 'too_large', 'not_image', 'no_page_image'] as const;
export type RemoteImageError = (typeof REMOTE_IMAGE_ERRORS)[number];

/** Gagal yang tidak akan berubah bila dicoba lagi — langsung FAILED, tidak menunggu 3 percobaan. */
export const PERMANENT_REMOTE_ERRORS: ReadonlySet<RemoteImageError> = new Set(['url_blocked', 'not_found', 'too_large', 'not_image', 'no_page_image']);

export type RemoteImageResult = { readonly ok: true; readonly image: UploadedImage; readonly from: string } | { readonly ok: false; readonly error: RemoteImageError };

export interface RemoteImageDeps {
  readonly fetch: typeof fetch;
  /** Semua alamat IP untuk satu nama host. */
  readonly resolve: (hostname: string) => Promise<readonly string[]>;
  readonly userAgent: string;
  readonly timeoutMs?: number;
}

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 1024 * 1024;
const PAGE_IMAGE_KEYS = ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'];

class RemoteImageFailure extends Error {
  constructor(readonly code: RemoteImageError) {
    super(code);
  }
}

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ipv4Parts(ip);
  if (!parts) return true;
  const [a = 0, b = 0, c = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** Alamat yang tidak boleh disentuh server: loopback, privat, link-local, CGNAT, multicast, dokumentasi. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version !== 6) return true;
  const lower = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  if (lower === '::' || lower === '::1') return true;
  const first = Number.parseInt(lower.split(':')[0] || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unik-lokal
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    lower.startsWith('64:ff9b:') || // NAT64 — bisa menunjuk IPv4 privat
    lower.startsWith('2001:db8:') ||
    lower.startsWith('::ffff:')
  );
}

async function assertPublicUrl(raw: string, deps: RemoteImageDeps): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RemoteImageFailure('url_blocked');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new RemoteImageFailure('url_blocked');
  }
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new RemoteImageFailure('url_blocked');
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new RemoteImageFailure('url_blocked');
    return url;
  }
  let addresses: readonly string[];
  try {
    addresses = await deps.resolve(host);
  } catch {
    throw new RemoteImageFailure('fetch_failed');
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new RemoteImageFailure('url_blocked');
  return url;
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new RemoteImageFailure('too_large');
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RemoteImageFailure('too_large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function fetchPublic(raw: string, deps: RemoteImageDeps, accept: string): Promise<{ url: URL; response: Response }> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublicUrl(current, deps);
    let response: Response;
    try {
      response = await deps.fetch(url, {
        redirect: 'manual',
        headers: { Accept: accept, 'User-Agent': deps.userAgent },
        signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
      });
    } catch {
      throw new RemoteImageFailure('fetch_failed');
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new RemoteImageFailure('fetch_failed');
      current = new URL(location, url).toString();
      continue;
    }
    if (response.status === 404 || response.status === 410) throw new RemoteImageFailure('not_found');
    if (!response.ok) throw new RemoteImageFailure('fetch_failed');
    return { url, response };
  }
  throw new RemoteImageFailure('fetch_failed');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#x2f;/gi, '/')
    .replace(/&#47;/g, '/')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? decodeEntities(match[2] ?? match[3] ?? match[4] ?? '').trim() : null;
}

/** Gambar pratinjau halaman (og:image dulu, lalu twitter:image), https absolut; null = tidak ada. */
export function extractPageImage(html: string, baseUrl: string): string | null {
  const found = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attribute(tag, 'property') ?? attribute(tag, 'name'))?.toLowerCase();
    const content = attribute(tag, 'content');
    if (key && content && PAGE_IMAGE_KEYS.includes(key) && !found.has(key)) found.set(key, content);
  }
  for (const key of PAGE_IMAGE_KEYS) {
    const value = found.get(key);
    if (!value) continue;
    try {
      const resolved = new URL(value, baseUrl);
      if (resolved.protocol === 'https:') return resolved.toString();
    } catch {
      // Nilai rusak: coba kunci berikutnya.
    }
  }
  return null;
}

function looksLikeHtml(contentType: string, bytes: Uint8Array): boolean {
  if (/text\/html|application\/xhtml/i.test(contentType)) return true;
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

async function readImage(response: Response): Promise<UploadedImage> {
  const bytes = await readCapped(response, IMAGE_LIMITS.maxBytes);
  const info = inspectImage(bytes);
  if (!info) throw new RemoteImageFailure('not_image');
  return { ...info, bytes: stripImageMetadata(bytes, info.type) };
}

export async function fetchRemoteImage(sourceUrl: string, deps: RemoteImageDeps): Promise<RemoteImageResult> {
  try {
    const first = await fetchPublic(sourceUrl, deps, 'image/webp,image/png,image/jpeg,text/html;q=0.8');
    const contentType = first.response.headers.get('content-type') ?? '';
    if (/^image\//i.test(contentType)) return { ok: true, image: await readImage(first.response), from: first.url.toString() };

    const bytes = await readCapped(first.response, MAX_HTML_BYTES).catch((error: unknown) => {
      // Halaman > 1 MB: cukup bagian awal tidak bisa dibaca dari stream yang dibatalkan — anggap tanpa gambar.
      if (error instanceof RemoteImageFailure && error.code === 'too_large') throw new RemoteImageFailure('no_page_image');
      throw error;
    });
    if (!looksLikeHtml(contentType, bytes)) {
      const info = inspectImage(bytes);
      if (!info) return { ok: false, error: 'not_image' };
      return { ok: true, image: { ...info, bytes: stripImageMetadata(bytes, info.type) }, from: first.url.toString() };
    }

    const pageImage = extractPageImage(new TextDecoder().decode(bytes), first.url.toString());
    if (!pageImage) return { ok: false, error: 'no_page_image' };
    const second = await fetchPublic(pageImage, deps, 'image/webp,image/png,image/jpeg');
    return { ok: true, image: await readImage(second.response), from: second.url.toString() };
  } catch (error) {
    if (error instanceof RemoteImageFailure) return { ok: false, error: error.code };
    throw error;
  }
}

export async function resolveAllAddresses(hostname: string): Promise<readonly string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}
