-- Tingkat kepercayaan + data uji (ADR-096, migration 20261124100001).
-- Cermin: src/lib/data/trust-levels.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-000000960a01', 'admin@percaya', '{"full_name":"Admin Percaya"}'),
  ('00000000-0000-4000-8000-000000960a02', 'anggota@percaya', '{"full_name":"Anggota Biasa"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-000000960a01';

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at, is_demo) VALUES
  ('00000000-0000-4000-8000-000000960e01', 'Lomba Nyata Uji', 'Penyelenggara Nyata', 'LOMBA',
   'https://daftar.example/t1', 'https://sumber.example/t1', 'APPROVED', now(), false),
  ('00000000-0000-4000-8000-000000960e02', 'Lomba Dummy Uji', 'Penyelenggara Dummy', 'LOMBA',
   'https://daftar.example/t2', 'https://sumber.example/t2', 'APPROVED', now(), true);
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-4000-8000-000000960e01', 'registration', now() + interval '10 days', true),
  ('00000000-0000-4000-8000-000000960e02', 'registration', now() + interval '10 days', true);
INSERT INTO public.event_categories (event_id, category_id)
  SELECT '00000000-0000-4000-8000-000000960e02', id FROM public.categories ORDER BY slug LIMIT 1;

-- 1. Bawaan: dari sumber publik, bukan data uji; nilai di luar daftar ditolak CHECK.
DO $$
DECLARE v_level TEXT; v_demo BOOLEAN;
BEGIN
  SELECT verification_level, is_demo INTO v_level, v_demo FROM public.events WHERE id = '00000000-0000-4000-8000-000000960e01';
  IF v_level <> 'PUBLIC_SOURCE' OR v_demo THEN
    RAISE EXCEPTION 'bawaan harus PUBLIC_SOURCE & bukan data uji, dapat % / %', v_level, v_demo;
  END IF;
  BEGIN
    UPDATE public.events SET verification_level = 'TERVERIFIKASI' WHERE id = '00000000-0000-4000-8000-000000960e01';
    RAISE EXCEPTION 'nilai di luar daftar harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

-- 2. Tamu: kegiatan uji tidak terbaca — tabel, view katalog, maupun tabel anaknya.
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = '00000000-0000-4000-8000-000000960e01') THEN
    RAISE EXCEPTION 'kegiatan nyata harus tetap terbaca tamu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE id = '00000000-0000-4000-8000-000000960e02')
     OR EXISTS (SELECT 1 FROM public.events_listing WHERE id = '00000000-0000-4000-8000-000000960e02') THEN
    RAISE EXCEPTION 'kegiatan uji tidak boleh terbaca tamu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_deadlines WHERE event_id = '00000000-0000-4000-8000-000000960e02')
     OR EXISTS (SELECT 1 FROM public.event_categories WHERE event_id = '00000000-0000-4000-8000-000000960e02') THEN
    RAISE EXCEPTION 'tenggat & kategori kegiatan uji tidak boleh terbaca tamu';
  END IF;
  IF (SELECT public.get_distinct_organizer_count()) <> (SELECT count(DISTINCT organizer) FROM public.events WHERE status = 'APPROVED') THEN
    RAISE EXCEPTION 'hitungan penyelenggara harus sama dengan yang terbaca tamu (tanpa data uji)';
  END IF;
END$$;
RESET ROLE;

-- 3. Anggota biasa: sama dengan tamu, dan tidak bisa mengubah tingkat verifikasi.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000960a02';
DO $$
DECLARE v_rows INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id = '00000000-0000-4000-8000-000000960e02') THEN
    RAISE EXCEPTION 'kegiatan uji tidak boleh terbaca anggota biasa';
  END IF;
  BEGIN
    UPDATE public.events SET verification_level = 'MODERATOR_VERIFIED' WHERE id = '00000000-0000-4000-8000-000000960e01';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN RAISE EXCEPTION 'anggota biasa tidak boleh menaikkan tingkat verifikasi'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- 4. Admin ber-MFA melihat data uji (untuk menguji alur) dan boleh menaikkan tingkat verifikasi.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000960a01';
SET LOCAL request.jwt.claims = '{"aal":"aal2"}';
DO $$
DECLARE v_rows INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = '00000000-0000-4000-8000-000000960e02') THEN
    RAISE EXCEPTION 'admin harus melihat kegiatan uji';
  END IF;
  UPDATE public.events SET verification_level = 'MODERATOR_VERIFIED' WHERE id = '00000000-0000-4000-8000-000000960e01';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'admin harus bisa menaikkan tingkat verifikasi'; END IF;
END$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT verification_level FROM public.events WHERE id = '00000000-0000-4000-8000-000000960e01') <> 'MODERATOR_VERIFIED' THEN
    RAISE EXCEPTION 'tingkat verifikasi admin tidak tersimpan';
  END IF;
END$$;
ROLLBACK;
