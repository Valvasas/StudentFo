-- Retensi (ADR-060): notifikasi lama terhapus, email kiriman yang sudah
-- diputuskan dikaburkan setelah 90 hari, dan klien tidak bisa memicunya.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000fe701', 'retensi@x');

INSERT INTO public.notifications (user_id, type, message, is_read, sent_at) VALUES
  ('00000000-0000-4000-8000-0000000fe701', 'UJI', 'dibaca-baru',      true,  now() - interval '179 days'),
  ('00000000-0000-4000-8000-0000000fe701', 'UJI', 'dibaca-lama',      true,  now() - interval '181 days'),
  ('00000000-0000-4000-8000-0000000fe701', 'UJI', 'belum-dibaca',     false, now() - interval '300 days'),
  ('00000000-0000-4000-8000-0000000fe701', 'UJI', 'belum-dibaca-tua', false, now() - interval '366 days');

INSERT INTO public.ugc_submissions (submitted_by_email, payload, status, created_at, reviewed_at) VALUES
  ('menunggu@x',  '{"title":"menunggu"}',  'PENDING',  now() - interval '400 days', NULL),
  ('baru@x',      '{"title":"baru"}',      'APPROVED', now() - interval '200 days', now() - interval '89 days'),
  ('diputus@x',   '{"title":"diputus"}',   'REJECTED', now() - interval '200 days', now() - interval '91 days'),
  ('warisan@x',   '{"title":"warisan"}',   'APPROVED', now() - interval '120 days', NULL);

DO $$
BEGIN
  IF public.purge_old_notifications() <> 2 THEN RAISE EXCEPTION 'harus menghapus tepat 2 notifikasi'; END IF;
  IF (SELECT array_agg(message ORDER BY message) FROM public.notifications WHERE type = 'UJI')
     IS DISTINCT FROM ARRAY['belum-dibaca', 'dibaca-baru'] THEN
    RAISE EXCEPTION 'notifikasi yang tersisa salah';
  END IF;

  IF public.redact_decided_submission_emails() <> 2 THEN RAISE EXCEPTION 'harus mengaburkan tepat 2 email'; END IF;
  IF (SELECT submitted_by_email FROM public.ugc_submissions WHERE payload ->> 'title' = 'menunggu') <> 'menunggu@x' THEN
    RAISE EXCEPTION 'kiriman PENDING tidak boleh disentuh, setua apa pun';
  END IF;
  IF (SELECT submitted_by_email FROM public.ugc_submissions WHERE payload ->> 'title' = 'baru') <> 'baru@x' THEN
    RAISE EXCEPTION 'keputusan < 90 hari tidak boleh dikaburkan';
  END IF;
  IF (SELECT count(*) FROM public.ugc_submissions
      WHERE payload ->> 'title' IN ('diputus', 'warisan') AND submitted_by_email = 'dihapus@retensi.invalid') <> 2 THEN
    RAISE EXCEPTION 'keputusan > 90 hari (termasuk baris tanpa reviewed_at) harus dikaburkan';
  END IF;

  -- Idempoten: jalan kedua tidak menyentuh apa pun.
  IF public.purge_old_notifications() <> 0 OR public.redact_decided_submission_emails() <> 0 THEN
    RAISE EXCEPTION 'job retensi harus idempoten';
  END IF;
END$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.purge_old_notifications();
    RAISE EXCEPTION 'anon tidak boleh memanggil purge_old_notifications';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe701';
DO $$
BEGIN
  BEGIN
    PERFORM public.redact_decided_submission_emails();
    RAISE EXCEPTION 'authenticated tidak boleh memanggil redact_decided_submission_emails';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

ROLLBACK;
