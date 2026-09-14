import type { DeadlineLabel, EducationLevel, EventStatus, EventType } from '@/types/domain';

/**
 * DATA CONTOH — bukan event sungguhan.
 *
 * Semua penyelenggara, tautan, dan tanggal di bawah ini fiktif dan dipakai
 * hanya untuk mengembangkan & meninjau antarmuka tanpa perlu database.
 * Saat mode ini aktif, UI menampilkan penanda "Data contoh" secara eksplisit
 * (lihat DemoBanner) supaya tidak ada yang salah mengira ini informasi asli.
 * Begitu kredensial Supabase terpasang, berkas ini tidak pernah dieksekusi.
 *
 * Tenggat ditulis RELATIF terhadap hari ini supaya seluruh rentang urgensi
 * (aman / peringatan / mendesak / ditutup) selalu bisa dilihat di UI.
 */
export interface SeedEvent {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly organizer: string;
  readonly description: string;
  readonly eventType: EventType;
  readonly categorySlugs: readonly string[];
  readonly educationLevels: readonly EducationLevel[];
  readonly location: string | null;
  readonly isOnline: boolean;
  readonly status: EventStatus;
  readonly savedCount: number;
  readonly createdDaysAgo: number;
  readonly deadlines: readonly { label: DeadlineLabel; inDays: number; isPrimary: boolean }[];
}

export const SEED_EVENTS: readonly SeedEvent[] = [
  {
    id: 'e1000000-0000-4000-8000-000000000001',
    slug: 'kompetisi-inovasi-perangkat-lunak-nusantara-2026',
    title: 'Kompetisi Inovasi Perangkat Lunak Nusantara 2026',
    organizer: 'Universitas Nusantara Digital',
    description:
      'Kompetisi pengembangan perangkat lunak tingkat nasional dengan tema "Teknologi untuk Ketahanan Pangan". Peserta membentuk tim 3-5 orang dan membangun purwarupa fungsional selama fase inkubasi enam minggu. Tim finalis mendapat pendampingan mentor industri sebelum demo day.',
    eventType: 'LOMBA',
    categorySlugs: ['teknologi', 'sains'],
    educationLevels: ['D3', 'D4_S1'],
    location: 'Bandung',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 412,
    createdDaysAgo: 2,
    deadlines: [
      { label: 'registration', inDays: 2, isPrimary: true },
      { label: 'submission', inDays: 24, isPrimary: false },
      { label: 'final', inDays: 52, isPrimary: false },
    ],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000002',
    slug: 'beasiswa-unggulan-bakti-pendidikan-2026',
    title: 'Beasiswa Unggulan Bakti Pendidikan 2026',
    organizer: 'Yayasan Bakti Pendidikan Indonesia',
    description:
      'Beasiswa penuh untuk jenjang S1 dan S2 mencakup biaya kuliah, tunjangan hidup bulanan, dan biaya penelitian akhir. Penerima wajib mengikuti program pengabdian masyarakat 80 jam per tahun.',
    eventType: 'BEASISWA',
    categorySlugs: ['pendidikan', 'sosial'],
    educationLevels: ['D4_S1', 'S2'],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 1284,
    createdDaysAgo: 5,
    deadlines: [
      { label: 'registration', inDays: 5, isPrimary: true },
      { label: 'announcement', inDays: 45, isPrimary: false },
    ],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000003',
    slug: 'program-magang-analis-data-kuartal-ii',
    title: 'Program Magang Analis Data — Kuartal II',
    organizer: 'PT Data Rekacipta Mandiri',
    description:
      'Magang bersertifikat enam bulan di tim data platform. Kandidat akan menangani pipeline ETL, membangun dasbor internal, dan menulis laporan analisis untuk tim produk. Tersedia uang saku dan konversi SKS.',
    eventType: 'MAGANG',
    categorySlugs: ['teknologi', 'bisnis'],
    educationLevels: ['D4_S1'],
    location: 'Jakarta Selatan',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 738,
    createdDaysAgo: 1,
    deadlines: [{ label: 'registration', inDays: 12, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000004',
    slug: 'workshop-riset-kualitatif-untuk-mahasiswa-tingkat-akhir',
    title: 'Workshop Riset Kualitatif untuk Mahasiswa Tingkat Akhir',
    organizer: 'Lembaga Kajian Sosial Wanabakti',
    description:
      'Lokakarya dua hari tentang perancangan penelitian kualitatif: penyusunan pertanyaan riset, teknik wawancara mendalam, dan pengodean tematik. Peserta membawa draf proposal masing-masing untuk ditinjau langsung.',
    eventType: 'WORKSHOP',
    categorySlugs: ['sosial', 'pendidikan'],
    educationLevels: ['D4_S1', 'S2'],
    location: 'Yogyakarta',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 96,
    createdDaysAgo: 3,
    deadlines: [{ label: 'registration', inDays: 6, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000005',
    slug: 'lomba-karya-tulis-ilmiah-energi-terbarukan',
    title: 'Lomba Karya Tulis Ilmiah Energi Terbarukan',
    organizer: 'Himpunan Mahasiswa Teknik Lingkungan Nusantara',
    description:
      'Kompetisi karya tulis ilmiah bertema transisi energi di daerah kepulauan. Naskah maksimal 15 halaman, dikirim dalam format PDF beserta lembar orisinalitas bermeterai.',
    eventType: 'LOMBA',
    categorySlugs: ['karya-tulis', 'sains'],
    educationLevels: ['SMA_SMK', 'D3', 'D4_S1'],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 203,
    createdDaysAgo: 8,
    deadlines: [
      { label: 'submission', inDays: 19, isPrimary: true },
      { label: 'announcement', inDays: 34, isPrimary: false },
    ],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000006',
    slug: 'kompetisi-debat-bahasa-indonesia-antar-sma',
    title: 'Kompetisi Debat Bahasa Indonesia Antar-SMA',
    organizer: 'Forum Literasi Pelajar Nusantara',
    description:
      'Turnamen debat format Asian Parliamentary untuk pelajar SMA/SMK sederajat. Mosi diumumkan 30 menit sebelum setiap babak. Tim terdiri atas tiga pembicara dan satu cadangan.',
    eventType: 'LOMBA',
    categorySlugs: ['debat', 'pendidikan'],
    educationLevels: ['SMA_SMK'],
    location: 'Surabaya',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 157,
    createdDaysAgo: 6,
    deadlines: [{ label: 'registration', inDays: 1, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000007',
    slug: 'pelatihan-desain-antarmuka-berbasis-riset',
    title: 'Pelatihan Desain Antarmuka Berbasis Riset',
    organizer: 'Studio Rupa Kolektif',
    description:
      'Kelas intensif empat pekan: riset pengguna, penyusunan arsitektur informasi, purwarupa interaktif, dan uji kegunaan. Setiap peserta menyelesaikan satu studi kasus untuk portofolio.',
    eventType: 'PELATIHAN',
    categorySlugs: ['desain', 'teknologi'],
    educationLevels: ['SMA_SMK', 'D3', 'D4_S1', 'UMUM'],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 521,
    createdDaysAgo: 4,
    deadlines: [{ label: 'registration', inDays: 9, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000008',
    slug: 'konferensi-mahasiswa-kesehatan-masyarakat-2026',
    title: 'Konferensi Mahasiswa Kesehatan Masyarakat 2026',
    organizer: 'Konsorsium Kesehatan Masyarakat Antar-Kampus',
    description:
      'Konferensi tahunan dengan jalur presentasi oral dan poster. Abstrak yang lolos akan diterbitkan dalam prosiding ber-ISBN. Tersedia sesi pendampingan penulisan abstrak bagi peserta pemula.',
    eventType: 'KONFERENSI',
    categorySlugs: ['kesehatan', 'sains'],
    educationLevels: ['D4_S1', 'S2', 'S3'],
    location: 'Makassar',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 88,
    createdDaysAgo: 11,
    deadlines: [
      { label: 'submission', inDays: 27, isPrimary: true },
      { label: 'final', inDays: 61, isPrimary: false },
    ],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000009',
    slug: 'program-relawan-literasi-desa-angkatan-7',
    title: 'Program Relawan Literasi Desa Angkatan 7',
    organizer: 'Gerakan Pustaka Bergerak Nusantara',
    description:
      'Penempatan relawan selama delapan pekan di taman baca masyarakat. Relawan mendampingi kegiatan membaca anak dan menyusun laporan dampak sederhana. Akomodasi dan transportasi ditanggung penyelenggara.',
    eventType: 'VOLUNTEER',
    categorySlugs: ['sosial', 'pendidikan'],
    educationLevels: ['D3', 'D4_S1', 'UMUM'],
    location: 'Nusa Tenggara Timur',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 174,
    createdDaysAgo: 9,
    deadlines: [{ label: 'registration', inDays: 16, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000010',
    slug: 'beasiswa-riset-tugas-akhir-sains-terapan',
    title: 'Beasiswa Riset Tugas Akhir Sains Terapan',
    organizer: 'Pusat Riset Terapan Wanabakti',
    description:
      'Bantuan dana penelitian untuk mahasiswa tingkat akhir yang mengerjakan topik sains terapan. Mencakup biaya bahan laboratorium, publikasi, dan pendampingan metodologi.',
    eventType: 'BEASISWA',
    categorySlugs: ['sains', 'pendidikan'],
    educationLevels: ['D4_S1', 'S2'],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 342,
    createdDaysAgo: 14,
    deadlines: [{ label: 'registration', inDays: 4, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000011',
    slug: 'kompetisi-rencana-bisnis-sosial-kampus',
    title: 'Kompetisi Rencana Bisnis Sosial Kampus',
    organizer: 'Inkubator Kewirausahaan Nusantara',
    description:
      'Kompetisi rencana bisnis untuk usaha berdampak sosial. Tim finalis mendapat modal awal, ruang kerja bersama selama enam bulan, dan pendampingan legal pendirian badan usaha.',
    eventType: 'LOMBA',
    categorySlugs: ['bisnis', 'sosial'],
    educationLevels: ['D3', 'D4_S1', 'S2'],
    location: 'Semarang',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 265,
    createdDaysAgo: 7,
    deadlines: [
      { label: 'registration', inDays: 31, isPrimary: true },
      { label: 'final', inDays: 74, isPrimary: false },
    ],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000012',
    slug: 'workshop-analisis-data-dengan-python-untuk-pemula',
    title: 'Workshop Analisis Data dengan Python untuk Pemula',
    organizer: 'Komunitas Data Terbuka Nusantara',
    description:
      'Lokakarya daring tiga sesi: dasar Python, pembersihan data tabular, dan visualisasi. Tidak dibutuhkan pengalaman pemrograman sebelumnya. Materi dan rekaman diberikan ke seluruh peserta.',
    eventType: 'WORKSHOP',
    categorySlugs: ['teknologi', 'sains'],
    educationLevels: ['SMA_SMK', 'D3', 'D4_S1', 'UMUM'],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 619,
    createdDaysAgo: 1,
    deadlines: [{ label: 'registration', inDays: 7, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000013',
    slug: 'festival-film-pendek-pelajar-nusantara',
    title: 'Festival Film Pendek Pelajar Nusantara',
    organizer: 'Sanggar Sinema Pelajar',
    description:
      'Kompetisi film pendek berdurasi maksimal 12 menit dengan tema kearifan lokal. Karya dinilai oleh juri praktisi sinema dan diputar dalam rangkaian pemutaran keliling di enam kota.',
    eventType: 'LOMBA',
    categorySlugs: ['seni', 'desain'],
    educationLevels: ['SMA_SMK', 'D3', 'D4_S1'],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 141,
    createdDaysAgo: 16,
    deadlines: [{ label: 'submission', inDays: 40, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000014',
    slug: 'magang-hukum-bantuan-hukum-masyarakat',
    title: 'Magang Hukum — Divisi Bantuan Hukum Masyarakat',
    organizer: 'Lembaga Bantuan Hukum Wanabakti',
    description:
      'Magang tiga bulan mendampingi penanganan perkara bantuan hukum cuma-cuma. Peserta menyusun ringkasan perkara, menghadiri sidang sebagai pengamat, dan mengikuti kelas praktik beracara.',
    eventType: 'MAGANG',
    categorySlugs: ['hukum', 'sosial'],
    educationLevels: ['D4_S1'],
    location: 'Jakarta Pusat',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 112,
    createdDaysAgo: 12,
    deadlines: [{ label: 'registration', inDays: 21, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000015',
    slug: 'kejuaraan-panahan-antar-perguruan-tinggi',
    title: 'Kejuaraan Panahan Antar-Perguruan Tinggi',
    organizer: 'Unit Kegiatan Olahraga Nusantara',
    description:
      'Kejuaraan panahan kategori recurve dan compound, nomor perorangan dan beregu. Peserta wajib menyertakan surat keterangan aktif kuliah dan hasil pemeriksaan kesehatan.',
    eventType: 'LOMBA',
    categorySlugs: ['olahraga'],
    educationLevels: ['D3', 'D4_S1', 'S2'],
    location: 'Malang',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 47,
    createdDaysAgo: 20,
    deadlines: [{ label: 'registration', inDays: -3, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000016',
    slug: 'pelatihan-kepemimpinan-organisasi-mahasiswa',
    title: 'Pelatihan Kepemimpinan Organisasi Mahasiswa',
    organizer: 'Pusat Pengembangan Kepemimpinan Kampus',
    description:
      'Pelatihan tatap muka tiga hari tentang manajemen organisasi, penyusunan program kerja, dan penanganan konflik tim. Peserta mendapat sertifikat dan akses jejaring alumni program.',
    eventType: 'PELATIHAN',
    categorySlugs: ['pendidikan', 'sosial'],
    educationLevels: ['D3', 'D4_S1'],
    location: 'Bogor',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 73,
    createdDaysAgo: 10,
    deadlines: [{ label: 'registration', inDays: 13, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000017',
    slug: 'olimpiade-matematika-pelajar-tingkat-nasional',
    title: 'Olimpiade Matematika Pelajar Tingkat Nasional',
    organizer: 'Perhimpunan Guru Matematika Nusantara',
    description:
      'Olimpiade dua tahap: penyisihan daring dan final tatap muka. Materi mencakup aljabar, teori bilangan, kombinatorika, dan geometri setara silabus olimpiade nasional.',
    eventType: 'LOMBA',
    categorySlugs: ['sains', 'pendidikan'],
    educationLevels: ['SMA_SMK'],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 389,
    createdDaysAgo: 3,
    deadlines: [
      { label: 'registration', inDays: 8, isPrimary: true },
      { label: 'final', inDays: 48, isPrimary: false },
    ],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000018',
    slug: 'beasiswa-pendidikan-vokasi-industri-kreatif',
    title: 'Beasiswa Pendidikan Vokasi Industri Kreatif',
    organizer: 'Yayasan Karya Cipta Nusantara',
    description:
      'Beasiswa parsial untuk mahasiswa vokasi bidang industri kreatif, mencakup biaya kuliah satu tahun dan bantuan peralatan produksi. Seleksi berbasis portofolio karya.',
    eventType: 'BEASISWA',
    categorySlugs: ['desain', 'seni'],
    educationLevels: ['D3', 'D4_S1'],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 226,
    createdDaysAgo: 18,
    deadlines: [{ label: 'registration', inDays: -10, isPrimary: true }],
  },
  // --- Antrean moderasi: tampil di /admin, tidak tampil ke publik (§7) ---
  {
    id: 'e1000000-0000-4000-8000-000000000019',
    slug: 'seminar-nasional-teknologi-pangan-menunggu-review',
    title: 'Seminar Nasional Teknologi Pangan',
    organizer: 'Fakultas Teknologi Pertanian Nusantara',
    description:
      'Hasil ekstraksi otomatis dari sumber pihak ketiga. Tenggat dan tautan pendaftaran belum diverifikasi manusia.',
    eventType: 'KONFERENSI',
    categorySlugs: ['sains'],
    educationLevels: ['D4_S1', 'S2'],
    location: 'Denpasar',
    isOnline: false,
    status: 'PENDING',
    savedCount: 0,
    createdDaysAgo: 0,
    deadlines: [{ label: 'registration', inDays: 25, isPrimary: true }],
  },
  {
    id: 'e1000000-0000-4000-8000-000000000020',
    slug: 'lomba-poster-kesehatan-remaja-menunggu-review',
    title: 'Lomba Poster Kesehatan Remaja',
    organizer: 'Komunitas Sehat Remaja Nusantara',
    description:
      'Hasil ekstraksi otomatis dari sumber pihak ketiga. Perlu pengecekan duplikasi dengan entri sejenis bulan lalu.',
    eventType: 'LOMBA',
    categorySlugs: ['kesehatan', 'desain'],
    educationLevels: ['SMA_SMK'],
    location: null,
    isOnline: true,
    status: 'PENDING',
    savedCount: 0,
    createdDaysAgo: 0,
    deadlines: [{ label: 'submission', inDays: 18, isPrimary: true }],
  },
] as const;

export const SEED_CATEGORIES = [
  { id: 'c1', name: 'Teknologi & IT', slug: 'teknologi' },
  { id: 'c2', name: 'Bisnis & Kewirausahaan', slug: 'bisnis' },
  { id: 'c3', name: 'Sains & Riset', slug: 'sains' },
  { id: 'c4', name: 'Desain & Kreatif', slug: 'desain' },
  { id: 'c5', name: 'Karya Tulis & Esai', slug: 'karya-tulis' },
  { id: 'c6', name: 'Debat & Public Speaking', slug: 'debat' },
  { id: 'c7', name: 'Seni & Budaya', slug: 'seni' },
  { id: 'c8', name: 'Olahraga', slug: 'olahraga' },
  { id: 'c9', name: 'Kesehatan & Kedokteran', slug: 'kesehatan' },
  { id: 'c10', name: 'Sosial & Lingkungan', slug: 'sosial' },
  { id: 'c11', name: 'Pendidikan & Keguruan', slug: 'pendidikan' },
  { id: 'c12', name: 'Hukum & Politik', slug: 'hukum' },
] as const;
