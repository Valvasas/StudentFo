-- Formulir pendaftaran internal, pembayaran, galeri (ADR-056): hanya
-- pengelola terverifikasi yang menyusun formulir/memverifikasi/mengunggah,
-- peserta hanya melihat miliknya, transisi status dijaga RPC, kuota tidak
-- bisa dilampaui, galeri dibatasi 30, kolom UUID panitia tidak terbaca.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000e501', 'panitia@uji', '{"full_name":"Panitia"}'),
  ('00000000-0000-4000-8000-00000000e502', 'peserta@uji', '{"full_name":"Peserta Satu"}'),
  ('00000000-0000-4000-8000-00000000e503', 'lain@uji', '{"full_name":"Peserta Dua"}'),
  ('00000000-0000-4000-8000-00000000e504', 'tiga@uji', '{"full_name":"Peserta Tiga"}');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at)
VALUES
  ('00000000-0000-4000-8000-00000000e5e1', 'Workshop Berbayar Uji', 'Himpunan Uji', 'WORKSHOP',
   'https://daftar.example/a', 'https://sumber.example/a', 'APPROVED', now()),
  ('00000000-0000-4000-8000-00000000e5e2', 'Seminar Gratis Uji', 'Himpunan Uji', 'KONFERENSI',
   'https://daftar.example/b', 'https://sumber.example/b', 'APPROVED', now());
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-4000-8000-00000000e5e1', 'registration', now() + interval '10 days', true),
  ('00000000-0000-4000-8000-00000000e5e2', 'registration', now() + interval '10 days', true);

INSERT INTO public.organizer_profiles (user_id, org_name, evidence)
VALUES ('00000000-0000-4000-8000-00000000e501', 'Himpunan Uji', 'Ketua himpunan, https://himpunan.example');
SELECT public.review_organizer('00000000-0000-4000-8000-00000000e501', 'VERIFIED', NULL, NULL);
INSERT INTO public.event_managers (event_id, user_id, source) VALUES
  ('00000000-0000-4000-8000-00000000e5e1', '00000000-0000-4000-8000-00000000e501', 'ADMIN'),
  ('00000000-0000-4000-8000-00000000e5e2', '00000000-0000-4000-8000-00000000e501', 'ADMIN');

-- 1. Formulir: hanya pengelola; berbayar wajib instruksi; `updated_by` tidak terbaca.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e502';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.event_registration_forms (event_id, is_open) VALUES ('00000000-0000-4000-8000-00000000e5e1', true);
    RAISE EXCEPTION 'peserta tidak boleh membuat formulir';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e501';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.event_registration_forms (event_id, is_open, fee_amount) VALUES ('00000000-0000-4000-8000-00000000e5e1', true, 50000);
    RAISE EXCEPTION 'acara berbayar tanpa instruksi pembayaran harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;
INSERT INTO public.event_registration_forms (event_id, is_open, fields, fee_amount, payment_instructions)
VALUES ('00000000-0000-4000-8000-00000000e5e1', true, '[{"id":"f_hp","type":"phone","label":"HP","required":true,"options":[]}]',
        50000, 'Transfer BCA 1234567890 a.n. Himpunan Uji');
INSERT INTO public.event_registration_forms (event_id, is_open, capacity)
VALUES ('00000000-0000-4000-8000-00000000e5e2', true, 1);

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_registration_forms) <> 2 THEN
    RAISE EXCEPTION 'formulir acara tayang harus terbaca publik';
  END IF;
  BEGIN
    PERFORM updated_by FROM public.event_registration_forms;
    RAISE EXCEPTION 'updated_by tidak boleh terbaca publik';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.register_for_event('00000000-0000-4000-8000-00000000e5e2', '{}');
    RAISE EXCEPTION 'tamu tidak boleh mendaftar';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

-- 2. Mendaftar: gratis langsung terkonfirmasi, papan ikut maju, kuota & duplikat dijaga.
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e502';
DO $$
DECLARE r public.event_registrations;
BEGIN
  r := public.register_for_event('00000000-0000-4000-8000-00000000e5e2', '{"f_x":"ya"}');
  IF r.status <> 'CONFIRMED' OR r.code !~ '^SF-[0-9A-F]{8}$' OR r.full_name <> 'Peserta Satu' THEN
    RAISE EXCEPTION 'pendaftaran gratis harus terkonfirmasi dengan salinan nama: %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.application_tracker
                 WHERE user_id = '00000000-0000-4000-8000-00000000e502'
                   AND event_id = '00000000-0000-4000-8000-00000000e5e2' AND status = 'APPLIED') THEN
    RAISE EXCEPTION 'papan pendaftaran harus ikut tercatat APPLIED';
  END IF;
  BEGIN
    PERFORM public.register_for_event('00000000-0000-4000-8000-00000000e5e2', '{}');
    RAISE EXCEPTION 'pendaftaran ganda harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'registration_exists' THEN RAISE; END IF;
  END;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e503';
DO $$
BEGIN
  PERFORM public.register_for_event('00000000-0000-4000-8000-00000000e5e2', '{}');
  RAISE EXCEPTION 'kuota 1 sudah terpakai';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'registration_full' THEN RAISE; END IF;
END$$;

-- 3. Alur bayar: menunggu → bukti → ditolak (catatan wajib) → bukti ulang → dikonfirmasi.
DO $$
DECLARE r public.event_registrations;
BEGIN
  r := public.register_for_event('00000000-0000-4000-8000-00000000e5e1', '{"f_hp":"0812"}');
  IF r.status <> 'AWAITING_PAYMENT' OR r.fee_amount <> 50000 THEN
    RAISE EXCEPTION 'acara berbayar harus menunggu pembayaran: %', r;
  END IF;
  PERFORM set_config('uji.reg', r.id::text, true);
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e502';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-00000000e503') THEN
    RAISE EXCEPTION 'peserta lain tidak boleh membaca pendaftaran orang lain';
  END IF;
  BEGIN
    PERFORM public.submit_payment_proof(current_setting('uji.reg')::uuid, current_setting('uji.reg') || '/00000000-0000-4000-8000-000000000001.jpg');
    RAISE EXCEPTION 'orang lain tidak boleh mengunggah bukti';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'registration_not_found' THEN RAISE; END IF;
  END;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e503';
DO $$
BEGIN
  BEGIN
    PERFORM public.submit_payment_proof(current_setting('uji.reg')::uuid, 'lain/berkas.jpg');
    RAISE EXCEPTION 'path di luar folder pendaftaran harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_registration' THEN RAISE; END IF;
  END;
  PERFORM public.submit_payment_proof(current_setting('uji.reg')::uuid, current_setting('uji.reg') || '/00000000-0000-4000-8000-000000000001.jpg');
END$$;

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                 WHERE user_id = '00000000-0000-4000-8000-00000000e501' AND type = 'PAYMENT_SUBMITTED') THEN
    RAISE EXCEPTION 'panitia harus dikabari bukti baru';
  END IF;
END$$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e504';
DO $$
BEGIN
  PERFORM public.review_event_registration(current_setting('uji.reg')::uuid, 'confirm', NULL);
  RAISE EXCEPTION 'bukan pengelola tidak boleh memverifikasi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'registration_not_found' THEN RAISE; END IF;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e501';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_registrations) <> 2 THEN
    RAISE EXCEPTION 'pengelola harus melihat semua pendaftar acaranya';
  END IF;
  BEGIN
    PERFORM reviewed_by FROM public.event_registrations;
    RAISE EXCEPTION 'reviewed_by tidak boleh terbaca';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.review_event_registration(current_setting('uji.reg')::uuid, 'reject_payment', '  ');
    RAISE EXCEPTION 'menolak tanpa catatan harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'review_note_required' THEN RAISE; END IF;
  END;
  PERFORM public.review_event_registration(current_setting('uji.reg')::uuid, 'reject_payment', 'Nominal kurang Rp 5.000');
  IF (SELECT status FROM public.event_registrations WHERE id = current_setting('uji.reg')::uuid) <> 'AWAITING_PAYMENT' THEN
    RAISE EXCEPTION 'bukti ditolak harus kembali menunggu pembayaran';
  END IF;
  BEGIN
    PERFORM public.review_event_registration(current_setting('uji.reg')::uuid, 'reject_payment', 'lagi');
    RAISE EXCEPTION 'tolak bukti hanya dari PAYMENT_REVIEW';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'registration_invalid_transition' THEN RAISE; END IF;
  END;
  PERFORM public.review_event_registration(current_setting('uji.reg')::uuid, 'confirm', NULL);
END$$;

DO $$
DECLARE s RECORD;
BEGIN
  SELECT * INTO s FROM public.registration_stats(ARRAY['00000000-0000-4000-8000-00000000e5e1'::uuid]);
  IF s.total <> 1 OR s.confirmed <> 1 OR s.recent <> 1 THEN
    RAISE EXCEPTION 'statistik pendaftar salah: %', s;
  END IF;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e503';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.registration_stats(ARRAY['00000000-0000-4000-8000-00000000e5e1'::uuid])) THEN
    RAISE EXCEPTION 'peserta tidak boleh mendapat statistik acara';
  END IF;
END$$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.event_registrations WHERE id = current_setting('uji.reg')::uuid) <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'tandai lunas harus mengonfirmasi';
  END IF;
  IF (SELECT count(*) FROM public.notifications
      WHERE user_id = '00000000-0000-4000-8000-00000000e503' AND type IN ('PAYMENT_REJECTED', 'REGISTRATION_CONFIRMED')) <> 2 THEN
    RAISE EXCEPTION 'peserta harus dikabari penolakan bukti & konfirmasi';
  END IF;
END$$;

-- 4. Batal: status akhir, lalu boleh mendaftar lagi; hitungan kuota publik.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e502';
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8000-00000000e5e2';
  PERFORM public.cancel_event_registration(v_id);
  BEGIN
    PERFORM public.cancel_event_registration(v_id);
    RAISE EXCEPTION 'batal dua kali harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'registration_invalid_transition' THEN RAISE; END IF;
  END;
  IF public.event_registration_count('00000000-0000-4000-8000-00000000e5e2') <> 0 THEN
    RAISE EXCEPTION 'yang dibatalkan tidak memakan kuota';
  END IF;
  PERFORM public.register_for_event('00000000-0000-4000-8000-00000000e5e2', '{}');
END$$;

-- 5. Galeri: hanya pengelola, maksimal 30, `uploaded_by` diisi server & tidak terbaca.
DO $$
BEGIN
  INSERT INTO public.event_photos (event_id, storage_path, content_type, width, height)
  VALUES ('00000000-0000-4000-8000-00000000e5e1', '00000000-0000-4000-8000-00000000e5e1/00000000-0000-4000-8000-0000000000aa.jpg', 'image/jpeg', 800, 600);
  RAISE EXCEPTION 'peserta tidak boleh mengunggah foto';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000e501';
INSERT INTO public.event_photos (event_id, storage_path, content_type, width, height)
SELECT '00000000-0000-4000-8000-00000000e5e1',
       '00000000-0000-4000-8000-00000000e5e1/' || gen_random_uuid() || '.jpg', 'image/jpeg', 800, 600
FROM generate_series(1, 30);
DO $$
BEGIN
  INSERT INTO public.event_photos (event_id, storage_path, content_type, width, height)
  VALUES ('00000000-0000-4000-8000-00000000e5e1', '00000000-0000-4000-8000-00000000e5e1/' || gen_random_uuid() || '.jpg', 'image/jpeg', 800, 600);
  RAISE EXCEPTION 'foto ke-31 harus ditolak';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'gallery_full' THEN RAISE; END IF;
END$$;

RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_photos WHERE uploaded_by IS DISTINCT FROM '00000000-0000-4000-8000-00000000e501') THEN
    RAISE EXCEPTION 'uploaded_by harus diisi server';
  END IF;
END$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_photos) <> 30 THEN
    RAISE EXCEPTION 'foto acara tayang harus terbaca publik';
  END IF;
  BEGIN
    PERFORM uploaded_by FROM public.event_photos;
    RAISE EXCEPTION 'uploaded_by tidak boleh terbaca publik';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.event_photos;
    RAISE EXCEPTION 'tamu tidak boleh menghapus foto';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

ROLLBACK;
