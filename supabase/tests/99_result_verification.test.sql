-- Verifikasi hasil oleh penyelenggara (ADR-047): hanya atas permintaan
-- pemilik, hanya oleh penyelenggara terverifikasi yang mengelola acara itu
-- (bukan dirinya sendiri), keputusan mengikat isi SAAT ITU (token versi),
-- gugur saat isi berubah / penyelenggara dicabut, tabel tertutup bagi klien.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000fb001', 'peserta@verif', '{"full_name":"Peserta Verif"}'),
  ('00000000-0000-4000-8000-0000000fb004', 'org@verif', '{"full_name":"Panitia Verif"}'),
  ('00000000-0000-4000-8000-0000000fb005', 'org-lain@verif', '{"full_name":"Panitia Lain"}');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-0000000fbe01', 'Lomba Verif Selesai', 'Himpunan Verif', 'LOMBA', 'https://d.example/v1', 'https://s.example/v1', 'EXPIRED', now()),
  ('00000000-0000-4000-8000-0000000fbe02', 'Lomba Tanpa Pengelola', 'Himpunan Lepas', 'LOMBA', 'https://d.example/v2', 'https://s.example/v2', 'APPROVED', now());

INSERT INTO public.application_tracker (user_id, event_id, status) VALUES
  ('00000000-0000-4000-8000-0000000fb001', '00000000-0000-4000-8000-0000000fbe01', 'ACCEPTED'),
  ('00000000-0000-4000-8000-0000000fb001', '00000000-0000-4000-8000-0000000fbe02', 'APPLIED'),
  -- Penyelenggara juga ikut acaranya sendiri: tidak boleh memverifikasi diri.
  ('00000000-0000-4000-8000-0000000fb004', '00000000-0000-4000-8000-0000000fbe01', 'ACCEPTED');
UPDATE public.application_tracker SET achievement = 'JUARA_1' WHERE user_id = '00000000-0000-4000-8000-0000000fb004';

INSERT INTO public.organizer_profiles (user_id, org_name, evidence) VALUES
  ('00000000-0000-4000-8000-0000000fb004', 'Himpunan Verif', 'Ketua himpunan, lihat https://himpunan.example'),
  ('00000000-0000-4000-8000-0000000fb005', 'Lembaga Lain', 'Ketua lembaga lain, lihat https://lain.example');
SELECT public.review_organizer('00000000-0000-4000-8000-0000000fb004', 'VERIFIED', NULL, NULL);
SELECT public.review_organizer('00000000-0000-4000-8000-0000000fb005', 'VERIFIED', NULL, NULL);
INSERT INTO public.event_managers (event_id, user_id, source) VALUES
  ('00000000-0000-4000-8000-0000000fbe01', '00000000-0000-4000-8000-0000000fb004', 'ADMIN');

CREATE FUNCTION pg_temp.expect_error(p_sql TEXT, p_message TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'seharusnya gagal dengan %: %', p_message, p_sql;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> p_message THEN RAISE; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(TEXT, TEXT) TO authenticated, anon;

SET LOCAL ROLE authenticated;

-- 1. Peserta: tanpa hasil tidak bisa minta; acara tanpa pengelola = tidak tersedia.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fb001';
SELECT pg_temp.expect_error($$SELECT public.request_result_verification('00000000-0000-4000-8000-0000000fbe01')$$, 'verification_not_eligible');
UPDATE public.application_tracker SET achievement = 'JUARA_2', proof_url = 'https://bukti.example/1';
SELECT pg_temp.expect_error($$SELECT public.request_result_verification('00000000-0000-4000-8000-0000000fbe02')$$, 'verification_unavailable');

-- 2. Tabel tertutup bagi klien; permintaan sah, idempoten.
SELECT pg_temp.expect_error($$SELECT 1 FROM public.portfolio_verifications$$, 'permission denied for table portfolio_verifications');
SELECT public.request_result_verification('00000000-0000-4000-8000-0000000fbe01');
SELECT public.request_result_verification('00000000-0000-4000-8000-0000000fbe01');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.my_result_verifications() WHERE status = 'PENDING') <> 1 THEN
    RAISE EXCEPTION 'permintaan harus tercatat sekali sebagai PENDING';
  END IF;
END$$;

-- 3. Penyelenggara lain (terverifikasi, bukan pengelola) tidak melihat & tidak bisa memutuskan.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fb005';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizer_pending_verifications()) THEN
    RAISE EXCEPTION 'penyelenggara lain tidak boleh melihat permintaan';
  END IF;
END$$;
SELECT pg_temp.expect_error(format(
  $$SELECT public.review_result_verification('00000000-0000-4000-8000-0000000fb001', '00000000-0000-4000-8000-0000000fbe01', now(), 'VERIFIED', NULL)$$
), 'not_event_manager');

-- 4. Pengelola: melihat permintaan + notifikasi; tidak bisa memverifikasi diri.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fb004';
SELECT pg_temp.expect_error($$SELECT public.request_result_verification('00000000-0000-4000-8000-0000000fbe01')$$, 'verification_unavailable');
SELECT pg_temp.expect_error(
  $$SELECT public.review_result_verification('00000000-0000-4000-8000-0000000fb004', '00000000-0000-4000-8000-0000000fbe01', now(), 'VERIFIED', NULL)$$,
  'verification_self');
DO $$
DECLARE
  pending RECORD;
BEGIN
  SELECT * INTO pending FROM public.organizer_pending_verifications();
  IF pending.full_name IS DISTINCT FROM 'Peserta Verif' OR pending.achievement IS DISTINCT FROM 'JUARA_2'
     OR pending.proof_url IS DISTINCT FROM 'https://bukti.example/1' THEN
    RAISE EXCEPTION 'pengelola harus melihat nama, hasil & bukti yang diminta: %', pending;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE type = 'VERIFICATION_REQUESTED') THEN
    RAISE EXCEPTION 'pengelola harus dikabari';
  END IF;
  -- Token versi basi ditolak.
  BEGIN
    PERFORM public.review_result_verification(pending.user_id, pending.event_id, pending.requested_at - interval '1 second', 'VERIFIED', NULL);
    RAISE EXCEPTION 'token versi basi harus ditolak';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'verification_not_pending' THEN RAISE; END IF;
  END;
  PERFORM public.review_result_verification(pending.user_id, pending.event_id, pending.requested_at, 'VERIFIED', 'catatan diabaikan');
END$$;

-- 5. Peserta: terkonfirmasi, dikabari, tampil di portofolio publik; ubah visibilitas tidak menggugurkan.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fb001';
UPDATE public.application_tracker SET portfolio_visible = true WHERE event_id = '00000000-0000-4000-8000-0000000fbe01';
DO $$
BEGIN
  IF (SELECT org_name FROM public.my_result_verifications() WHERE status = 'VERIFIED') IS DISTINCT FROM 'Himpunan Verif'
     OR (SELECT review_note FROM public.my_result_verifications()) IS NOT NULL THEN
    RAISE EXCEPTION 'verifikasi harus tercatat dengan nama lembaga, tanpa catatan';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE type = 'RESULT_VERIFIED') THEN
    RAISE EXCEPTION 'peserta harus dikabari';
  END IF;
  IF (SELECT verified_by FROM public.public_portfolio('00000000-0000-4000-8000-0000000fb001') WHERE event_id = '00000000-0000-4000-8000-0000000fbe01')
     IS DISTINCT FROM 'Himpunan Verif' THEN
    RAISE EXCEPTION 'portofolio publik harus menyebut lembaga yang mengonfirmasi';
  END IF;
END$$;

-- 6. Ubah bukti → gugur; minta lagi → ditolak dengan alasan → tidak bisa minta ulang tanpa perbaikan.
UPDATE public.application_tracker SET proof_url = 'https://bukti.example/2' WHERE event_id = '00000000-0000-4000-8000-0000000fbe01';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.my_result_verifications())
     OR (SELECT verified_by FROM public.public_portfolio('00000000-0000-4000-8000-0000000fb001') WHERE event_id = '00000000-0000-4000-8000-0000000fbe01') IS NOT NULL THEN
    RAISE EXCEPTION 'mengubah bukti harus menggugurkan verifikasi';
  END IF;
END$$;
SELECT public.request_result_verification('00000000-0000-4000-8000-0000000fbe01');

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fb004';
DO $$
DECLARE
  pending RECORD;
BEGIN
  SELECT * INTO pending FROM public.organizer_pending_verifications();
  PERFORM public.review_result_verification(pending.user_id, pending.event_id, pending.requested_at, 'DECLINED', '  Juara 2 tercatat atas nama tim lain.  ');
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fb001';
DO $$
BEGIN
  IF (SELECT review_note FROM public.my_result_verifications() WHERE status = 'DECLINED') IS DISTINCT FROM 'Juara 2 tercatat atas nama tim lain.' THEN
    RAISE EXCEPTION 'penolakan harus membawa alasan yang dirapikan';
  END IF;
  IF (SELECT verified_by FROM public.public_portfolio('00000000-0000-4000-8000-0000000fb001') WHERE event_id = '00000000-0000-4000-8000-0000000fbe01') IS NOT NULL THEN
    RAISE EXCEPTION 'hasil yang ditolak tidak boleh tampil terverifikasi';
  END IF;
END$$;
SELECT pg_temp.expect_error($$SELECT public.request_result_verification('00000000-0000-4000-8000-0000000fbe01')$$, 'verification_declined');
UPDATE public.application_tracker SET achievement = 'FINALIS' WHERE event_id = '00000000-0000-4000-8000-0000000fbe01';
SELECT public.request_result_verification('00000000-0000-4000-8000-0000000fbe01');
SELECT public.cancel_result_verification('00000000-0000-4000-8000-0000000fbe01');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.my_result_verifications()) THEN
    RAISE EXCEPTION 'permintaan yang dibatalkan harus hilang';
  END IF;
END$$;

-- 7. Verifikasi dari penyelenggara yang dicabut ikut gugur.
SELECT public.request_result_verification('00000000-0000-4000-8000-0000000fbe01');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fb004';
DO $$
DECLARE
  pending RECORD;
BEGIN
  SELECT * INTO pending FROM public.organizer_pending_verifications();
  PERFORM public.review_result_verification(pending.user_id, pending.event_id, pending.requested_at, 'VERIFIED', NULL);
END$$;
RESET ROLE;
SELECT public.review_organizer('00000000-0000-4000-8000-0000000fb004', 'REVOKED', NULL, 'uji');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.portfolio_verifications) THEN
    RAISE EXCEPTION 'verifikasi dari penyelenggara yang dicabut harus gugur';
  END IF;
END$$;

-- 8. Tamu tidak bisa memanggil apa pun.
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($$SELECT public.request_result_verification('00000000-0000-4000-8000-0000000fbe01')$$,
  'permission denied for function request_result_verification');
SELECT pg_temp.expect_error($$SELECT 1 FROM public.organizer_pending_verifications()$$,
  'permission denied for function organizer_pending_verifications');
ROLLBACK;
