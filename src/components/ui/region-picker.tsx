'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { SelectInput } from '@/components/ui/field';
import { Picker, type PickKind } from '@/components/ui/picker';
import { PROVINCE_OPTIONS, REGENCY_PICKER_OPTIONS, regencyName, type WilayahOption } from '@/lib/wilayah';

const NONE = 'Tidak ingin menyebut';

/**
 * Pemilih wilayah bertingkat (ADR-074): satu pemilih melayang berisi 514
 * kab/kota berkelompok provinsi (kelompoknya bisa dipilih = "provinsinya
 * saja"), lalu — bila `withDistrict` — daftar kecamatan yang diambil per
 * kab/kota dari `/api/wilayah/[kode]`. Nilainya SATU kode terdalam yang
 * dipilih di input tersembunyi `name`, jadi server cukup memeriksa satu kode.
 *
 * Tanpa JavaScript tombol pemilih tidak bisa dibuka, tetapi nilai lama tetap
 * terkirim utuh lewat input tersembunyi — menyimpan halaman tidak menghapus domisili.
 */
export function RegionPicker({
  name,
  defaultValue,
  labelledBy,
  withDistrict = false,
  optional = true,
  districtLabelId,
}: {
  name: string;
  defaultValue: string | null;
  labelledBy: string;
  withDistrict?: boolean;
  optional?: boolean;
  /** Id label untuk daftar kecamatan (wajib bila `withDistrict`). */
  districtLabelId?: string;
}) {
  const [code, setCode] = useState(defaultValue ?? '');
  const regency = code.length >= 5 ? code.slice(0, 5) : null;
  const [districts, setDistricts] = useState<{ regency: string; items: readonly WilayahOption[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const byLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of REGENCY_PICKER_OPTIONS) map.set(option.label, option.code);
    for (const province of PROVINCE_OPTIONS) map.set(province.name, province.code);
    return map;
  }, []);

  useEffect(() => {
    if (!withDistrict || !regency || districts?.regency === regency) return;
    let cancelled = false;
    setFailed(false);
    fetch(`/api/wilayah/${regency}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { districts: WilayahOption[] }) => {
        if (!cancelled) setDistricts({ regency, items: body.districts });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [withDistrict, regency, districts?.regency]);

  const provinceLabel = PROVINCE_OPTIONS.find((province) => province.code === code.slice(0, 2))?.name ?? '';
  const value = !code ? '' : code.length === 2 ? provinceLabel : (regencyName(code) ?? '');
  const display = !code ? '' : code.length === 2 ? `${provinceLabel} · kab/kota tidak disebut` : `${value}, ${provinceLabel}`;

  const onChange = (next: string, kind: PickKind) => {
    if (next === NONE) return setCode('');
    const picked = byLabel.get(next);
    if (!picked) return;
    // Memilih kelompok = provinsi saja; memilih kab/kota yang sama tidak menghapus kecamatan.
    setCode(kind === 'group' || picked.length === 2 || picked !== code.slice(0, 5) ? picked : code);
  };

  const items = districts?.regency === regency ? districts.items : null;

  return (
    <div className="flex flex-col gap-2.5">
      <input type="hidden" name={name} value={code} />
      <Picker
        labelledBy={labelledBy}
        title="Kabupaten / kota"
        placeholder={optional ? NONE : 'Pilih kabupaten / kota'}
        searchPlaceholder="Cari kabupaten, kota, atau provinsi"
        icon={<MapPin aria-hidden className="size-4" />}
        value={value}
        displayValue={display}
        groupSelectable
        pinned={optional ? [{ label: NONE }] : []}
        options={REGENCY_PICKER_OPTIONS}
        onChange={onChange}
      />
      {withDistrict && regency && (
        <div className="flex flex-col gap-1.5">
          <span id={districtLabelId} className="text-[13.5px] font-medium text-ink-soft">
            Kecamatan <span className="font-normal text-ink-muted">(opsional, tidak ditampilkan ke orang lain)</span>
          </span>
          {failed ? (
            <p className="text-[13px] text-ink-muted">Daftar kecamatan gagal dimuat. Kab/kota tetap tersimpan.</p>
          ) : (
            <SelectInput
              aria-labelledby={districtLabelId}
              value={code.length === 8 ? code : ''}
              disabled={!items}
              onChange={(event) => setCode(event.target.value || regency)}
            >
              <option value="">{items ? 'Tidak disebut' : 'Memuat kecamatan…'}</option>
              {items?.map((district) => (
                <option key={district.code} value={district.code}>
                  {district.name}
                </option>
              ))}
            </SelectInput>
          )}
        </div>
      )}
    </div>
  );
}
