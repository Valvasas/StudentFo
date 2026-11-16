import type { FormField } from '@/types/domain';

/**
 * Templat formulir pendaftaran (ADR-092) — titik mulai ala "templat" Google
 * Form untuk lomba mandiri & acara pelajar. Kolomnya DITAMBAHKAN ke formulir
 * (tidak menimpa), dengan id baru, dan semuanya bisa diubah/dihapus.
 * Setiap templat lolos `formFieldsSchema` (dikunci `form-templates.test.ts`).
 *
 * Sengaja TANPA kolom unggah berkas: KTP/KTM/karya di bucket kita = data
 * paling sensitif tanpa kebijakan retensi (ADR-056 "Ditolak"). Karya
 * dikumpulkan lewat tautan yang dikelola peserta sendiri.
 */
export interface FormTemplate {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly fields: readonly Omit<FormField, 'id'>[];
}

const agree = (label: string): Omit<FormField, 'id'> => ({ type: 'checkbox', label, help: null, required: true, options: [] });

export const FORM_TEMPLATES: readonly FormTemplate[] = [
  {
    key: 'lomba-tim',
    name: 'Lomba tim',
    description: 'Nama tim, jumlah & daftar anggota, kontak ketua, pembimbing, tautan karya.',
    fields: [
      { type: 'section', label: 'Data tim', help: 'Diisi ketua tim mewakili seluruh anggota.', required: false, options: [] },
      { type: 'short_text', label: 'Nama tim', help: null, required: true, options: [] },
      { type: 'dropdown', label: 'Jumlah anggota (termasuk ketua)', help: null, required: true, options: ['1', '2', '3', '4', '5'] },
      {
        type: 'long_text',
        label: 'Nama & asal sekolah/kampus tiap anggota',
        help: 'Satu anggota per baris, mis. Dinda Pratiwi — SMAN 1 Bandung.',
        required: true,
        options: [],
      },
      { type: 'phone', label: 'Nomor WhatsApp ketua', help: 'Untuk info teknis dari panitia.', required: true, options: [] },
      { type: 'short_text', label: 'Nama guru/dosen pembimbing', help: null, required: false, options: [] },
      {
        type: 'url',
        label: 'Tautan karya atau proposal',
        help: 'Google Drive, YouTube, GitHub, dsb. Pastikan aksesnya terbuka untuk panitia.',
        required: false,
        options: [],
      },
      agree('Kami sudah membaca dan menyetujui ketentuan lomba'),
    ],
  },
  {
    key: 'lomba-individu',
    name: 'Lomba individu',
    description: 'Asal sekolah/kampus, jenjang, kontak, portofolio, motivasi.',
    fields: [
      { type: 'section', label: 'Data peserta', help: null, required: false, options: [] },
      { type: 'short_text', label: 'Asal sekolah / kampus', help: null, required: true, options: [] },
      { type: 'dropdown', label: 'Jenjang pendidikan', help: null, required: true, options: ['SMA/SMK/MA', 'D3', 'D4/S1', 'S2'] },
      { type: 'phone', label: 'Nomor WhatsApp', help: 'Untuk info teknis dari panitia.', required: true, options: [] },
      { type: 'url', label: 'Tautan karya / portofolio', help: 'Pastikan aksesnya terbuka untuk panitia.', required: false, options: [] },
      { type: 'long_text', label: 'Ceritakan singkat motivasimu ikut lomba ini', help: null, required: false, options: [] },
      agree('Saya sudah membaca dan menyetujui ketentuan lomba'),
    ],
  },
  {
    key: 'seminar',
    name: 'Seminar / workshop',
    description: 'Asal instansi, status peserta, cara ikut, tingkat pemahaman, pertanyaan.',
    fields: [
      { type: 'short_text', label: 'Asal instansi / sekolah / kampus', help: null, required: true, options: [] },
      { type: 'dropdown', label: 'Status', help: null, required: true, options: ['Pelajar SMA/SMK/MA', 'Mahasiswa', 'Guru/Dosen', 'Umum'] },
      { type: 'select', label: 'Mengikuti secara', help: null, required: true, options: ['Daring', 'Luring (datang ke lokasi)'] },
      {
        type: 'scale',
        label: 'Seberapa paham kamu dengan topik ini?',
        help: null,
        required: false,
        options: [],
        scale: { max: 5, lowLabel: 'Baru mulai', highLabel: 'Sudah mahir' },
      },
      { type: 'long_text', label: 'Pertanyaan untuk pembicara', help: 'Opsional — dipilih panitia untuk sesi tanya jawab.', required: false, options: [] },
      agree('Saya bersedia hadir tepat waktu'),
    ],
  },
];
