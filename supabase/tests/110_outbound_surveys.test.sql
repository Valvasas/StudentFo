-- Pendataan kinerja (ADR-070): tidak ada jalur tulis/baca dari browser,
-- admin membaca, nilai di luar daftar ditolak, dan purge membuang > 365 hari.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f1a01', 'pengunjung@uji', '{"full_name":"Pengunjung"}');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at)
VALUES ('00000000-0000-4000-8000-0000000f1e01', 'Lomba Kinerja Uji', 'Panitia Kinerja', 'LOMBA',
        'https://daftar.example/kinerja', 'https://sumber.example/kinerja', 'APPROVED', now());

INSERT INTO public.outbound_surveys (event_id, signed_in, education_level, source, plan, province, institution, created_at) VALUES
  ('00000000-0000-4000-8000-0000000f1e01', true, 'D4_S1', 'INSTAGRAM', 'CARI_TIM', 'Jawa Barat', 'Universitas Uji', now()),
  ('00000000-0000-4000-8000-0000000f1e01', false, 'SMA_SMK', 'TEMAN', NULL, NULL, NULL, now() - interval '400 days');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.outbound_surveys (event_id, signed_in, education_level, source)
    VALUES ('00000000-0000-4000-8000-0000000f1e01', false, 'D4_S1', 'SPAM');
    RAISE EXCEPTION 'sumber di luar daftar harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

-- Tamu & pengguna biasa: tidak bisa menulis, tidak bisa membaca.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.outbound_surveys (event_id, signed_in, education_level, source)
    VALUES ('00000000-0000-4000-8000-0000000f1e01', false, 'D4_S1', 'GOOGLE');
    RAISE EXCEPTION 'anon tidak boleh menulis jawaban kinerja';
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
    INSERT INTO public.outbound_surveys (event_id, signed_in, education_level, source)
    VALUES ('00000000-0000-4000-8000-0000000f1e01', true, 'D4_S1', 'GOOGLE');
    RAISE EXCEPTION 'pengguna biasa tidak boleh menulis jawaban kinerja';
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
  IF (SELECT count(*) FROM public.outbound_surveys) <> 1 THEN
    RAISE EXCEPTION 'jawaban yang masih baru tidak boleh ikut terbuang';
  END IF;
END$$;
ROLLBACK;
