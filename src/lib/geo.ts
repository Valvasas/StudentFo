import { REGIONS } from '@/lib/regions';

export type LatLng = readonly [lat: number, lng: number];

/**
 * Titik tengah kota/kabupaten dari `REGIONS` (derajat desimal). Perkiraan
 * pusat kota, akurat sekitar belasan kilometer — cukup untuk "satu kota /
 * satu pulau / beda pulau", dan SENGAJA tidak lebih tepat: jarak dihitung
 * antarkota, bukan antaralamat, sehingga lokasi rumah siapa pun tidak pernah
 * disimpan maupun dihitung. Uji `geo.test.ts` memastikan setiap kota di
 * `REGIONS` punya titik di sini.
 */
const CITY_COORDINATES: Readonly<Record<string, LatLng>> = {
  // DKI Jakarta
  'Jakarta Pusat': [-6.18, 106.83],
  'Jakarta Selatan': [-6.26, 106.81],
  'Jakarta Barat': [-6.17, 106.76],
  'Jakarta Timur': [-6.23, 106.9],
  'Jakarta Utara': [-6.14, 106.88],
  'Kepulauan Seribu': [-5.61, 106.57],
  // Jawa Barat
  Bandung: [-6.91, 107.61],
  Bekasi: [-6.24, 106.99],
  Bogor: [-6.6, 106.8],
  Depok: [-6.4, 106.82],
  Cimahi: [-6.87, 107.54],
  Cirebon: [-6.71, 108.56],
  Tasikmalaya: [-7.33, 108.22],
  Sukabumi: [-6.92, 106.93],
  Karawang: [-6.32, 107.34],
  Garut: [-7.21, 107.9],
  Sumedang: [-6.86, 107.92],
  // Banten
  Tangerang: [-6.18, 106.63],
  'Tangerang Selatan': [-6.29, 106.72],
  Serang: [-6.12, 106.15],
  Cilegon: [-6.0, 106.04],
  Pandeglang: [-6.31, 106.11],
  Lebak: [-6.56, 106.25],
  // Jawa Tengah
  Semarang: [-6.97, 110.42],
  Surakarta: [-7.57, 110.82],
  Magelang: [-7.47, 110.22],
  Salatiga: [-7.33, 110.49],
  Pekalongan: [-6.89, 109.68],
  Tegal: [-6.87, 109.14],
  Purwokerto: [-7.42, 109.24],
  Kudus: [-6.8, 110.84],
  Klaten: [-7.71, 110.6],
  // DI Yogyakarta
  Yogyakarta: [-7.8, 110.36],
  Sleman: [-7.72, 110.35],
  Bantul: [-7.89, 110.33],
  'Kulon Progo': [-7.83, 110.16],
  Gunungkidul: [-7.96, 110.6],
  // Jawa Timur
  Surabaya: [-7.25, 112.75],
  Malang: [-7.98, 112.63],
  Sidoarjo: [-7.45, 112.72],
  Kediri: [-7.82, 112.01],
  Madiun: [-7.63, 111.52],
  Jember: [-8.17, 113.7],
  Banyuwangi: [-8.22, 114.37],
  Gresik: [-7.16, 112.65],
  Mojokerto: [-7.47, 112.43],
  Batu: [-7.87, 112.53],
  // Bali
  Denpasar: [-8.65, 115.22],
  Badung: [-8.58, 115.18],
  Gianyar: [-8.54, 115.33],
  Tabanan: [-8.54, 115.12],
  Buleleng: [-8.11, 115.09],
  // Nusa Tenggara
  Mataram: [-8.58, 116.12],
  Bima: [-8.46, 118.73],
  'Lombok Timur': [-8.65, 116.53],
  Sumbawa: [-8.5, 117.42],
  Kupang: [-10.18, 123.6],
  Ende: [-8.84, 121.66],
  Maumere: [-8.62, 122.21],
  'Labuan Bajo': [-8.5, 119.89],
  // Sumatera
  'Banda Aceh': [5.55, 95.32],
  Lhokseumawe: [5.18, 97.15],
  Langsa: [4.47, 97.97],
  Meulaboh: [4.14, 96.13],
  Medan: [3.59, 98.67],
  Binjai: [3.6, 98.49],
  Pematangsiantar: [2.96, 99.06],
  'Deli Serdang': [3.55, 98.87],
  Sibolga: [1.74, 98.78],
  Padang: [-0.95, 100.35],
  Bukittinggi: [-0.31, 100.37],
  Payakumbuh: [-0.22, 100.63],
  Solok: [-0.8, 100.65],
  Pekanbaru: [0.53, 101.45],
  Dumai: [1.67, 101.45],
  Kampar: [0.33, 101.03],
  Batam: [1.05, 104.03],
  Tanjungpinang: [0.92, 104.45],
  Bintan: [1.1, 104.5],
  Jambi: [-1.61, 103.61],
  'Sungai Penuh': [-2.06, 101.39],
  'Muaro Jambi': [-1.64, 103.8],
  Palembang: [-2.98, 104.76],
  Prabumulih: [-3.43, 104.24],
  Lubuklinggau: [-3.3, 102.86],
  'Ogan Ilir': [-3.2, 104.65],
  Pangkalpinang: [-2.13, 106.11],
  Belitung: [-2.75, 107.65],
  Bangka: [-1.95, 106.05],
  Bengkulu: [-3.8, 102.26],
  'Rejang Lebong': [-3.46, 102.52],
  'Bandar Lampung': [-5.43, 105.26],
  Metro: [-5.11, 105.31],
  'Lampung Selatan': [-5.6, 105.57],
  // Kalimantan
  Pontianak: [-0.03, 109.33],
  Singkawang: [0.91, 108.98],
  'Kubu Raya': [-0.1, 109.4],
  'Palangka Raya': [-2.21, 113.92],
  'Kotawaringin Timur': [-2.54, 112.95],
  Banjarmasin: [-3.32, 114.59],
  Banjarbaru: [-3.44, 114.83],
  Martapura: [-3.41, 114.85],
  Samarinda: [-0.5, 117.15],
  Balikpapan: [-1.24, 116.83],
  Bontang: [0.13, 117.5],
  'Penajam Paser Utara': [-1.27, 116.71],
  Tarakan: [3.3, 117.63],
  'Tanjung Selor': [2.84, 117.37],
  Nunukan: [4.14, 117.66],
  // Sulawesi
  Manado: [1.47, 124.84],
  Bitung: [1.44, 125.18],
  Tomohon: [1.33, 124.84],
  Gorontalo: [0.54, 123.06],
  'Bone Bolango': [0.5, 123.2],
  Palu: [-0.9, 119.87],
  Luwuk: [-0.95, 122.79],
  Poso: [-1.4, 120.75],
  Mamuju: [-2.68, 118.89],
  Majene: [-3.54, 118.97],
  Makassar: [-5.15, 119.43],
  Parepare: [-4.01, 119.63],
  Palopo: [-2.99, 120.2],
  Gowa: [-5.31, 119.74],
  Maros: [-5.0, 119.57],
  Kendari: [-3.97, 122.51],
  Baubau: [-5.47, 122.63],
  Kolaka: [-4.05, 121.59],
  // Maluku & Papua
  Ambon: [-3.7, 128.18],
  Tual: [-5.64, 132.75],
  'Maluku Tengah': [-3.3, 128.93],
  Ternate: [0.79, 127.38],
  'Tidore Kepulauan': [0.68, 127.43],
  Sofifi: [0.74, 127.57],
  Jayapura: [-2.53, 140.72],
  Keerom: [-2.93, 140.76],
  Sarmi: [-1.86, 138.75],
  Manokwari: [-0.86, 134.06],
  Fakfak: [-2.93, 132.3],
  Kaimana: [-3.65, 133.75],
  Sorong: [-0.88, 131.26],
  'Raja Ampat': [-0.43, 130.83],
  Nabire: [-3.37, 135.49],
  Mimika: [-4.55, 136.89],
  Wamena: [-4.1, 138.94],
  Jayawijaya: [-4.1, 138.94],
  Merauke: [-8.49, 140.4],
  'Boven Digoel': [-6.1, 140.3],
};

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Jarak lengkung bumi (haversine), kilometer. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a[0])) * Math.cos(toRadians(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function cityCoordinates(city: string | null | undefined): LatLng | null {
  return city && Object.hasOwn(CITY_COORDINATES, city) ? (CITY_COORDINATES[city] ?? null) : null;
}

/** Nama kota yang dikenal — kota di luar daftar tidak diterima form, jadi jarak selalu bisa dihitung. */
export function isKnownCity(city: string): boolean {
  return Object.hasOwn(CITY_COORDINATES, city);
}

/** Jarak antarkota dibulatkan ke 5 km; null bila salah satu kota tidak diketahui. Kota yang sama = 0. */
export function distanceBetweenCitiesKm(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  if (a === b) return 0;
  const from = cityCoordinates(a);
  const to = cityCoordinates(b);
  if (!from || !to) return null;
  return Math.round(haversineKm(from, to) / 5) * 5;
}

/** Semua kota yang punya titik, diurutkan menurut provinsinya di `REGIONS` — sumber daftar pilihan form. */
export function citiesByProvince(): readonly (readonly [province: string, cities: readonly string[]])[] {
  return REGIONS.map(([province, cities]) => [province, cities.filter(isKnownCity)] as const);
}

/**
 * "Satu kota", "Berdekatan", "±120 km", "±1.250 km" — angka dibulatkan di
 * sumbernya, tulisan tidak menjanjikan ketepatan lebih. "Satu kota" hanya
 * untuk kota yang sama (jarak 0); kota tetangga ≤15 km (Bandung–Cimahi)
 * "Berdekatan", supaya label tidak bertentangan dengan nama kota di sebelahnya.
 */
export function distanceLabel(km: number | null): string {
  if (km === null) return 'Jarak belum diketahui';
  if (km === 0) return 'Satu kota';
  if (km <= 15) return 'Berdekatan';
  return `±${km.toLocaleString('id-ID')} km`;
}
