-- Saklar pengingat tenggat (migration 20261105100001, ADR-063): akun yang
-- mematikannya tidak dibuatkan pengingat; pemilik hanya bisa mengubah
-- saklarnya sendiri, dan hak per kolom tidak membuka kolom `role`.
BEGIN;

CREATE FUNCTION pg_temp.deadline_in(n INT) RETURNS TIMESTAMPTZ LANGUAGE sql AS $$
  SELECT (((NOW() AT TIME ZONE 'Asia/Jakarta')::date + n) + TIME '23:59') AT TIME ZONE 'Asia/Jakarta'
$$;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000001a1', 'nyala@example.com'),
  ('00000000-0000-4000-8000-0000000001a2', 'mati@example.com');

DO $$
DECLARE
  on_user  UUID := '00000000-0000-4000-8000-0000000001a1';
  off_user UUID := '00000000-0000-4000-8000-0000000001a2';
  ev       UUID;
  created  INT;
BEGIN
  IF (SELECT deadline_reminders FROM public.users WHERE id = on_user) IS NOT TRUE THEN
    RAISE EXCEPTION 'R1: bawaan harus TRUE untuk akun baru';
  END IF;

  ev := public.stage_scraped_event(jsonb_build_object(
    'title', 'Lomba Saklar Pengingat', 'organizer', 'Panitia Uji', 'event_type', 'LOMBA',
    'registration_link', 'https://daftar.example', 'source_url', 'https://sumber.example/saklar',
    'education_levels', jsonb_build_array('D4_S1'), 'is_online', true,
    'deadlines', jsonb_build_array(jsonb_build_object(
      'label', 'registration', 'deadline_at', pg_temp.deadline_in(1), 'is_primary', true))));
  UPDATE public.events SET status = 'APPROVED', reviewed_at = NOW() WHERE id = ev;
  INSERT INTO public.saved_events (user_id, event_id) VALUES (on_user, ev), (off_user, ev);
  UPDATE public.users SET deadline_reminders = FALSE WHERE id = off_user;

  created := public.create_deadline_notifications();
  IF created <> 1 THEN
    RAISE EXCEPTION 'R2: hanya akun yang menyalakan pengingat yang dibuatkan, dapat %', created;
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE user_id = off_user) THEN
    RAISE EXCEPTION 'R2: akun yang mematikan pengingat tidak boleh dibuatkan notifikasi';
  END IF;
END$$;

-- Pemilik mengubah saklarnya sendiri; baris orang lain tidak tersentuh (RLS),
-- dan hak kolom baru tidak ikut membuka `role`.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000001a1';
UPDATE public.users SET deadline_reminders = FALSE WHERE id = '00000000-0000-4000-8000-0000000001a1';
UPDATE public.users SET deadline_reminders = TRUE WHERE id = '00000000-0000-4000-8000-0000000001a2';
DO $$
BEGIN
  BEGIN
    UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000001a1';
    RAISE EXCEPTION 'R3: kolom role tidak boleh bisa diubah pemilik akun';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deadline_reminders FROM public.users WHERE id = '00000000-0000-4000-8000-0000000001a1') IS NOT FALSE THEN
    RAISE EXCEPTION 'R3: pemilik harus bisa mematikan pengingatnya sendiri';
  END IF;
  IF (SELECT deadline_reminders FROM public.users WHERE id = '00000000-0000-4000-8000-0000000001a2') IS NOT FALSE THEN
    RAISE EXCEPTION 'R3: baris akun lain tidak boleh berubah';
  END IF;
END$$;

ROLLBACK;
