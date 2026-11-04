-- Persetujuan pengingat email & antrean yang menghormatinya (ADR-062 #6).
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000f8a01', 'setuju@x'),
  ('00000000-0000-4000-8000-0000000f8a02', 'telat-setuju@x'),
  ('00000000-0000-4000-8000-0000000f8a03', 'ditangguhkan@x');
INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at, education_levels) VALUES
  ('00000000-0000-4000-8000-0000000f8e01', 'Lomba Pengingat Email', 'Org Email', 'LOMBA', 'https://e.example/1', 'https://e.example/1', 'APPROVED', now(), '{D4_S1}');
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
VALUES ('00000000-0000-4000-8000-0000000f8e01', 'registration', now() + interval '3 days', true);

-- 1. RPC: hanya untuk diri sendiri, waktu persetujuan dicatat server.
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.set_deadline_email_reminders(true);
  RAISE EXCEPTION 'tamu tidak boleh memanggil';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f8a01';
DO $$
DECLARE
  first TIMESTAMPTZ;
BEGIN
  BEGIN
    UPDATE public.users SET deadline_email_opt_in_at = '2000-01-01' WHERE id = '00000000-0000-4000-8000-0000000f8a01';
    RAISE EXCEPTION 'waktu persetujuan tidak boleh ditulis langsung (bisa dipalsukan)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  first := public.set_deadline_email_reminders(true);
  IF first IS NULL THEN RAISE EXCEPTION 'menyalakan harus mengembalikan waktu persetujuan'; END IF;
  IF public.set_deadline_email_reminders(true) <> first THEN RAISE EXCEPTION 'menyalakan ulang tidak menggeser waktu persetujuan'; END IF;
  IF (SELECT deadline_email_opt_in_at FROM public.users WHERE id = '00000000-0000-4000-8000-0000000f8a01') <> first THEN
    RAISE EXCEPTION 'pemilik bisa membaca status persetujuannya sendiri';
  END IF;
  IF public.set_deadline_email_reminders(false) IS NOT NULL THEN RAISE EXCEPTION 'mematikan = NULL'; END IF;
  PERFORM public.set_deadline_email_reminders(true);
END$$;
RESET ROLE;

-- 2. Antrean: setuju → diklaim; pengingat sebelum persetujuan & akun ditangguhkan → tidak.
UPDATE public.users SET deadline_email_opt_in_at = now() + interval '1 minute' WHERE id = '00000000-0000-4000-8000-0000000f8a02';
UPDATE public.users SET deadline_email_opt_in_at = now(), suspended_at = now() WHERE id = '00000000-0000-4000-8000-0000000f8a03';
INSERT INTO public.notifications (id, user_id, event_id, type, message) VALUES
  ('00000000-0000-4000-8000-0000000f8b01', '00000000-0000-4000-8000-0000000f8a01', '00000000-0000-4000-8000-0000000f8e01', 'DEADLINE_H3', 'H-3'),
  ('00000000-0000-4000-8000-0000000f8b02', '00000000-0000-4000-8000-0000000f8a02', '00000000-0000-4000-8000-0000000f8e01', 'DEADLINE_H3', 'H-3 sebelum setuju'),
  ('00000000-0000-4000-8000-0000000f8b03', '00000000-0000-4000-8000-0000000f8a03', '00000000-0000-4000-8000-0000000f8e01', 'DEADLINE_H3', 'H-3 akun ditangguhkan');
-- Pengingat yang tertahan > 4 hari tidak lagi relevan.
INSERT INTO public.notifications (id, user_id, event_id, type, message, sent_at) VALUES
  ('00000000-0000-4000-8000-0000000f8b04', '00000000-0000-4000-8000-0000000f8a01', '00000000-0000-4000-8000-0000000f8e01', 'DEADLINE_H1', 'H-1 kuno', now() - interval '5 days');
UPDATE public.users SET deadline_email_opt_in_at = now() - interval '10 days' WHERE id = '00000000-0000-4000-8000-0000000f8a01';

SET LOCAL ROLE service_role;
DO $$
DECLARE
  claimed UUID[];
BEGIN
  SELECT array_agg(c.notification_id ORDER BY c.notification_id) INTO claimed FROM public.claim_notification_dispatch(50, 900) c;
  IF claimed IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-0000000f8b01']::UUID[] THEN
    RAISE EXCEPTION 'hanya pengingat milik yang setuju, sesudah persetujuan, akun aktif, dan belum basi: %', claimed;
  END IF;
END$$;
RESET ROLE;

-- 3. Berhenti → tidak ada lagi yang dibagikan, termasuk sewa yang habis.
UPDATE public.notifications SET dispatch_claimed_at = now() - interval '1 hour' WHERE id = '00000000-0000-4000-8000-0000000f8b01';
UPDATE public.users SET deadline_email_opt_in_at = NULL WHERE id = '00000000-0000-4000-8000-0000000f8a01';
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.claim_notification_dispatch(50, 900)) THEN
    RAISE EXCEPTION 'setelah berhenti, pengingat yang tertunda pun tidak boleh dikirim';
  END IF;
END$$;
RESET ROLE;
ROLLBACK;
