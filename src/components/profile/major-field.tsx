'use client';

import { useState } from 'react';
import { Picker } from '@/components/ui/picker';
import { MAJORS } from '@/lib/regions';

const OPTIONS = MAJORS.flatMap(([group, majors]) => majors.map((label) => ({ label, group })));

/**
 * Program studi lewat pemilih melayang (kanvas Data Diri). Nilainya ikut
 * terkirim lewat input tersembunyi, jadi tanpa JavaScript nilai lama tetap
 * terkirim utuh — menyimpan nama tidak ikut mengosongkan prodi.
 */
export function MajorField({ defaultValue, labelledBy }: { defaultValue: string; labelledBy: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name="major" value={value} />
      <Picker
        labelledBy={labelledBy}
        title="Program studi"
        placeholder="Pilih program studi"
        searchPlaceholder="Cari program studi"
        value={value}
        options={OPTIONS}
        allowCustom
        onChange={(next) => setValue(next.slice(0, 100))}
      />
    </>
  );
}
