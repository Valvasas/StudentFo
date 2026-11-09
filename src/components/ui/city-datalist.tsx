import { ALL_CITY_NAMES } from '@/lib/wilayah';

/**
 * Saran 500+ kab/kota (ADR-074) untuk isian lokasi kegiatan. `<datalist>`
 * bawaan, bukan pemilih kustom: tetap jalan tanpa JavaScript, ramah pembaca
 * layar & papan ketik ponsel, dan isian di luar daftar (nama kampus, gedung,
 * luar negeri) tetap diterima apa adanya — "lainnya" tanpa langkah tambahan.
 */
export function CityDatalist({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {ALL_CITY_NAMES.map((city) => (
        <option key={city} value={city} />
      ))}
    </datalist>
  );
}
