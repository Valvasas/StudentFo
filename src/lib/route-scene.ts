/**
 * Adegan pemuat navigasi (ADR-055): ilustrasi + kalimat pendek tentang
 * TUJUAN klik, bukan "Memuat…" generik. Murni dari path supaya bisa diuji
 * dan dipanggil di fase capture klik, sebelum halaman baru ada.
 *
 * Kalimatnya hiasan (`aria-hidden` di pemuatnya): pembaca layar sudah diberi
 * tahu perpindahan halaman oleh route announcer Next.js, dan pengumuman
 * "sedang memuat" kedua di setiap klik hanya jadi bising.
 */

export const ROUTE_SCENES = [
  'home',
  'catalog',
  'event',
  'register',
  'tracker',
  'teams',
  'network',
  'inbox',
  'profile',
  'settings',
  'admin',
  'studio',
  'submit',
  'auth',
  'page',
] as const;

export type RouteSceneKey = (typeof ROUTE_SCENES)[number];

export interface RouteScene {
  readonly key: RouteSceneKey;
  readonly label: string;
}

/** Cocok per SEGMEN: `/teams` dan `/teams/baru`, tapi bukan `/teams-lama`. */
const under = (prefix: string) => (path: string) => path === prefix || path.startsWith(`${prefix}/`);

const RULES: readonly { test: (path: string) => boolean; scene: RouteScene }[] = [
  { test: (path) => path === '/', scene: { key: 'home', label: 'Menyiapkan berandamu' } },
  { test: (path) => /^\/events\/[^/]+\/daftar$/.test(path), scene: { key: 'register', label: 'Mengantarmu ke formulir resmi' } },
  { test: (path) => /^\/events\/[^/]+\/persiapan$/.test(path), scene: { key: 'event', label: 'Menyiapkan daftar berkas' } },
  { test: (path) => /^\/events\/[^/]+$/.test(path), scene: { key: 'event', label: 'Membuka detail kegiatan' } },
  { test: (path) => path === '/events', scene: { key: 'catalog', label: 'Menyusun daftar kegiatan' } },
  { test: under('/tracker'), scene: { key: 'tracker', label: 'Menata papan pendaftaranmu' } },
  { test: (path) => path === '/teams/baru', scene: { key: 'teams', label: 'Menyiapkan meja tim baru' } },
  { test: under('/teams'), scene: { key: 'teams', label: 'Mengumpulkan tim terbuka' } },
  { test: under('/orang'), scene: { key: 'network', label: 'Membuka profil' } },
  { test: under('/connections'), scene: { key: 'network', label: 'Merangkai koneksimu' } },
  { test: (path) => under('/messages')(path) || under('/discussions')(path), scene: { key: 'inbox', label: 'Membuka kotak masuk' } },
  { test: (path) => path === '/profile/settings', scene: { key: 'settings', label: 'Membuka pengaturan' } },
  { test: (path) => path === '/profile/personalization', scene: { key: 'settings', label: 'Menyiapkan tampilanmu' } },
  { test: under('/profile'), scene: { key: 'profile', label: 'Membuka profilmu' } },
  { test: under('/admin'), scene: { key: 'admin', label: 'Membuka meja moderasi' } },
  { test: under('/penyelenggara'), scene: { key: 'studio', label: 'Membuka studio penyelenggara' } },
  { test: (path) => path === '/submit', scene: { key: 'submit', label: 'Menyiapkan formulir kiriman' } },
  {
    test: (path) => ['/login', '/register', '/forgot-password', '/reset-password'].includes(path),
    scene: { key: 'auth', label: 'Membuka pintu masuk' },
  },
];

const FALLBACK: RouteScene = { key: 'page', label: 'Membuka halaman' };

export function routeSceneFor(pathname: string): RouteScene {
  // Garis miring penutup (`/tracker/`) dan kapital tidak boleh jatuh ke adegan generik.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '').toLowerCase() : pathname;
  return RULES.find((rule) => rule.test(path))?.scene ?? FALLBACK;
}
