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
  'invalid_seeker_profile',
  'seeker_closed',
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
  'invalid_registration_form',
  'registration_form_fields',
  'registration_form_payment',
  'registration_closed',
  'registration_full',
  'registration_exists',
  'registration_not_found',
  'registration_invalid_transition',
  'registration_rate_limited',
  'invalid_registration',
  'review_note_required',
  'image_missing',
  'image_too_large',
  'image_invalid',
  'gallery_full',
  'too_many_photos',
  'photo_not_found',
  'invalid_video_url',
  'video_rate_limited',
  'media_unavailable',
  'profile_image_too_large',
  'profile_media_rate_limited',
  'profile_media_unavailable',
  'profile_media_empty',
  'invalid_banner_preset',
  'report_unavailable',
  'report_rate_limited',
  'invalid_report',
  'report_not_found',
  'user_not_found',
  'user_protected',
  'suspension_reason_required',
  'account_delete_confirm',
  'account_delete_failed',
  'mfa_invalid_code',
  'mfa_rate_limited',
  'mfa_failed',
  'question_unavailable',
  'invalid_question',
  'question_rate_limited',
  'question_not_found',
  'question_forbidden',
  'invalid_answer',
  'invalid_request',
  'reminders_unavailable',
  'lobby_forbidden',
  'lobby_closed',
  'lobby_invite_invalid',
  'lobby_rate_limited',
  'lobby_unavailable',
  'invalid_lobby',
  'invalid_outbound_survey',
  'invalid_outbound_config',
  'outbound_unavailable',
  'study_profile_unavailable',
  'username_taken',
  'invalid_profile_identity',
  'profile_identity_unavailable',
  'invalid_study_place',
  'badges_unavailable',
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
  invalid_seeker_profile:
    'Ada isian kartu pemain yang belum benar. Periksa keterangan di tiap kolom lalu simpan lagi.',
  seeker_closed: 'Buka kartu pemainmu dulu untuk mulai mencari.',
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
    'Data belum lengkap. Isi nama lembaga, jenis lembaga, jabatanmu, situs resmi (https://, opsional), dan jelaskan peranmu minimal 20 karakter beserta tautan bukti.',
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
  invalid_registration_form: 'Periksa isian: kuota & biaya berupa angka bulat, pengantar maks. 1.000 karakter.',
  registration_form_fields:
    'Ada pertanyaan yang belum lengkap: setiap pertanyaan butuh judul, dan pilihan ganda butuh minimal 2 pilihan.',
  registration_form_payment:
    'Acara berbayar butuh instruksi pembayaran (rekening, e-wallet, atau QRIS) minimal 10 karakter.',
  registration_closed: 'Pendaftaran lewat StudentFo untuk acara ini sedang ditutup.',
  registration_full: 'Kuota pendaftaran sudah penuh.',
  registration_exists: 'Kamu sudah terdaftar di acara ini. Lihat statusnya di menu Pembayaran.',
  registration_not_found: 'Pendaftaran itu tidak ditemukan.',
  registration_invalid_transition: 'Status pendaftaran sudah berubah. Muat ulang halaman untuk melihat yang terbaru.',
  registration_rate_limited: 'Terlalu banyak pendaftaran dalam satu jam. Coba lagi nanti.',
  invalid_registration: 'Ada jawaban yang belum valid. Periksa kolom yang ditandai lalu kirim ulang.',
  review_note_required: 'Tulis alasan singkat supaya peserta tahu apa yang perlu diperbaiki.',
  image_missing: 'Pilih berkas gambar dulu.',
  image_too_large: 'Ukuran gambar maksimal 5 MB per berkas.',
  image_invalid: 'Berkas harus berupa foto JPG, PNG, atau WebP (minimal 32×32 piksel).',
  gallery_full: 'Galeri maksimal 30 foto — sisa kuota tidak cukup untuk unggahan ini. Hapus beberapa foto lama dulu.',
  too_many_photos: 'Maksimal 6 foto sekali unggah. Pilih lebih sedikit lalu unggah sisanya berikutnya.',
  photo_not_found: 'Foto itu sudah tidak ada.',
  invalid_video_url: 'Tautan video harus dari YouTube atau Vimeo, mis. https://youtu.be/… atau https://vimeo.com/….',
  video_rate_limited: 'Video acara sudah terlalu sering diganti hari ini. Coba lagi besok.',
  media_unavailable: 'Poster & video belum bisa diatur — pembaruan database belum diterapkan. Coba lagi nanti.',
  profile_image_too_large:
    'Gambar terlalu besar untuk profil. Foto profil maksimal 1 MB (sisi terpanjang 1024 px), banner maksimal 2 MB (2400 px). Perkecil dulu, atau unggah dari peramban dengan JavaScript aktif supaya diperkecil otomatis.',
  profile_media_rate_limited: 'Foto & banner sudah terlalu sering diganti hari ini. Coba lagi besok.',
  profile_media_unavailable: 'Foto profil & banner belum bisa diatur — pembaruan database belum diterapkan. Coba lagi nanti.',
  profile_media_empty: 'Akun itu tidak punya foto profil atau banner unggahan.',
  invalid_banner_preset: 'Pilihan banner tidak dikenal. Pilih salah satu dari daftar.',
  report_unavailable: 'Yang kamu laporkan sudah tidak tersedia.',
  report_rate_limited: 'Kamu sudah mengirim banyak laporan hari ini. Coba lagi besok, atau hubungi kami lewat email.',
  invalid_report: 'Pilih alasan laporan, lalu kirim ulang. Keterangan maksimal 1.000 karakter.',
  report_not_found: 'Laporan itu sudah diputuskan admin lain.',
  user_not_found: 'Akun itu sudah tidak ada.',
  user_protected: 'Akun admin dan akunmu sendiri tidak bisa diubah dari sini.',
  suspension_reason_required: 'Tulis alasannya (minimal 5 karakter) — alasan ini tercatat di riwayat moderasi.',
  account_delete_confirm: 'Ketik HAPUS AKUN persis untuk mengonfirmasi.',
  account_delete_failed: 'Akun belum terhapus karena berkas unggahanmu gagal dihapus. Coba lagi sebentar lagi.',
  mfa_invalid_code: 'Kode tidak cocok atau sudah kedaluwarsa. Masukkan kode TERBARU dari aplikasi autentikator, dan pastikan jam ponselmu otomatis.',
  mfa_rate_limited: 'Terlalu banyak percobaan kode. Tunggu 15 menit lalu coba lagi.',
  mfa_failed: 'Verifikasi dua langkah gagal diproses. Coba lagi sebentar lagi.',
  question_unavailable: 'Kegiatan ini sudah tidak menerima pertanyaan baru.',
  invalid_question: 'Tulis pertanyaan 10–500 karakter.',
  question_rate_limited: 'Kamu sudah bertanya 5 kali hari ini. Coba lagi besok, atau cek buku panduan & tab lainnya.',
  question_not_found: 'Pertanyaan itu sudah tidak ada.',
  question_forbidden: 'Hanya penyelenggara terverifikasi kegiatan ini atau moderator yang bisa menjawab.',
  invalid_answer: 'Tulis jawaban 2–1500 karakter.',
  invalid_request: 'Permintaan tidak dikenali. Muat ulang halaman lalu coba lagi.',
  reminders_unavailable: 'Saklar pengingat belum aktif di server ini. Pengingat tenggat tetap dikirim seperti biasa.',
  lobby_forbidden: 'Lobi hanya untuk peserta lomba ini. Tandai “Sudah daftar” di Pendaftaran atau daftar lewat formulirnya dulu.',
  lobby_closed: 'Pendaftaran lomba ini sudah ditutup — lobinya hanya bisa dibaca.',
  lobby_invite_invalid: 'Hanya koneksi yang sudah terhubung yang bisa diajak dari lobi.',
  lobby_rate_limited: 'Kamu sudah mengirim 20 ajakan lobi hari ini. Coba lagi besok.',
  lobby_unavailable: 'Lobi lomba belum aktif di server ini. Coba lagi setelah pembaruan terpasang.',
  invalid_lobby: 'Pilih statusmu di lobi, dan catatan maksimal 160 karakter.',
  badges_unavailable: 'Pilihan menampilkan lencana belum aktif di server ini. Lencanamu tetap privat.',
  invalid_outbound_survey: 'Ada jawaban yang belum sesuai — lengkapi yang bertanda wajib, atau tekan Lewati.',
  invalid_outbound_config: 'Pertanyaan belum bisa disimpan: maksimal 8 pertanyaan tambahan, tiap pertanyaan berjudul, dan pilihan ganda minimal 2 pilihan.',
  username_taken: 'Username itu sudah dipakai orang lain. Coba variasi lain, mis. tambahkan angka atau titik.',
  invalid_profile_identity: 'Username 3–30 karakter: huruf kecil, angka, titik, atau garis bawah — diawali & diakhiri huruf/angka. Bio maksimal 280 karakter.',
  profile_identity_unavailable: 'Username & bio belum aktif di server ini. Coba lagi setelah pembaruan database terpasang.',
  study_profile_unavailable: 'Tempat studi & domisili belum aktif di server ini. Coba lagi setelah pembaruan database terpasang.',
  invalid_study_place: 'Tempat studi maksimal 120 karakter (minimal 2), dan domisili harus dipilih dari daftar wilayah.',
  outbound_unavailable: 'Pengaturan pertanyaan pendataan belum aktif di server ini. Coba lagi setelah pembaruan database terpasang.',
  unknown: 'Terjadi kesalahan. Coba lagi sebentar lagi.',
};

export const ACTION_NOTICE_CODES = [
  'submission_received',
  'submission_received_poster_skipped',
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
  'team_joined',
  'team_left',
  'seeker_opened',
  'seeker_saved',
  'match_invited',
  'tracker_applied',
  'tracker_accepted',
  'registration_confirmed',
  'registration_awaiting_payment',
  'payment_submitted',
  'registration_cancelled',
  'registration_form_saved',
  'registration_reviewed',
  'photos_uploaded',
  'photo_deleted',
  'poster_set',
  'poster_unset',
  'video_saved',
  'video_removed',
  'avatar_saved',
  'avatar_removed',
  'banner_saved',
  'banner_removed',
  'banner_preset_saved',
  'profile_media_cleared',
  'reminders_on',
  'reminders_off',
  'undo_done',
  'report_sent',
  'report_resolved',
  'report_dismissed',
  'user_suspended',
  'user_unsuspended',
  'user_deleted',
  'account_deleted',
  'mfa_enabled',
  'mfa_verified',
  'email_reminders_on',
  'email_reminders_off',
  'question_sent',
  'question_answered',
  'question_deleted',
  'question_hidden',
  'lobby_joined',
  'lobby_updated',
  'lobby_left',
  'lobby_invited',
  'lobby_already_invited',
  'badges_shown',
  'badges_hidden',
  'outbound_config_saved',
  'study_place_saved',
  'profile_identity_saved',
] as const;

export type ActionNoticeCode = (typeof ACTION_NOTICE_CODES)[number];

export const ACTION_NOTICE_MESSAGE: Record<ActionNoticeCode, string> = {
  submission_received:
    'Terima kasih! Kiriman kamu masuk antrean verifikasi. Kegiatan baru tayang setelah dicek manual ke sumbernya.',
  submission_received_poster_skipped:
    'Kiriman kamu masuk antrean verifikasi, tetapi posternya belum bisa disimpan. Setelah kegiatannya tayang, poster bisa ditambahkan dari studio penyelenggara atau oleh moderator.',
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
  undo_done: 'Dibatalkan — keadaan sebelumnya sudah dikembalikan.',
  lobby_joined: 'Kamu masuk lobi. Sapa peserta lain atau ajak temanmu ikut lomba ini.',
  lobby_updated: 'Kartu lobimu diperbarui.',
  lobby_left: 'Kamu keluar dari lobi. Kartumu tidak lagi terlihat peserta lain.',
  lobby_invited: 'Ajakan terkirim — temanmu dapat notifikasi berisi tautan lomba ini.',
  lobby_already_invited: 'Kamu sudah pernah mengajak teman ini untuk lomba ini.',
  badges_shown: 'Lencana yang sudah kamu raih kini tampil di profil publik dan lobi lomba.',
  badges_hidden: 'Lencanamu kembali privat — hanya kamu yang melihatnya.',
  outbound_config_saved: 'Pertanyaan pendataan tersimpan. Pengunjung berikutnya langsung melihat versi ini.',
  profile_identity_saved: 'Profil publikmu tersimpan. Bagikan tautannya supaya orang lebih mudah menemukanmu.',
  study_place_saved: 'Tempat studi & domisili tersimpan. Orang yang bisa melihat profilmu kini tahu kamu dari mana.',
  reminders_on: 'Pengingat tenggat menyala. Kegiatan yang kamu simpan atau lacak diingatkan H-3 dan H-1.',
  reminders_off: 'Pengingat tenggat dimatikan. Pengingat yang sudah ada di lonceng tidak dihapus.',
  portfolio_saved: 'Portofolio diperbarui.',
  moderation_restored: 'Dikembalikan ke antrean moderasi dan tercatat di riwayat.',
  presentation_saved: 'Lencana & promosi disimpan. Katalog publik ikut diperbarui.',
  team_created: 'Tim dibuka dan sudah tampil di Cari Tim. Bagikan tautannya ke orang yang kamu incar.',
  team_joined: 'Kamu masuk tim. Sapa ketuanya di halaman tim supaya pembagian tugas cepat jelas.',
  team_left: 'Kamu keluar dari tim. Kursimu kembali terbuka untuk orang lain.',
  seeker_opened: 'Kartu pemainmu aktif. Orang yang masuk bisa menemukanmu lewat pencocokan — tanpa email dan tanpa alamat rumah.',
  seeker_saved: 'Kartu pemainmu disimpan.',
  match_invited: 'Ajakan jadi partner terkirim. Kamu akan dapat notifikasi begitu dijawab.',
  tracker_applied: 'Dicatat sebagai "Sudah Daftar". Pindahkan tahapnya begitu ada kabar dari penyelenggara.',
  tracker_accepted: 'Dicatat sebagai "Diterima". Isi hasilnya di portofolio kalau ingin ditampilkan di profilmu.',
  registration_confirmed: 'Pendaftaranmu terkonfirmasi. Simpan kode pendaftaranmu untuk ditunjukkan ke panitia.',
  registration_awaiting_payment: 'Pendaftaran tersimpan. Selesaikan pembayaran lalu unggah buktinya di bawah.',
  payment_submitted: 'Bukti pembayaran terkirim. Panitia akan memeriksanya — kamu dikabari lewat notifikasi.',
  registration_cancelled: 'Pendaftaran dibatalkan.',
  registration_form_saved: 'Formulir pendaftaran disimpan.',
  registration_reviewed: 'Keputusan disimpan dan peserta sudah dikabari.',
  photos_uploaded: 'Foto ditambahkan ke galeri acara.',
  photo_deleted: 'Foto dihapus dari galeri.',
  poster_set: 'Poster dipasang — tampil pertama di slide, di kartu kegiatan, dan saat tautan dibagikan.',
  poster_unset: 'Foto itu tidak lagi jadi poster.',
  video_saved: 'Video dipasang di halaman acara.',
  video_removed: 'Video dilepas dari halaman acara.',
  avatar_saved: 'Foto profil terpasang. Orang yang boleh membuka profilmu melihatnya di Koneksi, tim, lobi, dan Komunitas.',
  avatar_removed: 'Foto profil dihapus. Inisial namamu tampil lagi.',
  banner_saved: 'Banner terpasang di kartu profilmu.',
  banner_removed: 'Banner unggahan dihapus.',
  banner_preset_saved: 'Banner kartu profil diperbarui.',
  profile_media_cleared: 'Foto profil & banner akun itu dicabut dan tercatat di riwayat moderasi.',
  report_sent: 'Laporan terkirim. Moderator meninjaunya — identitasmu tidak diberitahukan ke pihak yang dilaporkan.',
  report_resolved: 'Laporan ditandai sudah ditindak dan tercatat di riwayat.',
  report_dismissed: 'Laporan diabaikan dan tercatat di riwayat.',
  user_suspended: 'Akun ditangguhkan: tidak bisa masuk lagi dan keluar dari direktori. Kabari pemiliknya lewat email.',
  user_unsuspended: 'Penangguhan dicabut. Pemilik akun bisa masuk lagi.',
  user_deleted: 'Akun beserta datanya dihapus dan tercatat di riwayat.',
  account_deleted: 'Akunmu dan datanya sudah dihapus. Terima kasih sudah memakai StudentFo.',
  mfa_enabled: 'Verifikasi dua langkah aktif. Mulai sekarang, setiap masuk ke panel admin meminta kode dari aplikasi autentikatormu.',
  mfa_verified: 'Terverifikasi. Panel admin terbuka untuk sesi ini.',
  email_reminders_on: 'Pengingat email aktif. Kamu akan menerima email H-3 dan H-1 untuk kegiatan yang kamu simpan atau lacak.',
  email_reminders_off: 'Pengingat email dimatikan. Pengingat di lonceng notifikasi tetap berjalan.',
  question_sent: 'Pertanyaanmu tampil di bawah. Kamu dikabari lewat lonceng saat dijawab.',
  question_answered: 'Jawaban tersimpan dan penanya dikabari.',
  question_deleted: 'Pertanyaanmu sudah dihapus.',
  question_hidden: 'Pertanyaan disembunyikan dan tercatat di riwayat moderasi.',
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
      : code === 'submission_rate_limited' ||
          code === 'connection_rate_limited' ||
          code === 'organizer_rate_limited' ||
          code === 'registration_rate_limited' ||
          code === 'profile_media_rate_limited'
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
