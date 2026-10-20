/**
 * Isi kartu pemuat navigasi (ADR-055, ADR-056): ilustrasi kecil + "Memuat
 * <tujuan>…". Murni dari path supaya bisa diuji dan dipanggil di fase
 * capture klik, sebelum halaman baru ada.
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

const scene = (key: RouteSceneKey, target: string): RouteScene => ({ key, label: `Memuat ${target}…` });

const RULES: readonly { test: (path: string) => boolean; scene: RouteScene }[] = [
  { test: (path) => path === '/', scene: scene('home', 'beranda') },
  { test: (path) => /^\/events\/[^/]+\/daftar$/.test(path), scene: scene('register', 'situs penyelenggara') },
  { test: (path) => /^\/events\/[^/]+\/formulir$/.test(path), scene: scene('register', 'formulir pendaftaran') },
  { test: (path) => /^\/events\/[^/]+\/persiapan$/.test(path), scene: scene('event', 'daftar berkas') },
  { test: (path) => /^\/events\/[^/]+$/.test(path), scene: scene('event', 'detail kegiatan') },
  { test: (path) => path === '/events', scene: scene('catalog', 'daftar kegiatan') },
  { test: under('/pembayaran'), scene: scene('tracker', 'pembayaran') },
  { test: under('/tracker'), scene: scene('tracker', 'papan lamaran') },
  { test: (path) => path === '/teams/baru', scene: scene('teams', 'formulir tim baru') },
  { test: (path) => path === '/teams/cocok', scene: scene('teams', 'pencocokan tim') },
  { test: under('/teams'), scene: scene('teams', 'daftar tim') },
  { test: under('/orang'), scene: scene('network', 'profil') },
  { test: under('/connections'), scene: scene('network', 'koneksi') },
  { test: (path) => under('/messages')(path) || under('/discussions')(path), scene: scene('inbox', 'kotak masuk') },
  { test: (path) => path === '/profile/settings', scene: scene('settings', 'pengaturan') },
  { test: (path) => path === '/profile/personalization', scene: scene('settings', 'personalisasi') },
  { test: under('/profile'), scene: scene('profile', 'profilmu') },
  { test: under('/admin'), scene: scene('admin', 'antrean moderasi') },
  { test: under('/penyelenggara/acara'), scene: scene('studio', 'ruang kerja acara') },
  { test: under('/penyelenggara'), scene: scene('studio', 'studio penyelenggara') },
  { test: (path) => path === '/submit', scene: scene('submit', 'formulir kiriman') },
  { test: (path) => ['/register', '/verify-email'].includes(path), scene: scene('auth', 'pendaftaran akun') },
  { test: (path) => ['/forgot-password', '/reset-password'].includes(path), scene: scene('auth', 'pemulihan akun') },
  { test: (path) => under('/login')(path) || path === '/demo', scene: scene('auth', 'halaman masuk') },
];

const FALLBACK: RouteScene = scene('page', 'halaman');

export function routeSceneFor(pathname: string): RouteScene {
  // Garis miring penutup (`/tracker/`) dan kapital tidak boleh jatuh ke adegan generik.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '').toLowerCase() : pathname;
  return RULES.find((rule) => rule.test(path))?.scene ?? FALLBACK;
}
