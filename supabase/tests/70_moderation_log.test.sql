-- Log moderasi append-only: setiap perubahan status tercatat dengan aktor
-- yang benar, dari jalur mana pun, dan tidak bisa dihapus lewat API.
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000d0a1', 'admin.a@x', '{"full_name":"Admin A"}'),
  ('00000000-0000-4000-8000-00000000d0a2', 'admin.b@x', '{"full_name":"Admin B"}'),
  ('00000000-0000-4000-8000-00000000d0a3', 'biasa@x',   '{"full_name":"Biasa"}');
UPDATE public.users SET role = 'ADMIN'
WHERE id IN ('00000000-0000-4000-8000-00000000d0a1', '00000000-0000-4000-8000-00000000d0a2');

-- Scraper memasukkan PENDING: bukan keputusan, tidak dicatat.
INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url)
VALUES ('00000000-0000-4000-8000-00000000d0e1', 'Lomba Log', 'Org', 'LOMBA', 'https://x.example', 'https://x.example');

-- Admin A menyetujui (pola SupabaseEventRepository.reviewEvent).
UPDATE public.events SET status = 'APPROVED', reviewed_by = '00000000-0000-4000-8000-00000000d0a1', reviewed_at = now() - interval '1 minute'
WHERE id = '00000000-0000-4000-8000-00000000d0e1';
-- Admin B membalik jadi REJECTED dengan alasan.
UPDATE public.events SET status = 'REJECTED', reviewed_by = '00000000-0000-4000-8000-00000000d0a2', reviewed_at = now(), rejection_reason = 'Tautan palsu'
WHERE id = '00000000-0000-4000-8000-00000000d0e1';
-- Perubahan tanpa reviewed_at baru (SQL manual / job) → aktor NULL, bukan admin B.
UPDATE public.events SET status = 'APPROVED', rejection_reason = NULL WHERE id = '00000000-0000-4000-8000-00000000d0e1';
-- Perubahan kolom lain tidak dicatat.
UPDATE public.events SET description = 'x' WHERE id = '00000000-0000-4000-8000-00000000d0e1';

DO $$
DECLARE
  entries JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('from', from_status, 'to', to_status, 'actor', actor_id, 'reason', reason) ORDER BY id)
    INTO entries FROM public.moderation_log WHERE subject_id = '00000000-0000-4000-8000-00000000d0e1';
  IF entries IS DISTINCT FROM '[
      {"from":"PENDING","to":"APPROVED","actor":"00000000-0000-4000-8000-00000000d0a1","reason":null},
      {"from":"APPROVED","to":"REJECTED","actor":"00000000-0000-4000-8000-00000000d0a2","reason":"Tautan palsu"},
      {"from":"REJECTED","to":"APPROVED","actor":null,"reason":null}
    ]'::jsonb THEN
    RAISE EXCEPTION 'log event salah: %', entries;
  END IF;
END$$;

-- Kiriman komunitas: disetujui lewat RPC, ditolak lewat UPDATE.
INSERT INTO public.ugc_submissions (id, submitted_by_email, payload) VALUES
  ('00000000-0000-4000-8000-00000000d051', 'p@x', '{"title":"Beasiswa Kiriman","organizer":"Yayasan","event_type":"BEASISWA","registration_link":"https://y.example","deadline_at":"2099-01-01T00:00:00Z","education_levels":["D4_S1"]}'),
  ('00000000-0000-4000-8000-00000000d052', 'q@x', '{"title":"Kiriman Spam","organizer":"?","event_type":"LOMBA","registration_link":"https://z.example","deadline_at":"2099-01-01T00:00:00Z"}');

SELECT public.approve_submission('00000000-0000-4000-8000-00000000d051', '00000000-0000-4000-8000-00000000d0a1');
UPDATE public.ugc_submissions SET status = 'REJECTED', reviewed_by = '00000000-0000-4000-8000-00000000d0a2', reviewed_at = now()
WHERE id = '00000000-0000-4000-8000-00000000d052';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_type = 'submission'
      AND subject_id = '00000000-0000-4000-8000-00000000d051' AND to_status = 'APPROVED'
      AND actor_id = '00000000-0000-4000-8000-00000000d0a1' AND title = 'Beasiswa Kiriman') THEN
    RAISE EXCEPTION 'persetujuan kiriman tidak tercatat dengan aktornya';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_type = 'event'
      AND title = 'Beasiswa Kiriman' AND from_status IS NULL AND to_status = 'APPROVED'
      AND actor_id = '00000000-0000-4000-8000-00000000d0a1') THEN
    RAISE EXCEPTION 'event hasil kiriman tidak tercatat sebagai terbit oleh peninjau';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_id = '00000000-0000-4000-8000-00000000d052'
      AND to_status = 'REJECTED' AND actor_id = '00000000-0000-4000-8000-00000000d0a2') THEN
    RAISE EXCEPTION 'penolakan kiriman tidak tercatat';
  END IF;
  IF (SELECT reviewed_by FROM public.ugc_submissions WHERE id = '00000000-0000-4000-8000-00000000d051')
     IS DISTINCT FROM '00000000-0000-4000-8000-00000000d0a1' THEN
    RAISE EXCEPTION 'approve_submission harus mengisi reviewed_by kiriman';
  END IF;
END$$;

-- Append-only, bahkan untuk service_role.
SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    DELETE FROM public.moderation_log;
    RAISE EXCEPTION 'service_role tidak boleh menghapus log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.moderation_log SET actor_id = NULL;
    RAISE EXCEPTION 'service_role tidak boleh mengubah log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- Pengguna biasa tidak melihat apa pun; admin melihat semuanya.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d0a3';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.moderation_log) THEN
    RAISE EXCEPTION 'pengguna biasa tidak boleh membaca log moderasi';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d0a1';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.moderation_log) < 6 THEN
    RAISE EXCEPTION 'admin harus membaca seluruh log';
  END IF;
END$$;
RESET ROLE;

-- Tamu tidak bisa memalsukan peninjau di kiriman.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ugc_submissions (submitted_by_email, payload, reviewed_by)
    VALUES ('r@x', '{}', '00000000-0000-4000-8000-00000000d0a1');
    RAISE EXCEPTION 'anon tidak boleh mengisi reviewed_by';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

ROLLBACK;
