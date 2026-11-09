/**
 * Bidang peminatan spesifik (ADR-075). Kategori (`users.interests`, tabel
 * `categories`) tetap jadi pengelompok & bahan skor rekomendasi; bidang di
 * sini memperhalusnya — "Teknik & Rekayasa" → Teknik Sipil, Teknik Mesin, …
 * — supaya peminatan menjangkau prodi/jurusan yang beragam dan orang bisa
 * menemukan sesama peminat yang benar-benar sama.
 *
 * Memilih bidang = ikut memilih kategori induknya (`withParentCategories`),
 * jadi rekomendasi acara tidak pernah kehilangan sinyal. Slug STABIL: sudah
 * tersimpan di `users.study_fields`; ganti label boleh, ganti slug jangan.
 */
export interface StudyField {
  readonly slug: string;
  readonly label: string;
  /** Slug kategori induk — harus ada di tabel `categories` (dikunci uji). */
  readonly category: string;
}

const group = (category: string, entries: readonly (readonly [slug: string, label: string])[]): StudyField[] =>
  entries.map(([slug, label]) => ({ slug, label, category }));

export const STUDY_FIELDS: readonly StudyField[] = [
  ...group('teknologi', [
    ['pengembangan-web', 'Pengembangan Web'],
    ['aplikasi-mobile', 'Aplikasi Mobile'],
    ['kecerdasan-buatan', 'Kecerdasan Buatan & Machine Learning'],
    ['sains-data', 'Sains Data & Analitik'],
    ['keamanan-siber', 'Keamanan Siber'],
    ['jaringan-cloud', 'Jaringan & Cloud Computing'],
    ['pengembangan-gim', 'Pengembangan Gim'],
    ['iot-embedded', 'IoT & Sistem Tertanam'],
    ['robotika', 'Robotika'],
    ['sistem-informasi', 'Sistem Informasi'],
    ['pemrograman-kompetitif', 'Pemrograman Kompetitif'],
  ]),
  ...group('teknik', [
    ['teknik-sipil', 'Teknik Sipil & Konstruksi'],
    ['arsitektur', 'Arsitektur & Perencanaan Wilayah'],
    ['teknik-mesin', 'Teknik Mesin'],
    ['teknik-elektro', 'Teknik Elektro & Ketenagalistrikan'],
    ['teknik-industri', 'Teknik Industri'],
    ['teknik-kimia', 'Teknik Kimia'],
    ['teknik-lingkungan', 'Teknik Lingkungan'],
    ['pertambangan-perminyakan', 'Pertambangan & Perminyakan'],
    ['energi-terbarukan', 'Energi Terbarukan'],
    ['otomotif', 'Otomotif'],
    ['kedirgantaraan', 'Kedirgantaraan & Penerbangan'],
    ['perkapalan', 'Teknik Perkapalan & Kelautan'],
    ['geodesi-geomatika', 'Geodesi & Geomatika'],
    ['teknik-material', 'Teknik Material & Metalurgi'],
    ['teknik-biomedis', 'Teknik Biomedis'],
  ]),
  ...group('sains', [
    ['matematika', 'Matematika'],
    ['statistika', 'Statistika'],
    ['fisika', 'Fisika'],
    ['kimia', 'Kimia'],
    ['biologi', 'Biologi'],
    ['bioteknologi', 'Bioteknologi'],
    ['astronomi', 'Astronomi'],
    ['geosains', 'Geografi & Geosains'],
    ['olimpiade-sains', 'Olimpiade Sains (OSN)'],
    ['penelitian-ilmiah', 'Penelitian Ilmiah'],
  ]),
  ...group('kesehatan', [
    ['kedokteran', 'Kedokteran'],
    ['kedokteran-gigi', 'Kedokteran Gigi'],
    ['keperawatan', 'Keperawatan'],
    ['kebidanan', 'Kebidanan'],
    ['farmasi', 'Farmasi'],
    ['kesehatan-masyarakat', 'Kesehatan Masyarakat'],
    ['gizi', 'Gizi'],
    ['fisioterapi', 'Fisioterapi & Rehabilitasi'],
    ['laboratorium-medis', 'Teknologi Laboratorium Medis'],
    ['kesehatan-mental', 'Kesehatan Mental'],
  ]),
  ...group('bisnis', [
    ['kewirausahaan', 'Kewirausahaan & Startup'],
    ['pemasaran-digital', 'Pemasaran & Digital Marketing'],
    ['manajemen-bisnis', 'Manajemen & Strategi Bisnis'],
    ['manajemen-sdm', 'Manajemen SDM'],
    ['logistik', 'Logistik & Rantai Pasok'],
    ['bisnis-digital', 'Bisnis Digital & E-commerce'],
    ['business-case', 'Business Case Competition'],
  ]),
  ...group('ekonomi', [
    ['ilmu-ekonomi', 'Ilmu Ekonomi & Pembangunan'],
    ['akuntansi', 'Akuntansi & Audit'],
    ['keuangan-perbankan', 'Keuangan & Perbankan'],
    ['pasar-modal', 'Investasi & Pasar Modal'],
    ['ekonomi-syariah', 'Ekonomi & Keuangan Syariah'],
    ['perpajakan', 'Perpajakan'],
    ['aktuaria', 'Aktuaria'],
  ]),
  ...group('desain', [
    ['dkv', 'Desain Komunikasi Visual'],
    ['ui-ux', 'Desain UI/UX'],
    ['desain-produk', 'Desain Produk'],
    ['desain-interior', 'Desain Interior'],
    ['desain-busana', 'Desain Busana & Fesyen'],
    ['animasi', 'Animasi & Motion Graphic'],
    ['fotografi', 'Fotografi'],
    ['ilustrasi', 'Ilustrasi & Komik'],
  ]),
  ...group('seni', [
    ['musik', 'Musik & Paduan Suara'],
    ['tari', 'Tari'],
    ['teater', 'Teater & Seni Peran'],
    ['film', 'Film & Videografi'],
    ['seni-rupa', 'Seni Rupa & Lukis'],
    ['kriya', 'Kriya & Kerajinan'],
    ['budaya-daerah', 'Budaya & Kesenian Daerah'],
  ]),
  ...group('karya-tulis', [
    ['karya-tulis-ilmiah', 'Karya Tulis Ilmiah'],
    ['esai', 'Esai'],
    ['menulis-kreatif', 'Cerpen, Puisi & Menulis Kreatif'],
    ['policy-brief', 'Policy Brief & Kajian Kebijakan'],
  ]),
  ...group('debat', [
    ['debat-indonesia', 'Debat Bahasa Indonesia'],
    ['debat-inggris', 'Debat Bahasa Inggris'],
    ['model-un', 'Model United Nations'],
    ['public-speaking', 'Pidato & Public Speaking'],
  ]),
  ...group('olahraga', [
    ['sepak-bola', 'Sepak Bola & Futsal'],
    ['bulu-tangkis', 'Bulu Tangkis'],
    ['bola-basket', 'Bola Basket'],
    ['bola-voli', 'Bola Voli'],
    ['renang', 'Renang'],
    ['atletik', 'Atletik & Lari'],
    ['bela-diri', 'Pencak Silat & Bela Diri'],
    ['esports', 'E-sports'],
    ['catur', 'Catur'],
    ['ilmu-keolahragaan', 'Ilmu Keolahragaan'],
  ]),
  ...group('sosial', [
    ['psikologi', 'Psikologi'],
    ['sosiologi', 'Sosiologi'],
    ['antropologi', 'Antropologi'],
    ['kesejahteraan-sosial', 'Kesejahteraan Sosial'],
    ['lingkungan-iklim', 'Lingkungan & Perubahan Iklim'],
    ['pengabdian-masyarakat', 'Kerelawanan & Pengabdian Masyarakat'],
    ['pembangunan-berkelanjutan', 'SDGs & Pembangunan Berkelanjutan'],
  ]),
  ...group('pendidikan', [
    ['pgsd', 'Pendidikan Guru SD'],
    ['paud', 'Pendidikan Anak Usia Dini'],
    ['pendidikan-mipa', 'Pendidikan Matematika & IPA'],
    ['pendidikan-bahasa', 'Pendidikan Bahasa'],
    ['pendidikan-ips', 'Pendidikan IPS & Sejarah'],
    ['bimbingan-konseling', 'Bimbingan & Konseling'],
    ['teknologi-pendidikan', 'Teknologi Pendidikan'],
    ['pendidikan-khusus', 'Pendidikan Khusus & Inklusif'],
    ['literasi', 'Literasi & Gerakan Membaca'],
  ]),
  ...group('hukum', [
    ['ilmu-hukum', 'Ilmu Hukum'],
    ['peradilan-semu', 'Peradilan Semu (Moot Court)'],
    ['ilmu-politik', 'Ilmu Politik & Pemerintahan'],
    ['hubungan-internasional', 'Hubungan Internasional'],
    ['administrasi-publik', 'Administrasi & Kebijakan Publik'],
    ['hak-asasi-manusia', 'Hak Asasi Manusia & Antikorupsi'],
  ]),
  ...group('pertanian', [
    ['agroteknologi', 'Agroteknologi & Agronomi'],
    ['agribisnis', 'Agribisnis'],
    ['peternakan', 'Peternakan'],
    ['perikanan', 'Perikanan & Budidaya Perairan'],
    ['ilmu-kelautan', 'Ilmu Kelautan'],
    ['kehutanan', 'Kehutanan'],
    ['teknologi-pangan', 'Teknologi Pangan'],
    ['kedokteran-hewan', 'Kedokteran Hewan'],
  ]),
  ...group('bahasa', [
    ['sastra-indonesia', 'Bahasa & Sastra Indonesia'],
    ['sastra-inggris', 'Bahasa & Sastra Inggris'],
    ['bahasa-arab', 'Bahasa Arab'],
    ['bahasa-jepang', 'Bahasa Jepang'],
    ['bahasa-mandarin', 'Bahasa Mandarin'],
    ['bahasa-korea', 'Bahasa Korea'],
    ['bahasa-eropa', 'Bahasa Jerman, Prancis & Eropa Lain'],
    ['bahasa-daerah', 'Bahasa & Sastra Daerah'],
    ['linguistik', 'Linguistik & Penerjemahan'],
  ]),
  ...group('media', [
    ['ilmu-komunikasi', 'Ilmu Komunikasi'],
    ['jurnalistik', 'Jurnalistik'],
    ['public-relations', 'Public Relations'],
    ['penyiaran', 'Penyiaran & Broadcasting'],
    ['konten-kreator', 'Konten Kreator & Media Sosial'],
    ['periklanan', 'Periklanan'],
  ]),
  ...group('agama', [
    ['studi-islam', 'Studi Islam'],
    ['tilawah-tahfiz', 'Tilawah, Tahfiz & MTQ'],
    ['hukum-islam', 'Hukum Islam & Syariah'],
    ['komunikasi-islam', 'Dakwah & Komunikasi Islam'],
    ['teologi-kristen', 'Teologi Kristen & Katolik'],
    ['agama-hindu-buddha', 'Agama Hindu, Buddha & Khonghucu'],
  ]),
  ...group('pariwisata', [
    ['perhotelan', 'Perhotelan'],
    ['tata-boga', 'Tata Boga & Kuliner'],
    ['usaha-perjalanan', 'Usaha Perjalanan Wisata'],
    ['ekowisata', 'Ekowisata & Desa Wisata'],
    ['event-mice', 'Event & MICE'],
    ['tata-kecantikan', 'Tata Kecantikan'],
  ]),
];

export const STUDY_FIELD_LIMIT = 15;

const BY_SLUG = new Map(STUDY_FIELDS.map((field) => [field.slug, field]));

export function studyField(slug: string): StudyField | null {
  return BY_SLUG.get(slug) ?? null;
}

/** Slug tak dikenal dibuang, duplikat dibuang, dipotong ke batas — isian form bisa dipalsukan. */
export function cleanStudyFields(slugs: readonly string[]): string[] {
  return [...new Set(slugs.filter((slug) => BY_SLUG.has(slug)))].slice(0, STUDY_FIELD_LIMIT);
}

export function studyFieldsOf(category: string): readonly StudyField[] {
  return STUDY_FIELDS.filter((field) => field.category === category);
}

/**
 * Kategori pilihan + induk setiap bidang, urut & unik. Kategori tetap
 * dibatasi `maxInterests` (cermin `profileSchema`); induk didahulukan supaya
 * bidang yang dipilih tidak pernah kehilangan kategorinya.
 */
export function withParentCategories(categories: readonly string[], fields: readonly string[], maxInterests: number): string[] {
  const parents = cleanStudyFields(fields).map((slug) => BY_SLUG.get(slug)!.category);
  return [...new Set([...parents, ...categories])].slice(0, maxInterests);
}

export function studyFieldLabels(slugs: readonly string[]): string[] {
  return slugs.flatMap((slug) => {
    const field = BY_SLUG.get(slug);
    return field ? [field.label] : [];
  });
}
