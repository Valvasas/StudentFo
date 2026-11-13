-- Poster lampiran kiriman (ADR-084): hanya server yang menulis kolomnya,
-- hanya moderator ber-MFA & pengirimnya yang melihat poster yang belum
-- tayang, disetujui = berkas yang sama menjadi poster acara, ditolak =
-- dilepas untuk dihapus. Cermin: src/lib/data/submissions.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000ff001', 'pengirim@poster', '{"full_name":"Pengirim Poster"}'),
  ('00000000-0000-4000-8000-0000000ff002', 'orang-lain@poster', '{"full_name":"Orang Lain"}'),
  ('00000000-0000-4000-8000-0000000ff003', 'admin@poster', '{"full_name":"Admin Uji"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000ff003';

-- 1. Klien (anon maupun yang masuk) tidak bisa menulis kolom poster.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000ff001';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ugc_submissions (submitted_by_email, submitted_by, payload, poster_id, poster_type, poster_width, poster_height)
    VALUES ('pengirim@poster', '00000000-0000-4000-8000-0000000ff001', '{"title":"Susupan"}',
            '00000000-0000-4000-8000-0000000ffa09', 'image/png', 10, 10);
    RAISE EXCEPTION 'klien tidak boleh menulis kolom poster';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- 2. Server menyimpan kiriman berposter; bentuknya dijaga CHECK.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ugc_submissions (submitted_by_email, payload, poster_id)
    VALUES ('pengirim@poster', '{"title":"Setengah"}', '00000000-0000-4000-8000-0000000ffa08');
    RAISE EXCEPTION 'poster tanpa jenis & ukuran harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.ugc_submissions (submitted_by_email, payload, poster_id, poster_type, poster_width, poster_height)
    VALUES ('pengirim@poster', '{"title":"SVG"}', '00000000-0000-4000-8000-0000000ffa08', 'image/svg+xml', 10, 10);
    RAISE EXCEPTION 'jenis berkas di luar daftar harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

INSERT INTO public.ugc_submissions (id, submitted_by_email, submitted_by, payload, poster_id, poster_type, poster_width, poster_height) VALUES
  ('00000000-0000-4000-8000-0000000ffb01', 'pengirim@poster', '00000000-0000-4000-8000-0000000ff001',
   jsonb_build_object(
     'title', 'Lomba Berposter Uji 2026', 'organizer', 'Panitia Poster', 'event_type', 'LOMBA',
     'registration_link', 'https://daftar.example/poster-1', 'education_levels', jsonb_build_array('D4_S1'),
     'deadline_at', to_char(now() + interval '20 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
   '00000000-0000-4000-8000-0000000ffa01', 'image/jpeg', 800, 1000),
  ('00000000-0000-4000-8000-0000000ffb02', 'pengirim@poster', '00000000-0000-4000-8000-0000000ff001',
   jsonb_build_object(
     'title', 'Lomba Ditolak Uji 2026', 'organizer', 'Panitia Poster', 'event_type', 'LOMBA',
     'registration_link', 'https://daftar.example/poster-2', 'education_levels', jsonb_build_array('D4_S1'),
     'deadline_at', to_char(now() + interval '20 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
   '00000000-0000-4000-8000-0000000ffa02', 'image/png', 1200, 800);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.ugc_submissions (submitted_by_email, payload, poster_id, poster_type, poster_width, poster_height)
    VALUES ('lain@poster', '{"title":"Pinjam id"}', '00000000-0000-4000-8000-0000000ffa01', 'image/jpeg', 800, 1000);
    RAISE EXCEPTION 'id poster tidak boleh dipakai dua kiriman';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END$$;

-- 3. Siapa yang melihat poster yang belum tayang.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.submission_poster_file('00000000-0000-4000-8000-0000000ffb01');
    RAISE EXCEPTION 'anon tidak boleh memanggil submission_poster_file';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000ff001';
DO $$
DECLARE v_path TEXT; v_type TEXT;
BEGIN
  SELECT path, content_type INTO v_path, v_type FROM public.submission_poster_file('00000000-0000-4000-8000-0000000ffb01');
  IF v_path IS DISTINCT FROM '00000000-0000-4000-8000-0000000ffb01/00000000-0000-4000-8000-0000000ffa01.jpg' OR v_type <> 'image/jpeg' THEN
    RAISE EXCEPTION 'pengirim harus mendapat path posternya, dapat % / %', v_path, v_type;
  END IF;
  -- Pengirim tetap tidak bisa melepas/menyetujui sendiri.
  BEGIN
    PERFORM public.take_submission_poster('00000000-0000-4000-8000-0000000ffb01');
    RAISE EXCEPTION 'authenticated tidak boleh memanggil take_submission_poster';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.approve_submission('00000000-0000-4000-8000-0000000ffb01', '00000000-0000-4000-8000-0000000ff001');
    RAISE EXCEPTION 'authenticated tidak boleh memanggil approve_submission';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000ff002';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.submission_poster_file('00000000-0000-4000-8000-0000000ffb01')) THEN
    RAISE EXCEPTION 'orang lain tidak boleh membuka poster kiriman yang belum tayang';
  END IF;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000ff003';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.submission_poster_file('00000000-0000-4000-8000-0000000ffb01')) THEN
    RAISE EXCEPTION 'admin tanpa MFA (aal1) tidak boleh membuka poster kiriman';
  END IF;
END$$;
SET LOCAL request.jwt.claims = '{"aal":"aal2"}';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.submission_poster_file('00000000-0000-4000-8000-0000000ffb01')) THEN
    RAISE EXCEPTION 'moderator ber-MFA harus bisa melihat poster yang akan ditayangkannya';
  END IF;
END$$;
RESET request.jwt.claims;
RESET ROLE;

-- 4. Poster kiriman PENDING tidak bisa dilepas diam-diam.
DO $$
BEGIN
  IF public.take_submission_poster('00000000-0000-4000-8000-0000000ffb01') IS NOT NULL THEN
    RAISE EXCEPTION 'poster kiriman yang masih menunggu tidak boleh dilepas';
  END IF;
  IF (SELECT poster_id FROM public.ugc_submissions WHERE id = '00000000-0000-4000-8000-0000000ffb01') IS NULL THEN
    RAISE EXCEPTION 'poster kiriman PENDING harus tetap ada';
  END IF;
END$$;

-- 5. Disetujui: berkas yang sama menjadi poster acara, kolom kiriman kosong.
DO $$
DECLARE v_event UUID; v_photo RECORD;
BEGIN
  v_event := public.approve_submission('00000000-0000-4000-8000-0000000ffb01', '00000000-0000-4000-8000-0000000ff003');
  SELECT * INTO v_photo FROM public.event_photos WHERE event_id = v_event;
  IF v_photo.id IS DISTINCT FROM '00000000-0000-4000-8000-0000000ffa01'
     OR v_photo.storage_path IS DISTINCT FROM '00000000-0000-4000-8000-0000000ffb01/00000000-0000-4000-8000-0000000ffa01.jpg'
     OR v_photo.content_type <> 'image/jpeg' OR v_photo.width <> 800 OR v_photo.height <> 1000
     OR NOT v_photo.is_poster
     OR v_photo.uploaded_by IS DISTINCT FROM '00000000-0000-4000-8000-0000000ff001' THEN
    RAISE EXCEPTION 'poster lampiran harus menjadi poster acara dengan berkas yang sama: %', row_to_json(v_photo);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ugc_submissions
    WHERE id = '00000000-0000-4000-8000-0000000ffb01'
      AND (status <> 'APPROVED' OR poster_id IS NOT NULL OR poster_type IS NOT NULL OR poster_width IS NOT NULL OR poster_height IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'setelah disetujui kolom poster kiriman harus kosong';
  END IF;
  -- Berkasnya kini milik acara: melepas dari kiriman tidak mengembalikan apa pun.
  IF public.take_submission_poster('00000000-0000-4000-8000-0000000ffb01') IS NOT NULL THEN
    RAISE EXCEPTION 'poster yang sudah pindah ke acara tidak boleh dilepas lagi';
  END IF;
END$$;

-- Tamu membaca poster acara yang tayang; rute kiriman tidak lagi menyajikannya.
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.event_photos WHERE id = '00000000-0000-4000-8000-0000000ffa01' AND is_poster) THEN
    RAISE EXCEPTION 'poster acara yang tayang harus terbaca publik';
  END IF;
END$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000ff001';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.submission_poster_file('00000000-0000-4000-8000-0000000ffb01')) THEN
    RAISE EXCEPTION 'setelah disetujui poster tidak lagi disajikan lewat kiriman';
  END IF;
END$$;
RESET ROLE;

-- 6. Ditolak: path dikembalikan sekali untuk dihapus dari Storage, kolom kosong.
UPDATE public.ugc_submissions
SET status = 'REJECTED', reviewed_by = '00000000-0000-4000-8000-0000000ff003', reviewed_at = now()
WHERE id = '00000000-0000-4000-8000-0000000ffb02';
DO $$
DECLARE v_path TEXT;
BEGIN
  v_path := public.take_submission_poster('00000000-0000-4000-8000-0000000ffb02');
  IF v_path IS DISTINCT FROM '00000000-0000-4000-8000-0000000ffb02/00000000-0000-4000-8000-0000000ffa02.png' THEN
    RAISE EXCEPTION 'penolakan harus mengembalikan path poster, dapat %', v_path;
  END IF;
  IF (SELECT poster_id FROM public.ugc_submissions WHERE id = '00000000-0000-4000-8000-0000000ffb02') IS NOT NULL THEN
    RAISE EXCEPTION 'kolom poster kiriman yang ditolak harus kosong';
  END IF;
  IF public.take_submission_poster('00000000-0000-4000-8000-0000000ffb02') IS NOT NULL
     OR public.take_submission_poster('00000000-0000-4000-8000-0000000ffbff') IS NOT NULL THEN
    RAISE EXCEPTION 'melepas dua kali atau kiriman yang tidak ada mengembalikan NULL';
  END IF;
END$$;

-- 7. Kiriman tanpa poster disetujui seperti biasa (tidak membuat foto).
INSERT INTO public.ugc_submissions (id, submitted_by_email, payload) VALUES
  ('00000000-0000-4000-8000-0000000ffb03', 'tamu@poster',
   jsonb_build_object(
     'title', 'Lomba Tanpa Poster Uji 2026', 'organizer', 'Panitia Lain', 'event_type', 'LOMBA',
     'registration_link', 'https://daftar.example/poster-3', 'education_levels', jsonb_build_array('SMA_SMK'),
     'deadline_at', to_char(now() + interval '20 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
DO $$
DECLARE v_event UUID;
BEGIN
  v_event := public.approve_submission('00000000-0000-4000-8000-0000000ffb03', '00000000-0000-4000-8000-0000000ff003');
  IF EXISTS (SELECT 1 FROM public.event_photos WHERE event_id = v_event) THEN
    RAISE EXCEPTION 'kiriman tanpa poster tidak boleh membuat foto';
  END IF;
END$$;
ROLLBACK;
