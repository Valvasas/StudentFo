-- Temuan Security Advisor (ADR-062 #8): fungsi trigger tidak bisa dipanggil
-- peran API; fungsi bantu punya search_path tetap; trigger tetap bekerja.
BEGIN;
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.handle_new_user()', 'public.sync_saved_count()'] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'fungsi trigger % masih bisa dipanggil lewat API', fn;
    END IF;
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['public.touch_updated_at()', 'public.slugify(text)', 'public.compute_dedup_hash(text,text)', 'public.events_fill_derived()'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = fn::regprocedure AND array_to_string(proconfig, ',') LIKE 'search_path=%') THEN
      RAISE EXCEPTION '% belum punya search_path tetap', fn;
    END IF;
  END LOOP;
END$$;

-- Trigger yang bergantung pada fungsi-fungsi itu tetap berjalan.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('00000000-0000-4000-8000-0000000fa001', 'keras@x', '{"full_name":"Uji Keras"}');
INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url)
VALUES ('00000000-0000-4000-8000-0000000fae01', 'Lomba Pengerasan Fungsi', 'Org Keras', 'LOMBA', 'https://k.example', 'https://k.example');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = '00000000-0000-4000-8000-0000000fa001') THEN
    RAISE EXCEPTION 'handle_new_user() harus tetap mengisi public.users';
  END IF;
  IF (SELECT slug FROM public.events WHERE id = '00000000-0000-4000-8000-0000000fae01') <> 'lomba-pengerasan-fungsi'
     OR (SELECT dedup_hash FROM public.events WHERE id = '00000000-0000-4000-8000-0000000fae01') <> public.compute_dedup_hash('Lomba Pengerasan Fungsi', 'Org Keras') THEN
    RAISE EXCEPTION 'events_fill_derived() harus tetap mengisi slug & dedup_hash';
  END IF;
END$$;
INSERT INTO public.saved_events (user_id, event_id) VALUES ('00000000-0000-4000-8000-0000000fa001', '00000000-0000-4000-8000-0000000fae01');
DO $$
BEGIN
  IF (SELECT saved_count FROM public.events WHERE id = '00000000-0000-4000-8000-0000000fae01') <> 1 THEN
    RAISE EXCEPTION 'sync_saved_count() harus tetap menghitung';
  END IF;
END$$;
ROLLBACK;
