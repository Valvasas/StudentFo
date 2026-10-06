import { AppError, ERROR_CODES } from '@/lib/errors';

/**
 * Umpan balik Server Action non-akun (tim, kiriman komunitas, tracker).
 *
 * Aturannya sama dengan `auth-messages.ts`: yang dioper lewat URL hanyalah
 * KODE dari daftar tertutup, kalimatnya dirakit di server. Sebelumnya aksi
 * tim mengoper teks pesan apa adanya (`/teams?error=<teks>`) dan halaman
 * menampilkannya — siapa pun bisa membuat tautan `/teams?error=Akun kamu
 * diblokir, hubungi wa.me/...` yang tampil sebagai peringatan resmi di
 * domain kita. Kode tidak dikenal = tidak menampilkan apa-apa.
 */

export const ACTION_ERROR_CODES = [
  'team_not_found',
  'team_full',
  'team_forbidden',
  'leader_cannot_leave',
  'leader_cannot_be_removed',
  'event_unavailable',
  'invalid_team_form',
  'invalid_submission',
  'submission_duplicate',
  'submission_not_found',
  'submission_rate_limited',
  'captcha_failed',
  'connection_not_found',
  'connection_forbidden',
  'connection_exists',
  'connection_self',
  'connection_rate_limited',
  'person_unavailable',
  'block_self',
  'block_unavailable',
  'block_not_found',
  'invalid_network_profile',
  'invalid_connection_message',
  'invalid_organizer_application',
  'organizer_revoked',
  'organizer_not_verified',
  'organizer_rate_limited',
  'organizer_not_found',
  'organizer_invalid_transition',
  'claim_exists',
  'claim_already_managed',
  'claim_not_found',
  'invalid_claim',
  'invalid_revision',
  'revision_empty',
  'revision_deadline',
  'revision_not_found',
  'revision_rejected_by_db',
  'not_event_manager',
  'portfolio_not_eligible',
  'invalid_portfolio',
  'moderation_not_rejected',
  'invalid_presentation',
  'invalid_request',
  'registration_closed',
  'registration_full',
  'registration_exists',
  'registration_rejected_before',
  'registration_not_eligible',
  'registration_rate_limited',
  'invalid_registration',
  'registration_team_invalid',
  'registration_not_found',
  'registration_invalid_transition',
  'invalid_registration_form',
  'registration_form_unavailable',
  'unknown',
] as const;

export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number];

export const ACTION_ERROR_MESSAGE: Record<ActionErrorCode, string> = {
  team_not_found: 'Tim yang kamu cari tidak ditemukan.',
  team_full: 'Tim ini sudah penuh.',
  team_forbidden: 'Hanya ketua tim yang bisa melakukan ini.',
  leader_cannot_leave: 'Ketua tidak bisa keluar. Bubarkan tim kalau sudah tidak dipakai.',
  leader_cannot_be_removed: 'Ketua tidak bisa dikeluarkan dari timnya sendiri.',
  event_unavailable: 'Kegiatan yang dipilih tidak tersedia.',
  invalid_team_form:
    'Data tim belum valid. Pilih kegiatan, isi judul minimal 4 karakter, dan jumlah anggota 1–50.',
  invalid_submission: 'Ada isian yang belum benar. Periksa keterangan di tiap kolom lalu kirim ulang.',
  submission_duplicate: 'Kegiatan dengan judul dan penyelenggara yang sama sudah ada di katalog.',
  submission_not_found: 'Kiriman ini sudah tidak ada atau sudah ditinjau.',
  submission_rate_limited:
    'Terlalu banyak kiriman dalam satu jam terakhir. Coba lagi nanti — kiriman sebelumnya tetap ada di antrean.',
  captcha_failed:
    'Verifikasi anti-bot belum selesai atau kedaluwarsa. Tunggu tanda centang muncul, lalu kirim ulang.',
  connection_not_found: 'Ajakan itu sudah tidak ada — mungkin sudah dibatalkan atau dijawab.',
  connection_forbidden: 'Hanya orang yang diajak yang bisa menjawab ajakan ini.',
  connection_exists: 'Kalian sudah terhubung atau masih ada ajakan yang menunggu jawaban.',
  connection_self: 'Kamu tidak bisa mengajak dirimu sendiri.',
  connection_rate_limited:
    'Kamu sudah mengirim banyak ajakan dalam 24 jam terakhir. Tunggu ajakan sebelumnya dijawab dulu, lalu coba lagi besok.',
  person_unavailable: 'Orang ini tidak bisa diajak terhubung saat ini. Profilnya mungkin sudah disembunyikan.',
  block_self: 'Kamu tidak bisa memblokir dirimu sendiri.',
  block_unavailable: 'Orang ini tidak bisa diblokir dari sini. Muat ulang halaman lalu coba lagi.',
  block_not_found: 'Orang ini sudah tidak ada di daftar blokirmu.',
  invalid_network_profile: 'Headline maksimal 140 karakter.',
  invalid_connection_message: 'Pesan pengantar maksimal 280 karakter.',
  invalid_organizer_application:
    'Data belum lengkap. Isi nama lembaga, situs resmi (https://, opsional), dan jelaskan peranmu minimal 20 karakter beserta tautan bukti.',
  organizer_revoked: 'Status penyelenggara akun ini dicabut. Hubungi moderator bila menurutmu ini keliru.',
  organizer_not_verified: 'Fitur ini hanya untuk penyelenggara terverifikasi.',
  organizer_rate_limited: 'Terlalu banyak perubahan pengajuan hari ini. Coba lagi besok.',
  organizer_not_found: 'Pengajuan penyelenggara itu tidak ditemukan.',
  organizer_invalid_transition: 'Keputusan itu tidak berlaku untuk status pengajuan saat ini. Muat ulang antrean.',
  claim_exists: 'Klaimmu untuk acara ini masih menunggu ditinjau.',
  claim_already_managed: 'Acara ini sudah ada di dasbormu.',
  claim_not_found: 'Klaim itu sudah tidak ada atau sudah ditinjau.',
  invalid_claim: 'Jelaskan hubungan lembagamu dengan acara ini minimal 20 karakter, sertakan tautan bukti.',
  invalid_revision: 'Periksa isian: tautan harus https://, pilih minimal satu jenjang, deskripsi maks. 5000 karakter.',
  revision_empty: 'Tidak ada yang berubah dari data acara saat ini.',
  revision_deadline: 'Tenggat baru harus setelah hari ini dan tidak lebih dari 3 tahun ke depan.',
  revision_not_found: 'Permintaan perubahan itu sudah tidak ada atau sudah ditinjau.',
  revision_rejected_by_db:
    'Perubahan tidak bisa diterapkan: tautan bukan https://, tenggat sudah lewat, atau pengaju tidak lagi terverifikasi. Tolak permintaan ini.',
  not_event_manager: 'Kamu tidak (lagi) mengelola acara ini.',
  portfolio_not_eligible: 'Hasil hanya bisa diisi untuk kegiatan yang sudah kamu tandai "Sudah daftar".',
  invalid_portfolio: 'Periksa isian: pilih hasil yang sesuai jenis kegiatan, catatan maks. 120 karakter, tautan bukti harus https://.',
  moderation_not_rejected: 'Item itu sudah tidak berstatus ditolak — mungkin sudah dipulihkan admin lain.',
  invalid_presentation:
    'Periksa isian: pilih lencana dari daftar, dan tanggal akhir promosi mulai hari ini sampai paling lama 1 tahun ke depan.',
  invalid_request: 'Permintaan tidak dikenali. Muat ulang halaman lalu coba lagi.',
  registration_closed: 'Pendaftaran untuk acara ini sedang tidak dibuka.',
  registration_full: 'Kuota pendaftaran sudah penuh dan penyelenggara tidak membuka daftar tunggu.',
  registration_exists: 'Kamu sudah terdaftar di acara ini. Tiketmu ada di bawah.',
  registration_rejected_before: 'Pendaftaranmu untuk acara ini sudah diputuskan tidak diterima oleh penyelenggara.',
  registration_not_eligible: 'Jenjang pendidikanmu belum termasuk yang dibuka penyelenggara untuk acara ini.',
  registration_rate_limited: 'Terlalu banyak pendaftaran dalam satu jam terakhir. Coba lagi sebentar lagi.',
  invalid_registration: 'Ada isian yang belum benar. Periksa kolom yang ditandai, lalu kirim ulang.',
  registration_team_invalid: 'Pilih tim yang kamu ketuai untuk acara ini, dengan jumlah anggota sesuai ketentuan penyelenggara.',
  registration_not_found: 'Pendaftaran itu sudah tidak ada atau sudah diubah.',
  registration_invalid_transition: 'Keputusan itu tidak berlaku untuk status pendaftar saat ini (atau kuota sudah penuh). Muat ulang daftarnya.',
  invalid_registration_form: 'Pengaturan formulir belum valid. Periksa kolom yang ditandai.',
  registration_form_unavailable: 'Formulir hanya bisa dibuka untuk acara yang tayang dan tenggatnya belum lewat.',
  unknown: 'Terjadi kesalahan. Coba lagi sebentar lagi.',
};

export const ACTION_NOTICE_CODES = [
  'submission_received',
  'submission_approved',
  'submission_rejected',
  'demo_reset',
  'connection_requested',
  'connection_matched',
  'connection_accepted',
  'connection_declined',
  'connection_cancelled',
  'connection_removed',
  'person_blocked',
  'person_unblocked',
  'network_profile_saved',
  'organizer_applied',
  'claim_submitted',
  'revision_submitted',
  'organizer_reviewed',
  'claim_reviewed',
  'revision_reviewed',
  'portfolio_saved',
  'moderation_restored',
  'presentation_saved',
  'team_created',
  'registration_submitted',
  'registration_cancelled',
  'registration_form_saved',
  'registration_form_opened',
  'registration_form_closed',
  'registration_decided',
] as const;

export type ActionNoticeCode = (typeof ACTION_NOTICE_CODES)[number];

export const ACTION_NOTICE_MESSAGE: Record<ActionNoticeCode, string> = {
  submission_received:
    'Terima kasih! Kiriman kamu masuk antrean verifikasi. Kegiatan baru tayang setelah dicek manual ke sumbernya.',
  submission_approved: 'Kiriman disetujui dan kini tayang di katalog.',
  submission_rejected: 'Kiriman ditolak.',
  demo_reset: 'Data demo diatur ulang ke kondisi awal, dengan tenggat dihitung ulang dari hari ini.',
  connection_requested: 'Ajakan terkirim. Kamu akan dapat notifikasi begitu dijawab.',
  connection_matched: 'Ternyata dia sudah lebih dulu mengajakmu — sekarang kalian terhubung.',
  connection_accepted: 'Ajakan diterima. Kalian sekarang terhubung.',
  connection_declined: 'Ajakan ditolak. Pengirimnya tidak diberi tahu alasannya.',
  connection_cancelled: 'Ajakan dibatalkan.',
  connection_removed: 'Koneksi diputus.',
  person_blocked:
    'Diblokir. Koneksi & ajakan di antara kalian dihapus, dan kalian tidak bisa saling menemukan atau mengajak lagi. Dia tidak diberi tahu.',
  person_unblocked: 'Blokir dibuka. Kalian bisa saling menemukan dan mengajak lagi.',
  organizer_applied: 'Pengajuan terkirim. Moderator mengecek bukti peranmu dulu — kamu dikabari lewat lonceng notifikasi.',
  claim_submitted: 'Klaim terkirim ke moderator. Acara muncul di dasbormu setelah disetujui.',
  revision_submitted: 'Permintaan perubahan terkirim. Halaman acara baru berubah setelah dicek moderator.',
  organizer_reviewed: 'Keputusan verifikasi penyelenggara disimpan dan tercatat di riwayat.',
  claim_reviewed: 'Keputusan klaim disimpan dan tercatat di riwayat.',
  revision_reviewed: 'Keputusan perubahan acara disimpan dan tercatat di riwayat.',
  network_profile_saved: 'Pengaturan jaringan disimpan.',
  portfolio_saved: 'Portofolio diperbarui.',
  moderation_restored: 'Dikembalikan ke antrean moderasi dan tercatat di riwayat.',
  presentation_saved: 'Lencana & promosi disimpan. Katalog publik ikut diperbarui.',
  team_created: 'Tim dibuka dan sudah tampil di Cari Tim. Bagikan tautannya ke orang yang kamu incar.',
  registration_submitted: 'Pendaftaran terkirim. Simpan kode tiketmu — setiap perubahan status dikabari lewat lonceng notifikasi.',
  registration_cancelled: 'Pendaftaran dibatalkan. Kursimu diberikan ke orang berikutnya di daftar tunggu.',
  registration_form_saved: 'Formulir pendaftaran disimpan.',
  registration_form_opened: 'Pendaftaran dibuka. Tombol "Daftar di StudentFo" kini tampil di halaman acara.',
  registration_form_closed: 'Pendaftaran ditutup. Pendaftar yang sudah ada tetap tersimpan.',
  registration_decided: 'Keputusan disimpan dan pendaftar sudah dikabari lewat notifikasi.',
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseActionErrorCode(value: string | string[] | undefined): ActionErrorCode | null {
  const raw = pickFirst(value);
  return ACTION_ERROR_CODES.includes(raw as ActionErrorCode) ? (raw as ActionErrorCode) : null;
}

export function parseActionNoticeCode(value: string | string[] | undefined): ActionNoticeCode | null {
  const raw = pickFirst(value);
  return ACTION_NOTICE_CODES.includes(raw as ActionNoticeCode) ? (raw as ActionNoticeCode) : null;
}

/** Buat AppError yang alasannya bisa dioper ke URL sebagai kode. */
export function actionError(code: Exclude<ActionErrorCode, 'unknown'>): AppError {
  const status =
    code === 'team_forbidden' ||
    code === 'connection_forbidden' ||
    code === 'organizer_not_verified' ||
    code === 'organizer_revoked' ||
    code === 'not_event_manager'
      ? 403
      : code === 'submission_rate_limited' || code === 'connection_rate_limited' || code === 'organizer_rate_limited' || code === 'registration_rate_limited'
        ? 429
        : code.endsWith('not_found')
          ? 404
          : 422;
  const errorCode =
    status === 429
      ? ERROR_CODES.RATE_LIMITED
      : status === 403
      ? ERROR_CODES.FORBIDDEN
      : status === 404
        ? ERROR_CODES.NOT_FOUND
        : ERROR_CODES.VALIDATION_FAILED;
  return new AppError(errorCode, ACTION_ERROR_MESSAGE[code], status, { reason: code });
}

/**
 * Error apa pun → kode aman untuk URL. Error tanpa `reason` yang dikenal
 * (termasuk error driver Postgres) selalu jadi `unknown`; detailnya dicatat
 * ke log server, tidak pernah ke URL.
 */
export function toActionErrorCode(error: unknown): ActionErrorCode {
  if (error instanceof AppError) {
    const code = parseActionErrorCode(error.reason);
    if (code) return code;
  }
  console.error('[action]', error);
  return 'unknown';
}

/**
 * Tambahkan query ke path yang MUNGKIN sudah punya query string. Menempelkan
 * `?error=` mentah ke `/events?type=LOMBA` menghasilkan dua `?` dan parameter
 * yang tidak terbaca.
 */
export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const [base = '/', existing = ''] = path.split('?', 2);
  const search = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) search.delete(key);
    else search.set(key, value);
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}
