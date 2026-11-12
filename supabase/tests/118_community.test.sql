-- Komunitas (ADR-087): forum publik khusus anggota yang dimoderasi.
-- Cermin: src/lib/data/community.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000c001', 'penulis@kom', '{"full_name":"Dinda Pratiwi Sari"}'),
  ('00000000-0000-4000-8000-00000000c002', 'pembaca@kom', '{"full_name":"Bima"}'),
  ('00000000-0000-4000-8000-00000000c003', 'pelapor1@kom', '{"full_name":"Pelapor Satu"}'),
  ('00000000-0000-4000-8000-00000000c004', 'pelapor2@kom', '{"full_name":"Pelapor Dua"}'),
  ('00000000-0000-4000-8000-00000000c005', 'pelapor3@kom', '{"full_name":"Pelapor Tiga"}'),
  ('00000000-0000-4000-8000-00000000c006', 'admin@kom', '{"full_name":"Admin Uji"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-00000000c006';
-- Penulis: profil hanya untuk koneksi → username & foto tidak keluar ke orang asing.
UPDATE public.users SET username = 'dinda.uji', profile_visibility = 'NETWORK' WHERE id = '00000000-0000-4000-8000-00000000c001';
INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-00000000ce01', 'Lomba Komunitas Uji', 'Panitia', 'LOMBA', 'https://daftar.example/k1', 'https://sumber.example/k1', 'APPROVED', now()),
  ('00000000-0000-4000-8000-00000000ce02', 'Lomba Belum Tayang', 'Panitia', 'LOMBA', 'https://daftar.example/k2', 'https://sumber.example/k2', 'PENDING', NULL);

-- 0. Pembantu: nama tersingkat & penyaring kontak (contoh yang sama di community.test.ts).
DO $$
BEGIN
  IF public.community_display_name('Dinda Pratiwi Sari') <> 'Dinda S.'
     OR public.community_display_name('  bima  ') <> 'bima'
     OR public.community_display_name('Rani   prameswari') <> 'Rani P.'
     OR public.community_display_name('') <> 'Anggota'
     OR public.community_display_name(NULL) <> 'Anggota' THEN
    RAISE EXCEPTION 'community_display_name tidak sesuai';
  END IF;
  IF NOT public.community_has_contact('hubungi 081234567890 ya')
     OR NOT public.community_has_contact('WA +62 812-3456-7890')
     OR NOT public.community_has_contact('email aku: dinda.uji@kampus.ac.id')
     OR NOT public.community_has_contact('gabung https://chat.whatsapp.com/AbCd')
     OR NOT public.community_has_contact('t.me/grupku')
     OR public.community_has_contact('Batas 14 Nov 2026 pukul 08.00 WIB, hadiah Rp 2.500.000')
     OR public.community_has_contact('Tim 3-5 orang, kode lomba 0812') THEN
    RAISE EXCEPTION 'community_has_contact tidak sesuai';
  END IF;
END$$;

-- 1. Tamu tidak bisa memanggil apa pun; tabel tidak terbaca siapa pun selain lewat RPC.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.list_community_posts();
    RAISE EXCEPTION 'anon tidak boleh membaca Komunitas';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.create_community_post('tanya', 'Judul uji tamu', 'Isi postingan tamu uji', NULL);
    RAISE EXCEPTION 'anon tidak boleh menulis';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c002';
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.community_posts;
    RAISE EXCEPTION 'tabel tidak boleh terbaca langsung';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- 2. Menulis: validasi, filter kontak, kegiatan harus tayang, batas laju 5/hari.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c001';
DO $$
DECLARE v_post UUID;
BEGIN
  BEGIN
    PERFORM public.create_community_post('gosip', 'Judul yang cukup', 'Isi yang cukup panjang', NULL);
    RAISE EXCEPTION 'topik di luar daftar harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.create_community_post('tanya', 'Pendek', 'Isi', NULL);
    RAISE EXCEPTION 'isi terlalu pendek harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.create_community_post('cari-tim', 'Cari anggota tim UI/UX', 'Yang minat chat 081234567890 ya', NULL);
    RAISE EXCEPTION 'nomor HP harus ditolak';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'community_contact_blocked' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_community_post('info', 'Info lomba belum tayang', 'Ini kegiatan yang belum disetujui moderator', '00000000-0000-4000-8000-00000000ce02');
    RAISE EXCEPTION 'kegiatan yang belum tayang tidak boleh ditautkan';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  v_post := public.create_community_post('tanya', 'Boleh tim lintas kampus?', 'Ada yang tahu apakah lomba ini boleh tim lintas kampus?', '00000000-0000-4000-8000-00000000ce01');
  PERFORM set_config('uji.post', v_post::text, true);
END$$;
RESET ROLE;

-- 3. Membaca: nama tersingkat, username/foto hanya bila boleh melihat profil, tamu-tanpa-sesi kosong.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c002';
DO $$
DECLARE v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM public.list_community_posts(NULL, NULL, NULL, NULL, 20);
  IF v_row.id IS DISTINCT FROM current_setting('uji.post')::uuid THEN
    RAISE EXCEPTION 'postingan harus tampil di lini masa';
  END IF;
  IF v_row.author_name <> 'Dinda S.' OR v_row.author_username IS NOT NULL OR v_row.is_mine THEN
    RAISE EXCEPTION 'nama tersingkat & tanpa username untuk orang asing, dapat % / %', v_row.author_name, v_row.author_username;
  END IF;
  IF v_row.event_slug IS NULL OR v_row.event_title <> 'Lomba Komunitas Uji' OR v_row.topic <> 'tanya' THEN
    RAISE EXCEPTION 'kegiatan & topik harus ikut';
  END IF;
  IF (SELECT count(*) FROM public.list_community_posts('cerita', NULL, NULL, NULL, 20)) <> 0
     OR (SELECT count(*) FROM public.list_community_posts(NULL, '00000000-0000-4000-8000-00000000ce01', NULL, NULL, 20)) <> 1 THEN
    RAISE EXCEPTION 'saringan topik & kegiatan';
  END IF;
  -- Kursor: tidak ada yang lebih lama dari postingan ini.
  IF EXISTS (SELECT 1 FROM public.list_community_posts(NULL, NULL, v_row.last_activity_at, v_row.id, 20)) THEN
    RAISE EXCEPTION 'kursor harus melewati postingan yang sudah tampil';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_community_posts()) THEN
    RAISE EXCEPTION 'tanpa sesi tidak ada yang terbaca';
  END IF;
END$$;
RESET ROLE;

-- 4. Membalas: penulis dikabari SEKALI per postingan (diperbarui), membalas sendiri tidak mengabari.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c002';
DO $$
BEGIN
  PERFORM public.reply_community_post(current_setting('uji.post')::uuid, 'Boleh, tahun lalu timku lintas kampus.');
  PERFORM public.reply_community_post(current_setting('uji.post')::uuid, 'Cek juga buku panduannya bagian 3.');
  BEGIN
    PERFORM public.reply_community_post(current_setting('uji.post')::uuid, 'Hubungi aku di dinda@contoh.id');
    RAISE EXCEPTION 'email di balasan harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c001';
DO $$
DECLARE v_count INT;
BEGIN
  PERFORM public.reply_community_post(current_setting('uji.post')::uuid, 'Terima kasih infonya!');
  SELECT count(*) INTO v_count FROM public.list_community_replies(current_setting('uji.post')::uuid, 300);
  IF v_count <> 3 THEN RAISE EXCEPTION 'tiga balasan, dapat %', v_count; END IF;
  IF NOT (SELECT is_op FROM public.list_community_replies(current_setting('uji.post')::uuid, 300) WHERE is_mine) THEN
    RAISE EXCEPTION 'balasan penulis postingan ditandai';
  END IF;
  IF (SELECT reply_count FROM public.list_community_posts() WHERE id = current_setting('uji.post')::uuid) <> 3 THEN
    RAISE EXCEPTION 'hitungan balasan di lini masa';
  END IF;
END$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-00000000c001' AND type = 'COMMUNITY_REPLY') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-00000000c001' AND community_post_id = current_setting('uji.post')::uuid AND NOT is_read) THEN
    RAISE EXCEPTION 'penulis dikabari satu kali per postingan';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-00000000c002' AND type = 'COMMUNITY_REPLY') THEN
    RAISE EXCEPTION 'pembalas tidak dikabari';
  END IF;
END$$;

-- 5. "Bermanfaat": bukan untuk tulisan sendiri, bisa dilepas lagi, terhitung.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c002';
DO $$
BEGIN
  IF NOT public.toggle_community_helpful(current_setting('uji.post')::uuid, NULL) THEN RAISE EXCEPTION 'tandai harus TRUE'; END IF;
  IF public.toggle_community_helpful(current_setting('uji.post')::uuid, NULL) THEN RAISE EXCEPTION 'lepas harus FALSE'; END IF;
  PERFORM public.toggle_community_helpful(current_setting('uji.post')::uuid, NULL);
  IF (SELECT helpful_count FROM public.get_community_post(current_setting('uji.post')::uuid)) <> 1
     OR NOT (SELECT helped FROM public.get_community_post(current_setting('uji.post')::uuid)) THEN
    RAISE EXCEPTION 'hitungan & tanda bermanfaat';
  END IF;
  BEGIN
    PERFORM public.toggle_community_helpful(NULL, (SELECT id FROM public.list_community_replies(current_setting('uji.post')::uuid, 300) WHERE is_mine LIMIT 1));
    RAISE EXCEPTION 'tulisan sendiri tidak bisa ditandai';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;
RESET ROLE;

-- 6. Blokir menyembunyikan dua arah; penangguhan menghilangkan tulisan.
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c002';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_community_posts() WHERE id = current_setting('uji.post')::uuid)
     OR EXISTS (SELECT 1 FROM public.get_community_post(current_setting('uji.post')::uuid)) THEN
    RAISE EXCEPTION 'yang diblokir tidak melihat postingan pemblokir';
  END IF;
  BEGIN
    PERFORM public.reply_community_post(current_setting('uji.post')::uuid, 'Masih bisa membalas?');
    RAISE EXCEPTION 'yang diblokir tidak bisa membalas';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c001';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.list_community_replies(current_setting('uji.post')::uuid, 300)) <> 1 THEN
    RAISE EXCEPTION 'pemblokir tidak melihat balasan orang yang diblokirnya';
  END IF;
END$$;
RESET ROLE;
DELETE FROM public.connection_blocks WHERE blocker_id = '00000000-0000-4000-8000-00000000c001';

-- 7. Laporan: bukan tulisan sendiri, satu terbuka per pelapor, tiga pelapor = sembunyi otomatis.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c001';
DO $$
BEGIN
  BEGIN
    PERFORM public.report_community_content('post', current_setting('uji.post')::uuid, 'spam', NULL);
    RAISE EXCEPTION 'tulisan sendiri tidak bisa dilaporkan';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c003';
SELECT public.report_community_content('post', current_setting('uji.post')::uuid, 'spam', 'Promosi berulang');
SELECT public.report_community_content('post', current_setting('uji.post')::uuid, 'spam', 'Klik lagi');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c004';
SELECT public.report_community_content('post', current_setting('uji.post')::uuid, 'misleading', NULL);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.community_reports WHERE status = 'OPEN') <> 2 THEN
    RAISE EXCEPTION 'satu laporan terbuka per pelapor';
  END IF;
  IF (SELECT hidden_at FROM public.community_posts WHERE id = current_setting('uji.post')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'dua pelapor belum menyembunyikan';
  END IF;
END$$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c005';
SELECT public.report_community_content('post', current_setting('uji.post')::uuid, 'harassment', NULL);
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c002';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_community_posts() WHERE id = current_setting('uji.post')::uuid) THEN
    RAISE EXCEPTION 'tiga pelapor = tersembunyi dari lini masa';
  END IF;
END$$;
RESET ROLE;

-- 8. Antrean: satu baris per tulisan; diabaikan = tampil lagi (hanya yang otomatis).
DO $$
DECLARE v_queue RECORD;
BEGIN
  SELECT * INTO v_queue FROM public.admin_community_report_queue(50);
  IF v_queue.report_count <> 3 OR NOT v_queue.hidden OR NOT v_queue.hidden_auto OR v_queue.author_name <> 'Dinda Pratiwi Sari'
     OR v_queue.reasons <> ARRAY['harassment', 'misleading', 'spam'] OR v_queue.snapshot NOT LIKE 'Boleh tim lintas kampus?%' THEN
    RAISE EXCEPTION 'antrean per tulisan tidak sesuai: %', row_to_json(v_queue);
  END IF;
  PERFORM public.admin_resolve_community_report(v_queue.report_id, '00000000-0000-4000-8000-00000000c006', 'DISMISSED', false, 'Pertanyaan wajar');
  IF (SELECT hidden_at FROM public.community_posts WHERE id = current_setting('uji.post')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'diabaikan = tersembunyi otomatis tampil lagi';
  END IF;
  IF (SELECT count(*) FROM public.community_reports WHERE status = 'DISMISSED') <> 3 THEN
    RAISE EXCEPTION 'semua laporan terbuka tulisan itu ikut ditutup';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE type = 'REPORT_DISMISSED' AND message LIKE '%Komunitas%') <> 3 THEN
    RAISE EXCEPTION 'tiap pelapor dikabari';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_type = 'report' AND title LIKE 'Laporan Komunitas: postingan%' AND to_status = 'DISMISSED') THEN
    RAISE EXCEPTION 'keputusan tercatat di riwayat';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE message LIKE '%Pertanyaan wajar%') THEN
    RAISE EXCEPTION 'catatan moderator tidak boleh sampai ke pelapor';
  END IF;
END$$;

-- 9. Ditindak + disembunyikan moderator: final, tidak terbuka lagi oleh laporan berikutnya.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c003';
SELECT public.report_community_content('post', current_setting('uji.post')::uuid, 'harassment', 'Ternyata menghina di balasan');
RESET ROLE;
DO $$
BEGIN
  PERFORM public.admin_resolve_community_report((SELECT id FROM public.community_reports WHERE status = 'OPEN'), '00000000-0000-4000-8000-00000000c006', 'RESOLVED', true, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE id = current_setting('uji.post')::uuid AND hidden_at IS NOT NULL AND NOT hidden_auto) THEN
    RAISE EXCEPTION 'disembunyikan moderator = final';
  END IF;
  BEGIN
    PERFORM public.admin_resolve_community_report((SELECT id FROM public.community_reports LIMIT 1), '00000000-0000-4000-8000-00000000c006', 'RESOLVED', true, NULL);
    RAISE EXCEPTION 'laporan yang sudah ditutup tidak bisa diputuskan lagi';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END$$;

-- 10. Moderasi hanya service_role; ekspor milik sendiri; hapus postingan membawa balasan & notifikasinya.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c006';
SET LOCAL request.jwt.claims = '{"aal":"aal2"}';
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.admin_community_report_queue(10);
    RAISE EXCEPTION 'authenticated (bahkan admin) tidak memanggil antrean langsung';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET request.jwt.claims;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c001';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.my_community_content() WHERE kind = 'post' AND hidden) <> 1
     OR (SELECT count(*) FROM public.my_community_content() WHERE kind = 'reply') <> 1 THEN
    RAISE EXCEPTION 'ekspor memuat postingan (termasuk yang disembunyikan) & balasan sendiri';
  END IF;
  PERFORM public.delete_community_post(current_setting('uji.post')::uuid);
END$$;
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.community_replies WHERE post_id = current_setting('uji.post')::uuid)
     OR EXISTS (SELECT 1 FROM public.notifications WHERE community_post_id = current_setting('uji.post')::uuid) THEN
    RAISE EXCEPTION 'hapus postingan membawa balasan & notifikasinya';
  END IF;
  -- Laporan tetap ada sebagai arsip, dengan cuplikan isinya.
  IF (SELECT count(*) FROM public.community_reports WHERE snapshot LIKE 'Boleh tim lintas kampus?%') < 1 THEN
    RAISE EXCEPTION 'laporan & cuplikannya bertahan walau tulisannya dihapus';
  END IF;
END$$;

-- 11. Batas laju: 5 postingan per hari.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c002';
DO $$
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM public.create_community_post('cerita', format('Cerita lomba ke-%s', i), 'Pengalaman ikut lomba pertama kali.', NULL);
  END LOOP;
  BEGIN
    PERFORM public.create_community_post('cerita', 'Cerita lomba ke-6', 'Pengalaman ikut lomba pertama kali.', NULL);
    RAISE EXCEPTION 'postingan ke-6 harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'community_rate_limited' THEN RAISE; END IF;
  END;
END$$;
RESET ROLE;

-- 12. Penulis yang ditangguhkan hilang dari Komunitas.
UPDATE public.users SET suspended_at = now(), suspension_reason = 'Uji' WHERE id = '00000000-0000-4000-8000-00000000c002';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c003';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_community_posts()) THEN
    RAISE EXCEPTION 'tulisan akun yang ditangguhkan tidak tampil';
  END IF;
END$$;
RESET ROLE;
ROLLBACK;
