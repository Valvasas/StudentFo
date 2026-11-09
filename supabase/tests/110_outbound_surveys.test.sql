-- Pendataan kinerja (ADR-070/073): tidak ada jalur tulis/baca dari browser,
-- admin membaca jawaban, konfigurasi tertutup untuk klien, "Lewati" tidak
-- boleh membawa jawaban, kode wilayah berbentuk benar, dan purge > 365 hari.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f1a01', 'pengunjung@uji', '{"full_name":"Pengunjung"}');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at)
VALUES ('00000000-0000-4000-8000-0000000f1e01', 'Lomba Kinerja Uji', 'Panitia Kinerja', 'LOMBA',
        'https://daftar.example/kinerja', 'https://sumber.example/kinerja', 'APPROVED', now());

-- Baris tunggal bawaan ada dan berisi dua pertanyaan (cermin DEFAULT_OUTBOUND_CONFIG).
DO $$
BEGIN
  IF (SELECT jsonb_array_length(questions) FROM public.outbound_survey_config WHERE id = 1) <> 2 THEN
    RAISE EXCEPTION 'konfigurasi bawaan harus berisi 2 pertanyaan';
  END IF;
  BEGIN
    INSERT INTO public.outbound_survey_config (id) VALUES (2);
    RAISE EXCEPTION 'konfigurasi hanya boleh satu baris';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.outbound_survey_config SET questions = (SELECT jsonb_agg(n) FROM generate_series(1, 9) n) WHERE id = 1;
    RAISE EXCEPTION 'lebih dari 8 pertanyaan harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

INSERT INTO public.outbound_surveys (event_id, signed_in, education_level, region_code, institution_id, institution, answers, created_at) VALUES
  ('00000000-0000-4000-8000-0000000f1e01', true, 'D4_S1', '32.73', '001002', 'Universitas Indonesia', '{"f_sumber": "TikTok"}', now()),
  ('00000000-0000-4000-8000-0000000f1e01', false, 'SMA_SMK', NULL, NULL, NULL, '{}', now() - interval '400 days');
INSERT INTO public.outbound_surveys (event_id, signed_in, skipped) VALUES ('00000000-0000-4000-8000-0000000f1e01', false, true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.outbound_surveys (event_id, signed_in, skipped, answers)
    VALUES ('00000000-0000-4000-8000-0000000f1e01', false, true, '{"f_sumber": "TikTok"}');
    RAISE EXCEPTION 'melewati sambil membawa jawaban harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.outbound_surveys (event_id, signed_in, region_code)
    VALUES ('00000000-0000-4000-8000-0000000f1e01', false, '32.7');
    RAISE EXCEPTION 'kode wilayah yang bentuknya salah harus ditolak';
  EXCEPTION WHEN check_violation OR string_data_right_truncation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.outbound_surveys (event_id, signed_in, answers)
    VALUES ('00000000-0000-4000-8000-0000000f1e01', false, '[1, 2]');
    RAISE EXCEPTION 'answers harus objek';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

-- Tamu & pengguna biasa: tidak bisa menulis, tidak bisa membaca, tidak bisa mengubah pertanyaan.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.outbound_surveys (event_id, signed_in) VALUES ('00000000-0000-4000-8000-0000000f1e01', false);
    RAISE EXCEPTION 'anon tidak boleh menulis jawaban kinerja';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.outbound_survey_config;
    RAISE EXCEPTION 'anon tidak boleh membaca konfigurasi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f1a01';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.outbound_surveys) <> 0 THEN
    RAISE EXCEPTION 'pengguna biasa tidak boleh membaca jawaban kinerja';
  END IF;
  BEGIN
    INSERT INTO public.outbound_surveys (event_id, signed_in) VALUES ('00000000-0000-4000-8000-0000000f1e01', true);
    RAISE EXCEPTION 'pengguna biasa tidak boleh menulis jawaban kinerja';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.outbound_survey_config SET ask_education = 'OFF';
    RAISE EXCEPTION 'pengguna biasa tidak boleh mengubah pertanyaan';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.purge_old_outbound_surveys();
    RAISE EXCEPTION 'pengguna biasa tidak boleh menjalankan purge';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

DO $$
BEGIN
  IF public.purge_old_outbound_surveys() <> 1 THEN
    RAISE EXCEPTION 'purge harus membuang tepat satu jawaban > 365 hari';
  END IF;
  IF (SELECT count(*) FROM public.outbound_surveys) <> 2 THEN
    RAISE EXCEPTION 'jawaban & lewati yang masih baru tidak boleh ikut terbuang';
  END IF;
END$$;
ROLLBACK;
