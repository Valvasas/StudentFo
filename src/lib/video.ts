/**
 * Video acara (ADR-079): hanya tautan YouTube/Vimeo, disimpan dalam SATU
 * bentuk kanonis yang juga dikunci CHECK `events_video_url_shape` di
 * migration 20261109100002 (dikunci `video.test.ts`). StudentFo tidak
 * menampung berkas video.
 *
 * Diputar lewat domain tanpa-pelacak (youtube-nocookie.com, Vimeo `dnt=1`)
 * dan baru dimuat setelah pengunjung menekan Putar — membuka halaman acara
 * tidak mengirim apa pun ke pihak ketiga.
 */

export const VIDEO_URL_MAX = 200;

export const CANONICAL_VIDEO_PATTERN = /^https:\/\/(www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com\/[0-9]{6,12})$/;

export type VideoProvider = 'youtube' | 'vimeo';

export interface EventVideo {
  readonly provider: VideoProvider;
  readonly id: string;
  /** Bentuk kanonis — yang disimpan & dibuka tanpa JavaScript. */
  readonly url: string;
  /** Pemutar tersemat; hanya dimuat setelah diklik (`autoplay=1` sah karena aksi pengguna). */
  readonly embedUrl: string;
  readonly providerLabel: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^[0-9]{6,12}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

function youtubeUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function vimeoUrl(id: string): string {
  return `https://vimeo.com/${id}`;
}

/**
 * Tautan yang ditempel orang → bentuk kanonis, atau `null` bila bukan video
 * YouTube/Vimeo yang bisa diputar. Menerima youtu.be, /shorts/, /embed/,
 * /live/, m.youtube, tanpa skema, dan Vimeo /channels/…/ID atau player.
 * Playlist tanpa video, kanal, dan domain tiruan ditolak.
 */
export function normalizeVideoUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 500) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || (url.port && url.port !== '443' && url.port !== '80')) return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const id = segments[0] ?? '';
    return YOUTUBE_ID.test(id) ? youtubeUrl(id) : null;
  }
  if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === 'watch') {
      const id = url.searchParams.get('v') ?? '';
      return YOUTUBE_ID.test(id) ? youtubeUrl(id) : null;
    }
    if (segments.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(segments[0] ?? '')) {
      const id = segments[1] ?? '';
      return YOUTUBE_ID.test(id) ? youtubeUrl(id) : null;
    }
    return null;
  }
  if (VIMEO_HOSTS.has(host)) {
    // vimeo.com/123, vimeo.com/channels/x/123, player.vimeo.com/video/123 — ID = segmen angka terakhir.
    const id = [...segments].reverse().find((segment) => VIMEO_ID.test(segment)) ?? '';
    return id ? vimeoUrl(id) : null;
  }
  return null;
}

/** Bentuk kanonis (dari database) → data pemutar. Selain bentuk kanonis = `null`, tidak ditebak. */
export function parseVideo(canonical: string | null | undefined): EventVideo | null {
  if (!canonical || !CANONICAL_VIDEO_PATTERN.test(canonical)) return null;
  const youtube = /[?&]v=([A-Za-z0-9_-]{11})$/.exec(canonical);
  if (youtube?.[1]) {
    const id = youtube[1];
    return {
      provider: 'youtube',
      id,
      url: youtubeUrl(id),
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`,
      providerLabel: 'YouTube',
    };
  }
  const id = canonical.slice(canonical.lastIndexOf('/') + 1);
  return {
    provider: 'vimeo',
    id,
    url: vimeoUrl(id),
    embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`,
    providerLabel: 'Vimeo',
  };
}

/** Domain pemutar — sumber tunggal untuk CSP `frame-src` (`security-headers.ts`). */
export const VIDEO_FRAME_ORIGINS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'] as const;
