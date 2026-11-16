-- Interaksi & perawatan postingan (ADR-092): suka, komentar, laporan,
-- bagikan ke koneksi, "Lagi ramai", cara mendaftar, hapus permanen.
-- Cermin: src/lib/data/engagement.test.ts, src/lib/popularity.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000e0a01', 'penulis@eng', '{"full_name":"Dinda Pratiwi Sari"}'),
  ('00000000-0000-4000-8000-0000000e0a02', 'pembaca@eng', '{"full_name":"Bima Arya"}'),
  ('00000000-0000-4000-8000-0000000e0a03', 'lapor1@eng', '{"full_name":"Pelapor Satu"}'),
  ('00000000-0000-4000-8000-0000000e0a04', 'lapor2@eng', '{"full_name":"Pelapor Dua"}'),
  ('00000000-0000-4000-8000-0000000e0a05', 'lapor3@eng', '{"full_name":"Pelapor Tiga"}'),
  ('00000000-0000-4000-8000-0000000e0a06', 'admin@eng', '{"full_name":"Admin Uji"}'),
  ('00000000-0000-4000-8000-0000000e0a07', 'panitia@eng', '{"full_name":"Panitia Resmi"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000e0a06';
INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-0000000e0e01', 'Lomba Ramai Uji', 'Panitia', 'LOMBA', 'https://daftar.example/e1', 'https://sumber.example/e1', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000e0e02', 'Lomba Belum Tayang', 'Panitia', 'LOMBA', 'https://daftar.example/e2', 'https://sumber.example/e2', 'PENDING', NULL),
  ('00000000-0000-4000-8000-0000000e0e03', 'Lomba Sudah Tutup', 'Panitia', 'LOMBA', 'https://daftar.example/e3', 'https://sumber.example/e3', 'EXPIRED', now()),
  ('00000000-0000-4000-8000-0000000e0e04', 'Lomba Sepi Uji', 'Panitia', 'LOMBA', 'https://daftar.example/e4', 'https://sumber.example/e4', 'APPROVED', now());
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-4000-8000-0000000e0e01', 'registration', now() + interval '20 days', true),
  ('00000000-0000-4000-8000-0000000e0e04', 'registration', now() + interval '20 days', true);
INSERT INTO public.organizer_profiles (user_id, org_name, evidence)
VALUES ('00000000-0000-4000-8000-0000000e0a07', 'Org Ramai', 'Ketua panitia, https://ramai.example/panitia');
SELECT public.review_organizer('00000000-0000-4000-8000-0000000e0a07', 'VERIFIED', NULL, NULL);
INSERT INTO public.event_managers (event_id, user_id, source) VALUES ('00000000-0000-4000-8000-0000000e0e01', '00000000-0000-4000-8000-0000000e0a07', 'ADMIN');

-- 1. Tamu: boleh melihat angka (bukti sosial), tidak boleh menulis / membaca komentar / membaca tabel.
SET LOCAL ROLE anon;
DO $$
DECLARE v_state RECORD;
BEGIN
  SELECT * INTO v_state FROM public.event_engagement_state('00000000-0000-4000-8000-0000000e0e01');
  IF v_state.like_count <> 0 OR v_state.comment_count <> 0 OR v_state.liked THEN
    RAISE EXCEPTION 'tamu: angka nol & belum suka, dapat %', row_to_json(v_state);
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_engagement_state('00000000-0000-4000-8000-0000000e0e02')) THEN
    RAISE EXCEPTION 'kegiatan belum tayang tidak punya angka publik';
  END IF;
  BEGIN
    PERFORM * FROM public.toggle_event_like('00000000-0000-4000-8000-0000000e0e01');
    RAISE EXCEPTION 'tamu tidak boleh menyukai';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 50);
    RAISE EXCEPTION 'tamu tidak membaca komentar';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.event_likes;
    RAISE EXCEPTION 'tabel suka tidak terbaca langsung';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.event_comments;
    RAISE EXCEPTION 'tabel komentar tidak terbaca langsung';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- 2. Suka: menyala → mati → menyala; hitungan ikut; kegiatan belum tayang ditolak.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a02';
DO $$
DECLARE v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM public.toggle_event_like('00000000-0000-4000-8000-0000000e0e01');
  IF NOT v_row.liked OR v_row.like_count <> 1 THEN RAISE EXCEPTION 'suka pertama, dapat %', row_to_json(v_row); END IF;
  SELECT * INTO v_row FROM public.toggle_event_like('00000000-0000-4000-8000-0000000e0e01');
  IF v_row.liked OR v_row.like_count <> 0 THEN RAISE EXCEPTION 'batal suka, dapat %', row_to_json(v_row); END IF;
  SELECT * INTO v_row FROM public.toggle_event_like('00000000-0000-4000-8000-0000000e0e01');
  IF NOT (SELECT liked FROM public.event_engagement_state('00000000-0000-4000-8000-0000000e0e01')) THEN
    RAISE EXCEPTION 'keadaan suka pembaca';
  END IF;
  BEGIN
    PERFORM * FROM public.toggle_event_like('00000000-0000-4000-8000-0000000e0e02');
    RAISE EXCEPTION 'kegiatan belum tayang tidak bisa disukai';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  -- Kegiatan yang sudah tutup masih bisa disukai (tetap terbaca publik).
  PERFORM * FROM public.toggle_event_like('00000000-0000-4000-8000-0000000e0e03');
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a03';
SELECT * FROM public.toggle_event_like('00000000-0000-4000-8000-0000000e0e01');
RESET ROLE;
-- Angka kartu (tabel penghitung) terbaca anon hanya untuk kegiatan tayang.
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT like_count FROM public.event_engagement WHERE event_id = '00000000-0000-4000-8000-0000000e0e01') <> 2 THEN
    RAISE EXCEPTION 'penghitung suka kartu = 2';
  END IF;
END$$;
RESET ROLE;

-- 3. Komentar: validasi, kontak ditolak, kegiatan tutup/belum tayang ditolak, balasan satu tingkat.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a01';
DO $$
DECLARE v_comment UUID;
BEGIN
  BEGIN
    PERFORM public.create_event_comment('00000000-0000-4000-8000-0000000e0e01', ' x ', NULL);
    RAISE EXCEPTION 'komentar terlalu pendek harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.create_event_comment('00000000-0000-4000-8000-0000000e0e01', 'Yang mau satu tim chat 081234567890', NULL);
    RAISE EXCEPTION 'nomor HP harus ditolak';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'community_contact_blocked' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_event_comment('00000000-0000-4000-8000-0000000e0e03', 'Kapan pengumumannya?', NULL);
    RAISE EXCEPTION 'kegiatan tutup tidak menerima komentar baru';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.create_event_comment('00000000-0000-4000-8000-0000000e0e02', 'Belum tayang kok bisa?', NULL);
    RAISE EXCEPTION 'kegiatan belum tayang tidak menerima komentar';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  v_comment := public.create_event_comment('00000000-0000-4000-8000-0000000e0e01', 'Tahun lalu temanya apa ya?', NULL);
  PERFORM set_config('uji.comment', v_comment::text, true);
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a02';
DO $$
DECLARE v_reply UUID;
BEGIN
  v_reply := public.create_event_comment('00000000-0000-4000-8000-0000000e0e01', 'Energi terbarukan, cek arsipnya.', current_setting('uji.comment')::uuid);
  PERFORM public.create_event_comment('00000000-0000-4000-8000-0000000e0e01', 'Juri dari kampus mana saja?', current_setting('uji.comment')::uuid);
  BEGIN
    PERFORM public.create_event_comment('00000000-0000-4000-8000-0000000e0e01', 'Balasan untuk balasan', v_reply);
    RAISE EXCEPTION 'balasan hanya satu tingkat';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.create_event_comment('00000000-0000-4000-8000-0000000e0e04', 'Induk dari kegiatan lain', current_setting('uji.comment')::uuid);
    RAISE EXCEPTION 'induk harus dari kegiatan yang sama';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a07';
SELECT public.create_event_comment('00000000-0000-4000-8000-0000000e0e01', 'Halo, panitia di sini. Tema tahun ini diumumkan Senin.', NULL);
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a06';
SELECT public.create_event_comment('00000000-0000-4000-8000-0000000e0e01', 'Info dari tim StudentFo: buku panduan sudah diperbarui.', NULL);
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a01';
-- Membalas komentar sendiri tidak mengabari diri sendiri.
SELECT public.create_event_comment('00000000-0000-4000-8000-0000000e0e01', 'Makasih semua!', current_setting('uji.comment')::uuid);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000e0a01' AND type = 'EVENT_COMMENT_REPLY') <> 1 THEN
    RAISE EXCEPTION 'penulis dikabari SEKALI per kegiatan (diperbarui), bukan per balasan';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000e0a02' AND type = 'EVENT_COMMENT_REPLY') THEN
    RAISE EXCEPTION 'pembalas tidak dikabari';
  END IF;
  IF (SELECT comment_count FROM public.event_engagement WHERE event_id = '00000000-0000-4000-8000-0000000e0e01') <> 6 THEN
    RAISE EXCEPTION 'penghitung komentar = 6';
  END IF;
END$$;

-- 4. Membaca: nama tersingkat, penanda resmi, milik sendiri, urutan & jumlah.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a02';
DO $$
DECLARE v_row RECORD;
BEGIN
  IF (SELECT count(*) FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 50)) <> 6 THEN
    RAISE EXCEPTION 'enam komentar (3 utama + 3 balasan)';
  END IF;
  SELECT * INTO v_row FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 50) WHERE id = current_setting('uji.comment')::uuid;
  IF v_row.author_name <> 'Dinda S.' OR v_row.author_username IS NOT NULL OR v_row.is_mine OR v_row.author_role IS NOT NULL THEN
    RAISE EXCEPTION 'penulis biasa: nama tersingkat, tanpa penanda, dapat %', row_to_json(v_row);
  END IF;
  IF (SELECT author_role FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 50) WHERE body LIKE 'Halo, panitia%') <> 'organizer'
     OR (SELECT author_role FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 50) WHERE body LIKE 'Info dari tim%') <> 'team' THEN
    RAISE EXCEPTION 'penanda penyelenggara & tim StudentFo';
  END IF;
  IF (SELECT count(*) FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 50) WHERE is_mine) <> 2 THEN
    RAISE EXCEPTION 'dua balasan milik pembaca';
  END IF;
  -- Jendela 1 utas: utama terbaru + balasannya, dan tanda "masih ada yang lama".
  IF (SELECT count(*) FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 1) WHERE parent_id IS NULL) <> 1
     OR NOT (SELECT bool_and(more_threads) FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 1)) THEN
    RAISE EXCEPTION 'jendela utas & tanda lebih banyak';
  END IF;
  IF (SELECT comment_count FROM public.event_engagement_state('00000000-0000-4000-8000-0000000e0e01')) <> 6 THEN
    RAISE EXCEPTION 'jumlah komentar di halaman detail';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 50)) THEN
    RAISE EXCEPTION 'tanpa sesi tidak ada komentar yang terbaca';
  END IF;
END$$;
RESET ROLE;

-- 5. Blokir menyembunyikan dua arah; penangguhan menghilangkan komentar (dan hitungannya di detail).
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000e0a01', '00000000-0000-4000-8000-0000000e0a02');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a02';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 50) WHERE id = current_setting('uji.comment')::uuid) THEN
    RAISE EXCEPTION 'yang diblokir tidak melihat komentar pemblokir';
  END IF;
  BEGIN
    PERFORM public.create_event_comment('00000000-0000-4000-8000-0000000e0e01', 'Masih bisa membalas?', current_setting('uji.comment')::uuid);
    RAISE EXCEPTION 'yang diblokir tidak bisa membalas';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END$$;
RESET ROLE;
DELETE FROM public.connection_blocks WHERE blocker_id = '00000000-0000-4000-8000-0000000e0a01';

-- 6. Laporan: bukan milik sendiri, satu terbuka per pelapor, tiga pelapor = sembunyi otomatis.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a01';
DO $$
BEGIN
  BEGIN
    PERFORM public.report_event_comment(current_setting('uji.comment')::uuid, 'spam', NULL);
    RAISE EXCEPTION 'komentar sendiri tidak bisa dilaporkan';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a03';
SELECT public.report_event_comment(current_setting('uji.comment')::uuid, 'spam', 'Promosi berulang');
SELECT public.report_event_comment(current_setting('uji.comment')::uuid, 'spam', 'Klik lagi');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a04';
SELECT public.report_event_comment(current_setting('uji.comment')::uuid, 'misleading', NULL);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_comment_reports WHERE status = 'OPEN') <> 2 THEN
    RAISE EXCEPTION 'satu laporan terbuka per pelapor';
  END IF;
  IF (SELECT hidden_at FROM public.event_comments WHERE id = current_setting('uji.comment')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'dua pelapor belum menyembunyikan';
  END IF;
END$$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a05';
SELECT public.report_event_comment(current_setting('uji.comment')::uuid, 'harassment', NULL);
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a02';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 50) WHERE id = current_setting('uji.comment')::uuid) THEN
    RAISE EXCEPTION 'tiga pelapor = tersembunyi';
  END IF;
  -- Balasannya ikut tak tampil: utasnya tersembunyi.
  IF EXISTS (SELECT 1 FROM public.list_event_comments('00000000-0000-4000-8000-0000000e0e01', 50) WHERE parent_id = current_setting('uji.comment')::uuid) THEN
    RAISE EXCEPTION 'balasan dari utas tersembunyi tidak tampil';
  END IF;
  IF (SELECT comment_count FROM public.event_engagement_state('00000000-0000-4000-8000-0000000e0e01')) <> 2 THEN
    RAISE EXCEPTION 'hitungan detail tanpa utas tersembunyi = 2';
  END IF;
END$$;
RESET ROLE;
DO $$
DECLARE v_queue RECORD;
BEGIN
  -- Utama disembunyikan = seluruh utasnya (utama + 3 balasan) tidak terhitung di kartu.
  IF (SELECT comment_count FROM public.event_engagement WHERE event_id = '00000000-0000-4000-8000-0000000e0e01') <> 2 THEN
    RAISE EXCEPTION 'penghitung kartu = utas yang tampil saja (2)';
  END IF;
  SELECT * INTO v_queue FROM public.admin_event_comment_report_queue(50);
  IF v_queue.report_count <> 3 OR NOT v_queue.hidden OR NOT v_queue.hidden_auto OR v_queue.author_name <> 'Dinda Pratiwi Sari'
     OR v_queue.reasons <> ARRAY['harassment', 'misleading', 'spam'] OR v_queue.event_title <> 'Lomba Ramai Uji' THEN
    RAISE EXCEPTION 'antrean per komentar tidak sesuai: %', row_to_json(v_queue);
  END IF;
  PERFORM public.admin_resolve_event_comment_report(v_queue.report_id, '00000000-0000-4000-8000-0000000e0a06', 'DISMISSED', false, 'Pertanyaan wajar');
  IF (SELECT hidden_at FROM public.event_comments WHERE id = current_setting('uji.comment')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'diabaikan = tersembunyi otomatis tampil lagi';
  END IF;
  IF (SELECT comment_count FROM public.event_engagement WHERE event_id = '00000000-0000-4000-8000-0000000e0e01') <> 6 THEN
    RAISE EXCEPTION 'penghitung kartu naik lagi saat tampil';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE type = 'REPORT_DISMISSED' AND message LIKE '%komentar kegiatan%') <> 3 THEN
    RAISE EXCEPTION 'tiap pelapor dikabari';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE message LIKE '%Pertanyaan wajar%') THEN
    RAISE EXCEPTION 'catatan moderator tidak sampai ke pelapor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_type = 'report' AND title LIKE 'Laporan komentar kegiatan%' AND to_status = 'DISMISSED') THEN
    RAISE EXCEPTION 'keputusan tercatat di riwayat';
  END IF;
  -- Moderator menyembunyikan langsung: final + tercatat.
  PERFORM public.admin_hide_event_comment(current_setting('uji.comment')::uuid, '00000000-0000-4000-8000-0000000e0a06', 'Menyesatkan');
  IF NOT EXISTS (SELECT 1 FROM public.event_comments WHERE id = current_setting('uji.comment')::uuid AND hidden_at IS NOT NULL AND NOT hidden_auto) THEN
    RAISE EXCEPTION 'disembunyikan moderator = final';
  END IF;
  BEGIN
    PERFORM public.admin_hide_event_comment(current_setting('uji.comment')::uuid, '00000000-0000-4000-8000-0000000e0a06', NULL);
    RAISE EXCEPTION 'yang sudah tersembunyi tidak bisa disembunyikan lagi';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END$$;

-- 7. Moderasi hanya service_role (bahkan admin aal2 tidak memanggil langsung).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a06';
SET LOCAL request.jwt.claims = '{"aal":"aal2"}';
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.admin_event_comment_report_queue(10);
    RAISE EXCEPTION 'antrean hanya service_role';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.delete_event_permanently('00000000-0000-4000-8000-0000000e0e04', '00000000-0000-4000-8000-0000000e0a06', 'Salah posting');
    RAISE EXCEPTION 'hapus permanen hanya service_role';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
-- Cara mendaftar: admin aal2 boleh mengatur.
SELECT public.set_event_registration_mode('00000000-0000-4000-8000-0000000e0e04', 'studentfo');
RESET request.jwt.claims;
-- Pengelola terverifikasi boleh, orang lain tidak; nilai di luar daftar ditolak.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a07';
SELECT public.set_event_registration_mode('00000000-0000-4000-8000-0000000e0e01', 'studentfo');
DO $$
BEGIN
  BEGIN
    PERFORM public.set_event_registration_mode('00000000-0000-4000-8000-0000000e0e01', 'gform');
    RAISE EXCEPTION 'mode di luar daftar ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a02';
DO $$
BEGIN
  BEGIN
    PERFORM public.set_event_registration_mode('00000000-0000-4000-8000-0000000e0e01', 'external');
    RAISE EXCEPTION 'bukan pengelola tidak boleh mengatur cara mendaftar';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT registration_mode FROM public.events_listing WHERE id = '00000000-0000-4000-8000-0000000e0e01') <> 'studentfo'
     OR (SELECT registration_mode FROM public.events_listing WHERE id = '00000000-0000-4000-8000-0000000e0e04') <> 'studentfo' THEN
    RAISE EXCEPTION 'cara mendaftar tersimpan & terbaca dari view';
  END IF;
END$$;

-- 8. approve_submission: 'studentfo' hanya untuk pengirim penyelenggara terverifikasi/admin.
INSERT INTO public.ugc_submissions (id, submitted_by_email, submitted_by, payload) VALUES
  ('00000000-0000-4000-8000-0000000e05b1', 'panitia@eng', '00000000-0000-4000-8000-0000000e0a07',
   jsonb_build_object('title', 'Lomba Mandiri Panitia', 'organizer', 'Org Ramai', 'event_type', 'LOMBA',
     'registration_link', 'https://studentfo.example/events', 'education_levels', '["SMA_SMK"]'::jsonb,
     'deadline_at', (now() + interval '10 days')::text, 'registration_mode', 'studentfo')),
  ('00000000-0000-4000-8000-0000000e05b2', 'pembaca@eng', '00000000-0000-4000-8000-0000000e0a02',
   jsonb_build_object('title', 'Lomba Kiriman Biasa', 'organizer', 'Siapa Saja', 'event_type', 'LOMBA',
     'registration_link', 'https://daftar.example/x', 'education_levels', '["SMA_SMK"]'::jsonb,
     'deadline_at', (now() + interval '10 days')::text, 'registration_mode', 'studentfo'));
DO $$
DECLARE v_mine UUID; v_other UUID;
BEGIN
  v_mine := public.approve_submission('00000000-0000-4000-8000-0000000e05b1', '00000000-0000-4000-8000-0000000e0a06');
  v_other := public.approve_submission('00000000-0000-4000-8000-0000000e05b2', '00000000-0000-4000-8000-0000000e0a06');
  IF (SELECT registration_mode FROM public.events WHERE id = v_mine) <> 'studentfo' THEN
    RAISE EXCEPTION 'penyelenggara terverifikasi boleh lomba mandiri';
  END IF;
  IF (SELECT registration_mode FROM public.events WHERE id = v_other) <> 'external' THEN
    RAISE EXCEPTION 'payload suntikan dari akun biasa tidak boleh menjadikan studentfo';
  END IF;
END$$;

-- 9. Bagikan ke koneksi: hanya koneksi diterima, tanpa blokir, tanpa penerima tertangguh; dedupe per kegiatan.
INSERT INTO public.connections (requester_id, addressee_id) VALUES
  ('00000000-0000-4000-8000-0000000e0a02', '00000000-0000-4000-8000-0000000e0a03'),
  ('00000000-0000-4000-8000-0000000e0a04', '00000000-0000-4000-8000-0000000e0a02'),
  ('00000000-0000-4000-8000-0000000e0a02', '00000000-0000-4000-8000-0000000e0a05');
UPDATE public.connections SET status = 'ACCEPTED', responded_at = now()
WHERE requester_id IN ('00000000-0000-4000-8000-0000000e0a02', '00000000-0000-4000-8000-0000000e0a04')
  AND addressee_id IN ('00000000-0000-4000-8000-0000000e0a03', '00000000-0000-4000-8000-0000000e0a02');
-- Koneksi ke lapor3 tetap PENDING; lapor2 memblokir pembaca setelah terhubung.
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000e0a04', '00000000-0000-4000-8000-0000000e0a02');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a02';
DO $$
DECLARE v_sent INT;
BEGIN
  v_sent := public.share_event_with_connections('00000000-0000-4000-8000-0000000e0e01', ARRAY[
    '00000000-0000-4000-8000-0000000e0a03', '00000000-0000-4000-8000-0000000e0a03',
    '00000000-0000-4000-8000-0000000e0a04', '00000000-0000-4000-8000-0000000e0a05',
    '00000000-0000-4000-8000-0000000e0a01', '00000000-0000-4000-8000-0000000e0a02'
  ]::uuid[]);
  IF v_sent <> 1 THEN RAISE EXCEPTION 'hanya satu koneksi sah yang dikabari, dapat %', v_sent; END IF;
  -- Kirim ulang = notifikasi yang sama diperbarui, bukan baris baru.
  PERFORM public.share_event_with_connections('00000000-0000-4000-8000-0000000e0e01', ARRAY['00000000-0000-4000-8000-0000000e0a03']::uuid[]);
  BEGIN
    PERFORM public.share_event_with_connections('00000000-0000-4000-8000-0000000e0e02', ARRAY['00000000-0000-4000-8000-0000000e0a03']::uuid[]);
    RAISE EXCEPTION 'kegiatan belum tayang tidak bisa dibagikan';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.share_event_with_connections('00000000-0000-4000-8000-0000000e0e01', ARRAY[]::uuid[]);
    RAISE EXCEPTION 'tanpa penerima ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE type = 'EVENT_SHARED') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.notifications WHERE type = 'EVENT_SHARED' AND user_id = '00000000-0000-4000-8000-0000000e0a03'
                    AND message = 'Bima A. membagikan "Lomba Ramai Uji" kepadamu.' AND event_id = '00000000-0000-4000-8000-0000000e0e01') THEN
    RAISE EXCEPTION 'kabar bagikan: satu baris, kalimat tetap, nama tersingkat';
  END IF;
END$$;
DELETE FROM public.connection_blocks WHERE blocker_id = '00000000-0000-4000-8000-0000000e0a04';

-- 10. "Lagi ramai": skor = Σ bobot × 2^(−jam/72), sekali per orang untuk komentar & klik, hanya kegiatan terbuka.
-- Bersihkan sinyal bagian sebelumnya supaya angka bisa dihitung tangan.
DELETE FROM public.event_comments;
DELETE FROM public.event_likes;
INSERT INTO public.event_likes (event_id, user_id, created_at) VALUES
  ('00000000-0000-4000-8000-0000000e0e01', '00000000-0000-4000-8000-0000000e0a02', now() - interval '72 hours'),
  ('00000000-0000-4000-8000-0000000e0e01', '00000000-0000-4000-8000-0000000e0a03', now()),
  -- Di luar jendela 14 hari: tidak dihitung.
  ('00000000-0000-4000-8000-0000000e0e04', '00000000-0000-4000-8000-0000000e0a02', now() - interval '15 days'),
  -- Kegiatan tutup: tidak dinilai.
  ('00000000-0000-4000-8000-0000000e0e03', '00000000-0000-4000-8000-0000000e0a02', now());
INSERT INTO public.event_comments (event_id, author_id, body, created_at) VALUES
  ('00000000-0000-4000-8000-0000000e0e01', '00000000-0000-4000-8000-0000000e0a01', 'Komentar lama', now() - interval '144 hours'),
  ('00000000-0000-4000-8000-0000000e0e01', '00000000-0000-4000-8000-0000000e0a01', 'Komentar baru', now());
INSERT INTO public.saved_events (user_id, event_id, saved_at) VALUES
  ('00000000-0000-4000-8000-0000000e0a05', '00000000-0000-4000-8000-0000000e0e01', now() - interval '144 hours');
INSERT INTO public.recommendation_signals (event_id, kind, user_id, created_at) VALUES
  ('00000000-0000-4000-8000-0000000e0e01', 'register_click', '00000000-0000-4000-8000-0000000e0a04', now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000e0e01', 'register_click', '00000000-0000-4000-8000-0000000e0a04', now()),
  ('00000000-0000-4000-8000-0000000e0e01', 'register_click', NULL, now());
DO $$
DECLARE v_score FLOAT8; v_expected FLOAT8;
BEGIN
  PERFORM public.refresh_event_trends();
  -- suka: 1×0,5 + 1×1 · komentar: satu orang, terakhir = sekarang → 2×1 · simpan: 3×0,25 · klik: satu orang terakhir sekarang → 4×1
  v_expected := 0.5 + 1 + 2 + 0.75 + 4;
  SELECT trend_score INTO v_score FROM public.events_listing WHERE id = '00000000-0000-4000-8000-0000000e0e01';
  IF abs(v_score - v_expected) > 0.01 THEN
    RAISE EXCEPTION 'skor ramai %, harap %', v_score, v_expected;
  END IF;
  IF (SELECT trend_score FROM public.events_listing WHERE id = '00000000-0000-4000-8000-0000000e0e04') <> 0
     OR (SELECT trend_score FROM public.events_listing WHERE id = '00000000-0000-4000-8000-0000000e0e03') <> 0 THEN
    RAISE EXCEPTION 'di luar jendela & kegiatan tutup = 0';
  END IF;
  -- Tidak lagi ada sinyal → turun ke nol pada penyegaran berikutnya.
  DELETE FROM public.event_likes;
  DELETE FROM public.event_comments;
  DELETE FROM public.saved_events WHERE event_id = '00000000-0000-4000-8000-0000000e0e01';
  DELETE FROM public.recommendation_signals WHERE event_id = '00000000-0000-4000-8000-0000000e0e01';
  PERFORM public.refresh_event_trends();
END$$;
DO $$
BEGIN
  IF (SELECT trend_score FROM public.events_listing WHERE id = '00000000-0000-4000-8000-0000000e0e01') <> 0 THEN
    RAISE EXCEPTION 'tanpa sinyal lagi = skor nol';
  END IF;
  IF (SELECT like_count FROM public.event_engagement WHERE event_id = '00000000-0000-4000-8000-0000000e0e01') <> 0
     OR (SELECT comment_count FROM public.event_engagement WHERE event_id = '00000000-0000-4000-8000-0000000e0e01') <> 0 THEN
    RAISE EXCEPTION 'penghitung turun ke nol setelah barisnya dihapus';
  END IF;
END$$;

-- 11. Hapus permanen: harus diturunkan dulu, wajib alasan, pendaftar aktif menghalangi, tercatat, berkas didata.
INSERT INTO public.event_likes (event_id, user_id) VALUES ('00000000-0000-4000-8000-0000000e0e04', '00000000-0000-4000-8000-0000000e0a02');
INSERT INTO public.event_comments (event_id, author_id, body) VALUES ('00000000-0000-4000-8000-0000000e0e04', '00000000-0000-4000-8000-0000000e0a02', 'Salah info ya ini?');
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.event_deletion_files('00000000-0000-4000-8000-0000000e0e04');
    RAISE EXCEPTION 'kegiatan tayang harus diturunkan dulu';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'event_not_taken_down' THEN RAISE; END IF;
  END;
  UPDATE public.events SET status = 'REJECTED', reviewed_at = now(), reviewed_by = '00000000-0000-4000-8000-0000000e0a06', rejection_reason = 'Dihapus admin: salah posting'
  WHERE id = '00000000-0000-4000-8000-0000000e0e04';
  INSERT INTO public.event_registration_forms (event_id, is_open) VALUES ('00000000-0000-4000-8000-0000000e0e04', true);
  INSERT INTO public.event_registrations (event_id, user_id, full_name, email, answers, status, code)
  VALUES ('00000000-0000-4000-8000-0000000e0e04', '00000000-0000-4000-8000-0000000e0a03', 'Pelapor Satu', 'lapor1@eng', '{}', 'CONFIRMED', 'SF-0000E0E4');
  BEGIN
    PERFORM * FROM public.event_deletion_files('00000000-0000-4000-8000-0000000e0e04');
    RAISE EXCEPTION 'pendaftar aktif menghalangi';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'event_has_registrations' THEN RAISE; END IF;
  END;
  UPDATE public.event_registrations SET status = 'CANCELLED' WHERE event_id = '00000000-0000-4000-8000-0000000e0e04';
  IF EXISTS (SELECT 1 FROM public.event_deletion_files('00000000-0000-4000-8000-0000000e0e04')) THEN
    RAISE EXCEPTION 'tanpa foto & bukti = tidak ada berkas';
  END IF;
  BEGIN
    PERFORM public.delete_event_permanently('00000000-0000-4000-8000-0000000e0e04', '00000000-0000-4000-8000-0000000e0a06', 'abc');
    RAISE EXCEPTION 'alasan wajib ≥ 5 karakter';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'deletion_reason_required' THEN RAISE; END IF;
  END;
  PERFORM public.delete_event_permanently('00000000-0000-4000-8000-0000000e0e04', '00000000-0000-4000-8000-0000000e0a06', 'Salah posting, duplikat');
  IF EXISTS (SELECT 1 FROM public.events WHERE id = '00000000-0000-4000-8000-0000000e0e04')
     OR EXISTS (SELECT 1 FROM public.event_comments WHERE event_id = '00000000-0000-4000-8000-0000000e0e04')
     OR EXISTS (SELECT 1 FROM public.event_engagement WHERE event_id = '00000000-0000-4000-8000-0000000e0e04') THEN
    RAISE EXCEPTION 'kegiatan & semua turunannya hilang (penghitung tidak menghalangi kaskade)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_id = '00000000-0000-4000-8000-0000000e0e04'
                 AND from_status = 'REJECTED' AND to_status = 'DELETED' AND actor_id = '00000000-0000-4000-8000-0000000e0a06'
                 AND title = 'Lomba Sepi Uji' AND reason = 'Salah posting, duplikat') THEN
    RAISE EXCEPTION 'hapus permanen tercatat di riwayat';
  END IF;
  BEGIN
    PERFORM public.delete_event_permanently('00000000-0000-4000-8000-0000000e0e04', '00000000-0000-4000-8000-0000000e0a06', 'Sekali lagi');
    RAISE EXCEPTION 'yang sudah dihapus tidak ditemukan';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END$$;

-- 12. Ekspor: komentar milik sendiri, termasuk yang disembunyikan.
INSERT INTO public.event_comments (event_id, author_id, body, hidden_at) VALUES
  ('00000000-0000-4000-8000-0000000e0e01', '00000000-0000-4000-8000-0000000e0a01', 'Tersembunyi tapi milikku', now());
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0a01';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.my_event_comments() WHERE hidden AND event_title = 'Lomba Ramai Uji') <> 1 THEN
    RAISE EXCEPTION 'ekspor memuat komentar sendiri termasuk yang disembunyikan';
  END IF;
END$$;
RESET ROLE;
ROLLBACK;
