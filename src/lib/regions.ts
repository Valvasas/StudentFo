/**
 * Data pilihan untuk pemilih melayang (provinsi & kota, kampus, program
 * studi). Contoh representatif dari kanvas desain, BUKAN daftar lengkap
 * se-Indonesia: pemilih kampus & prodi mengizinkan isian sendiri untuk yang
 * tidak ada di daftar.
 */
export const REGIONS: readonly (readonly [province: string, cities: readonly string[]])[] = [
  ['DKI Jakarta', ['Jakarta Pusat', 'Jakarta Selatan', 'Jakarta Barat', 'Jakarta Timur', 'Jakarta Utara', 'Kepulauan Seribu']],
  ['Jawa Barat', ['Bandung', 'Bekasi', 'Bogor', 'Depok', 'Cimahi', 'Cirebon', 'Tasikmalaya', 'Sukabumi', 'Karawang', 'Garut', 'Sumedang']],
  ['Banten', ['Tangerang', 'Tangerang Selatan', 'Serang', 'Cilegon', 'Pandeglang', 'Lebak']],
  ['Jawa Tengah', ['Semarang', 'Surakarta', 'Magelang', 'Salatiga', 'Pekalongan', 'Tegal', 'Purwokerto', 'Kudus', 'Klaten']],
  ['DI Yogyakarta', ['Yogyakarta', 'Sleman', 'Bantul', 'Kulon Progo', 'Gunungkidul']],
  ['Jawa Timur', ['Surabaya', 'Malang', 'Sidoarjo', 'Kediri', 'Madiun', 'Jember', 'Banyuwangi', 'Gresik', 'Mojokerto', 'Batu']],
  ['Bali', ['Denpasar', 'Badung', 'Gianyar', 'Tabanan', 'Buleleng']],
  ['Nusa Tenggara Barat', ['Mataram', 'Bima', 'Lombok Timur', 'Sumbawa']],
  ['Nusa Tenggara Timur', ['Kupang', 'Ende', 'Maumere', 'Labuan Bajo']],
  ['Aceh', ['Banda Aceh', 'Lhokseumawe', 'Langsa', 'Meulaboh']],
  ['Sumatera Utara', ['Medan', 'Binjai', 'Pematangsiantar', 'Deli Serdang', 'Sibolga']],
  ['Sumatera Barat', ['Padang', 'Bukittinggi', 'Payakumbuh', 'Solok']],
  ['Riau', ['Pekanbaru', 'Dumai', 'Kampar']],
  ['Kepulauan Riau', ['Batam', 'Tanjungpinang', 'Bintan']],
  ['Jambi', ['Jambi', 'Sungai Penuh', 'Muaro Jambi']],
  ['Sumatera Selatan', ['Palembang', 'Prabumulih', 'Lubuklinggau', 'Ogan Ilir']],
  ['Bangka Belitung', ['Pangkalpinang', 'Belitung', 'Bangka']],
  ['Bengkulu', ['Bengkulu', 'Rejang Lebong']],
  ['Lampung', ['Bandar Lampung', 'Metro', 'Lampung Selatan']],
  ['Kalimantan Barat', ['Pontianak', 'Singkawang', 'Kubu Raya']],
  ['Kalimantan Tengah', ['Palangka Raya', 'Kotawaringin Timur']],
  ['Kalimantan Selatan', ['Banjarmasin', 'Banjarbaru', 'Martapura']],
  ['Kalimantan Timur', ['Samarinda', 'Balikpapan', 'Bontang', 'Penajam Paser Utara']],
  ['Kalimantan Utara', ['Tarakan', 'Tanjung Selor', 'Nunukan']],
  ['Sulawesi Utara', ['Manado', 'Bitung', 'Tomohon']],
  ['Gorontalo', ['Gorontalo', 'Bone Bolango']],
  ['Sulawesi Tengah', ['Palu', 'Luwuk', 'Poso']],
  ['Sulawesi Barat', ['Mamuju', 'Majene']],
  ['Sulawesi Selatan', ['Makassar', 'Parepare', 'Palopo', 'Gowa', 'Maros']],
  ['Sulawesi Tenggara', ['Kendari', 'Baubau', 'Kolaka']],
  ['Maluku', ['Ambon', 'Tual', 'Maluku Tengah']],
  ['Maluku Utara', ['Ternate', 'Tidore Kepulauan', 'Sofifi']],
  ['Papua', ['Jayapura', 'Keerom', 'Sarmi']],
  ['Papua Barat', ['Manokwari', 'Fakfak', 'Kaimana']],
  ['Papua Barat Daya', ['Sorong', 'Raja Ampat']],
  ['Papua Tengah', ['Nabire', 'Mimika']],
  ['Papua Pegunungan', ['Wamena', 'Jayawijaya']],
  ['Papua Selatan', ['Merauke', 'Boven Digoel']],
];

export const CAMPUSES: readonly (readonly [name: string, city: string])[] = [
  ['Universitas Indonesia', 'Depok'],
  ['Institut Teknologi Bandung', 'Bandung'],
  ['Universitas Gadjah Mada', 'Sleman'],
  ['Universitas Padjadjaran', 'Sumedang'],
  ['Institut Teknologi Sepuluh Nopember', 'Surabaya'],
  ['Universitas Airlangga', 'Surabaya'],
  ['IPB University', 'Bogor'],
  ['Universitas Brawijaya', 'Malang'],
  ['Universitas Diponegoro', 'Semarang'],
  ['Universitas Sebelas Maret', 'Surakarta'],
  ['Universitas Hasanuddin', 'Makassar'],
  ['Universitas Sumatera Utara', 'Medan'],
  ['Universitas Andalas', 'Padang'],
  ['Universitas Sriwijaya', 'Palembang'],
  ['Universitas Udayana', 'Badung'],
  ['Universitas Negeri Yogyakarta', 'Sleman'],
  ['Universitas Negeri Malang', 'Malang'],
  ['Universitas Negeri Surabaya', 'Surabaya'],
  ['Universitas Negeri Jakarta', 'Jakarta Timur'],
  ['Universitas Pendidikan Indonesia', 'Bandung'],
  ['Universitas Negeri Semarang', 'Semarang'],
  ['Universitas Jember', 'Jember'],
  ['Universitas Lampung', 'Bandar Lampung'],
  ['Universitas Riau', 'Pekanbaru'],
  ['Universitas Syiah Kuala', 'Banda Aceh'],
  ['Universitas Mulawarman', 'Samarinda'],
  ['Universitas Lambung Mangkurat', 'Banjarmasin'],
  ['Universitas Tanjungpura', 'Pontianak'],
  ['Universitas Sam Ratulangi', 'Manado'],
  ['Universitas Cenderawasih', 'Jayapura'],
  ['Universitas Pattimura', 'Ambon'],
  ['Universitas Mataram', 'Mataram'],
  ['Universitas Nusa Cendana', 'Kupang'],
  ['Telkom University', 'Bandung'],
  ['Universitas Bina Nusantara', 'Jakarta Barat'],
  ['Universitas Trisakti', 'Jakarta Barat'],
  ['Universitas Atma Jaya Yogyakarta', 'Sleman'],
  ['Universitas Islam Indonesia', 'Sleman'],
  ['Universitas Muhammadiyah Yogyakarta', 'Bantul'],
  ['Universitas Muhammadiyah Malang', 'Malang'],
  ['Universitas Kristen Petra', 'Surabaya'],
  ['Universitas Pelita Harapan', 'Tangerang'],
  ['Universitas Multimedia Nusantara', 'Tangerang'],
  ['Politeknik Negeri Bandung', 'Bandung'],
  ['Politeknik Negeri Jakarta', 'Depok'],
  ['Politeknik Elektronika Negeri Surabaya', 'Surabaya'],
  ['UIN Syarif Hidayatullah Jakarta', 'Tangerang Selatan'],
  ['UIN Sunan Kalijaga', 'Yogyakarta'],
  ['Institut Teknologi Sumatera', 'Lampung Selatan'],
  ['Institut Teknologi Kalimantan', 'Balikpapan'],
];

export const MAJORS: readonly (readonly [group: string, majors: readonly string[]])[] = [
  ['Teknik & Komputer', ['Informatika', 'Sistem Informasi', 'Ilmu Komputer', 'Teknik Elektro', 'Teknik Industri', 'Teknik Sipil', 'Teknik Mesin', 'Teknik Kimia', 'Arsitektur', 'Sains Data']],
  ['Sains', ['Matematika', 'Statistika', 'Fisika', 'Kimia', 'Biologi', 'Farmasi', 'Teknologi Pangan']],
  ['Sosial & Humaniora', ['Ilmu Komunikasi', 'Hubungan Internasional', 'Ilmu Politik', 'Sosiologi', 'Psikologi', 'Hukum', 'Sastra Inggris', 'Sastra Indonesia']],
  ['Ekonomi & Bisnis', ['Manajemen', 'Akuntansi', 'Ilmu Ekonomi', 'Bisnis Digital', 'Kewirausahaan']],
  ['Seni & Desain', ['Desain Komunikasi Visual', 'Desain Produk', 'Desain Interior', 'Film & Televisi', 'Seni Rupa']],
  ['Kesehatan', ['Kedokteran', 'Kedokteran Gigi', 'Keperawatan', 'Kesehatan Masyarakat', 'Gizi']],
  ['Pendidikan', ['Pendidikan Matematika', 'Pendidikan Bahasa Inggris', 'Pendidikan Guru SD', 'Bimbingan dan Konseling']],
  ['SMA/SMK', ['IPA', 'IPS', 'Bahasa', 'Rekayasa Perangkat Lunak', 'Teknik Komputer dan Jaringan', 'Multimedia', 'Akuntansi SMK', 'Tata Boga']],
];

const CITY_PROVINCE = new Map(REGIONS.flatMap(([province, cities]) => cities.map((city) => [city, province] as const)));

export function provinceOf(city: string): string | null {
  return CITY_PROVINCE.get(city) ?? null;
}

export function citiesOf(province: string): readonly string[] {
  return REGIONS.find(([name]) => name === province)?.[1] ?? [];
}
