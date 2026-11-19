-- Pengerasan "Lagi ramai" & koneksi bersama (ADR-093, migration 20261119100001).
-- Cermin: src/lib/popularity.test.ts (TREND_VISITOR_DAILY_CAP), src/lib/event-views.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-000000930a01', 'aku@hard', '{"full_name":"Aku Pemanggil"}'),
  ('00000000-0000-4000-8000-000000930a02', 'teman@hard', '{"full_name":"Teman Bersama"}'),
  ('00000000-0000-4000-8000-000000930a03', 'terbuka@hard', '{"full_name":"Calon Terbuka"}'),
  ('00000000-0000-4000-8000-000000930a04', 'pemblokir@hard', '{"full_name":"Calon Pemblokir"}'),
  ('00000000-0000-4000-8000-000000930a05', 'tertutup@hard', '{"full_name":"Calon Tertutup"}');
UPDATE public.users SET profile_visibility = 'NETWORK' WHERE id = '00000000-0000-4000-8000-000000930a05';
-- Trigger memaksa ajakan baru PENDING; diterima lewat UPDATE (pola 95_network).
INSERT INTO public.connections (requester_id, addressee_id) VALUES
  ('00000000-0000-4000-8000-000000930a01', '00000000-0000-4000-8000-000000930a02'),
  ('00000000-0000-4000-8000-000000930a02', '00000000-0000-4000-8000-000000930a03'),
  ('00000000-0000-4000-8000-000000930a02', '00000000-0000-4000-8000-000000930a04'),
  ('00000000-0000-4000-8000-000000930a02', '00000000-0000-4000-8000-000000930a05');
UPDATE public.connections SET status = 'ACCEPTED'
WHERE '00000000-0000-4000-8000-000000930a02' IN (requester_id, addressee_id);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.connections WHERE status = 'ACCEPTED' AND '00000000-0000-4000-8000-000000930a02' IN (requester_id, addressee_id)) <> 4 THEN
    RAISE EXCEPTION 'persiapan: empat koneksi diterima';
  END IF;
END$$;
INSERT INTO public.connection_blocks (blocker_id, blocked_id)
VALUES ('00000000-0000-4000-8000-000000930a04', '00000000-0000-4000-8000-000000930a01');

-- 1. Koneksi bersama hanya untuk kandidat yang boleh dilihat: pemblokir & profil tertutup tidak terukur.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000930a01';
DO $$
DECLARE v_rows JSONB;
BEGIN
  SELECT coalesce(jsonb_object_agg(user_id, mutual_count), '{}'::jsonb) INTO v_rows
  FROM public.mutual_connection_counts(ARRAY[
    '00000000-0000-4000-8000-000000930a03',
    '00000000-0000-4000-8000-000000930a04',
    '00000000-0000-4000-8000-000000930a05'
  ]::uuid[]);
  IF v_rows <> '{"00000000-0000-4000-8000-000000930a03": 1}'::jsonb THEN
    RAISE EXCEPTION 'koneksi bersama: hanya calon terbuka = 1, dapat %', v_rows;
  END IF;
END$$;
RESET ROLE;

-- 2. Pengunjung anonim dijepit 20/hari/acara (= 5 poin sebelum peluruhan).
INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-000000930e01', 'Lomba Digelembungkan', 'Panitia', 'LOMBA', 'https://daftar.example/h1', 'https://sumber.example/h1', 'APPROVED', now()),
  ('00000000-0000-4000-8000-000000930e02', 'Lomba Pengunjung Sedikit', 'Panitia', 'LOMBA', 'https://daftar.example/h2', 'https://sumber.example/h2', 'APPROVED', now());
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-4000-8000-000000930e01', 'registration', now() + interval '20 days', true),
  ('00000000-0000-4000-8000-000000930e02', 'registration', now() + interval '20 days', true);
INSERT INTO public.event_daily_stats (event_id, day, views, visitors) VALUES
  ('00000000-0000-4000-8000-000000930e01', (now() AT TIME ZONE 'Asia/Jakarta')::date - 1, 9000, 5000),
  ('00000000-0000-4000-8000-000000930e02', (now() AT TIME ZONE 'Asia/Jakarta')::date - 1, 8, 8);
DO $$
DECLARE v_decay FLOAT8; v_big FLOAT8; v_small FLOAT8;
BEGIN
  PERFORM public.refresh_event_trends();
  v_decay := power(2::float8, -GREATEST(extract(epoch FROM now() - ((((now() AT TIME ZONE 'Asia/Jakarta')::date - 1)::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Jakarta'))::float8 / 3600.0, 0) / 72.0);
  SELECT trend_score INTO v_big FROM public.events_listing WHERE id = '00000000-0000-4000-8000-000000930e01';
  SELECT trend_score INTO v_small FROM public.events_listing WHERE id = '00000000-0000-4000-8000-000000930e02';
  IF abs(v_big - 0.25 * 20 * v_decay) > 0.001 THEN
    RAISE EXCEPTION '5000 pengunjung harus dijepit ke 20: skor %, harap %', v_big, 0.25 * 20 * v_decay;
  END IF;
  IF abs(v_small - 0.25 * 8 * v_decay) > 0.001 THEN
    RAISE EXCEPTION 'di bawah plafon tidak berubah: skor %, harap %', v_small, 0.25 * 8 * v_decay;
  END IF;
END$$;

-- 3. Hak: refresh hanya service_role, koneksi bersama hanya pengguna masuk.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.mutual_connection_counts(uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.refresh_event_trends()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.mutual_connection_counts(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'hak fungsi pengerasan salah';
  END IF;
END$$;
ROLLBACK;
