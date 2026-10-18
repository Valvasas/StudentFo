-- register_for_event() (migration 20261015100001): kode yang bertabrakan
-- diulang, tetapi hanya konflik `code` — pendaftaran ganda tetap
-- `registration_exists` dan indeks satu-pendaftaran-hidup tidak ditelan.
-- Tabrakan dipaksa dengan trigger BEFORE INSERT sementara: efek trigger
-- BEFORE ikut diperiksa ON CONFLICT, jadi kode yang ditimpa benar-benar bentrok.
BEGIN;

DO $$
DECLARE p RECORD;
BEGIN
  SELECT prosecdef, proconfig INTO p FROM pg_proc WHERE oid = 'public.register_for_event(uuid, jsonb)'::regprocedure;
  IF NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp'] THEN
    RAISE EXCEPTION 'register_for_event harus SECURITY DEFINER dengan search_path terkunci: %', p;
  END IF;
  IF has_function_privilege('anon', 'public.register_for_event(uuid, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.register_for_event(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'register_for_event hanya untuk authenticated (ADR-020)';
  END IF;
END$$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000e5b1', 'kode-satu@uji', '{"full_name":"Kode Satu"}'),
  ('00000000-0000-4000-8000-00000000e5b2', 'kode-dua@uji', '{"full_name":"Kode Dua"}'),
  ('00000000-0000-4000-8000-00000000e5b3', 'kode-tiga@uji', '{"full_name":"Kode Tiga"}');
INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at)
VALUES ('00000000-0000-4000-8000-00000000e5b0', 'Seminar Kode Uji', 'Himpunan Uji', 'KONFERENSI',
        'https://daftar.example/kode', 'https://sumber.example/kode', 'APPROVED', now());
INSERT INTO public.event_registration_forms (event_id, is_open) VALUES ('00000000-0000-4000-8000-00000000e5b0', true);
INSERT INTO public.event_registrations (code, event_id, user_id, full_name, email, status)
VALUES ('SF-00000000', '00000000-0000-4000-8000-00000000e5b0', '00000000-0000-4000-8000-00000000e5b3',
        'Kode Tiga', 'kode-tiga@uji', 'CONFIRMED');

CREATE FUNCTION public.uji_force_registration_conflict() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_left INTEGER := coalesce(nullif(current_setting('uji.collisions', true), ''), '0')::int;
BEGIN
  IF v_left > 0 THEN
    NEW.code := 'SF-00000000';
    PERFORM set_config('uji.collisions', (v_left - 1)::text, true);
  END IF;
  IF coalesce(current_setting('uji.steal_user', true), '') <> '' THEN
    NEW.user_id := current_setting('uji.steal_user')::uuid;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER uji_force_registration_conflict BEFORE INSERT ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.uji_force_registration_conflict();

-- 1. Dua tabrakan beruntun → percobaan ketiga berhasil dengan kode baru.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e5b1';
DO $$
DECLARE r public.event_registrations;
BEGIN
  PERFORM set_config('uji.collisions', '2', true);
  r := public.register_for_event('00000000-0000-4000-8000-00000000e5b0', '{}');
  IF r.id IS NULL OR r.code = 'SF-00000000' OR r.code !~ '^SF-[0-9A-F]{8}$' OR r.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'kode bertabrakan harus diulang sampai unik: %', r;
  END IF;
  IF current_setting('uji.collisions') <> '0' THEN
    RAISE EXCEPTION 'dua tabrakan harus terpakai sebelum berhasil, sisa %', current_setting('uji.collisions');
  END IF;

  BEGIN
    PERFORM public.register_for_event('00000000-0000-4000-8000-00000000e5b0', '{}');
    RAISE EXCEPTION 'pendaftaran ganda harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'registration_exists' THEN RAISE; END IF;
  END;
END$$;

-- 2. Tabrakan terus-menerus → berhenti setelah 5 percobaan, tidak berputar selamanya.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e5b2';
DO $$
BEGIN
  PERFORM set_config('uji.collisions', '5', true);
  PERFORM public.register_for_event('00000000-0000-4000-8000-00000000e5b0', '{}');
  RAISE EXCEPTION 'tabrakan terus-menerus harus menyerah';
EXCEPTION WHEN unique_violation THEN
  IF SQLERRM <> 'registration_code_exhausted' THEN RAISE; END IF;
END$$;

-- 3. Pelanggaran indeks satu-pendaftaran-hidup TIDAK ditelan ON CONFLICT (code).
DO $$
DECLARE v_constraint TEXT;
BEGIN
  PERFORM set_config('uji.collisions', '0', true);
  PERFORM set_config('uji.steal_user', '00000000-0000-4000-8000-00000000e5b3', true);
  PERFORM public.register_for_event('00000000-0000-4000-8000-00000000e5b0', '{}');
  RAISE EXCEPTION 'pelanggaran event_registrations_one_active harus tetap meledak';
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint IS DISTINCT FROM 'event_registrations_one_active' THEN RAISE; END IF;
END$$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8000-00000000e5b0') <> 2 THEN
    RAISE EXCEPTION 'hanya baris awal & satu pendaftaran sukses yang boleh ada';
  END IF;
END$$;

ROLLBACK;
