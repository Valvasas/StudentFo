import type { Metadata } from 'next';
import { Callout, ContactNote, InlineLink, LegalDocument, OperatorRef, privacyStatus, type LegalSection } from '@/components/legal/legal-document';
import type { LegalDocumentStatus } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Kebijakan privasi',
  description:
    'Data apa yang diproses StudentFo, dasar dan tujuannya, siapa yang bisa melihatnya, berapa lama disimpan, dan hakmu menurut UU Pelindungan Data Pribadi.',
};

const SUMMARY = [
  'Kami tidak menjual datamu dan tidak memasang iklan atau pelacak pihak ketiga.',
  'Profilmu tersembunyi sampai kamu sendiri memilih terlihat — di Koneksi atau lewat kartu pemain.',
  'Data dirimu sampai ke penyelenggara hanya bila kamu mendaftar lewat formulir StudentFo mereka.',
  'Kamu bisa mengakses, memperbaiki, mengunduh, dan meminta penghapusan datamu; kami menindaklanjuti paling lambat 3 × 24 jam.',
];

function sections(status: LegalDocumentStatus): readonly LegalSection[] {
  return [
    {
      title: 'Siapa kami',
      body: (
        <>
          <p>
            Kebijakan ini menjelaskan cara <OperatorRef status={status} /> memproses data pribadimu sebagai Pengendali Data Pribadi
            menurut Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (&ldquo;UU PDP&rdquo;). Kebijakan ini berlaku untuk
            seluruh situs dan fitur StudentFo, dan dibaca bersama{' '}
            <InlineLink href="/terms">Syarat &amp; Ketentuan</InlineLink> serta <InlineLink href="/cookie-policy">Kebijakan cookie</InlineLink>.
          </p>
          <p>
            StudentFo menampilkan kegiatan milik penyelenggara lain. Situs penyelenggara yang kamu buka dari StudentFo tunduk pada kebijakan
            privasi mereka sendiri.
          </p>
        </>
      ),
    },
    {
      title: 'Data yang kami proses',
      body: (
        <>
          <p>Hanya yang dibutuhkan untuk menjalankan fitur yang kamu pakai. Kami tidak meminta NIK, foto KTP, nilai rapor/IPK, atau lokasi GPS.</p>
          <ul>
            <li>
              <strong>Akun:</strong> nama, email, kata sandi, jenis akun (peserta atau penyelenggara), serta catatan persetujuanmu atas dokumen
              ini dan pernyataan usiamu. Kata sandi disimpan dalam bentuk hash oleh layanan autentikasi — kami tidak pernah bisa membacanya. Bila
              kamu masuk dengan Google, Google mengirim nama, email, dan tautan foto profilmu; kami hanya memakai nama dan email.
            </li>
            <li>
              <strong>Profil:</strong> jenjang pendidikan, program studi, dan bidang minat yang kamu pilih.
            </li>
            <li>
              <strong>Aktivitas:</strong> kegiatan yang kamu simpan, status dan catatan di Papan lamaran, portofolio (hasil yang kamu laporkan
              sendiri, catatan, tautan bukti, dan pilihan tampil-tidaknya), serta tim yang kamu buat atau ikuti.
            </li>
            <li>
              <strong>Koneksi (bila kamu memakainya):</strong> pilihan terlihat di direktori, headline, ajakan terhubung beserta pesannya, daftar
              koneksi, dan orang yang kamu blokir.
            </li>
            <li>
              <strong>Kartu pemain (pencocokan tim, bila kamu membuatnya):</strong> nama kota (bukan alamat), keahlian yang kamu bawa dan cari,
              kesediaan kerja daring, kalimat pengantar, dan status kartu.
            </li>
            <li>
              <strong>Pendaftaran lewat formulir StudentFo:</strong> nama dan email akunmu, jawaban atas pertanyaan penyelenggara, kode dan status
              pendaftaran, dan — untuk acara berbayar — foto bukti transfer. Bukti transfer termasuk <em>data keuangan pribadi</em>, salah satu
              data pribadi yang bersifat spesifik (Pasal 4 UU PDP), jadi kami menyimpannya di penyimpanan privat dan membuang metadata fotonya
              (termasuk lokasi GPS) sebelum disimpan.
            </li>
            <li>
              <strong>Penyelenggara terverifikasi:</strong> nama lembaga, situs web, keterangan dan bukti yang kamu kirim untuk verifikasi, acara
              yang kamu kelola, dan foto galeri yang kamu unggah.
            </li>
            <li>
              <strong>Kiriman kegiatan:</strong> email pengirim dan isi formulir saat kamu mengusulkan kegiatan baru.
            </li>
            <li>
              <strong>Notifikasi:</strong> pengingat tenggat dan kabar tentang pendaftaran, kiriman, dan koneksimu. Bila kamu menyalakan
              pengingat tenggat lewat email, juga waktu persetujuanmu dan catatan email mana yang sudah terkirim.
            </li>
            <li>
              <strong>Laporan:</strong> alasan dan keterangan saat kamu melaporkan kegiatan atau pengguna lain.
            </li>
            <li>
              <strong>Status akun:</strong> bila akunmu ditangguhkan admin karena melanggar Syarat &amp; Ketentuan, waktu dan alasannya.
            </li>
            <li>
              <strong>Sinyal rekomendasi:</strong> catatan bahwa sebuah kegiatan disimpan atau tombol daftarnya diklik, beserta jenjang dan minatmu
              saat itu.
            </li>
            <li>
              <strong>Data teknis:</strong> (a) untuk membatasi percobaan masuk dan kiriman berlebihan, alamat IP diubah menjadi kode satu arah dan
              dibuang setelah satu hari; (b) untuk statistik kunjungan acara, kunjungan dihitung dengan kode harian satu arah dari alamat IP dan
              jenis peramban, yang dibuang keesokan harinya — penyelenggara hanya melihat angka total; (c) log akses standar penyedia hosting
              (alamat IP, waktu, halaman) untuk keamanan dan pemecahan masalah.
            </li>
          </ul>
          <Callout>
            Pertanyaan di formulir pendaftaran ditentukan penyelenggara. Isi hanya yang menurutmu wajar untuk kegiatan itu. StudentFo tidak pernah
            meminta kata sandi, PIN, atau kode OTP — laporkan formulir yang memintanya.
          </Callout>
        </>
      ),
    },
    {
      title: 'Dasar dan tujuan pemrosesan',
      body: (
        <>
          <p>Setiap pemrosesan punya dasar hukum menurut Pasal 20 UU PDP:</p>
          <ul>
            <li>
              <strong>Menjalankan perjanjian denganmu</strong> (Syarat &amp; Ketentuan): membuat dan mengelola akun, menyimpan kegiatan, Papan
              lamaran, tim, pendaftaran ke acara, notifikasi, dan menampilkan kegiatan yang cocok dengan jenjang dan minatmu.
            </li>
            <li>
              <strong>Persetujuanmu:</strong> fitur yang membuat dirimu terlihat orang lain (direktori Koneksi, kartu pemain, portofolio publik),
              masuk dengan Google, pengingat tenggat lewat email (mati sampai kamu menyalakannya di Pengaturan; setiap email memuat tautan
              berhenti), dan pemrosesan data pengguna berusia di bawah 18 tahun. Persetujuan bisa kamu tarik kapan saja tanpa
              memengaruhi pemrosesan sebelumnya.
            </li>
            <li>
              <strong>Kepentingan yang sah:</strong> keamanan dan pencegahan penyalahgunaan (pembatas laju, CAPTCHA, moderasi kiriman, verifikasi
              penyelenggara), statistik kunjungan agregat untuk penyelenggara, dan penyetelan urutan rekomendasi.
            </li>
            <li>
              <strong>Kewajiban hukum:</strong> menanggapi permintaan resmi aparat yang berwenang sesuai peraturan perundang-undangan.
            </li>
          </ul>
          <p>Kami tidak memakai datamu untuk iklan, tidak menjualnya, dan tidak membuat profil tentang dirimu untuk pihak lain.</p>
        </>
      ),
    },
    {
      title: 'Rekomendasi dan pencocokan otomatis',
      body: (
        <>
          <p>
            Urutan &ldquo;cocok untukmu&rdquo; dan skor kecocokan di pencocokan tim dihitung otomatis dari jenjang, minat, keahlian, kota, dan
            portofolio. Hasilnya hanya mengatur apa yang tampil lebih dulu: tidak menolak pendaftaranmu, tidak menentukan seleksi kegiatan apa pun,
            dan tidak menimbulkan akibat hukum. Kegiatan berlabel &ldquo;Promosi&rdquo; adalah iklan dan tidak mengubah skor.
          </p>
          <p>
            Kamu bisa mengosongkan minat, menutup kartu pemain, atau menyatakan keberatan atas keputusan yang diambil hanya berdasarkan pemrosesan
            otomatis (Pasal 10 UU PDP).
          </p>
        </>
      ),
    },
    {
      title: 'Siapa yang bisa melihat',
      body: (
        <>
          <ul>
            <li>
              <strong>Tamu yang belum masuk:</strong> tidak melihat nama pengguna mana pun. Yang tampil hanya nama lembaga penyelenggara.
            </li>
            <li>
              <strong>Anggota tim yang sama:</strong> nama dan peranmu di tim tersebut.
            </li>
            <li>
              <strong>Pengguna lain yang masuk, hanya bila kamu memilih terlihat:</strong> bila kamu membuka profil di Koneksi atau membuka kartu
              pemain, mereka bisa melihat profil publikmu (nama, headline, jurusan, jenjang, minat, portofolio publik) dan mengajakmu terhubung.
              Pengguna yang kartunya juga terbuka melihat isi kartu pemainmu di hasil pencocokan. Email tidak pernah ditampilkan. Orang yang kamu
              blokir tidak bisa melihat atau menghubungimu.
            </li>
            <li>
              <strong>Koneksi dan orang yang kamu ajak:</strong> nama, headline, dan pesan ajakanmu.
            </li>
            <li>
              <strong>Penyelenggara terverifikasi acara yang kamu daftari lewat formulir StudentFo:</strong> nama, email, jawaban formulir, status,
              dan bukti pembayaranmu untuk acara itu saja — tidak data akunmu yang lain. Penyelenggara bisa mengunduh daftar pendaftarnya, dan atas
              salinan itu ia menjadi pengendali data tersendiri yang wajib mematuhi UU PDP.
            </li>
            <li>
              <strong>Moderator dan admin StudentFo:</strong> kiriman kegiatan beserta email pengirimnya, pengajuan penyelenggara, laporan beserta
              nama pelapornya, dan — hanya bila diperlukan untuk menangani laporan, sengketa, atau penyalahgunaan — data pendaftaran. Pihak yang
              kamu laporkan tidak pernah diberi tahu siapa pelapornya.
            </li>
            <li>
              <strong>Aparat yang berwenang:</strong> hanya bila diwajibkan peraturan perundang-undangan.
            </li>
          </ul>
          <Callout>
            Bila acara tidak memakai formulir StudentFo, tombol &ldquo;Daftar sekarang&rdquo; membuka situs resmi penyelenggara. Apa pun yang kamu
            isi di sana tunduk pada kebijakan privasi penyelenggara tersebut. StudentFo tidak memegang uang pendaftaran: pembayaran langsung ke
            rekening penyelenggara.
          </Callout>
        </>
      ),
    },
    {
      title: 'Pemroses data dan transfer ke luar negeri',
      body: (
        <>
          <p>Kami memakai penyedia layanan yang memproses data atas nama kami, hanya untuk keperluan berikut:</p>
          <ul>
            <li>
              <strong>Supabase</strong> — basis data, autentikasi akun, dan penyimpanan berkas.
            </li>
            <li>
              <strong>Penyedia hosting aplikasi</strong> — server yang menjalankan situs ini.
            </li>
            <li>
              <strong>Cloudflare Turnstile</strong> — pemeriksa anti-bot di formulir daftar, lupa sandi, kirim ulang konfirmasi, dan kirim kegiatan.
              Ia memproses alamat IP dan sinyal perangkat untuk membedakan manusia dari bot.
            </li>
            <li>
              <strong>Penyedia pengiriman email</strong> — email konfirmasi akun dan atur ulang kata sandi.
            </li>
            <li>
              <strong>Resend</strong> — hanya bila kamu menyalakan pengingat tenggat lewat email: alamat email, namamu, dan judul serta tenggat
              kegiatan yang diingatkan.
            </li>
            <li>
              <strong>Google</strong> — hanya bila kamu memilih masuk dengan Google.
            </li>
          </ul>
          <p>
            Server penyedia tersebut dapat berada di luar wilayah Indonesia, misalnya di Singapura. Sesuai Pasal 56 UU PDP, kami hanya memakai
            penyedia yang menerapkan standar pelindungan data yang setara atau lebih tinggi dari UU PDP dan menyediakan perjanjian pemrosesan data.
            Dengan memakai StudentFo, kamu menyetujui transfer tersebut.
          </p>
        </>
      ),
    },
    {
      title: 'Cookie dan penyimpanan peramban',
      body: (
        <p>
          Kami hanya memakai cookie yang dibutuhkan agar kamu tetap masuk dan situs aman, plus penyimpanan peramban untuk mengingat pilihan tampilan.
          Tidak ada cookie iklan atau analitik pihak ketiga. Rinciannya — nama, tujuan, dan masa berlaku masing-masing — ada di{' '}
          <InlineLink href="/cookie-policy">Kebijakan cookie</InlineLink>.
        </p>
      ),
    },
    {
      title: 'Berapa lama disimpan',
      body: (
        <>
          <ul>
            <li>
              <strong>Akun, profil, aktivitas, koneksi, kartu pemain, dan pendaftaran:</strong> selama akunmu aktif. Saat akun dihapus, semuanya ikut
              terhapus, termasuk berkas bukti pembayaran. Foto galeri yang kamu unggah sebagai penyelenggara tetap menjadi bagian halaman acaranya.
            </li>
            <li>
              <strong>Notifikasi:</strong> yang sudah dibaca dihapus otomatis setelah 180 hari; semua notifikasi dihapus setelah 365 hari.
            </li>
            <li>
              <strong>Email pengirim kiriman kegiatan:</strong> dihapus otomatis 90 hari setelah moderator memutuskan kirimannya. Informasi
              kegiatannya tetap tersimpan sebagai arsip moderasi.
            </li>
            <li>
              <strong>Kode IP pembatas laju:</strong> dibuang setelah satu hari. <strong>Kode pengunjung harian:</strong> dibuang keesokan harinya;
              yang tersisa hanya angka total per acara.
            </li>
            <li>
              <strong>Tim yang kamu buat, laporan yang kamu kirim, dan sinyal rekomendasi:</strong> tetap ada setelah akunmu dihapus, tetapi
              tautannya ke akunmu diputus.
            </li>
            <li>
              <strong>Catatan tindakan moderasi</strong> (keputusan laporan, penangguhan, dan penghapusan akun oleh admin) disimpan sebagai jejak
              audit agar setiap tindakan bisa dipertanggungjawabkan. Catatan penghapusan tidak memuat namamu.
            </li>
            <li>
              <strong>Salinan cadangan basis data:</strong> data yang sudah dihapus bisa tertinggal di cadangan otomatis penyedia sampai cadangan itu
              tertimpa, dan tidak dipakai untuk keperluan lain.
            </li>
          </ul>
          <p>Salinan daftar pendaftar yang sudah diunduh penyelenggara tunduk pada kebijakan penyelenggara tersebut.</p>
        </>
      ),
    },
    {
      title: 'Hak kamu',
      body: (
        <>
          <p>Menurut Pasal 5–13 UU PDP, kamu berhak untuk:</p>
          <ul>
            <li>mendapat informasi tentang identitas kami, dasar, tujuan, dan cara kami memproses datamu — itulah isi kebijakan ini;</li>
            <li>
              melengkapi, memperbarui, dan memperbaiki datamu — sebagian besar bisa langsung dari <InlineLink href="/profile/details">Data diri</InlineLink>{' '}
              dan <InlineLink href="/profile/interests">Peminatan</InlineLink>;
            </li>
            <li>
              mengakses dan mendapat salinan datamu, serta menerimanya dalam format yang bisa dibaca mesin — unduh dari{' '}
              <InlineLink href="/profile/privacy">Privasi &amp; data</InlineLink>, atau minta salinan lengkap lewat kontak di bawah;
            </li>
            <li>
              mengakhiri pemrosesan dan menghapus akun beserta datanya — langsung dari{' '}
              <InlineLink href="/profile/settings#hapus-akun">Pengaturan → Hapus akun</InlineLink>, atau lewat kontak di bawah;
            </li>
            <li>menarik persetujuan — misalnya menutup kartu pemain atau menyembunyikan profilmu di Koneksi;</li>
            <li>menyatakan keberatan atas keputusan yang diambil hanya berdasarkan pemrosesan otomatis;</li>
            <li>meminta penundaan atau pembatasan pemrosesan;</li>
            <li>menggugat dan menerima ganti rugi atas pelanggaran pemrosesan data pribadimu.</li>
          </ul>
          <p>
            Kirim permintaanmu ke kontak di bagian terakhir, dari alamat email akunmu. Kami bisa meminta verifikasi identitas sebelum
            menindaklanjutinya, tanpa biaya, dan menanggapi paling lambat 3 × 24 jam sejak permintaan diterima. Sebagian hak dapat dibatasi bila
            diwajibkan peraturan (Pasal 15 UU PDP), misalnya data yang wajib disimpan untuk proses hukum — bila begitu, kami jelaskan alasannya.
          </p>
          <p>
            Bila tanggapan kami tidak memuaskan, kamu dapat mengadu ke lembaga penyelenggara pelindungan data pribadi sesuai UU PDP.
          </p>
        </>
      ),
    },
    {
      title: 'Keamanan dan kebocoran data',
      body: (
        <>
          <p>
            Semua lalu lintas memakai koneksi terenkripsi. Di basis data, setiap akun hanya bisa membaca dan mengubah datanya sendiri (row level
            security). Bukti pembayaran dan foto disimpan di penyimpanan privat yang hanya dibuka server setelah memeriksa hakmu. Mengganti kata
            sandi meminta kata sandi lama dan mengeluarkan sesi di perangkat lain.
          </p>
          <p>
            Tidak ada sistem yang kebal sepenuhnya. Bila terjadi kegagalan pelindungan data pribadi, kami memberi tahu kamu dan lembaga pelindungan
            data pribadi secara tertulis paling lambat 3 × 24 jam, berisi data apa yang terungkap, kapan dan bagaimana terjadinya, serta upaya
            penanganan dan pemulihannya (Pasal 46 UU PDP).
          </p>
        </>
      ),
    },
    {
      title: 'Pengguna di bawah 18 tahun',
      body: (
        <>
          <p>
            Banyak pengguna kami siswa SMP dan SMA/SMK. Sesuai Pasal 25 UU PDP dan Peraturan Pemerintah Nomor 17 Tahun 2025 tentang Tata Kelola
            Penyelenggaraan Sistem Elektronik dalam Pelindungan Anak:
          </p>
          <ul>
            <li>usia minimal untuk membuat akun adalah 13 tahun;</li>
            <li>
              pengguna berusia 13–17 tahun wajib mendapat persetujuan orang tua atau wali sebelum membuat akun, dan menyatakannya saat mendaftar;
            </li>
            <li>
              orang tua atau wali dapat menghubungi kami untuk melihat, memperbaiki, atau menghapus data anaknya, dan untuk menarik persetujuan;
            </li>
            <li>
              setiap akun mendapat pengaturan paling privat sejak awal: profil tersembunyi, kartu pemain tertutup, email tidak pernah ditampilkan,
              dan fitur blokir;
            </li>
            <li>akun yang ternyata dibuat anak di bawah 13 tahun, atau tanpa izin orang tua/wali, dapat kami tangguhkan dan hapus.</li>
          </ul>
          <p>Untuk acara berbayar, kami menyarankan pengguna di bawah 18 tahun mendaftar dan membayar bersama orang tua atau wali.</p>
        </>
      ),
    },
    {
      title: 'Perubahan kebijakan',
      body: (
        <p>
          Bila kebijakan ini berubah, tanggal di atas diperbarui. Perubahan penting — misalnya tujuan baru atau jenis data baru — kami umumkan di
          dalam aplikasi paling lambat 14 hari sebelum berlaku, dan bila perubahannya membutuhkan persetujuan baru, kami memintanya lebih dulu.
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
 * Kebijakan privasi (kanvas Kebijakan Privasi, ADR-060). Isinya ditulis dari
 * skema yang benar-benar ada (supabase/migrations) dan job retensi yang
 * benar-benar berjalan — kanvas menyebut NIK, IPK, dan dokumen di server,
 * yang tidak dilakukan aplikasi ini (ADR-039). Bila fitur baru memproses data
 * pribadi baru, bab "Data yang kami proses" dan `LEGAL_REVISION` ikut diubah.
 */
export default function PrivacyPolicyPage() {
  const status = privacyStatus();
  return (
    <LegalDocument
      current="privasi"
      title="Kebijakan privasi"
      status={status}
      readMinutes={9}
      summary={SUMMARY}
      sections={sections(status)}
      prefix="kp-"
      asideLink={{ href: '/profile/privacy', label: 'Atur privasi akunmu' }}
    />
  );
}
