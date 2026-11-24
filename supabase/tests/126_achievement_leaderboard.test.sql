-- Prestasi terverifikasi, peringkat, portofolio publik (ADR-098, migration 20261125100001).
-- Cermin: src/lib/data/achievement-verifications.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-000000980a01', 'juara@prestasi', '{"full_name":"Juara Satu"}'),
  ('00000000-0000-4000-8000-000000980a02', 'lain@prestasi', '{"full_name":"Orang Lain"}'),
  ('00000000-0000-4000-8000-000000980a03', 'admin@prestasi', '{"full_name":"Admin Prestasi"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-000000980a03';
UPDATE public.users SET institution_id = '001002', institution_name = 'Universitas Indonesia', username = 'juara.satu'
  WHERE id = '00000000-0000-4000-8000-000000980a01';

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at, is_demo) VALUES
  ('00000000-0000-4000-8000-000000980e01', 'Lomba Selesai Uji', 'Panitia', 'LOMBA', 'https://d.example/1', 'https://s.example/1', 'EXPIRED', now(), false),
  ('00000000-0000-4000-8000-000000980e02', 'Lomba Masih Buka Uji', 'Panitia', 'LOMBA', 'https://d.example/2', 'https://s.example/2', 'APPROVED', now(), false),
  ('00000000-0000-4000-8000-000000980e03', 'Beasiswa Uji', 'Yayasan', 'BEASISWA', 'https://d.example/3', 'https://s.example/3', 'EXPIRED', now(), false),
  ('00000000-0000-4000-8000-000000980e04', 'Lomba Dummy Uji', 'Panitia', 'LOMBA', 'https://d.example/4', 'https://s.example/4', 'EXPIRED', now(), true);
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-4000-8000-000000980e01', 'registration', now() - interval '30 days', true),
  ('00000000-0000-4000-8000-000000980e01', 'announcement', now() - interval '5 days', false),
  ('00000000-0000-4000-8000-000000980e02', 'registration', now() + interval '10 days', true),
  ('00000000-0000-4000-8000-000000980e03', 'registration', now() - interval '30 days', true),
  ('00000000-0000-4000-8000-000000980e04', 'registration', now() - interval '30 days', true);

INSERT INTO public.application_tracker (user_id, event_id, status, achievement, proof_url) VALUES
  ('00000000-0000-4000-8000-000000980a01', '00000000-0000-4000-8000-000000980e01', 'ACCEPTED', 'JUARA_1', 'https://bukti.example/sertifikat'),
  ('00000000-0000-4000-8000-000000980a01', '00000000-0000-4000-8000-000000980e02', 'APPLIED', 'FINALIS', 'https://bukti.example/f'),
  ('00000000-0000-4000-8000-000000980a01', '00000000-0000-4000-8000-000000980e03', 'ACCEPTED', 'PENERIMA', 'https://bukti.example/b'),
  ('00000000-0000-4000-8000-000000980a02', '00000000-0000-4000-8000-000000980e01', 'ACCEPTED', 'JUARA_2', NULL);

-- 1. Hak: tamu tidak bisa mengajukan; tabel tidak bisa ditulis klien.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.request_achievement_verification(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.review_achievement_verification(uuid, uuid, uuid, text, text, timestamptz)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.achievement_verifications', 'INSERT')
     OR has_table_privilege('authenticated', 'public.achievement_verifications', 'UPDATE')
     OR NOT has_function_privilege('anon', 'public.campus_leaderboard(timestamptz, timestamptz, text, integer)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.public_portfolio_page(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hak akses verifikasi/peringkat salah';
  END IF;
END$$;

-- 2. Pengajuan: terlalu dini, bukan lomba, tanpa bukti, lalu sah, lalu ganda.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000980a01';
DO $$
BEGIN
  BEGIN
    PERFORM public.request_achievement_verification('00000000-0000-4000-8000-000000980e02');
    RAISE EXCEPTION 'pendaftaran yang masih buka harus ditolak';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'verification_too_early' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.request_achievement_verification('00000000-0000-4000-8000-000000980e03');
    RAISE EXCEPTION 'beasiswa tidak masuk peringkat';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'verification_not_eligible' THEN RAISE; END IF;
  END;
  PERFORM public.request_achievement_verification('00000000-0000-4000-8000-000000980e01');
  BEGIN
    PERFORM public.request_achievement_verification('00000000-0000-4000-8000-000000980e01');
    RAISE EXCEPTION 'pengajuan ganda harus ditolak';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'verification_exists' THEN RAISE; END IF;
  END;
  IF (SELECT institution_name FROM public.achievement_verifications WHERE event_id = '00000000-0000-4000-8000-000000980e01') <> 'Universitas Indonesia' THEN
    RAISE EXCEPTION 'kampus harus disalin saat pengajuan';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000980a02';
DO $$
BEGIN
  BEGIN
    PERFORM public.request_achievement_verification('00000000-0000-4000-8000-000000980e01');
    RAISE EXCEPTION 'tanpa bukti harus ditolak';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'verification_needs_proof' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.achievement_verifications) THEN
    RAISE EXCEPTION 'orang lain tidak boleh membaca pengajuan milik orang lain';
  END IF;
END$$;
RESET ROLE;

-- 3. Sebelum diverifikasi: tidak ada di peringkat.
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.campus_leaderboard(NULL, NULL, NULL, 50)) THEN
    RAISE EXCEPTION 'pengajuan yang belum diverifikasi tidak boleh dihitung';
  END IF;
END$$;
RESET ROLE;

-- 4. Keputusan moderator (service_role): bukan admin / diri sendiri / versi basi ditolak; sah → VERIFIED + notifikasi.
SET LOCAL ROLE service_role;
DO $$
DECLARE v_at TIMESTAMPTZ;
BEGIN
  SELECT requested_at INTO v_at FROM public.achievement_verifications WHERE event_id = '00000000-0000-4000-8000-000000980e01';
  BEGIN
    PERFORM public.review_achievement_verification('00000000-0000-4000-8000-000000980a02', '00000000-0000-4000-8000-000000980a01', '00000000-0000-4000-8000-000000980e01', 'VERIFIED', NULL, v_at);
    RAISE EXCEPTION 'bukan admin harus ditolak';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.review_achievement_verification('00000000-0000-4000-8000-000000980a03', '00000000-0000-4000-8000-000000980a01', '00000000-0000-4000-8000-000000980e01', 'VERIFIED', NULL, v_at - interval '1 second');
    RAISE EXCEPTION 'versi basi harus ditolak';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'verification_changed' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.review_achievement_verification('00000000-0000-4000-8000-000000980a03', '00000000-0000-4000-8000-000000980a01', '00000000-0000-4000-8000-000000980e01', 'REJECTED', '  ', v_at);
    RAISE EXCEPTION 'penolakan tanpa alasan harus ditolak';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'verification_note_required' THEN RAISE; END IF;
  END;
  PERFORM public.review_achievement_verification('00000000-0000-4000-8000-000000980a03', '00000000-0000-4000-8000-000000980a01', '00000000-0000-4000-8000-000000980e01', 'VERIFIED', NULL, v_at);
END$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-000000980a01' AND type = 'ACHIEVEMENT_VERIFIED') THEN
    RAISE EXCEPTION 'pemilik harus dikabari';
  END IF;
END$$;

-- 5. Peringkat: kampus terhitung tanpa nama; nama hanya bila portofolio publik.
SET LOCAL ROLE anon;
DO $$
DECLARE v_score INT; v_people INT;
BEGIN
  SELECT score, people INTO v_score, v_people FROM public.campus_leaderboard(NULL, NULL, NULL, 50) WHERE institution_id = '001002';
  IF v_score <> 10 OR v_people <> 1 THEN RAISE EXCEPTION 'skor kampus harus 10 dari 1 orang, dapat % / %', v_score, v_people; END IF;
  IF EXISTS (SELECT 1 FROM public.people_leaderboard(NULL, NULL, NULL, 50)) THEN
    RAISE EXCEPTION 'nama tidak boleh tampil tanpa opt-in';
  END IF;
  IF public.public_portfolio_page('juara.satu') IS NOT NULL THEN
    RAISE EXCEPTION 'portofolio privat tidak boleh terbaca tamu';
  END IF;
  -- Periode: prestasi 5 hari lalu tidak masuk rentang yang berakhir 10 hari lalu.
  IF EXISTS (SELECT 1 FROM public.campus_leaderboard(NULL, now() - interval '10 days', NULL, 50)) THEN
    RAISE EXCEPTION 'saringan periode tidak dihormati';
  END IF;
END$$;
RESET ROLE;

UPDATE public.users SET portfolio_public = true WHERE id = '00000000-0000-4000-8000-000000980a01';
SET LOCAL ROLE anon;
DO $$
DECLARE v_page JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.people_leaderboard(NULL, NULL, NULL, 50) WHERE username = 'juara.satu' AND score = 10) THEN
    RAISE EXCEPTION 'yang opt-in harus tampil di peringkat mahasiswa';
  END IF;
  v_page := public.public_portfolio_page('JUARA.SATU ');
  IF v_page IS NULL OR v_page ->> 'institution_name' <> 'Universitas Indonesia' THEN
    RAISE EXCEPTION 'portofolio publik harus terbaca tamu setelah opt-in';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_page -> 'entries') x WHERE x ->> 'verification' = 'VERIFIED') THEN
    RAISE EXCEPTION 'status verifikasi harus ikut di portofolio publik';
  END IF;
  IF v_page ? 'email' OR v_page::text ILIKE '%@prestasi%' THEN
    RAISE EXCEPTION 'email tidak boleh bocor';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_page -> 'entries') x WHERE x ->> 'event_type' = 'BEASISWA') THEN
    RAISE EXCEPTION 'beasiswa privat secara bawaan';
  END IF;
END$$;
RESET ROLE;

-- 6. Mengubah hasil setelah diverifikasi → verifikasi gugur, skor hilang.
UPDATE public.application_tracker SET achievement = 'JUARA_2'
  WHERE user_id = '00000000-0000-4000-8000-000000980a01' AND event_id = '00000000-0000-4000-8000-000000980e01';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.achievement_verifications WHERE user_id = '00000000-0000-4000-8000-000000980a01') THEN
    RAISE EXCEPTION 'mengubah hasil harus menggugurkan verifikasi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.campus_leaderboard(NULL, NULL, NULL, 50)) THEN
    RAISE EXCEPTION 'verifikasi gugur tidak boleh dihitung';
  END IF;
END$$;

-- 7. Kegiatan data uji tidak pernah dihitung (diuji di level fungsi agregat).
INSERT INTO public.application_tracker (user_id, event_id, status, achievement, proof_url) VALUES
  ('00000000-0000-4000-8000-000000980a02', '00000000-0000-4000-8000-000000980e04', 'ACCEPTED', 'JUARA_1', 'https://bukti.example/d');
INSERT INTO public.achievement_verifications (user_id, event_id, result, proof_url, institution_id, institution_name, status, reviewed_at, reviewed_by)
  VALUES ('00000000-0000-4000-8000-000000980a02', '00000000-0000-4000-8000-000000980e04', 'JUARA_1', 'https://bukti.example/d', '002001', 'ITB', 'VERIFIED', now(), '00000000-0000-4000-8000-000000980a03');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.campus_leaderboard(NULL, NULL, NULL, 50) WHERE institution_id = '002001') THEN
    RAISE EXCEPTION 'prestasi di kegiatan data uji tidak boleh dihitung';
  END IF;
END$$;
ROLLBACK;
