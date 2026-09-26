-- Pengirim yang MASUK dikabari saat kirimannya disetujui/ditolak; tamu
-- tidak; pengguna tidak bisa mengatasnamakan orang lain.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000f0a1', 'pengirim@x'),
  ('00000000-0000-4000-8000-00000000f0a2', 'korban@x'),
  ('00000000-0000-4000-8000-00000000f0ad', 'admin@x');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000f0a1';
INSERT INTO public.ugc_submissions (submitted_by_email, payload, submitted_by) VALUES
  ('pengirim@x',
   '{"title":"Lomba Kiriman Notif","organizer":"Org Notif","event_type":"LOMBA","registration_link":"https://n.example","deadline_at":"2099-01-01T00:00:00Z"}',
   '00000000-0000-4000-8000-00000000f0a1'),
  ('pengirim@x',
   '{"title":"Kiriman Ditolak Notif","organizer":"Org","event_type":"LOMBA","registration_link":"https://n.example","deadline_at":"2099-01-01T00:00:00Z"}',
   '00000000-0000-4000-8000-00000000f0a1');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.ugc_submissions (submitted_by_email, payload, submitted_by)
    VALUES ('korban@x', '{}', '00000000-0000-4000-8000-00000000f0a2');
    RAISE EXCEPTION 'pengguna tidak boleh mengirim atas nama akun lain';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ugc_submissions (submitted_by_email, payload, submitted_by)
    VALUES ('korban@x', '{}', '00000000-0000-4000-8000-00000000f0a2');
    RAISE EXCEPTION 'tamu tidak boleh mengisi submitted_by';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- Tamu tanpa akun: kiriman valid, tidak ada notifikasi.
INSERT INTO public.ugc_submissions (id, submitted_by_email, payload) VALUES
  ('00000000-0000-4000-8000-00000000f053', 'tamu@x',
   '{"title":"Kiriman Tamu","organizer":"Org Tamu","event_type":"LOMBA","registration_link":"https://n.example","deadline_at":"2099-01-01T00:00:00Z"}');

SELECT public.approve_submission(
  (SELECT id FROM public.ugc_submissions WHERE payload ->> 'title' = 'Lomba Kiriman Notif'),
  '00000000-0000-4000-8000-00000000f0ad');
UPDATE public.ugc_submissions SET status = 'REJECTED' WHERE payload ->> 'title' = 'Kiriman Ditolak Notif';
UPDATE public.ugc_submissions SET status = 'REJECTED' WHERE id = '00000000-0000-4000-8000-00000000f053';

DO $$
DECLARE
  approved RECORD;
BEGIN
  SELECT n.*, e.title AS event_title INTO approved FROM public.notifications n
  LEFT JOIN public.events e ON e.id = n.event_id
  WHERE n.user_id = '00000000-0000-4000-8000-00000000f0a1' AND n.type = 'SUBMISSION_APPROVED';
  IF approved IS NULL OR approved.event_title IS DISTINCT FROM 'Lomba Kiriman Notif' THEN
    RAISE EXCEPTION 'notifikasi disetujui harus menaut ke event yang baru tayang: %', approved;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-00000000f0a1'
                 AND type = 'SUBMISSION_REJECTED' AND message LIKE '%Kiriman Ditolak Notif%') THEN
    RAISE EXCEPTION 'penolakan harus dikabarkan ke pengirim';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE type LIKE 'SUBMISSION_%') <> 2 THEN
    RAISE EXCEPTION 'kiriman tamu tidak boleh menghasilkan notifikasi';
  END IF;
END$$;
ROLLBACK;
