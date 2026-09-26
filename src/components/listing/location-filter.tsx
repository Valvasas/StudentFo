'use client';

import { useRouter } from 'next/navigation';
import { Globe, MapPin, Monitor } from 'lucide-react';
import { Picker, type PickKind } from '@/components/ui/picker';
import { citiesOf, REGIONS } from '@/lib/regions';
import { buildEventHref, type ParsedEventQuery } from '@/lib/search-params';

const ALL = 'Semua lokasi';
const ONLINE = 'Daring';

/**
 * Pemilih lokasi magang (kanvas desain Magang + `StudentHubPicker`).
 * Setiap pilihan jadi URL (`lokasi=` / `mode=daring`), jadi hasilnya bisa
 * dibagikan dan tombol back bekerja; memilih provinsi = semua kotanya.
 */
export function LocationFilter({ query, counts }: { query: ParsedEventQuery; counts: Readonly<Record<string, number>> }) {
  const router = useRouter();
  const province = REGIONS.find(
    ([, cities]) => query.locations.length > 1 && cities.length === query.locations.length && cities.every((city) => query.locations.includes(city)),
  )?.[0];
  const value = query.mode === 'online' ? ONLINE : province ?? query.locations[0] ?? '';
  const display = query.mode === 'online' ? 'Daring' : province ? `${province} · semua kota` : query.locations[0] ?? '';
  const onlineCount = counts.__online__ ?? 0;

  const onChange = (next: string, kind: PickKind) => {
    const base = { ...query, page: 1 };
    const href =
      next === ALL
        ? buildEventHref(base, { locations: [], mode: undefined })
        : next === ONLINE
          ? buildEventHref(base, { locations: [], mode: 'online' })
          : kind === 'group'
            ? buildEventHref(base, { locations: citiesOf(next), mode: undefined })
            : buildEventHref(base, { locations: [next], mode: undefined });
    router.push(href, { scroll: false });
  };

  const options = REGIONS.flatMap(([group, cities]) => cities.map((label) => ({ label, group, count: counts[label] })))
    // Kota yang punya lowongan tampil lebih dulu, seperti kanvas.
    .sort((left, right) => Number(Boolean(right.count)) - Number(Boolean(left.count)));

  return (
    <Picker
      variant="pill"
      align="right"
      icon={<MapPin aria-hidden className="size-4" />}
      title="Lokasi magang"
      placeholder={ALL}
      searchPlaceholder="Cari kota atau provinsi"
      value={value}
      displayValue={display}
      groupSelectable
      pinned={[
        { label: ALL, icon: <Globe aria-hidden className="size-4" />, count: counts.__all__ },
        { label: ONLINE, icon: <Monitor aria-hidden className="size-4" />, sub: 'Kerja dari mana saja', count: onlineCount },
      ]}
      options={options}
      onChange={onChange}
    />
  );
}
