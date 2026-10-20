import { describe, expect, it } from 'vitest';
import { REGIONS } from './regions';
import { citiesByProvince, cityCoordinates, distanceBetweenCitiesKm, distanceLabel, haversineKm, isKnownCity } from './geo';

describe('cakupan koordinat', () => {
  const allCities = REGIONS.flatMap(([, cities]) => cities);

  it('setiap kota di REGIONS punya titik — jarak tidak pernah gagal karena data', () => {
    const missing = allCities.filter((city) => !isKnownCity(city));
    expect(missing).toEqual([]);
  });

  it('semua titik jatuh di dalam Indonesia (kotak batas kasar)', () => {
    for (const city of allCities) {
      const [lat, lng] = cityCoordinates(city)!;
      expect(lat, city).toBeGreaterThan(-11.1);
      expect(lat, city).toBeLessThan(6.2);
      expect(lng, city).toBeGreaterThan(95);
      expect(lng, city).toBeLessThan(141.1);
    }
  });

  it('nama kota tidak ganda lintas provinsi (kuncinya nama saja)', () => {
    expect(new Set(allCities).size).toBe(allCities.length);
  });

  it('citiesByProvince mempertahankan seluruh kota', () => {
    expect(citiesByProvince().flatMap(([, cities]) => cities)).toHaveLength(allCities.length);
  });
});

describe('jarak antarkota', () => {
  it('cocok dengan jarak garis lurus yang dikenal (toleransi 5%)', () => {
    // Garis lurus dari koordinat pusat kota publik (bukan tabel proyek), dihitung terpisah.
    const known: readonly [string, string, number][] = [
      ['Jakarta Pusat', 'Bandung', 120],
      ['Jakarta Pusat', 'Surabaya', 665],
      ['Yogyakarta', 'Surakarta', 57],
      ['Medan', 'Padang', 539],
      ['Makassar', 'Surabaya', 775],
      ['Jakarta Pusat', 'Jayapura', 3_778],
    ];
    for (const [a, b, km] of known) {
      const got = distanceBetweenCitiesKm(a, b)!;
      expect(Math.abs(got - km) / km, `${a}–${b}: ${got}`).toBeLessThan(0.05);
    }
  });

  it('simetris, dan kota yang sama = 0', () => {
    expect(distanceBetweenCitiesKm('Bandung', 'Malang')).toBe(distanceBetweenCitiesKm('Malang', 'Bandung'));
    expect(distanceBetweenCitiesKm('Bandung', 'Bandung')).toBe(0);
  });

  it('dibulatkan ke 5 km — lokasi tidak lebih tepat dari yang perlu', () => {
    for (const [a, b] of [['Bandung', 'Cimahi'], ['Depok', 'Bogor'], ['Medan', 'Binjai']] as const) {
      expect(distanceBetweenCitiesKm(a, b)! % 5).toBe(0);
    }
  });

  it('null bila salah satu kosong atau tidak dikenal (bukan 0, bukan tebakan)', () => {
    expect(distanceBetweenCitiesKm(null, 'Bandung')).toBeNull();
    expect(distanceBetweenCitiesKm('Bandung', undefined)).toBeNull();
    expect(distanceBetweenCitiesKm('Bandung', 'Atlantis')).toBeNull();
    expect(cityCoordinates('constructor')).toBeNull();
  });

  it('haversine: seperempat keliling bumi dari khatulistiwa ke kutub', () => {
    expect(haversineKm([0, 0], [90, 0])).toBeCloseTo(10_007.5, 0);
  });
});

describe('distanceLabel', () => {
  it('menulis jarak tanpa menjanjikan ketepatan', () => {
    expect(distanceLabel(0)).toBe('Satu kota');
    expect(distanceLabel(10)).toBe('Berdekatan');
    expect(distanceLabel(120)).toBe('±120 km');
    expect(distanceLabel(null)).toBe('Jarak belum diketahui');
  });
});
