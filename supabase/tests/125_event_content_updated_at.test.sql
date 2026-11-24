-- updated_at events = perubahan isi saja (ADR-097, migration 20261124100002).
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-000000970a01', 'penyimpan@lastmod', '{"full_name":"Penyimpan"}');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at, updated_at) VALUES
  ('00000000-0000-4000-8000-000000970e01', 'Lomba Lastmod Uji', 'Panitia Lastmod', 'LOMBA',
   'https://daftar.example/l1', 'https://sumber.example/l1', 'APPROVED', now(), '2026-01-01T00:00:00Z');

-- 1. Menyimpan (saved_count lewat trigger sync_saved_count) tidak memajukan updated_at.
INSERT INTO public.saved_events (user_id, event_id) VALUES
  ('00000000-0000-4000-8000-000000970a01', '00000000-0000-4000-8000-000000970e01');
DO $$
DECLARE v_saved INT; v_updated TIMESTAMPTZ;
BEGIN
  SELECT saved_count, updated_at INTO v_saved, v_updated FROM public.events WHERE id = '00000000-0000-4000-8000-000000970e01';
  IF v_saved <> 1 THEN RAISE EXCEPTION 'saved_count harus 1, dapat %', v_saved; END IF;
  IF v_updated <> '2026-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'menyimpan tidak boleh memajukan updated_at (dapat %)', v_updated;
  END IF;
END$$;

-- 2. Mengubah isi (deskripsi) memajukan updated_at.
UPDATE public.events SET description = 'Deskripsi baru' WHERE id = '00000000-0000-4000-8000-000000970e01';
DO $$
BEGIN
  IF (SELECT updated_at FROM public.events WHERE id = '00000000-0000-4000-8000-000000970e01') <= '2026-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'perubahan isi harus memajukan updated_at';
  END IF;
END$$;

-- 3. Fungsi trigger tidak bisa dipanggil klien.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.touch_event_updated_at()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.touch_event_updated_at()', 'EXECUTE') THEN
    RAISE EXCEPTION 'touch_event_updated_at tidak boleh terbuka untuk klien';
  END IF;
END$$;
ROLLBACK;
