-- "Buat acara StudentFo" (ADR-093, migration 20261119100002).
-- Cermin: src/lib/data/admin-events.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-000000931a01', 'admin@buat', '{"full_name":"Admin Pembuat"}'),
  ('00000000-0000-4000-8000-000000931a02', 'biasa@buat', '{"full_name":"Anggota Biasa"}'),
  ('00000000-0000-4000-8000-000000931a03', 'skors@buat', '{"full_name":"Admin Ditangguhkan"}');
UPDATE public.users SET role = 'ADMIN' WHERE id IN ('00000000-0000-4000-8000-000000931a01', '00000000-0000-4000-8000-000000931a03');
UPDATE public.users SET suspended_at = now() WHERE id = '00000000-0000-4000-8000-000000931a03';

-- 1. Hak: hanya service_role yang boleh memanggil.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_create_event(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_create_event(uuid, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.admin_create_event(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'admin_create_event hanya untuk service_role';
  END IF;
END$$;

-- 2. Pelaku bukan admin / admin ditangguhkan / kosong = ditolak 42501.
DO $$
DECLARE v_actor UUID;
BEGIN
  FOREACH v_actor IN ARRAY ARRAY['00000000-0000-4000-8000-000000931a02', '00000000-0000-4000-8000-000000931a03']::uuid[] LOOP
    BEGIN
      PERFORM public.admin_create_event(v_actor, '{"title":"Tidak boleh"}'::jsonb);
      RAISE EXCEPTION 'pelaku % seharusnya ditolak', v_actor;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.admin_create_event(NULL, '{}'::jsonb);
    RAISE EXCEPTION 'pelaku kosong seharusnya ditolak';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

-- 3. Admin: langsung tayang, lomba mandiri, tenggat + tahapan + kategori, log moderasi satu baris dengan pelaku.
DO $$
DECLARE v_id UUID; v_slug TEXT; v_event public.events%ROWTYPE; v_logs INT;
BEGIN
  SELECT created_id, created_slug INTO v_id, v_slug FROM public.admin_create_event(
    '00000000-0000-4000-8000-000000931a01',
    jsonb_build_object(
      'title', 'Lomba Esai StudentFo 2027',
      'organizer', 'StudentFo',
      'description', 'Lomba internal untuk pelajar.',
      'event_type', 'LOMBA',
      'registration_link', 'https://studentfo.example/events',
      'source_url', NULL,
      'education_levels', jsonb_build_array('SMA_SMK', 'D4_S1'),
      'category_slugs', (SELECT jsonb_agg(slug) FROM (SELECT slug FROM public.categories ORDER BY slug LIMIT 2) s),
      'location', NULL,
      'is_online', true,
      'deadline_at', to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'stages', jsonb_build_array(jsonb_build_object('label', 'announcement', 'deadline_at', to_char(now() + interval '40 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
      'is_free', true,
      'price_amount', NULL,
      'video_url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'registration_mode', 'studentfo'
    )
  );
  SELECT * INTO v_event FROM public.events WHERE id = v_id;
  IF v_event.status <> 'APPROVED' OR v_event.registration_mode <> 'studentfo' OR v_event.reviewed_by <> '00000000-0000-4000-8000-000000931a01'
     OR v_event.slug <> v_slug OR v_event.video_url IS NULL OR NOT v_event.is_online THEN
    RAISE EXCEPTION 'kegiatan admin salah: %', row_to_json(v_event);
  END IF;
  IF (SELECT count(*) FROM public.event_deadlines WHERE event_id = v_id) <> 2
     OR (SELECT count(*) FROM public.event_categories WHERE event_id = v_id) <> 2 THEN
    RAISE EXCEPTION 'tenggat/tahapan/kategori tidak lengkap';
  END IF;
  SELECT count(*) INTO v_logs FROM public.moderation_log
  WHERE subject_id = v_id AND to_status = 'APPROVED' AND actor_id = '00000000-0000-4000-8000-000000931a01';
  IF v_logs <> 1 THEN
    RAISE EXCEPTION 'log moderasi harus tepat satu baris berpelaku, dapat %', v_logs;
  END IF;
  -- Terlihat publik lewat katalog.
  IF NOT EXISTS (SELECT 1 FROM public.events_listing WHERE id = v_id AND registration_mode = 'studentfo') THEN
    RAISE EXCEPTION 'kegiatan admin tidak muncul di katalog';
  END IF;
END$$;

-- 4. Judul + penyelenggara yang sama dengan kegiatan aktif = 23505 (dedup), video tak kanonis dibuang, mode asing = external.
DO $$
DECLARE v_id UUID;
BEGIN
  BEGIN
    PERFORM public.admin_create_event('00000000-0000-4000-8000-000000931a01', jsonb_build_object(
      'title', 'Lomba Esai StudentFo 2027', 'organizer', 'StudentFo', 'event_type', 'LOMBA',
      'registration_link', 'https://studentfo.example/events', 'deadline_at', to_char(now() + interval '5 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
    RAISE EXCEPTION 'duplikat seharusnya ditolak';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  SELECT created_id INTO v_id FROM public.admin_create_event('00000000-0000-4000-8000-000000931a01', jsonb_build_object(
    'title', 'Workshop Menulis Internal', 'organizer', 'StudentFo', 'event_type', 'WORKSHOP',
    'registration_link', 'https://daftar.example/w', 'deadline_at', to_char(now() + interval '5 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'video_url', 'https://evil.example/video', 'registration_mode', 'apa-saja'));
  IF (SELECT video_url FROM public.events WHERE id = v_id) IS NOT NULL
     OR (SELECT registration_mode FROM public.events WHERE id = v_id) <> 'external' THEN
    RAISE EXCEPTION 'video tak kanonis harus dibuang & mode asing = external';
  END IF;
END$$;
ROLLBACK;
