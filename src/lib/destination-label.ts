/**
 * Nama halaman tujuan untuk kalimat "Masuk untuk membuka …" di halaman masuk.
 * Tamu yang dilempar dari /pembayaran atau /messages tanpa penjelasan mengira
 * tautannya salah. Daftar tertutup berdasarkan awalan path; `null` = tidak
 * dikenal (tujuan arbitrer tidak dikutip ke layar).
 */
const DESTINATIONS: readonly { readonly test: (path: string) => boolean; readonly label: string }[] = [
  { test: (path) => /^\/events\/[^/]+\/formulir$/.test(path), label: 'formulir pendaftaran' },
  { test: (path) => path === '/pembayaran' || path.startsWith('/pembayaran/'), label: 'Pendaftaran & pembayaran' },
  { test: (path) => path === '/tracker' || path.startsWith('/tracker/'), label: 'Papan lamaran' },
  { test: (path) => path === '/profile' || path.startsWith('/profile/'), label: 'profilmu' },
  { test: (path) => path === '/messages', label: 'Pesan' },
  { test: (path) => path === '/discussions', label: 'Ruang diskusi' },
  { test: (path) => path === '/connections', label: 'Koneksi' },
  { test: (path) => path === '/teams/baru', label: 'form buka tim' },
  { test: (path) => path === '/teams/cocok', label: 'pencocokan tim' },
  { test: (path) => path === '/teams' || path.startsWith('/teams/'), label: 'Cari tim' },
  { test: (path) => path === '/penyelenggara' || path.startsWith('/penyelenggara/'), label: 'Studio penyelenggara' },
  { test: (path) => path === '/submit', label: 'form kirim kegiatan' },
];

export function destinationLabel(next: string): string | null {
  const path = next.split(/[?#]/)[0] ?? '';
  return DESTINATIONS.find((entry) => entry.test(path))?.label ?? null;
}
