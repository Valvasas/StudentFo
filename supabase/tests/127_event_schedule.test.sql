-- Waktu pelaksanaan (ADR-100, migration 20261125100002).
-- Cermin: src/lib/event-schedule.test.ts & src/lib/data/event-schedule.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-000001000a01', 'admin@jadwal', '{"full_name":"Admin Jadwal"}'),
  ('00000000-0000-4000-8000-000001000a02', 'anggota@jadwal', '{"full_name":"Anggota Biasa"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-000001000a01';

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-000001000e01', 'Workshop Jadwal Uji', 'Penyelenggara Uji', 'WORKSHOP',
   'https://daftar.example/j1', 'https://sumber.example/j1', 'APPROVED', now());
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-4000-8000-000001000e01', 'registration', now() + interval '10 days', true);

-- 1. Bawaan kosong; selesai tanpa mulai / sebelum mulai ditolak CHECK.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id = '00000000-0000-4000-8000-000001000e01' AND (starts_at IS NOT NULL OR ends_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'jadwal bawaan harus kosong';
  END IF;
  BEGIN
    UPDATE public.events SET ends_at = now() WHERE id = '00000000-0000-4000-8000-000001000e01';
    RAISE EXCEPTION 'selesai tanpa mulai harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.events SET starts_at = now(), ends_at = now() - interval '1 hour' WHERE id = '00000000-0000-4000-8000-000001000e01';
    RAISE EXCEPTION 'selesai sebelum mulai harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

-- 2. Tamu tidak bisa memanggil RPC sama sekali.
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.set_event_schedule('00000000-0000-4000-8000-000001000e01', now(), NULL);
  RAISE EXCEPTION 'tamu tidak boleh memanggil set_event_schedule';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
RESET ROLE;

-- 3. Anggota yang bukan pengelola ditolak, jadwal tetap kosong.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000001000a02';
DO $$
BEGIN
  PERFORM public.set_event_schedule('00000000-0000-4000-8000-000001000e01', now() + interval '20 days', NULL);
  RAISE EXCEPTION 'bukan pengelola harus ditolak';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'not_event_manager' THEN RAISE; END IF;
END$$;
RESET ROLE;

-- 4. Admin memasang, urutan terbalik ditolak dengan kode tertutup, lalu menghapus.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000001000a01';
SET LOCAL request.jwt.claims = '{"aal":"aal2"}';
DO $$
DECLARE v_start TIMESTAMPTZ; v_end TIMESTAMPTZ;
BEGIN
  PERFORM public.set_event_schedule('00000000-0000-4000-8000-000001000e01', '2026-12-12 09:00+07', '2026-12-12 16:00+07');
  SELECT starts_at, ends_at INTO v_start, v_end FROM public.events WHERE id = '00000000-0000-4000-8000-000001000e01';
  IF v_start <> '2026-12-12 02:00+00' OR v_end <> '2026-12-12 09:00+00' THEN
    RAISE EXCEPTION 'jadwal admin tidak tersimpan: % – %', v_start, v_end;
  END IF;

  BEGIN
    PERFORM public.set_event_schedule('00000000-0000-4000-8000-000001000e01', '2026-12-12 16:00+07', '2026-12-12 09:00+07');
    RAISE EXCEPTION 'urutan terbalik harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_schedule' THEN RAISE; END IF;
  END;

  PERFORM public.set_event_schedule('00000000-0000-4000-8000-000001000e01', NULL, NULL);
  IF EXISTS (SELECT 1 FROM public.events WHERE id = '00000000-0000-4000-8000-000001000e01' AND starts_at IS NOT NULL) THEN
    RAISE EXCEPTION 'jadwal harus bisa dihapus';
  END IF;
END$$;
RESET ROLE;

-- 5. Tamu membaca jadwal kegiatan tayang lewat policy yang sama.
UPDATE public.events SET starts_at = '2026-12-12 09:00+07' WHERE id = '00000000-0000-4000-8000-000001000e01';
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = '00000000-0000-4000-8000-000001000e01' AND starts_at IS NOT NULL) THEN
    RAISE EXCEPTION 'jadwal kegiatan tayang harus terbaca tamu';
  END IF;
END$$;
RESET ROLE;

ROLLBACK;
