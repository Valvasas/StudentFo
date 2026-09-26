-- Sinyal rekomendasi: hanya server (service_role) yang menulis.
BEGIN;
INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at)
VALUES ('00000000-0000-4000-8000-00000000e5a1', 'Lomba Sinyal', 'Org', 'LOMBA', 'https://x.example', 'https://x.example', 'APPROVED', now());

SET LOCAL ROLE service_role;
INSERT INTO public.recommendation_signals (event_id, kind, interests, education_level)
VALUES ('00000000-0000-4000-8000-00000000e5a1', 'register_click', '{teknologi}', 'D4_S1');
RESET ROLE;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.recommendation_signals (event_id, kind) VALUES ('00000000-0000-4000-8000-00000000e5a1', 'klik_palsu');
    RAISE EXCEPTION 'kind di luar daftar harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.recommendation_signals (event_id, kind) VALUES ('00000000-0000-4000-8000-00000000e5a1', 'save');
    RAISE EXCEPTION 'anon tidak boleh menulis sinyal (penggelembungan bobot)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e5f0';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.recommendation_signals (event_id, kind) VALUES ('00000000-0000-4000-8000-00000000e5a1', 'save');
    RAISE EXCEPTION 'authenticated tidak boleh menulis sinyal langsung';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.recommendation_signals) THEN
    RAISE EXCEPTION 'non-admin tidak boleh membaca sinyal';
  END IF;
END$$;
ROLLBACK;
