'use client';

import { useRef, useState } from 'react';
import { PenLine } from 'lucide-react';
import { controlClass } from '@/components/ui/field';
import { Picker } from '@/components/ui/picker';
import { MAJORS } from '@/lib/regions';

const OPTIONS = MAJORS.flatMap(([group, majors]) => majors.map((label) => ({ label, group })));
const KNOWN = new Set(OPTIONS.map((option) => option.label));
const OTHER = 'Lainnya — tulis sendiri';
const MAX = 100;

/**
 * Program studi lewat pemilih melayang (kanvas Data Diri), ±260 prodi/jurusan
 * (ADR-075) + "Lainnya — tulis sendiri" yang membuka isian bebas: daftar
 * sebanyak apa pun tidak akan memuat semua prodi peminatan khusus. Nilai lama
 * di luar daftar langsung tampil di isian bebas, bukan hilang.
 *
 * Nilainya ikut terkirim lewat input tersembunyi, jadi tanpa JavaScript nilai
 * lama tetap terkirim utuh — menyimpan nama tidak ikut mengosongkan prodi.
 */
export function MajorField({ defaultValue, labelledBy }: { defaultValue: string; labelledBy: string }) {
  const [value, setValue] = useState(defaultValue);
  const [custom, setCustom] = useState(Boolean(defaultValue) && !KNOWN.has(defaultValue));
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="major" value={value} />
      <Picker
        labelledBy={labelledBy}
        title="Program studi"
        placeholder="Pilih program studi"
        searchPlaceholder="Cari program studi atau jurusan"
        value={custom ? OTHER : value}
        displayValue={custom ? OTHER : undefined}
        options={OPTIONS}
        pinned={[{ label: OTHER, icon: <PenLine aria-hidden className="size-4" />, sub: 'Tidak ada di daftar' }]}
        allowCustom
        onChange={(next, kind) => {
          if (next === OTHER) {
            setCustom(true);
            if (KNOWN.has(value)) setValue('');
            requestAnimationFrame(() => inputRef.current?.focus());
            return;
          }
          setCustom(kind === 'custom');
          setValue(next.slice(0, MAX));
        }}
      />
      {custom && (
        <input
          ref={inputRef}
          aria-labelledby={labelledBy}
          aria-describedby={`${labelledBy}-lainnya`}
          value={value}
          maxLength={MAX}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Tulis nama prodi/jurusanmu"
          className={controlClass}
        />
      )}
      {custom && (
        <span id={`${labelledBy}-lainnya`} className="text-[12.5px] text-ink-muted">
          Ditulis apa adanya, maks. {MAX} karakter.
        </span>
      )}
    </div>
  );
}
