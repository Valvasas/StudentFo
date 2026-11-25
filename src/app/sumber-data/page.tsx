import type { Metadata } from 'next';
import Link from 'next/link';
import { Database, ListChecks, MapPin, Newspaper, School, ShieldCheck } from 'lucide-react';
import { institutionCount, INSTITUTION_SOURCE } from '@/lib/institutions';
import { PROVINCE_OPTIONS, REGENCY_PICKER_OPTIONS, WILAYAH_SOURCE } from '@/lib/wilayah';
import { VERIFICATION_LEVEL_DESCRIPTION, VERIFICATION_LEVEL_LABEL } from '@/types/domain';

export const metadata: Metadata = {
  title: 'Sumber data & tingkat verifikasi',
  description: 'Beda label Terverifikasi moderator dan Dari sumber publik, serta asal data wilayah dan direktori sekolah & kampus di StudentFo.',
  alternates: { canonical: '/sumber-data' },
};

/** Apa yang benar-benar diperiksa di tiap tingkat (ADR-096) — satu sumber dengan label di kartu & halaman kegiatan. */
const TRUST_LEVELS = [
  {
    level: 'MODERATOR_VERIFIED',
    icon: ShieldCheck,
    checks: [
      'Tanggal penting dan tautan pendaftaran dicocokkan dengan kanal resmi penyelenggara (situs, akun media sosial, atau surat edaran resminya).',
      'Identitas penyelenggara diperiksa: lembaga, kampus, instansi, atau komunitas yang benar-benar ada.',
      'Otomatis untuk acara buatan StudentFo dan acara yang dikelola penyelenggara terverifikasi.',
    ],
  },
  {
    level: 'PUBLIC_SOURCE',
    icon: Newspaper,
    checks: [
      'Disalin dari pengumuman publik (situs penyelenggara, portal berita, atau kiriman komunitas) beserta tautan sumbernya.',
      'Moderator memastikan isinya masuk akal dan bukan penipuan yang kasatmata sebelum tayang.',
      'Belum dicocokkan langsung dengan penyelenggaranya — buka pengumuman resminya sebelum mendaftar atau membayar.',
    ],
  },
] as const;

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
          Seberapa dalam sebuah kegiatan sudah diperiksa, dan dari mana daftar wilayah serta sekolah/kampus di StudentFo berasal. Data
          referensi diambil dari sumber publik resmi, dibekukan per tanggal unduh, dan diperbarui berkala. Menemukan yang keliru atau belum ada? Kamu tetap bisa mengetik namanya sendiri — dan kabari kami lewat{' '}
          <Link href="/about" className="font-medium text-ink underline underline-offset-[3px]">
            halaman Tentang
          </Link>
          .
        </p>
      </header>

      <section aria-labelledby="tingkat-verifikasi" className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-line p-5 sm:p-6">
        <h2 id="tingkat-verifikasi" className="flex items-center gap-2 text-lg font-semibold">
          <ListChecks aria-hidden className="size-5 text-ink-muted" /> Tingkat verifikasi kegiatan
        </h2>
        <p className="text-[14.5px] leading-relaxed text-ink-soft">
          Setiap kegiatan ditinjau moderator sebelum tayang — tidak ada jalur otomatis yang bisa menayangkan apa pun. Tapi kedalaman
          pemeriksaannya tidak selalu sama, jadi setiap kegiatan diberi salah satu dari dua label berikut, di kartu maupun halaman detailnya.
        </p>
        <dl className="flex flex-col gap-4">
          {TRUST_LEVELS.map(({ level, icon: Icon, checks }) => (
            <div key={level} className="flex flex-col gap-2 rounded-card bg-panel-nested p-4">
              <dt className={`flex items-center gap-2 text-[15px] font-semibold ${level === 'MODERATOR_VERIFIED' ? 'text-success' : 'text-ink'}`}>
                <Icon aria-hidden className="size-[18px] shrink-0" /> {VERIFICATION_LEVEL_LABEL[level]}
              </dt>
              <dd className="flex flex-col gap-2 text-[14px] leading-relaxed text-ink-soft">
                <span>{VERIFICATION_LEVEL_DESCRIPTION[level]}</span>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-ink-muted">
                  {checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          Label bisa berubah: moderator menaikkannya begitu detailnya dicocokkan, atau menurunkannya bila sumber resminya berubah. Melihat
          kegiatan yang janggal? Laporkan dari halaman kegiatannya.
        </p>
      </section>

      <section aria-labelledby="wilayah" className="flex flex-col gap-3 rounded-2xl border border-line p-5 sm:p-6">
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

      <section aria-labelledby="sekolah" className="flex flex-col gap-3 rounded-2xl border border-line p-5 sm:p-6">
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
