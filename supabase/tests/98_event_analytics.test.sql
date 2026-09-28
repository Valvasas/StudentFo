-- Analitik acara (ADR-043): kunjungan dihitung per hari dengan dedup
-- pengunjung, hanya pengelola terverifikasi/admin yang bisa membaca,
-- kelompok audiens kecil disembunyikan (k = 5), dan klien tidak bisa
-- menulis atau membaca tabel mentahnya.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000d0b01', 'org@analitik', '{"full_name":"Panitia"}'),
  ('00000000-0000-4000-8000-0000000d0b02', 'lain@analitik', '{"full_name":"Orang Lain"}'),
  ('00000000-0000-4000-8000-0000000d0b10', 's0@analitik', '{"full_name":"S0"}'),
  ('00000000-0000-4000-8000-0000000d0b11', 's1@analitik', '{"full_name":"S1"}'),
  ('00000000-0000-4000-8000-0000000d0b12', 's2@analitik', '{"full_name":"S2"}'),
  ('00000000-0000-4000-8000-0000000d0b13', 's3@analitik', '{"full_name":"S3"}'),
  ('00000000-0000-4000-8000-0000000d0b14', 's4@analitik', '{"full_name":"S4"}'),
  ('00000000-0000-4000-8000-0000000d0b15', 's5@analitik', '{"full_name":"S5"}'),
  ('00000000-0000-4000-8000-0000000d0b16', 's6@analitik', '{"full_name":"S6"}'),
  ('00000000-0000-4000-8000-0000000d0b17', 's7@analitik', '{"full_name":"S7"}');
-- Enam penyimpan S1 (lolos k=5), dua S2 (harus disembunyikan).
UPDATE public.users SET education_level = 'D4_S1', interests = ARRAY['teknologi']
WHERE id BETWEEN '00000000-0000-4000-8000-0000000d0b10' AND '00000000-0000-4000-8000-0000000d0b15';
UPDATE public.users SET education_level = 'S2'
WHERE id IN ('00000000-0000-4000-8000-0000000d0b16', '00000000-0000-4000-8000-0000000d0b17');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-0000000d0be1', 'Lomba Analitik Uji', 'Himpunan Analitik', 'LOMBA',
   'https://daftar.example/analitik', 'https://sumber.example/analitik', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000d0be2', 'Lomba Belum Tayang', 'Himpunan Analitik', 'LOMBA',
   'https://daftar.example/pending', 'https://sumber.example/pending', 'PENDING', NULL);

INSERT INTO public.organizer_profiles (user_id, org_name, evidence)
VALUES ('00000000-0000-4000-8000-0000000d0b01', 'Himpunan Analitik', 'Ketua himpunan, lihat https://himpunan.example');
SELECT public.review_organizer('00000000-0000-4000-8000-0000000d0b01', 'VERIFIED', NULL, NULL);
INSERT INTO public.event_managers (event_id, user_id, source)
VALUES ('00000000-0000-4000-8000-0000000d0be1', '00000000-0000-4000-8000-0000000d0b01', 'ADMIN');

INSERT INTO public.saved_events (user_id, event_id)
SELECT id, '00000000-0000-4000-8000-0000000d0be1' FROM public.users
WHERE id BETWEEN '00000000-0000-4000-8000-0000000d0b10' AND '00000000-0000-4000-8000-0000000d0b17';
INSERT INTO public.recommendation_signals (event_id, kind, user_id, interests, education_level)
VALUES ('00000000-0000-4000-8000-0000000d0be1', 'register_click', NULL, '{}', NULL);

-- 1. Kunjungan: pengunjung yang sama dua kali = 2 kunjungan, 1 pengunjung.
SELECT public.record_event_view('00000000-0000-4000-8000-0000000d0be1', repeat('a', 64));
SELECT public.record_event_view('00000000-0000-4000-8000-0000000d0be1', repeat('a', 64));
SELECT public.record_event_view('00000000-0000-4000-8000-0000000d0be1', repeat('b', 64));
SELECT public.record_event_view('00000000-0000-4000-8000-0000000d0be2', repeat('c', 64));
DO $$
BEGIN
  IF (SELECT (views, visitors) FROM public.event_daily_stats WHERE event_id = '00000000-0000-4000-8000-0000000d0be1')
     IS DISTINCT FROM (3, 2) THEN
    RAISE EXCEPTION 'harus 3 kunjungan dari 2 pengunjung unik';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_daily_stats WHERE event_id = '00000000-0000-4000-8000-0000000d0be2') THEN
    RAISE EXCEPTION 'kunjungan ke acara yang belum tayang tidak boleh tercatat';
  END IF;
  BEGIN
    PERFORM public.record_event_view('00000000-0000-4000-8000-0000000d0be1', 'bukan-hex');
    RAISE EXCEPTION 'hash pengunjung selain 64 hex harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

-- 2. Pengelola terverifikasi membaca laporannya; k-anonimitas berlaku.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0b01';
DO $$
DECLARE
  report JSONB := public.event_analytics('00000000-0000-4000-8000-0000000d0be1', 30);
BEGIN
  IF (report ->> 'days')::INT <> 30 OR jsonb_array_length(report -> 'series') <> 30 THEN
    RAISE EXCEPTION 'deret harian harus 30 hari: %', report -> 'days';
  END IF;
  IF (report #>> '{series,29,views}')::INT <> 3 OR (report #>> '{series,29,visitors}')::INT <> 2 THEN
    RAISE EXCEPTION 'hari terakhir deret harus hari ini (WIB): %', report #> '{series,29}';
  END IF;
  IF report -> 'totals' <> '{"views": 3, "visitors": 2, "saves": 8, "clicks": 1, "applied": 0}'::JSONB THEN
    RAISE EXCEPTION 'total salah: %', report -> 'totals';
  END IF;
  IF report #> '{audience,levels}' <> '[{"label": "D4_S1", "count": 6}]'::JSONB
     OR (report #>> '{audience,hidden}')::INT <> 2 THEN
    RAISE EXCEPTION 'kelompok < 5 (S2) harus disembunyikan: %', report -> 'audience';
  END IF;
  IF report #> '{audience,interests}' <> '[{"label": "teknologi", "count": 6}]'::JSONB THEN
    RAISE EXCEPTION 'minat salah: %', report #> '{audience,interests}';
  END IF;
  IF (public.event_analytics('00000000-0000-4000-8000-0000000d0be1', 9999) ->> 'days')::INT <> 90 THEN
    RAISE EXCEPTION 'rentang harus dipotong ke 90 hari';
  END IF;

  -- Tabel mentah tidak terjangkau klien.
  BEGIN
    PERFORM 1 FROM public.event_daily_stats;
    RAISE EXCEPTION 'event_daily_stats tidak boleh terbaca klien';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.event_view_dedup;
    RAISE EXCEPTION 'event_view_dedup tidak boleh terbaca klien';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.record_event_view('00000000-0000-4000-8000-0000000d0be1', repeat('d', 64));
    RAISE EXCEPTION 'klien tidak boleh menggelembungkan kunjungan langsung';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

-- 3. Pengguna lain (bukan pengelola) ditolak.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0b02';
DO $$
BEGIN
  PERFORM public.event_analytics('00000000-0000-4000-8000-0000000d0be1', 30);
  RAISE EXCEPTION 'bukan pengelola tidak boleh membaca analitik';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'analytics_forbidden' THEN RAISE; END IF;
END$$;
RESET ROLE;

-- 4. Verifikasi dicabut → analitik langsung tertutup, tanpa menghapus hak kelola.
SELECT public.review_organizer('00000000-0000-4000-8000-0000000d0b01', 'REVOKED', NULL, 'Uji pencabutan');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0b01';
DO $$
BEGIN
  PERFORM public.event_analytics('00000000-0000-4000-8000-0000000d0be1', 30);
  RAISE EXCEPTION 'penyelenggara yang dicabut tidak boleh membaca analitik';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
RESET ROLE;

-- 5. Anon tidak bisa memanggil apa pun.
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.event_analytics('00000000-0000-4000-8000-0000000d0be1', 30);
  RAISE EXCEPTION 'anon tidak boleh memanggil event_analytics';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
RESET ROLE;

-- 6. Dedup lama dibersihkan (hash harian tidak disimpan lebih dari perlu).
INSERT INTO public.event_view_dedup (event_id, day, visitor_hash)
VALUES ('00000000-0000-4000-8000-0000000d0be1', (now() AT TIME ZONE 'Asia/Jakarta')::DATE - 5, repeat('e', 64));
DO $$
BEGIN
  IF public.purge_event_view_dedup() <> 1 THEN
    RAISE EXCEPTION 'hanya baris dedup lama yang boleh dihapus';
  END IF;
  IF (SELECT count(*) FROM public.event_view_dedup) <> 2 THEN
    RAISE EXCEPTION 'dedup hari ini harus tetap ada';
  END IF;
END$$;
ROLLBACK;
