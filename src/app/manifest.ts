import type { MetadataRoute } from 'next';

/**
 * Untuk "Tambahkan ke layar utama": tanpa manifest, Android memakai judul
 * halaman yang panjang sebagai nama ikon dan favicon 32 px sebagai gambarnya.
 *
 * `display: 'browser'`, bukan `standalone`: tanpa bilah browser, iOS tidak
 * punya tombol kembali, sementara banyak alur di sini (detail kegiatan, tautan
 * ke situs penyelenggara) mengandalkannya. Ini pintasan, bukan aplikasi.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StudentFo — Info lomba, beasiswa, dan magang',
    short_name: 'StudentFo',
    description: 'Info lomba, beasiswa, magang, dan workshop untuk pelajar & mahasiswa Indonesia, tervalidasi manual.',
    lang: 'id',
    start_url: '/',
    display: 'browser',
    background_color: '#faf8f3',
    theme_color: '#faf8f3',
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png' },
    ],
  };
}
