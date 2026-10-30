import type { Metadata } from 'next';
import { Callout, ContactNote, InlineLink, LegalDocument, OperatorRef, termsStatus, type LegalSection } from '@/components/legal/legal-document';
import type { LegalDocumentStatus } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Syarat & Ketentuan',
  description:
    'Aturan memakai StudentFo: akun dan batas usia, peran StudentFo dan penyelenggara, pendaftaran dan pembayaran, konten pengguna, serta penyelesaian sengketa.',
};

const SUMMARY = [
  'StudentFo gratis untuk pelajar dan mahasiswa. Usia minimal 13 tahun; di bawah 18 tahun dengan izin orang tua atau wali.',
  'Kami mengumpulkan dan memeriksa info kegiatan, tetapi penyelenggaralah yang bertanggung jawab atas kegiatan, seleksi, hadiah, dan uang pendaftaran.',
  'StudentFo tidak pernah meminta kata sandi, kode OTP, atau transfer ke rekening StudentFo untuk pendaftaran acara.',
  'Akun yang menipu, melecehkan orang lain, atau memanen data pengguna akan kami tangguhkan.',
];

function sections(status: LegalDocumentStatus): readonly LegalSection[] {
  return [
    {
      title: 'Tentang ketentuan ini',
      body: (
        <>
          <p>
            Syarat &amp; Ketentuan ini adalah perjanjian antara kamu dan <OperatorRef status={status} /> yang mengatur pemakaian StudentFo.
            Dengan membuat akun atau memakai StudentFo, kamu menyetujui ketentuan ini beserta{' '}
            <InlineLink href="/privacy-policy">Kebijakan privasi</InlineLink> dan <InlineLink href="/cookie-policy">Kebijakan cookie</InlineLink>.
            Bila tidak setuju, jangan memakai StudentFo.
          </p>
          <p>
            Ketentuan ini dibuat dalam Bahasa Indonesia sesuai Undang-Undang Nomor 24 Tahun 2009. Bila kelak tersedia terjemahan, versi Bahasa
            Indonesia yang berlaku.
          </p>
        </>
      ),
    },
    {
      title: 'Layanan StudentFo',
      body: (
        <>
          <p>
            StudentFo mengumpulkan informasi lomba, beasiswa, magang, workshop, dan seminar untuk pelajar dan mahasiswa Indonesia dari sumber publik
            dan kiriman pengguna, lalu memeriksanya secara manual sebelum tayang. StudentFo juga menyediakan Papan lamaran, tim, pencocokan tim,
            koneksi, dan formulir pendaftaran untuk penyelenggara.
          </p>
          <ul>
            <li>
              <strong>StudentFo bukan penyelenggara kegiatan</strong> dan bukan pihak dalam seleksi, penjurian, pemberian beasiswa, atau penerimaan
              magang. Keputusan itu sepenuhnya milik penyelenggara.
            </li>
            <li>
              Lencana resmi (misalnya instansi pemerintah atau kampus) dan tanda <strong>penyelenggara terverifikasi</strong> diberikan moderator
              setelah memeriksa bukti. Keduanya menyatakan siapa di balik kegiatan, bukan jaminan mutu kegiatan.
            </li>
            <li>
              Kegiatan berlabel <strong>&ldquo;Promosi&rdquo;</strong> adalah penempatan berbayar dari penyelenggara. Promosi tidak memengaruhi
              pemeriksaan, lencana, atau skor rekomendasi.
            </li>
            <li>Fitur untuk peserta gratis. Bila kelak ada fitur berbayar, harganya diumumkan jelas sebelum kamu memilihnya.</li>
          </ul>
        </>
      ),
    },
    {
      title: 'Akun',
      body: (
        <ul>
          <li>
            Usia minimal 13 tahun. Bila kamu berusia 13–17 tahun, kamu wajib mendapat persetujuan orang tua atau wali sebelum membuat akun.
          </li>
          <li>Isi datamu dengan benar dan jangan membuat akun atas nama orang atau lembaga lain.</li>
          <li>
            Jaga kerahasiaan kata sandimu. Beri tahu kami segera bila akunmu dipakai orang lain. Kamu bertanggung jawab atas aktivitas di akunmu,
            kecuali yang terjadi karena kesalahan atau kelalaian kami.
          </li>
          <li>Akun bersifat pribadi dan tidak boleh dijual atau dipindahtangankan.</li>
        </ul>
      ),
    },
    {
      title: 'Yang tidak boleh dilakukan',
      body: (
        <>
          <p>Saat memakai StudentFo, kamu tidak boleh:</p>
          <ul>
            <li>
              mengunggah atau mengirim konten yang melanggar hukum, termasuk yang dilarang Undang-Undang Informasi dan Transaksi Elektronik:
              pornografi, perjudian, penghinaan atau pencemaran nama baik, ujaran kebencian berbasis SARA, berita bohong, dan pemerasan;
            </li>
            <li>mengirim kegiatan palsu, menyesatkan, atau yang memungut uang dengan cara menipu;</li>
            <li>meminta uang, kata sandi, kode OTP, atau data pribadi dari pengguna lain di luar alur resmi kegiatan;</li>
            <li>
              melecehkan, mengintimidasi, atau mengirim ajakan berulang yang tidak diinginkan, dan menghubungi pengguna di bawah umur dengan maksud
              yang tidak patut;
            </li>
            <li>menyamar sebagai orang, lembaga, atau penyelenggara lain;</li>
            <li>
              mengambil data secara otomatis (scraping, bot, crawler di luar yang diizinkan <InlineLink href="/robots.txt">robots.txt</InlineLink>),
              memanen profil pengguna, atau mengakali CAPTCHA dan pembatas laju;
            </li>
            <li>
              mengganggu, membebani, atau menguji keamanan sistem tanpa izin tertulis. Bila menemukan celah keamanan, laporkan kepada kami — kami
              tidak menindak pelapor yang beritikad baik.
            </li>
          </ul>
        </>
      ),
    },
    {
      title: 'Konten dan kiriman pengguna',
      body: (
        <>
          <p>
            Kiriman kegiatan, profil, portofolio, tim, pesan ajakan, dan isian formulir tetap milikmu. Kamu memberi kami izin non-eksklusif dan tanpa
            royalti untuk menyimpan, menampilkan, dan menyesuaikan format konten itu sejauh perlu untuk menjalankan StudentFo, selama konten itu
            masih tayang.
          </p>
          <p>
            Kamu menjamin berhak membagikan konten tersebut dan bahwa isinya benar. Kami dapat menolak, menurunkan, atau menyunting format konten
            yang melanggar ketentuan ini atau hukum, dan memberi tahu alasannya bila memungkinkan. Kiriman kegiatan selalu ditinjau moderator
            sebelum tayang.
          </p>
        </>
      ),
    },
    {
      title: 'Koneksi, tim, dan pencocokan tim',
      body: (
        <ul>
          <li>
            Profil di Koneksi dan kartu pemain tertutup sampai kamu membukanya. Dengan membukanya, kamu setuju terlihat oleh pengguna lain yang masuk
            seperti dijelaskan di Kebijakan privasi.
          </li>
          <li>Pakai fitur ini untuk mencari rekan belajar dan tim, bukan untuk berjualan, merekrut anggota skema berantai, atau mengumpulkan kontak.</li>
          <li>
            Kamu bisa memblokir siapa pun kapan saja — orang yang diblokir tidak bisa melihat atau menghubungimu — dan melaporkan perilaku yang
            melanggar lewat <strong>Laporkan</strong> di profilnya. Pelapor tidak pernah diberitahukan ke pihak yang dilaporkan.
          </li>
          <li>
            Kesepakatan di dalam tim — pembagian tugas, biaya, atau hadiah — adalah urusan anggota tim. Kami bisa membantu menindak penyalahgunaan
            fitur, tetapi bukan pihak dalam kesepakatan itu.
          </li>
        </ul>
      ),
    },
    {
      title: 'Pendaftaran acara dan pembayaran',
      body: (
        <>
          <ul>
            <li>
              Bila acara memakai situs penyelenggara, pendaftaranmu berlangsung di sana dan tunduk pada ketentuan penyelenggara.
            </li>
            <li>
              Bila acara memakai formulir StudentFo, jawabanmu dan — untuk acara berbayar — bukti transfermu dikirim ke penyelenggara acara itu.
            </li>
            <li>
              <strong>StudentFo tidak memegang, menampung, atau menyalurkan uang pendaftaran.</strong> Pembayaran langsung ke rekening yang
              dicantumkan penyelenggara, dan penyelenggara yang memverifikasinya. Pengembalian dana dan sengketa biaya diselesaikan dengan
              penyelenggara sesuai ketentuan mereka.
            </li>
            <li>
              Bila kamu menduga penipuan, berhenti membayar dan tekan <strong>Laporkan</strong> di halaman kegiatan. Kami dapat menurunkan kegiatan,
              mencabut status penyelenggara, dan meneruskan laporan ke pihak berwenang.
            </li>
          </ul>
          <Callout>
            Selalu cocokkan nomor rekening dengan pengumuman resmi penyelenggara yang ditautkan di halaman kegiatan. Jangan mentransfer ke rekening
            pribadi yang dikirim lewat pesan.
          </Callout>
        </>
      ),
    },
    {
      title: 'Ketentuan khusus penyelenggara',
      body: (
        <>
          <p>Bila kamu mengajukan diri sebagai penyelenggara atau mengelola acara di StudentFo, kamu juga menyetujui bahwa:</p>
          <ul>
            <li>kamu berwenang mewakili lembaga yang kamu sebut, dan bukti yang kamu kirim untuk verifikasi asli;</li>
            <li>
              informasi acara — tenggat, syarat, biaya, hadiah, rekening pembayaran — benar dan segera kamu perbarui bila berubah;
            </li>
            <li>kamu bertanggung jawab atas pelaksanaan acara, seleksi, pemberian hadiah atau manfaat, dan pengembalian dana;</li>
            <li>
              atas data pendaftar yang kamu terima, kamu adalah <strong>Pengendali Data Pribadi</strong> tersendiri menurut UU PDP: memakainya hanya
              untuk acara itu, menjaganya tetap aman, tidak menjual atau membagikannya, menghapusnya bila tidak lagi diperlukan, dan melayani
              permintaan pendaftar atas datanya;
            </li>
            <li>
              formulirmu hanya menanyakan yang benar-benar diperlukan, dan tidak pernah meminta kata sandi, PIN, kode OTP, nomor kartu, atau data
              pribadi spesifik (kesehatan, biometrik, genetika, catatan kejahatan) kecuali diwajibkan hukum;
            </li>
            <li>
              foto yang kamu unggah ke galeri milikmu atau sudah mendapat izin, dan orang yang dapat dikenali di dalamnya — terutama anak — sudah
              menyetujuinya.
            </li>
          </ul>
          <p>Pelanggaran dapat membuat acara diturunkan dan status penyelenggara dicabut.</p>
        </>
      ),
    },
    {
      title: 'Hak kekayaan intelektual',
      body: (
        <p>
          Nama, logo, desain, dan kode StudentFo milik kami. Informasi dan materi kegiatan milik penyelenggaranya. Kamu bebas membagikan tautan ke
          halaman StudentFo, tetapi tidak boleh menyalin isi situs dalam jumlah besar atau memakai merek StudentFo seolah-olah kami mendukung
          produkmu tanpa izin tertulis.
        </p>
      ),
    },
    {
      title: 'Penangguhan dan pengakhiran',
      body: (
        <ul>
          <li>Kamu bisa berhenti memakai StudentFo kapan saja dan menghapus akunmu sendiri dari Pengaturan → Hapus akun.</li>
          <li>
            Kami dapat menangguhkan atau menutup akun yang melanggar ketentuan ini. Akun yang ditangguhkan tidak bisa masuk dan tidak terlihat
            pengguna lain. Kami memberi tahu alasannya lewat email akunmu, lebih dulu bila memungkinkan — kecuali bila harus bertindak segera,
            misalnya penipuan, keselamatan anak, atau perintah hukum. Setiap tindakan tercatat dan bisa ditinjau ulang.
          </li>
          <li>Bila menurutmu penangguhan itu keliru, ajukan keberatan lewat kontak di bawah; kami meninjaunya ulang.</li>
        </ul>
      ),
    },
    {
      title: 'Tanggung jawab',
      body: (
        <>
          <p>
            Kami berupaya keras agar informasi di StudentFo akurat, tetapi informasi kegiatan berasal dari penyelenggara dan dapat berubah tanpa
            sepengetahuan kami. Periksa ulang ke sumber resmi yang ditautkan sebelum mendaftar atau membayar.
          </p>
          <p>
            Kami bertanggung jawab atas kerugian yang timbul karena kesalahan atau kelalaian kami dalam menjalankan StudentFo, sesuai peraturan
            perundang-undangan. Kami tidak bertanggung jawab atas tindakan penyelenggara, isi situs pihak lain, atau kesepakatan antarpengguna,
            sepanjang kerugian itu tidak disebabkan oleh kesalahan atau kelalaian kami.
          </p>
          <p>
            Tidak ada bagian ketentuan ini yang mengurangi hakmu sebagai konsumen menurut Undang-Undang Nomor 8 Tahun 1999 tentang Perlindungan
            Konsumen.
          </p>
        </>
      ),
    },
    {
      title: 'Keadaan kahar',
      body: (
        <p>
          Kami tidak dianggap lalai bila layanan terganggu karena keadaan di luar kendali wajar kami, seperti bencana alam, gangguan listrik atau
          jaringan berskala luas, gangguan penyedia infrastruktur, atau tindakan pemerintah. Kami akan memberi tahu dan memulihkan layanan secepatnya.
        </p>
      ),
    },
    {
      title: 'Perubahan ketentuan',
      body: (
        <p>
          Kami dapat mengubah ketentuan ini untuk mengikuti perkembangan layanan atau peraturan. Perubahan penting kami umumkan di dalam aplikasi
          paling lambat 14 hari sebelum berlaku, dan tidak berlaku surut. Bila tidak setuju dengan perubahan itu, kamu bisa berhenti memakai
          StudentFo dan meminta akunmu dihapus sebelum perubahan berlaku.
        </p>
      ),
    },
    {
      title: 'Hukum yang berlaku dan sengketa',
      body: (
        <p>
          Ketentuan ini tunduk pada hukum Republik Indonesia. Sengketa diselesaikan lebih dulu secara musyawarah: hubungi kami dan kami menanggapi
          dalam 14 hari kerja. Bila dalam 30 hari tidak tercapai kesepakatan, kamu dapat menempuh penyelesaian melalui Badan Penyelesaian Sengketa
          Konsumen atau pengadilan negeri yang berwenang, sesuai peraturan perundang-undangan.
        </p>
      ),
    },
    {
      title: 'Kontak',
      body: <ContactNote status={status} />,
    },
  ];
}

/**
 * Syarat & Ketentuan (ADR-060, P0 audit 2026-10-05). Ditulis menghindari
 * klausula baku yang batal demi hukum menurut UU 8/1999 Pasal 18: tidak ada
 * pengalihan tanggung jawab atas kesalahan kami sendiri, dan perubahan
 * diumumkan lebih dulu, tidak berlaku surut, dengan jalan keluar bagi yang
 * tidak setuju — bukan "terus memakai = setuju". Isi tetap draf sampai
 * pemilik meninjaunya bersama penasihat hukum (`termsStatus`).
 */
export default function TermsPage() {
  const status = termsStatus();
  return (
    <LegalDocument
      current="syarat"
      title="Syarat & Ketentuan"
      status={status}
      readMinutes={9}
      summary={SUMMARY}
      sections={sections(status)}
      prefix="sk-"
    />
  );
}
