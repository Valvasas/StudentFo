# CHANGELOG.md — versi yang berlaku SEKARANG

> **Baca ini sebelum mengubah apa pun.** Dokumen ini ada karena kejadian
> berulang: fitur sudah diperbarui, lalu sesi berikutnya membangun dari versi
> lama — mengulang pekerjaan yang sudah ada atau menimpa versi baru dengan yang
> lama. Penyebab nyatanya selalu sama: **cabang kerja tidak digabung ke `main`**,
> padahal migration-nya sudah diterapkan ke produksi.

## Langkah 0 setiap sesi (wajib, sebelum menulis kode)

```bash
git fetch origin && npm run check:sync -- --fetch
```

- **GAGAL** = kamu sedang membangun di atas versi lama. Berhenti, gabungkan
  dulu (`git merge origin/main`, atau cabang yang disebut).
- **PERINGATAN** cabang lain berisi migration = baca bagian "Cabang usang"
  di bawah; jangan gabung tanpa tinjauan, jangan juga mengabaikannya diam-diam.
- Bila Supabase MCP tersedia, cocokkan `list_migrations` produksi
  (`urmmihzjkkbxcwfzvuao`) dengan `supabase/APPLIED_MIGRATIONS.txt`. Yang ada
  di produksi tapi tidak di repo = **berhenti**, cari cabangnya.
- Sebelum "membangun ulang" sesuatu yang diminta pemilik, cari dulu di tabel
  di bawah dan di `DECISION.md` — permintaan lama yang diulang sering berarti
  versi sebelumnya hilang di cabang yang tak tergabung, bukan belum pernah ada.

Setelah menerapkan migration ke produksi (atas persetujuan pemilik): tambahkan
barisnya ke `supabase/APPLIED_MIGRATIONS.txt` di commit yang sama, dan pastikan
commit itu masuk `main` sebelum sesi berakhir. `npm run verify` menolak cabang
yang tidak memuat migration yang sudah ada di produksi
(`src/lib/migrations-manifest.test.ts`).

---

## Peta "versi yang berlaku" — jangan kembali ke kolom kanan

| Area | Yang berlaku sekarang | Versi lama yang SUDAH DIGANTI | Dikunci oleh |
|---|---|---|---|
| Daftar peserta | `/register` → `RegisterForm` (nama, email, sandi + **ulangi sandi**, usia, persetujuan) | Kartu radio "Daftar sebagai" (`AccountTypeField`, dihapus ADR-063) | `auth-pages.spec.ts`, `register-forms.spec.ts` |
| Daftar penyelenggara | `/penyelenggara/daftar` → `OrganizerRegisterForm`: data lembaga (nama, jenis, situs, bukti) + penanggung jawab (nama, jabatan, email kerja) + pernyataan wewenang (ADR-069) | Form peserta berlabel "penanggung jawab" (ADR-063 awal) | `register-forms.spec.ts`, `organizer.test.ts`, `auth-failure.test.ts` |
| Data lembaga | Draf di user metadata → form studio terisi, kirim satu klik; kolom `org_type`, `contact_role` | Pengajuan hanya nama/situs/bukti | `109_organizer_signup_fields.test.sql` |
| Email ganda saat daftar | Ditolak terang: `email_taken` + tautan Masuk/Lupa sandi (ADR-069). Masuk & lupa sandi TETAP seragam | Halaman "cek email" seragam untuk email terdaftar (ADR-011 untuk daftar) | `auth-messages.test.ts` |
| Ulangi kata sandi | `ConfirmPasswordInput` di daftar ×2, setel ulang, ganti sandi; kode `password_mismatch`/`same_password`/`weak_password` | Mismatch → "Ada isian yang belum benar" | `auth-failure.test.ts` |
| Pengaturan | Hub `/profile/settings` + `keamanan/` + `notifikasi/` (ADR-067). Pengingat email di **Notifikasi**, Hapus akun di **Privasi & data** | Satu halaman Pengaturan berisi semuanya (cabang `ccr-c5c96a43`) | `settings.spec.ts`, `email-reminders.spec.ts`, `trust-safety.spec.ts` |
| Tur penyelenggara | `organizer-tour.tsx` + `product-tour.tsx` (ADR-063/066) | `student-tour.tsx` (dihapus, menjanjikan alur 404) | — |
| Keluar ke tautan resmi | `/events/[slug]/daftar` → **pendataan kinerja** `/sebelum-daftar` sekali per acara → tautan resmi **atau formulir StudentFo** (ADR-070, ADR-092 #8). Pertanyaan **diatur admin** di `/admin/kinerja/pertanyaan` + tombol **Lewati** (ADR-073) | Langsung ke tautan resmi; pertanyaan dikunci di kode/CHECK SQL (`source`/`plan`, ADR-070 awal); formulir StudentFo melewati pendataan (ADR-070 awal) | `register-redirect.spec.ts`, `event-engagement.spec.ts`, `outbound-survey.test.ts`, `110_outbound_surveys.test.sql` |
| Wilayah | `lib/wilayah.ts` + `wilayah-districts.ts`: 38 prov / 514 kab-kota / 7.285 kecamatan (Kepmendagri, ADR-074), `RegionPicker`. `REGIONS` TETAP untuk filter lokasi acara & jarak (butuh titik) | — (jangan "melengkapi" `REGIONS` tanpa koordinat; jangan ganti filter acara ke wilayah lengkap tanpa normalisasi `location`) | `wilayah.test.ts`, `geo.test.ts` |
| Tempat studi | Direktori resmi `src/data/institutions.ts` (±49 rb SMA/SMK/MA/SLB/keagamaan + 5.800 PT) + `/api/institusi` + `InstitutionPicker`; kolom `users.institution_*`, `domicile_code`; tampil lewat `public_profile_details()` (ADR-076) | `CAMPUSES` (50 kampus contoh, dihapus) | `institutions.test.ts`, `study-profile.test.ts`, `study-place.spec.ts`, `113_study_profile.test.sql` |
| Peminatan | 19 kategori + 150 bidang spesifik (`lib/study-fields.ts`, `users.study_fields`), bidang membawa induknya (ADR-075); `MAJORS` ±260 prodi/jurusan | 12 kategori saja; `MAJORS` ±60 contoh | `study-fields.test.ts`, `study-place.spec.ts` |
| Lobi | `/lobi` + `/lobi/[slug]`: lobi per lomba untuk yang SUDAH mendaftar (ADR-071) | "Lobi" ditafsirkan sebagai `/teams` (konteks ADR-065) — JANGAN ditafsirkan ulang | `lobby.spec.ts`, `lobby.test.ts` ×2, `111_event_lobby.test.sql` |
| Lencana | Dihitung dari catatan pihak ketiga (ADR-068); opt-in tampil di profil publik & lobi (ADR-072) | — (jangan buat tabel lencana / aksi klaim) | `achievements.test.ts`, `public-badges.test.ts`, `112_public_badges.test.sql` |
| Profil publik | `/u/[username]` + username/bio/keterlihatan di Data diri (ADR-077); bawaan MEMBERS (anggota yang masuk), NETWORK = hanya koneksi | Profil hanya terbaca bila "bisa ditemukan" (ADR-040); kartu demo "Profil publik" (localStorage, dilepas) | `profile-identity.test.ts`, `114_profile_identity.test.sql`, `profile-identity.spec.ts` |
| Jalan keluar pesan akun | `email_not_confirmed` → tautan "Kirim ulang email konfirmasi" (`/verify-email?email=…`); `reset_email_sent` → "Belum punya akun? … daftar dulu", tampil untuk semua alamat | Pesan tanpa tautan: orang yang belum terkonfirmasi atau belum pernah daftar menunggu email yang tak datang | `auth-pages.spec.ts` |
| Email Auth | `supabase/templates/*.html` dari `auth-email-templates.ts`, tautan `token_hash` (ADR-078), dipasang pemilik (`docs/email-templates.md`) | Template bawaan Supabase / `{{ .ConfirmationURL }}` PKCE | `auth-email-templates.test.ts` |
| Pilihan "Lainnya" | Prodi (isian bebas), kampus ("pakai teks ini"), domisili ("Luar negeri" = LN), lokasi kegiatan (datalist 503 kab/kota) | Prodi custom tersembunyi di "Pakai …" | `study-place.spec.ts`, `wilayah.test.ts` |
| Pemilih melayang di ponsel | Posisi dijepit ke viewport saat dibuka (`Picker`) | Popover 340px ditambatkan ke tombol → meluber | `picker-viewport.spec.ts` |
| Poster, slide & video | Poster = foto galeri bertanda `is_poster` (satu/acara) → slide `MediaSlider` di Ringkasan, thumbnail kartu & papan, og:image; video = tautan YouTube/Vimeo kanonis `events.video_url`, pemutar fasad (nocookie, dimuat setelah Putar); kelola di studio & `/admin/media/[slug]` (ADR-079) | Grid galeri `EventGallery`/`GalleryViewer` (dihapus); kartu tanpa gambar sama sekali | `event-media.spec.ts`, `video.test.ts`, `event-media.test.ts`, `115_event_media.test.sql` |
| Logo | `LogoSprite` + `LogoMark`/`LogoEmblem` dari `logo-paths.ts` (hasil `scripts/trace-logo.py`, ADR-080); ikon & OG dari `LOGO_BOLD` | Monogram `LOGO_MARK` di `illustrations.tsx` (dihapus) | `landing-tour.spec.ts` (render), axe |
| Tur beranda | Satu cuplikan tanpa judul/daftar langkah; kendali putar/jeda + 5 ruas (ADR-081) | Panggung + 5 tab langkah berteks + label "Contoh tampilan" (ADR-065) | `landing-tour.spec.ts` |
| Foto profil & banner | Kolom `users.avatar_*`/`banner_*`/`banner_preset`, bucket privat `profile-media`, `/media/profil/[id]`; kartu "Foto & banner" di Data diri; cabut di `/admin/pengguna` (ADR-083) | Hanya inisial + sampul bertitik | `profile-media.test.ts` ×2, `116_profile_media.test.sql`, `profile-media.spec.ts` |
| Poster di kiriman | Langkah "Media kegiatan" di `/submit` (poster: pengirim yang masuk), kolom `ugc_submissions.poster_*`, `/media/kiriman/[id]` (ADR-084) | Poster hanya setelah tayang (studio/admin); video di lipatan "detail tambahan" | `submissions.test.ts`, `117_submission_poster.test.sql`, `submission-poster.spec.ts` |
| Komunitas | `/komunitas` (+ `baru`, `[id]`): forum publik khusus anggota, nama tersingkat, tanpa DM & tanpa kontak pribadi, lapor + sembunyi otomatis 3 pelapor, antrean di `/admin/laporan` (ADR-087) | `/discussions` "Ruang diskusi" (pratinjau demo, localStorage — tetap demo saja) | `community.test.ts` ×2, `118_community.test.sql`, `community.spec.ts` |
| Ajakan bertindak | "Langkah awalmu" di beranda peserta + satu saran di lonceng, dihitung dari akun (`lib/next-steps.ts`), cookie `sf_langkah` untuk menyembunyikan (ADR-086) | Satu tautan "Pilih minat & jenjangmu" | `next-steps.test.ts`, `personal-home.spec.ts` |
| Detail kegiatan untuk tamu | Etalase + cuplikan ≤ 200 karakter + `MemberGate`; tab lain, tautan pendaftaran, kalender khusus anggota (ADR-085) | Semua isi & "Daftar sekarang" terbuka untuk tamu | `event-gate.spec.ts`, `event-access.test.ts`, `register-redirect.spec.ts` |
| Jendela daftar & lookup | Batas `TEAM_LIST_LIMIT`/`MANAGED_EVENTS_LIMIT` di `repository.ts`, sama di kedua repository; satu item = `getTrackerItem`/`getManagedEvent`/`listTeams(eventId)`/`listTeamsByIds` (ADR-088) | `list…().find()` di halaman per kegiatan; `.limit(60)`/`200` hanya di Supabase | `teams.test.ts`, `managed-events.test.ts`, `parity.test.ts`, `organizers.test.ts` |
| Menu melayang | `<details data-popover>` + `PopoverDismiss` (ketuk di luar, Escape, pindah halaman); panel lonceng & akun menjangkar ke header di ponsel (ADR-089) | Panel diratakan kanan ke lonceng (terpotong di 320px), menu tetap terbuka | `popover-dismiss.spec.ts` |
| Teks pengguna panjang | `body { overflow-wrap: break-word }` + `min-w-0 [overflow-wrap:anywhere]` di teks daun item flex/grid (ADR-088) | Tanpa pengaman; `anywhere` global (jangan — chip terbelah) | `extreme-content.spec.ts` |
| Klik "Daftar" → Papan lamaran | `noteRegisterClick()` di `/daftar` & `/sebelum-daftar`: sinyal + sama dengan "Simpan ke Tracker" (`saveEvent` + `addTrackerItemIfAbsent` → kolom "Disimpan"), tanpa sinyal `save` kedua (ADR-090). "Sudah Daftar" tetap dilaporkan sendiri (ADR-046) | Klik hanya sinyal; Papan lamaran kosong setelah menekan "Daftar" | `register-click.test.ts`, `register-redirect.spec.ts` |
| Hapus postingan | "Alat moderator" di halaman kegiatan + `/admin/acara` (Kelola postingan): turunkan kapan saja, juga sebelum tenggat → **Urungkan / Tayangkan lagi**; hapus permanen hanya yang sudah diturunkan, ketik `HAPUS`, tanpa pendaftar aktif (ADR-092 #1) | Hanya Tolak di antrean moderasi; kegiatan yang sudah tayang tidak bisa diturunkan dari UI | `event-removal.test.ts`, `engagement.test.ts`, `119_event_engagement.test.sql`, `event-engagement.spec.ts` |
| Suka & komentar | Baris `EngagementBar` (Suka · Komentar · Bagikan) di bawah judul; tab `?tab=komentar` khusus anggota dengan rel Komunitas, laporan di `/admin/laporan` → "Komentar kegiatan" (ADR-092 #2–3). Tanya jawab TETAP untuk jawaban resmi | Tidak ada; satu tombol `ShareButton` di halaman kegiatan | `event-comments.test.ts`, `engagement.test.ts`, `parity.test.ts`, `119_event_engagement.test.sql`, `event-engagement.spec.ts` |
| "Lagi ramai" | Urutan `sort=popular` + `TrendingStrip` (beranda tamu & pribadi, papan Lomba); skor `refresh_event_trends()` ↔ `lib/popularity.ts` (ADR-092 #4). Urutan bawaan TETAP "Paling relevan" | — (jangan jadikan "ramai" urutan bawaan / papan bertenggat) | `popularity.test.ts`, `119_event_engagement.test.sql`, `event-engagement.spec.ts` |
| Bagikan | `ShareMenu` `<details data-popover>` (salin, Web Share, WA/Telegram/X/FB/LinkedIn/Email, tanpa pelacak) + `/events/[slug]/bagikan` ke koneksi (ADR-092 #5). `ShareButton` hanya untuk tim & lobi | `ShareButton` (salin tautan) di halaman kegiatan | `event-engagement.spec.ts`, `extreme-content.spec.ts` |
| Lomba mandiri | `events.registration_mode = 'studentfo'`: pilihan "Lewat formulir di StudentFo" di `/submit` (penyelenggara terverifikasi & admin) + sakelar "Hanya lewat StudentFo" di studio; admin membuka studio kegiatan apa pun (ADR-092 #6) | Setiap postingan wajib bertautan pendaftaran luar | `119_event_engagement.test.sql`, `event-engagement.spec.ts` |
| Formulir ala Google Form | + drop-down, jam, skala linear, judul bagian, gandakan, templat (mengganti kolom awal formulir baru; tidak menggandakan pertanyaan), **Ringkasan jawaban** `pendaftar?tampilan=ringkasan` (ADR-092 #7). Tanpa unggah berkas | ADR-056 awal: 10 jenis, tanpa templat/ringkasan | `registration-form.test.ts`, `form-templates.test.ts`, `registration-summary.test.ts`, `event-engagement.spec.ts` |
| Membuat lomba internal (admin) | `/admin/acara/baru` "Buat acara StudentFo": langsung tayang lewat RPC `admin_create_event`, formulir dari templat TERTUTUP → penyusun formulir (ADR-093) | /submit → antrean → setujui kiriman sendiri → studio → formulir (5 langkah, kena batas 3/jam per email) | `admin-create-event.spec.ts`, `admin-events.test.ts`, `121_admin_create_event.test.sql` |
| Navigasi admin | 3 kelompok (Moderasi · Postingan · Akun & data) + alat kelompok aktif, target ≥ 44px (ADR-093) | 9 tab rata dalam satu rel geser | `touch-targets.spec.ts`, `admin-review.spec.ts` |
| Antrean moderasi | + "Setujui yang dipilih" (maks 50, hanya setujui; tolak tetap per kartu) (ADR-093) | Setujui satu per satu | `admin-create-event.spec.ts` |
| Beranda admin | + "Buat acara StudentFo" & "Cek pengiriman email" (SMTP gagal terlihat admin) (ADR-093) | SMTP gagal hanya di log Supabase | — |
| "Lagi ramai" | Pengunjung anonim dijepit 20/hari/acara + maks 30 tampilan/hari per IP per acara (ADR-093) | Pengunjung tanpa batas (bisa didongkrak bot) | `popularity.test.ts` (kunci SQL), `event-views.test.ts`, `120_trend_hardening.test.sql` |
| Angka suka/komentar di halaman kegiatan | Disembunyikan selama 0 (aria-label tetap) | "Suka 0 · Komentar 0" | `event-engagement.spec.ts` |
| Slide penjelas | Poster + **slide berketerangan** saat `/submit` (maks. 5, `ugc_submission_photos`) & "Buat acara StudentFo"; urutan `event_photos.sort_order` (poster tetap pertama, unggahan baru di belakang), geser & ubah keterangan per slide di studio/admin; keterangan slide aktif tampil di bawah slider (ADR-094) | Hanya poster saat kirim/buat; galeri "terbaru dulu" (slide sekaligus tampil terbalik), satu keterangan untuk semua gambar sekali unggah | `122_event_slides.test.sql`, `event-slides.test.ts`, `form-assist.spec.ts`, `event-media.spec.ts` |
| Penyusun formulir | Seret pegangan ⠿ + panah keyboard + "Urutan N dari M", urutkan pilihan (Alt+↑/↓, A–Z), "Lainnya: …", **Tambah cepat**, **Pratinjau**, salin dari acara lain, checklist "Siap dibuka?" (ADR-094) | Tombol naik/turun saja, tersembunyi di ponsel | `form-assist.test.ts`, `form-assist.spec.ts`, `organizer.spec.ts`, `event-engagement.spec.ts` |
| Status tim | Jenis `team_status` (pilihan tetap `TEAM_STATUSES`) di templat Lomba tim + Tambah cepat; "belum punya tim" → tawaran partner di formulir, halaman pendaftaran, halaman acara; lobi `?niat=` (ADR-094) | "Nama tim" wajib; pendaftar tanpa tim tidak diarahkan ke mana pun | `form-assist.test.ts`, `form-assist.spec.ts` |
| Mengisi formulir StudentFo | Progres pertanyaan wajib, draf per tab (`FieldMemory live`), "Isi dari profilku", jawaban pulih saat server menolak (ADR-094) | Galat server mengosongkan semua jawaban | `form-assist.test.ts`, `form-assist.spec.ts` |
| Kirim kegiatan | Deskripsi di langkah 1 (bukan lipatan), peta langkah bertaut, "Kirimanmu" di bawah form (ADR-094) | Deskripsi di "Detail tambahan"; daftar kiriman di atas form | `submission-poster.spec.ts`, `submission-notification.spec.ts` |
| Media antrean moderasi | `event_media_imports` → pengerja (cron tiap jam + tombol admin) menyiapkan gambar resmi (og:image laman sumber) + poster & slide ringkasan buatan server ke `event_photos` SEBELUM disetujui; strip poster/slide & alasan gagal di kartu antrean; `/admin/media/[slug]?acara=` untuk kegiatan PENDING (ADR-095) | Poster hanya bisa dipasang manual setelah tayang, satu per satu | `123_event_media_imports.test.sql`, `src/lib/media-import/*.test.ts` |
| Klaim kepercayaan kegiatan | Dua tingkat `events.verification_level`: **Terverifikasi moderator** / **Dari sumber publik** (`TrustBadge` di kartu, `TrustNote` di detail, penjelasan `/sumber-data#tingkat-verifikasi`); centang di form Setujui; saklar di Kelola postingan (ADR-096) | Satu klaim "diverifikasi/tervalidasi manual" untuk semua kegiatan | `trust-levels.test.ts`, `124_event_trust_levels.test.sql` |
| Data uji | `events.is_demo` ditutup di policy `events_public_read`; saklar "Tandai data uji" (ADR-096) | — (jangan menyaring data uji per halaman/kueri — policy yang menutup) | `trust-levels.test.ts`, `124_event_trust_levels.test.sql`, `listing.test.ts` |
| Tur beranda (isi) | Kegiatan SUNGGUHAN (`TourSample`) atau garis kerangka (ADR-096) | Nama karangan "Contoh penyelenggara" / "lomba desain" (ADR-065) | `landing-tour.spec.ts` |
| Teks pembaca layar | `sr-only` hanya melengkapi (satuan/konteks), tidak menyalin angka/label terlihat (ADR-096) | Kalimat lengkap `sr-only` + salinan `aria-hidden` ("2 suka2", "D4/S1D4/S1") | `event-engagement.spec.ts` (Peringkat) |
| Penomoran ADR | 061–062 keamanan & MVP ops · 063 tur & pintu penyelenggara · 064/065 kesan AI & tur beranda (dulu 061/062 di `main`) · 066 penggabungan · 067/068 · 069–096 | Nomor ganda 061/062 | — |

## Migration

- 2026-11-22 (persetujuan pemilik di sesi): `20261120100001_event_slides` dan `20261121100001_event_media_imports` diterapkan ke staging, diuji asap (di-rollback: kegiatan baru membawa 5 impor media, klaim jalan, anon/authenticated tertutup, RPC & kolom slide ada), lalu produksi. Postgres mengunduh tiap berkas dari commit `7b387cc` dan menolak bila SHA-256 tidak cocok (pola ADR-062 #8); versi = nama berkas. Produksi: **56** migration = repo.
- 2026-11-19 (perintah pemilik "konfigurasi yang bisa dikerjakan, kerjakan"): `20261116100001_event_engagement`,
  `20261119100001_trend_visitor_cap_and_mutual_privacy`, `20261119100002_admin_create_event` diterapkan ke staging,
  diuji asap (buat acara admin di transaksi yang di-rollback: APPROVED, mode studentfo, 1 log berpelaku, tampil di
  katalog), lalu produksi. Postgres mengunduh tiap berkas dari commit `e6bcabf` dan menolak bila SHA-256/ukuran tidak
  cocok (pola ADR-062 #8); versi `schema_migrations` = nama berkas. Advisor keamanan: tanpa temuan baru di luar pola
  yang disengaja (tabel ber-RLS tanpa policy hanya lewat RPC; `admin_create_event` tidak terbuka untuk anon/authenticated).
- (Riwayat) Produksi: 51 migration, dicocokkan langsung 2026-11-13.
- 2026-11-13 (persetujuan pemilik di chat): `20261109100002_event_media`, `20261110100001_profile_media`,
  `20261112100001_submission_poster`, `20261112100002_community` diterapkan ke staging, diuji, lalu produksi.
  Postgres mengunduh tiap berkas dari commit `657c998` dan menolak bila SHA-256 tidak cocok (pola ADR-062 #8);
  tiap berkas atomik, versi = nama berkas. Sidik skema publik 12 komponen (fungsi, policy, constraint, kolom,
  indeks, trigger, view, RLS, hak anon/authenticated, kategori) identik lokal = staging = produksi — selisih satu-satunya
  hak `MAINTAIN` Postgres 17 bawaan Supabase pada tabel lama. Uji asap staging (di-rollback): tulis → balas →
  penulis dikabari, tamu ditolak, media profil & poster kiriman terbaca sesuai hak.
- 2026-11-09: `20261108100001`–`04` dan `20261109100001_profile_details` diterapkan ke staging lalu produksi,
  persis isi berkas (tanpa DROP). Versi di `schema_migrations` disamakan dengan nama berkas; sidik skema
  (policy, constraint, hak kolom, kategori, 14 definisi fungsi) identik lokal = staging = produksi.

## Cabang usang (ada migration, TIDAK di produksi, JANGAN digabung tanpa tinjauan)

| Cabang | Isi | Status |
|---|---|---|
| `ccr-a2058300-u92ao5` | `20260929110001_result_verification` — penyelenggara mengonfirmasi hasil portofolio (ADR-047 versi cabang itu) | Tidak pernah digabung. Ide yang layak dipindahkan (sumber pihak ketiga untuk lencana "Juara"), tetapi nomor ADR-nya bertabrakan dengan ADR-047 `main` — port ulang, jangan merge |
| `ccr-4d61ed42-skxs6m` | `20261006100001_event_registrations` — pendaftaran internal versi awal (ADR-055 versi cabang itu) | Digantikan ADR-056 di `main`. Jangan digabung |
| `ccr-c5c96a43-8eijqc` | 8 migration trust & safety … function_hardening | **Sudah digabung** 2026-11-08 (commit `1d4b3a4`) |

---

## Riwayat (terbaru di atas)

### 2026-11-24 — cabang `claude/admiring-lovelace-75z4mp` (dari `main` `23e6aa9`)
- Fase 1 (ADR-096): teks ganda pembaca layar dibereskan, tur beranda memakai kegiatan sungguhan, alt poster bermakna, dua tingkat kepercayaan + data uji.
- Migration `20261124100001_event_trust_levels` **BELUM diterapkan** (perlu persetujuan pemilik). Cabang **belum digabung ke `main`.**

### 2026-11-21 — cabang `ccr-e5c48abe-22c436` (dari `main` `1fbfd96`)
- 26 kegiatan kurasi (lomba/magang/workshop dari laman resmi) masuk antrean produksi lewat `stage_scraped_event` — data saja.
- Impor media otomatis ke antrean moderasi (ADR-095): gambar resmi + poster & slide ringkasan, cron + tombol admin, pratinjau staf.
- Dependensi baru `@fontsource/plus-jakarta-sans` (font OFL untuk poster). Migration `20261120100001` & `20261121100001` **sudah di produksi** (22 Nov). Cabang **belum digabung ke `main`** — PR dibuka.

### 2026-11-20 — cabang `claude/studentfo-improvements-features-y22p76` (dari `main` `3821965`)
- Slide penjelas saat kirim & buat acara, urutan + keterangan per slide (ADR-094 #1–2).
- Penyusun formulir: seret/panah/"Urutan", Lainnya, Tambah cepat, Pratinjau, salin formulir, "Siap dibuka?" (ADR-094 #5).
- Status tim + tawaran cari partner/tim/lobi (`lib/nudges.ts`), pembantu pengisian (progres, draf per tab, isi dari profil) (ADR-094 #3–4, #6).
- `/submit` lebih fokus (ADR-094 #7). Migration `20261120100001_event_slides` **belum diterapkan**. Cabang **belum digabung ke `main`.**

### 2026-11-19 — cabang `claude/practical-ritchie-emo0or` (dari `main` `2350ff9`)
- Audit pra-produksi (`docs/audit-pra-produksi-2026-11-19.md`) + perbaikan menyeluruh (ADR-093): tes bom-waktu (CI merah),
  `?page` raksasa → 502, penyebab galat hulu kini di log, plafon `formList`, "Lagi ramai" tahan bot, koneksi bersama
  hormati blokir.
- Fitur: **Buat acara StudentFo**, navigasi admin berkelompok, setujui massal, email uji admin, `SubmitButton` sisa.
- UI: beranda tamu menunjukkan isi di layar pertama, angka nol disembunyikan, CTA tamu "Masuk & daftar", luberan 320px.
- Migration `20261116100001`, `20261119100001`, `20261119100002` **sudah di produksi**; `RATE_LIMIT_SECRET` diisi di Vercel.
- **Cabang belum digabung ke `main`** — langkah & konfigurasi pemilik: `docs/langkah-konfigurasi-pemilik.md`.

### 2026-11-16 — cabang `ccr-efbe8b18-bip6n8` (dari `main` `b86fa8f` + `claude/brave-cray-xsqigf` `267a35d`)
- Suka, komentar, bagikan (menu + ke koneksi), "Lagi ramai", hapus postingan kapan saja (turunkan → urungkan →
  hapus permanen), lomba mandiri berformulir StudentFo, formulir ala Google Form + Ringkasan jawaban (ADR-092).
- Pendataan kinerja kini juga sebelum formulir StudentFo; ekspor data akun memuat komentar & suka;
  kebijakan privasi & S&K diperbarui, `LEGAL_REVISION` 2026-11-16.
- Migration `20261116100001_event_engagement` **belum diterapkan**. Cabang **belum digabung ke `main`.**

### 2026-11-13 — cabang `claude/brave-cray-xsqigf` (lanjutan)
- Audit skalabilitas (ADR-088): jendela daftar sama di kedua repository, lookup satu baris untuk tracker/hak kelola/tim,
  `/teams` per kegiatan tidak lagi menyaring jendela global; konten 255 karakter rapi di 320px (`extreme-content.spec.ts`).
- Tanpa migration baru. Empat migration 2026-11-12 **diterapkan ke staging & produksi** (lihat bagian Migration).

### 2026-11-12 — cabang `claude/brave-cray-xsqigf` (dari `…registration-form-competition-features-sptvfz`)
- Logo baru (ADR-080), tur beranda hanya cuplikan (ADR-081), 12 ragam lencana + animasi (ADR-082).
- Foto profil & banner (ADR-083), poster dilampirkan saat kirim kegiatan (ADR-084),
  gerbang anggota di halaman kegiatan (ADR-085), "Langkah awal" (ADR-086), Komunitas (ADR-087). `LEGAL_REVISION` 2026-11-12.
- Empat migration diterapkan 2026-11-13 (lihat bagian Migration). Di-merge ke `main` lewat PR #29 (2026-11-13).

### 2026-11-09 — cabang `claude/registration-form-competition-features-sptvfz` (bagian 5, setelah PR #27)
- **Serah-terima sesi & langkah konfigurasi pemilik yang sedang berjalan: `docs/progres-sekarang.md`.**
- Poster, slide & video kegiatan (ADR-079): migration `20261109100002_event_media` BELUM diterapkan;
  kode aman urutan deploy (tanpa kolom → poster/video tidak tampil, aksi → `media_unavailable`).
- Kartu & papan kini boleh memuat thumbnail poster (pilihan manusia saja) — membalik sebagian "kartu tanpa gambar".
- Kebijakan privasi & cookie: YouTube/Vimeo hanya setelah Putar; `LEGAL_REVISION` 2026-11-09.

### 2026-11-09 — cabang `claude/registration-form-competition-features-sptvfz` (bagian 4, sebelum merge)
- Bug live: `/submit`, beranda admin, `/admin`, ekspor data crash tanpa `SUPABASE_SERVICE_ROLE_KEY` (log Vercel) → kini turun anggun; kunci itu tetap harus diisi pemilik.
- Pemilih melayang tidak meluber di ponsel; opsi "Lainnya" di prodi/kampus/domisili/lokasi.
- Username, bio, `/u/[username]`, profil terbuka untuk anggota (ADR-077); template email Auth (ADR-078).
- Migration `20261109100001` diganti nama `profile_details` (sebelum diterapkan); migration lobi memakai ALTER POLICY.
  Kelima migration cabang ini lalu diterapkan ke staging & produksi (47).
- Penjaga isian belum disimpan (ADR-067): ketikan/isi otomatis SEBELUM skrip dimuat kini ikut dijaga
  (patokan = isi render server) — `unsaved-guard.spec.ts` menahan skrip untuk membuktikannya.

### 2026-11-09 — cabang `claude/registration-form-competition-features-sptvfz` (bagian 3)
- Pendataan kinerja: pertanyaan diatur admin + Lewati (ADR-073).
- Wilayah lengkap Kepmendagri (ADR-074), bidang peminatan spesifik + 7 kategori (ADR-075),
  direktori tempat studi dari Data Referensi Kemendikdasmen + tampil di profil/lobi/Koneksi (ADR-076).
- Halaman `/sumber-data` (atribusi ODbL), kebijakan privasi diperbarui.
- **Memperbarui data referensi:** jalankan crawler terpisah (bukan bagian build) lalu
  `node scripts/import-institutions.mjs …` dan `node scripts/import-wilayah.mjs …`; tinjau diff-nya.

### 2026-11-08 — cabang `claude/registration-form-competition-features-sptvfz`
> **Status penggabungan:** bagian 1 (gabung versi produksi + form daftar
> penyelenggara, ulangi sandi, email ganda) MASUK `main` lewat PR #26 (`d4ab7c9`).
> Bagian 2 (pendataan kinerja, lobi, lencana publik, penjaga anti-regresi —
> `c0dc1a3`) di-push SETELAH PR #26 di-merge: **belum di `main` sampai PR
> berikutnya digabung.** Jangan mulai sesi baru dari `main` sebelum itu.

- Gabung `ccr-c5c96a43-8eijqc` (versi produksi) ke cabang kerja; konflik Pengaturan diselesaikan dengan hub ADR-067.
- Form daftar penyelenggara terpisah dengan data lembaga; ulangi kata sandi di semua form sandi baru; email ganda ditolak terang (ADR-069).
- Pendataan kinerja sebelum keluar ke tautan resmi + dasbor `/admin/kinerja` (ADR-070).
- Lobi lomba (ADR-071); sesama anggota lobi boleh saling mengajak terhubung.
- Lencana opt-in di profil publik & lobi (ADR-072).
- Penjaga anti-regresi: `npm run check:sync`, `supabase/APPLIED_MIGRATIONS.txt`, tes manifes di `verify`, dokumen ini.

### 2026-11-05/06 — `main` (PR #24, #25)
- ADR-067 (kembali, konfirmasi, Pengaturan per konteks), ADR-068 (lencana dihitung), migration `20261105100001` diterapkan.

### 2026-10-31 — 2026-11-04 — `ccr-8508b1ef` → `ccr-c5c96a43`
- ADR-061–063, 066: keamanan & kepercayaan, MVP operasional, pintu penyelenggara, peluncuran produksi (41 migration).
