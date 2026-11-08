-- Tanya-jawab publik per kegiatan (ADR-062 #7).
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f9a01', 'penanya@x', '{"full_name":"Sinta Ayu Lestari"}'),
  ('00000000-0000-4000-8000-0000000f9a02', 'panitia@x', '{"full_name":"Panitia Lomba"}'),
  ('00000000-0000-4000-8000-0000000f9a03', 'admin@x', '{"full_name":"Admin Moderator"}'),
  ('00000000-0000-4000-8000-0000000f9a04', 'lain@x', '{"full_name":"Orang Lain"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000f9a03';

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at, education_levels) VALUES
  ('00000000-0000-4000-8000-0000000f9e01', 'Lomba Tanya Jawab', 'Org Tanya', 'LOMBA', 'https://q.example/1', 'https://q.example/1', 'APPROVED', now(), '{D4_S1}'),
  ('00000000-0000-4000-8000-0000000f9e02', 'Lomba Antre', 'Org Antre', 'LOMBA', 'https://q.example/2', 'https://q.example/2', 'PENDING', NULL, '{D4_S1}'),
  ('00000000-0000-4000-8000-0000000f9e03', 'Lomba Tutup', 'Org Tutup', 'LOMBA', 'https://q.example/3', 'https://q.example/3', 'EXPIRED', now(), '{D4_S1}');
INSERT INTO public.organizer_profiles (user_id, org_name, evidence)
VALUES ('00000000-0000-4000-8000-0000000f9a02', 'Org Tanya', 'Ketua panitia, https://q.example/panitia');
SELECT public.review_organizer('00000000-0000-4000-8000-0000000f9a02', 'VERIFIED', NULL, NULL);
INSERT INTO public.event_managers (event_id, user_id, source) VALUES ('00000000-0000-4000-8000-0000000f9e01', '00000000-0000-4000-8000-0000000f9a02', 'ADMIN');

-- 1. Tamu membaca, tidak bisa bertanya; tabel tidak bisa disentuh langsung.
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM * FROM public.list_event_questions('00000000-0000-4000-8000-0000000f9e01', 10);
  BEGIN
    PERFORM public.ask_event_question('00000000-0000-4000-8000-0000000f9e01', 'Apakah boleh tim lintas kampus?');
    RAISE EXCEPTION 'tamu tidak boleh bertanya';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- 2. Bertanya.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f9a01';
DO $$
DECLARE
  q UUID;
BEGIN
  BEGIN
    PERFORM 1 FROM public.event_questions;
    RAISE EXCEPTION 'tabel tidak boleh dibaca langsung (id akun penanya)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.ask_event_question('00000000-0000-4000-8000-0000000f9e02', 'Kegiatan ini belum tayang, kan?');
    RAISE EXCEPTION 'kegiatan yang belum tayang tidak menerima pertanyaan';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.ask_event_question('00000000-0000-4000-8000-0000000f9e03', 'Kapan pengumuman pemenangnya?');
    RAISE EXCEPTION 'kegiatan yang sudah tutup tidak menerima pertanyaan baru';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.ask_event_question('00000000-0000-4000-8000-0000000f9e01', '  hai  ');
    RAISE EXCEPTION 'pertanyaan < 10 karakter ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  q := public.ask_event_question('00000000-0000-4000-8000-0000000f9e01', '  Apakah boleh tim lintas kampus?  ');
  IF (SELECT body FROM public.list_event_questions('00000000-0000-4000-8000-0000000f9e01', 10) WHERE id = q) <> 'Apakah boleh tim lintas kampus?' THEN
    RAISE EXCEPTION 'isi dirapikan';
  END IF;
  IF NOT (SELECT is_mine FROM public.list_event_questions('00000000-0000-4000-8000-0000000f9e01', 10) WHERE id = q) THEN
    RAISE EXCEPTION 'penanya mengenali pertanyaannya sendiri';
  END IF;
  IF (SELECT author_first_name FROM public.list_event_questions('00000000-0000-4000-8000-0000000f9e01', 10) WHERE id = q) <> 'Sinta' THEN
    RAISE EXCEPTION 'hanya nama depan yang tampil publik';
  END IF;
  FOR i IN 1..4 LOOP
    PERFORM public.ask_event_question('00000000-0000-4000-8000-0000000f9e01', format('Pertanyaan tambahan nomor %s?', i));
  END LOOP;
  BEGIN
    PERFORM public.ask_event_question('00000000-0000-4000-8000-0000000f9e01', 'Pertanyaan keenam hari ini?');
    RAISE EXCEPTION 'lebih dari 5 pertanyaan sehari harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'question_rate_limited' THEN RAISE; END IF;
  END;
END$$;
RESET ROLE;

-- Id diambil sebagai pemilik database: peran API sengaja tidak bisa membaca tabelnya.
SELECT set_config('uji.q0', (SELECT id::text FROM public.event_questions WHERE body = 'Apakah boleh tim lintas kampus?'), true),
       set_config('uji.q1', (SELECT id::text FROM public.event_questions WHERE body = 'Pertanyaan tambahan nomor 1?'), true),
       set_config('uji.q2', (SELECT id::text FROM public.event_questions WHERE body = 'Pertanyaan tambahan nomor 2?'), true),
       set_config('uji.q3', (SELECT id::text FROM public.event_questions WHERE body = 'Pertanyaan tambahan nomor 3?'), true),
       set_config('uji.q4', (SELECT id::text FROM public.event_questions WHERE body = 'Pertanyaan tambahan nomor 4?'), true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000f9a02' AND type = 'QUESTION_ASKED') <> 1 THEN
    RAISE EXCEPTION 'pengelola terverifikasi dikabari SEKALI per kegiatan, bukan per pertanyaan';
  END IF;
END$$;

-- 3. Menjawab: bukan pengelola ditolak; pengelola = penyelenggara; admin tanpa MFA ditolak, dengan MFA = moderator.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f9a04';
DO $$
DECLARE
  q UUID := current_setting('uji.q0')::uuid;
BEGIN
  PERFORM public.answer_event_question(q, 'Boleh, saya jamin.');
  RAISE EXCEPTION 'orang lain tidak boleh menjawab atas nama penyelenggara';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f9a02';
DO $$
DECLARE
  q UUID := current_setting('uji.q0')::uuid;
BEGIN
  PERFORM public.answer_event_question(q, 'Boleh, maksimal tiga orang per tim.');
  IF (SELECT answered_as FROM public.list_event_questions('00000000-0000-4000-8000-0000000f9e01', 10) WHERE id = q) <> 'organizer' THEN
    RAISE EXCEPTION 'jawaban pengelola berlabel penyelenggara';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f9a03';
DO $$
DECLARE
  q UUID := current_setting('uji.q1')::uuid;
BEGIN
  BEGIN
    PERFORM public.answer_event_question(q, 'Jawaban admin tanpa MFA');
    RAISE EXCEPTION 'admin aal1 tidak boleh menjawab';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', '{"aal":"aal2"}', true);
  PERFORM public.answer_event_question(q, 'Silakan cek buku panduan bagian 3.');
  IF (SELECT answered_as FROM public.list_event_questions('00000000-0000-4000-8000-0000000f9e01', 10) WHERE id = q) <> 'moderator' THEN
    RAISE EXCEPTION 'jawaban admin berlabel moderator';
  END IF;
END$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000f9a01' AND type = 'QUESTION_ANSWERED') <> 1 THEN
    RAISE EXCEPTION 'penanya dikabari (satu kabar per kegiatan yang diperbarui)';
  END IF;
END$$;

-- 4. Laporan → sembunyikan → hilang dari daftar, tercatat di riwayat; penanya menghapus pertanyaannya sendiri.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f9a04';
SELECT public.report_content('question', current_setting('uji.q2')::uuid, 'spam', NULL);
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f9a01';
DO $$
BEGIN
  PERFORM public.report_content('question', current_setting('uji.q3')::uuid, 'spam', NULL);
  RAISE EXCEPTION 'tidak boleh melaporkan pertanyaan sendiri';
EXCEPTION WHEN no_data_found THEN NULL;
END$$;
DO $$
BEGIN
  PERFORM public.delete_event_question(current_setting('uji.q4')::uuid);
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f9a04';
DO $$
BEGIN
  PERFORM public.delete_event_question(current_setting('uji.q3')::uuid);
  RAISE EXCEPTION 'hanya penanya yang bisa menghapus pertanyaannya';
EXCEPTION WHEN no_data_found THEN NULL;
END$$;
RESET ROLE;

DO $$
DECLARE
  q UUID := current_setting('uji.q2')::uuid;
  report UUID := (SELECT id FROM public.content_reports WHERE subject_type = 'question' AND subject_id = current_setting('uji.q2')::uuid);
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_questions WHERE body = 'Pertanyaan tambahan nomor 4?') THEN
    RAISE EXCEPTION 'penanya bisa menghapus pertanyaannya';
  END IF;
  PERFORM public.hide_event_question(q, '00000000-0000-4000-8000-0000000f9a03', 'Spam berulang');
  PERFORM public.resolve_content_report(report, '00000000-0000-4000-8000-0000000f9a03', 'RESOLVED', 'Disembunyikan');
  IF EXISTS (SELECT 1 FROM public.list_event_questions('00000000-0000-4000-8000-0000000f9e01', 50) WHERE id = q) THEN
    RAISE EXCEPTION 'pertanyaan yang disembunyikan tidak tampil';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_type = 'question' AND subject_id = q AND to_status = 'REJECTED' AND reason = 'Spam berulang') THEN
    RAISE EXCEPTION 'penyembunyian tercatat di riwayat moderasi';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000f9a04' AND type = 'REPORT_RESOLVED' AND message LIKE '%pertanyaan yang kamu laporkan%') THEN
    RAISE EXCEPTION 'pelapor pertanyaan dikabari dengan subjek yang benar';
  END IF;
  BEGIN
    PERFORM public.hide_event_question(q, '00000000-0000-4000-8000-0000000f9a03', NULL);
    RAISE EXCEPTION 'menyembunyikan dua kali = tidak ditemukan';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END$$;

-- 5. Ekspor data: penanya melihat semua pertanyaannya, termasuk yang disembunyikan; orang lain tidak.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f9a04';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_my_event_questions()) THEN RAISE EXCEPTION 'orang lain tidak melihat pertanyaan penanya'; END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f9a01';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.list_my_event_questions()) <> 4 OR NOT EXISTS (SELECT 1 FROM public.list_my_event_questions() WHERE hidden) THEN
    RAISE EXCEPTION 'ekspor memuat 4 pertanyaan tersisa termasuk yang disembunyikan (yang dihapus sendiri tidak), dapat %', (SELECT count(*) FROM public.list_my_event_questions());
  END IF;
END$$;
RESET ROLE;

-- 6. Hapus akun penanya menghapus pertanyaannya.
DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000f9a01';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_questions WHERE body LIKE 'Pertanyaan tambahan%' OR body = 'Apakah boleh tim lintas kampus?') THEN
    RAISE EXCEPTION 'pertanyaan ikut terhapus bersama akun penanya';
  END IF;
END$$;
ROLLBACK;
