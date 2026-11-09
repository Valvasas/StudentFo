import type { Metadata } from 'next';
import Link from 'next/link';
import { Database, MapPin, School } from 'lucide-react';
import { institutionCount, INSTITUTION_SOURCE } from '@/lib/institutions';
import { PROVINCE_OPTIONS, REGENCY_PICKER_OPTIONS, WILAYAH_SOURCE } from '@/lib/wilayah';

export const metadata: Metadata = {
  title: 'Sumber data',
  description: 'Asal data wilayah administratif dan direktori sekolah & perguruan tinggi yang dipakai StudentFo, beserta lisensinya.',
};

const number = (value: number) => value.toLocaleString('id-ID');

/**
 * Atribusi data referensi (ADR-074, ADR-076). ODbL mewajibkan pemberitahuan
 * bagi karya yang memakai basis datanya; selain kewajiban, halaman ini
 * menjawab "datanya dari mana?" yang wajar ditanyakan sebelum orang memilih
 * sekolahnya dari daftar kami.
 */
export default function DataSourcesPage() {
  return (
    <div className="container-page flex max-w-3xl flex-col gap-8 pb-20 pt-10">
      <header className="flex flex-col gap-3">
        <h1 className="flex items-center gap-2.5 text-[clamp(28px,4vw,38px)] leading-[1.05] tracking-[-0.04em]">
          <Database aria-hidden className="size-7 text-ink-muted" />
          Sumber data
        </h1>
        <p className="text-[15.5px] leading-relaxed text-ink-soft">
          Daftar wilayah dan sekolah/kampus di StudentFo diambil dari sumber publik resmi, dibekukan per tanggal unduh, dan diperbarui
          berkala. Menemukan yang keliru atau belum ada? Kamu tetap bisa mengetik namanya sendiri — dan kabari kami lewat{' '}
          <Link href="/about" className="font-medium text-ink underline underline-offset-[3px]">
            halaman Tentang
          </Link>
          .
        </p>
      </header>

      <section aria-labelledby="wilayah" className="flex flex-col gap-3 rounded-[18px] border border-line p-5 sm:p-6">
        <h2 id="wilayah" className="flex items-center gap-2 text-lg font-semibold">
          <MapPin aria-hidden className="size-5 text-ink-muted" /> Wilayah administratif
        </h2>
        <p className="text-[14.5px] leading-relaxed text-ink-soft">
          {number(PROVINCE_OPTIONS.length)} provinsi dan {number(REGENCY_PICKER_OPTIONS.length)} kabupaten/kota, beserta kecamatannya, menurut
          Keputusan Menteri Dalam Negeri terbaru tentang kode dan data wilayah administrasi pemerintahan.
        </p>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          Data dari <em>idn-area-data</em> oleh Fityan Nugroho, dilisensikan di bawah{' '}
          <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noopener noreferrer" className="underline underline-offset-[3px]">
            Open Database License (ODbL) 1.0
          </a>
          . Salinan yang kami pakai tersedia dengan lisensi yang sama. Sumber: {WILAYAH_SOURCE}.
        </p>
      </section>

      <section aria-labelledby="sekolah" className="flex flex-col gap-3 rounded-[18px] border border-line p-5 sm:p-6">
        <h2 id="sekolah" className="flex items-center gap-2 text-lg font-semibold">
          <School aria-hidden className="size-5 text-ink-muted" /> Sekolah & perguruan tinggi
        </h2>
        <p className="text-[14.5px] leading-relaxed text-ink-soft">
          {number(institutionCount())} satuan pendidikan — SMA, SMK, MA, SLB, dan perguruan tinggi negeri, swasta, maupun kedinasan — dengan
          NPSN atau kode perguruan tinggi resminya.
        </p>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          {INSTITUTION_SOURCE}. Singkatan kampus (mis. UI, ITB, UGM) kami kurasi dari nama yang dipakai kampusnya sendiri; tidak semua
          kampus punya singkatan di daftar kami. Tempat studi di profil diisi pemiliknya dan tidak kami verifikasi.
        </p>
      </section>
    </div>
  );
}
