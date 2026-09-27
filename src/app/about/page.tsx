import type { Metadata } from 'next';
import Link from 'next/link';
import { Accessibility, ArrowRight, BadgeCheck, CalendarClock, FileSearch, Gift, Globe, Lock, ScanText } from 'lucide-react';
import { RevealObserver } from '@/components/landing/reveal-observer';
import { getEventRepository } from '@/lib/data';
import { dataMode } from '@/lib/env';

/**
 * Tentang (ADR-040). Tema & gerak sama dengan beranda (kanvas Landing v2):
 * label mono kecil, judul rapat, `data-reveal` saat digulir.
 *
 * Setiap klaim di halaman ini harus bisa ditunjuk ke perilaku sistem yang
 * sesungguhnya — angka dari repository yang sama dengan katalog, alur
 * verifikasi dari pipeline + antrean /admin, dan daftar "yang belum kami
 * lakukan" ditulis terang-terangan. Halaman "tentang kami" yang melebih-
 * lebihkan adalah kerugian nyata bagi yang mempercayainya (ADR-039 #4).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tentang',
  description:
    'StudentFo mengumpulkan lomba, beasiswa, magang, dan workshop untuk pelajar & mahasiswa Indonesia, lalu memeriksanya manual sebelum tayang. Gratis, tanpa menjual data.',
};

const FLOW = [
  { icon: Globe, title: 'Sumber publik', body: 'Pengumuman resmi dari kampus, lembaga, dan penyelenggara — atau dikirim langsung lewat formulir kiriman.' },
  { icon: ScanText, title: 'Dibaca otomatis', body: 'Judul, tenggat, jenjang, dan tautan resmi diekstrak lalu divalidasi. Yang janggal langsung ditahan.' },
  { icon: BadgeCheck, title: 'Ditinjau manusia', body: 'Moderator mencocokkan hasilnya dengan sumber asli. Tidak ada jalur otomatis yang bisa menayangkan kegiatan.' },
  { icon: CalendarClock, title: 'Tayang untukmu', body: 'Sisa hari dihitung ulang di setiap kunjungan dalam WIB, dan kegiatan yang lewat tenggat ditutup sendiri.' },
] as const;

const PRINCIPLES = [
  { icon: Gift, title: 'Gratis untuk pelajar', body: 'Cari, simpan, pengingat, papan pendaftaran, cari tim, dan koneksi — tanpa biaya dan tanpa iklan berbayar di daftar.' },
  { icon: Lock, title: 'Datamu bukan dagangan', body: 'Setiap akun hanya bisa membaca datanya sendiri di tingkat database. Profil jaringan tersembunyi sampai kamu memilih terlihat.' },
  { icon: FileSearch, title: 'Sumber selalu bisa dicek', body: 'Setiap kegiatan menautkan pengumuman aslinya. Kalau ada yang janggal, kamu bisa memastikannya sendiri sebelum membayar apa pun.' },
  { icon: Accessibility, title: 'Bisa dipakai siapa saja', body: 'Tetap jalan tanpa JavaScript, di layar 320px, dengan keyboard, dan dengan pembaca layar. Kontras warna diuji otomatis.' },
] as const;

const NOT_YET = [
  'StudentFo bukan penyelenggara. Kami tidak menerima pendaftaran atau pembayaran — tombol "Daftar" selalu membawamu ke situs resmi.',
  'Pengingat tenggat baru muncul di dalam aplikasi (lonceng notifikasi), belum lewat email atau WhatsApp.',
  'Cakupan sumber masih bertumbuh. Kalau tahu kegiatan yang belum ada, kirimkan — setiap kiriman tetap ditinjau manual.',
  'Kebijakan privasi masih berstatus draf sampai ditinjau bersama penasihat hukum.',
] as const;

const sectionClass = 'container-page max-w-[1120px] pt-[clamp(80px,11vw,128px)]';
const eyebrowClass = 'font-mono text-[13px] text-ink-muted';
const h2Class = 'text-[clamp(30px,4.6vw,42px)] font-bold leading-[1.08] tracking-[-0.035em]';
const delay = (ms: number) => ({ ['--reveal-delay' as string]: `${ms}ms` });

export default async function AboutPage() {
  const stats = await (await getEventRepository()).getStats();
  const numbers = [
    { value: stats.totalActive, label: 'kegiatan masih terbuka' },
    { value: stats.organizerCount, label: 'penyelenggara' },
    { value: stats.closingThisWeek, label: 'tutup dalam 7 hari' },
    { value: stats.addedThisWeek, label: 'baru minggu ini' },
  ];

  return (
    <div className="overflow-x-clip">
      <RevealObserver />

      <section className="container-page max-w-[1120px] pt-[clamp(48px,8vw,96px)]">
        <div className="enter flex max-w-[820px] flex-col gap-5 [animation-duration:900ms]">
          <span className={eyebrowClass}>Tentang StudentFo</span>
          <h1 className="text-[clamp(38px,6.4vw,68px)] leading-[1.02]">
            Peluang untuk pelajar tidak seharusnya tersebar di lima grup WhatsApp.
          </h1>
          <p className="max-w-[60ch] text-[17px] leading-relaxed text-ink-muted">
            Info lomba, beasiswa, dan magang biasanya datang terlambat, terpotong, atau tanpa sumber — dan yang palsu ikut beredar.
            StudentFo mengumpulkannya di satu tempat, memeriksa setiap kegiatan ke sumber aslinya, lalu menghitung sisa waktumu
            supaya tidak ada tenggat yang terlewat.
          </p>
        </div>

        <dl className="enter mt-12 grid overflow-hidden rounded-[20px] border border-line [animation-delay:150ms] [animation-duration:900ms] [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
          {numbers.map((item) => (
            <div key={item.label} className="flex flex-col-reverse gap-1.5 border-b border-r border-line p-6 last:border-r-0">
              <dt className="text-sm text-ink-muted">{item.label}</dt>
              <dd className="font-mono text-[44px] font-medium leading-none tracking-[-0.05em]">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12.5px] text-ink-muted">
          {dataMode === 'seed'
            ? 'Angka dari data contoh mode demo — bukan statistik produk sungguhan.'
            : 'Dihitung langsung dari katalog saat halaman ini dibuka.'}
        </p>
      </section>

      <section aria-labelledby="alur-title" className={sectionClass}>
        <div data-reveal="" className="flex max-w-[640px] flex-col gap-3.5">
          <span className={eyebrowClass}>Cara kerja</span>
          <h2 id="alur-title" className={h2Class}>
            Dari pengumuman sampai ke layarmu, ada satu manusia di tengahnya.
          </h2>
        </div>
        {/* Garis penghubung antar-langkah = motif "benang" yang sama dengan peta koneksi. */}
        <ol className="relative mt-12 grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
          <span aria-hidden className="absolute left-[19px] top-5 hidden h-px w-[calc(100%-38px)] bg-line-strong min-[980px]:block" />
          {FLOW.map((step, index) => (
            <li key={step.title} data-reveal="" style={delay(index * 160)} className="relative flex flex-col gap-3">
              <span className="relative z-[1] flex size-10 items-center justify-center rounded-pill border border-line-strong bg-canvas">
                <step.icon aria-hidden className="size-[18px]" />
              </span>
              <span className="font-mono text-[12px] text-ink-muted">0{index + 1}</span>
              <h3 className="text-[18px] font-semibold tracking-[-0.015em]">{step.title}</h3>
              <p className="text-[14.5px] leading-relaxed text-ink-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="prinsip-title" className={sectionClass}>
        <div data-reveal="" className="flex max-w-[640px] flex-col gap-3.5">
          <span className={eyebrowClass}>Prinsip</span>
          <h2 id="prinsip-title" className={h2Class}>
            Empat hal yang tidak kami tawar.
          </h2>
        </div>
        <ul className="mt-12 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr))]">
          {PRINCIPLES.map((item, index) => (
            <li key={item.title} data-reveal="" style={delay(index * 120)} className="flex flex-col gap-3 rounded-[18px] border border-line p-6">
              <span className="flex size-10 items-center justify-center rounded-card bg-panel-nested">
                <item.icon aria-hidden className="size-[18px]" />
              </span>
              <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{item.title}</h3>
              <p className="text-[14.5px] leading-relaxed text-ink-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="belum-title" className={sectionClass}>
        <div className="grid items-start gap-x-16 gap-y-8 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          <div data-reveal="" className="flex flex-col gap-3.5">
            <span className={eyebrowClass}>Terus terang</span>
            <h2 id="belum-title" className={h2Class}>
              Yang belum kami lakukan.
            </h2>
            <p className="max-w-[40ch] text-base leading-relaxed text-ink-muted">
              Lebih baik kamu tahu batasnya dari kami sekarang, daripada kecewa belakangan.
            </p>
          </div>
          <ul className="flex flex-col border-t border-line">
            {NOT_YET.map((item, index) => (
              <li key={item} data-reveal="left" style={delay(index * 140)} className="flex gap-4 border-b border-line py-5 text-[15px] leading-relaxed">
                <span className="font-mono text-[13px] text-ink-muted">0{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="mulai-title" className={sectionClass}>
        <div data-reveal="scale" className="flex flex-col gap-8 rounded-[24px] bg-inverse px-[clamp(24px,5vw,56px)] py-[clamp(36px,6vw,64px)] text-on-inverse">
          <h2 id="mulai-title" className="max-w-[18ch] text-[clamp(30px,4.6vw,44px)] font-bold leading-[1.06] tracking-[-0.035em] text-on-inverse">
            Mulai dari minatmu, lanjut dengan orang yang tepat.
          </h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))]">
            {[
              { href: '/events', label: 'Jelajahi kegiatan', hint: 'Lomba, beasiswa, magang, workshop' },
              { href: '/connections', label: 'Temukan koneksi', hint: 'Orang dengan minat yang sama' },
              { href: '/submit', label: 'Kirim kegiatan', hint: 'Untuk penyelenggara & komunitas' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex min-h-11 items-center justify-between gap-3 rounded-[14px] bg-inverse-nested px-5 py-4 transition-colors duration-200 ease-snap hover:bg-on-inverse hover:text-inverse"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{link.label}</span>
                  <span className="text-[13px] text-on-inverse-muted group-hover:text-inverse">{link.hint}</span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
          <p className="text-[13px] text-on-inverse-muted">
            Ingin tahu bagaimana datamu diperlakukan?{' '}
            <Link href="/privacy-policy" className="text-on-inverse underline underline-offset-[3px]">
              Baca kebijakan privasi
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
