/**
 * Kapan navigasi daftar → detail memakai View Transitions API (ADR-099).
 * Murni & teruji; pemakaiannya di `components/ui/transition-link.tsx`.
 *
 * Selama transisi, peramban MEMBEKUKAN tampilan lama sampai halaman baru
 * dirender — di koneksi lambat itu berarti layar diam tanpa umpan balik.
 * Karena itu transisi hanya dipakai bila geraknya tidak dikurangi, peramban
 * mendukungnya, dan koneksinya tidak lambat/hemat data; selebihnya navigasi
 * biasa (dengan bilah progres). Jendela beku juga dibatasi
 * `VIEW_TRANSITION_CAP_MS`: lewat dari itu tampilan dilepas dan halaman
 * baru muncul begitu siap.
 */
export const VIEW_TRANSITION_CAP_MS = 1500;

const SLOW_CONNECTIONS: ReadonlySet<string> = new Set(['slow-2g', '2g', '3g']);

export interface ViewTransitionEnv {
  readonly supported: boolean;
  readonly reducedMotion: boolean;
  /** `navigator.connection.effectiveType`, bila peramban melaporkannya. */
  readonly effectiveType?: string;
  readonly saveData?: boolean;
}

export function canUseViewTransition(env: ViewTransitionEnv): boolean {
  if (!env.supported || env.reducedMotion || env.saveData) return false;
  return !env.effectiveType || !SLOW_CONNECTIONS.has(env.effectiveType);
}

export interface ClickLike {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

/**
 * Hanya klik kiri polos ke halaman LAIN di situs ini yang diambil alih.
 * Ctrl/⌘/Shift/tengah = buka tab/jendela baru seperti biasa; jangkar di
 * halaman yang sama tidak pernah mengganti halaman, jadi tidak ada yang
 * ditunggu (transisi akan membeku sampai batas waktunya).
 */
export function isTransitionableClick(event: ClickLike, target: string, destination: URL, current: URL): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (target && target !== '_self') return false;
  return destination.origin === current.origin && destination.pathname !== current.pathname;
}
