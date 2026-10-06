import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Check } from 'lucide-react';
import { TocSpy } from '@/components/legal/toc-spy';

export const metadata: Metadata = {
  title: 'Kebijakan privasi',
  description: 'Data apa yang disimpan StudentFo, untuk apa, siapa yang bisa melihatnya, dan hakmu atas data itu.',
};

const SUMMARY = [
  'Kami tidak menjual datamu dan tidak memasang iklan atau pelacak pihak ketiga.',
  'Data pendaftaran hanya dibagikan ke penyelenggara saat kamu mendaftar langsung di StudentFo dan menyetujuinya di formulir. Selain itu, pendaftaran terjadi di situs penyelenggara.',
  'Anggota timmu hanya melihat nama dan peranmu. Tamu yang belum masuk tidak melihat nama siapa pun.',
  'Kamu bisa melihat dan memperbaiki datamu kapan saja dari halaman akun.',
];

const SECTIONS: readonly { title: string; body: ReactNode }[] = [
  {
    title: 'Data yang kami simpan',
    body: (
      <>
        <p>Hanya yang dibutuhkan untuk menampilkan kegiatan yang cocok dan membantumu melacak pendaftaran.</p>
        <ul>
          <li>
            <strong>Akun:</strong> nama, email, dan kata sandi. Kata sandi disimpan dalam bentuk hash oleh layanan autentikasi — kami tidak pernah bisa
            membacanya. Bila kamu masuk dengan Google, kami menerima nama dan email dari Google.
          </li>
          <li>
            <strong>Profil:</strong> jenjang pendidikan, program studi, dan bidang minat yang kamu pilih.
          </li>
          <li>
            <strong>Aktivitas:</strong> kegiatan yang kamu simpan, status yang kamu catat di Pendaftaran, dan tim yang kamu buat atau ikuti.
          </li>
          <li>
            <strong>Pendaftaran langsung:</strong> untuk kegiatan bertanda &ldquo;Daftar di StudentFo&rdquo; — nomor WhatsApp, institusi, jurusan,
            jenjang, jawabanmu atas pertanyaan penyelenggara, tim yang kamu daftarkan, kode tiket, status, dan waktu persetujuanmu. Nama dan
            email disalin dari akunmu saat mendaftar.
          </li>
          <li>
            <strong>Kiriman kegiatan:</strong> email pengirim dan isi formulir saat kamu mengusulkan kegiatan baru.
          </li>
          <li>
            <strong>Sinyal rekomendasi:</strong> catatan bahwa sebuah kegiatan disimpan atau tombol daftarnya diklik, dipakai untuk mengurutkan
            rekomendasi.
          </li>
          <li>
            <strong>Data teknis:</strong> penanda sementara untuk membatasi percobaan masuk dan kiriman yang berlebihan.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: 'Cara kami memakai data',
    body: (
      <p>
        Jenjang dan minatmu dipakai untuk mengurutkan dan menandai kegiatan yang cocok. Kegiatan yang kamu simpan dipakai untuk pengingat tenggat di
        dalam aplikasi. Data pendaftaran langsung dipakai penyelenggara untuk memproses pendaftaranmu, dan kami memakainya untuk mengabarimu
        perubahan status. Kiriman kegiatan dibaca moderator sebelum tayang. Kami tidak memakai datamu untuk iklan.
      </p>
    ),
  },
  {
    title: 'Siapa yang bisa melihat',
    body: (
      <>
        <ul>
          <li>
            <strong>Anggota tim yang sama:</strong> nama dan peranmu di tim tersebut.
          </li>
          <li>
            <strong>Penyelenggara terverifikasi kegiatan yang kamu daftari langsung:</strong> seluruh data pendaftaranmu untuk kegiatan itu
            (termasuk nama, email, dan nomor WhatsApp), setelah kamu menyetujuinya di formulir. Mereka bisa mengunduhnya (CSV) untuk keperluan
            kegiatan tersebut. Penyelenggara kegiatan lain tidak bisa melihatnya.
          </li>
          <li>
            <strong>Moderator:</strong> kiriman kegiatan beserta email pengirimnya, untuk verifikasi.
          </li>
          <li>
            <strong>Penyedia infrastruktur:</strong> basis data dan autentikasi dijalankan di Supabase, yang memproses data atas nama kami.
          </li>
        </ul>
        <Callout>
          Tombol &ldquo;Daftar sekarang&rdquo; dan &ldquo;lewat situs penyelenggara&rdquo; membuka situs resmi penyelenggara. Apa pun yang kamu
          isi di sana tunduk pada kebijakan privasi penyelenggara tersebut, bukan kebijakan ini. Formulir di StudentFo tidak pernah meminta kata
          sandi, OTP, NIK, atau nomor rekening — laporkan bila ada yang memintanya.
        </Callout>
      </>
    ),
  },
  {
    title: 'Data di peramban',
    body: (
      <p>
        Pilihan tema tersimpan di peramban (localStorage). Di mode data contoh, fitur yang belum punya penyimpanan server — profil publik, dokumen,
        pesan, catatan persiapan — hanya tersimpan di peramban perangkatmu dan bisa dihapus dari Pengaturan. Nama berkas dokumen dicatat, isinya tidak
        pernah dibaca atau dikirim. Isian formulir pendaftaran yang belum terkirim disimpan sementara di tab peramban itu saja (sessionStorage) dan
        hilang saat tab ditutup atau tiketmu terbit.
      </p>
    ),
  },
  {
    title: 'Berapa lama disimpan',
    body: (
      <p>
        Data akun disimpan selama akunmu aktif. Saat akun dihapus, profil, kegiatan tersimpan, catatan pendaftaran, keanggotaan tim, dan
        notifikasimu ikut terhapus — begitu pula pendaftaran langsungmu. Salinan yang sudah diunduh penyelenggara berada di tangan mereka; minta
        penghapusannya langsung ke penyelenggara. Tim yang kamu buat dan sinyal rekomendasi tetap ada tanpa tautan ke akunmu. Email di kiriman
        kegiatan tetap tersimpan sebagai arsip moderasi.
      </p>
    ),
  },
  {
    title: 'Hak kamu',
    body: (
      <>
        <p>Sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi, kamu berhak untuk:</p>
        <ul>
          <li>mengakses dan mendapatkan salinan datamu,</li>
          <li>memperbaiki data yang keliru — sebagian besar bisa langsung dari halaman Data diri dan Peminatan,</li>
          <li>menarik persetujuan dan meminta penghapusan akun beserta datanya.</li>
        </ul>
      </>
    ),
  },
  {
    title: 'Keamanan',
    body: (
      <p>
        Semua lalu lintas memakai koneksi terenkripsi. Di basis data, setiap akun hanya bisa membaca dan mengubah datanya sendiri (row level
        security). Mengganti kata sandi meminta kata sandi lama dan mengeluarkan sesi di perangkat lain.
      </p>
    ),
  },
  {
    title: 'Pengguna di bawah 18 tahun',
    body: (
      <p>
        Banyak pengguna kami siswa SMA/SMK. Bila kamu belum berusia 18 tahun, mintalah persetujuan orang tua atau wali sebelum membuat akun, sesuai
        ketentuan pelindungan data pribadi anak.
      </p>
    ),
  },
  {
    title: 'Perubahan & kontak',
    body: (
      <>
        <p>Bila kebijakan ini berubah, tanggal berlaku di atas diperbarui dan perubahan penting diumumkan di dalam aplikasi.</p>
        <Callout>
          Draf ini belum mencantumkan alamat kontak resmi pengelola data. Pengelola wajib melengkapinya dan meninjau isi kebijakan ini bersama
          penasihat hukum sebelum rilis publik.
        </Callout>
      </>
    ),
  },
];

function Callout({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-3 rounded-card border border-line bg-panel-nested px-4 py-3.5 text-[14.5px] leading-relaxed">
      <AlertTriangle aria-hidden className="mt-0.5 size-[18px] shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Kebijakan privasi (kanvas Kebijakan Privasi). Tata letak dari kanvas;
 * isinya ditulis ulang dari skema yang benar-benar ada (supabase/migrations)
 * — kanvas menyebut NIK, IPK, dokumen di server, dan penerusan data ke
 * penyelenggara, yang tidak dilakukan aplikasi ini (ADR-039).
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="container-page pb-20 pt-12">
      <header className="enter flex max-w-[720px] flex-col gap-3 [animation-duration:900ms]">
        <span className="font-mono text-xs tracking-[.08em] text-ink-muted">DOKUMEN · DRAF</span>
        <h1 className="text-[clamp(36px,6vw,56px)] leading-[1.02]">Kebijakan privasi</h1>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-ink-muted">
          <span>Draf 26 September 2026</span>
          <span aria-hidden>·</span>
          <span>Waktu baca sekitar 4 menit</span>
        </p>
      </header>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-[92px]">
          <nav id="daftar-isi" aria-labelledby="daftar-isi-title" className="flex flex-col gap-1">
            <h2 id="daftar-isi-title" className="mb-2 font-mono text-[11.5px] font-normal tracking-[.08em] text-ink-muted">
              DAFTAR ISI
            </h2>
            <ol className="flex flex-col gap-0.5">
              {SECTIONS.map((section, index) => (
                <li key={section.title}>
                  <a
                    href={`#kp-${index + 1}`}
                    className="flex min-h-11 items-center gap-2.5 rounded-sm px-2.5 text-[14px] text-ink-muted transition-colors duration-150 hover:bg-panel-nested hover:text-ink aria-[current]:bg-panel-nested aria-[current]:font-semibold aria-[current]:text-ink lg:min-h-9"
                  >
                    <span className="w-4 font-mono text-xs">{index + 1}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
            <Link
              href="/profile/privacy"
              className="mt-4 flex min-h-11 items-center gap-1.5 self-start px-2.5 text-[13.5px] font-semibold underline underline-offset-[3px]"
            >
              Atur privasi akunmu <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </nav>
          <TocSpy navId="daftar-isi" prefix="kp-" count={SECTIONS.length} />
        </aside>

        <article className="flex max-w-[68ch] flex-col gap-12">
          <section aria-labelledby="ringkas-title" className="enter rounded-[18px] bg-inverse p-6 text-on-inverse [animation-delay:120ms] [animation-duration:900ms] sm:p-7">
            <h2 id="ringkas-title" className="mb-4 text-lg font-semibold text-on-inverse">
              Versi singkat
            </h2>
            <ul className="flex flex-col gap-3">
              {SUMMARY.map((item) => (
                <li key={item} className="flex gap-3 text-[15px] leading-snug">
                  <span aria-hidden className="mt-px flex size-5 shrink-0 items-center justify-center rounded-pill bg-on-inverse text-inverse">
                    <Check className="size-3" strokeWidth={2.6} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {SECTIONS.map((section, index) => (
            <section
              key={section.title}
              id={`kp-${index + 1}`}
              aria-labelledby={`kp-${index + 1}-title`}
              className="flex scroll-mt-24 flex-col gap-4 text-[15.5px] leading-[1.7] text-ink-soft [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5"
            >
              <h2 id={`kp-${index + 1}-title`} className="text-[22px] font-bold leading-tight tracking-[-0.025em] text-ink">
                {index + 1}. {section.title}
              </h2>
              {section.body}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
