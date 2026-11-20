-- Slide & gambar deskriptif (ADR-094): urutan pilihan pengelola, keterangan
-- per gambar, dan gambar pendukung kiriman yang ikut tayang dalam urutan
-- pengirim. Cermin: src/lib/data/event-slides.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000fa101', 'panitia@slide', '{"full_name":"Panitia Slide"}'),
  ('00000000-0000-4000-8000-0000000fa102', 'asing@slide', '{"full_name":"Orang Asing"}'),
  ('00000000-0000-4000-8000-0000000fa103', 'admin@slide', '{"full_name":"Admin Slide"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000fa103';

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-0000000fa1e1', 'Lomba Slide Uji', 'Himpunan Slide', 'LOMBA',
   'https://daftar.example/s1', 'https://sumber.example/s1', 'APPROVED', now());
INSERT INTO public.organizer_profiles (user_id, org_name, evidence)
VALUES ('00000000-0000-4000-8000-0000000fa101', 'Himpunan Slide', 'Ketua himpunan, https://himpunan.example');
SELECT public.review_organizer('00000000-0000-4000-8000-0000000fa101', 'VERIFIED', NULL, NULL);
INSERT INTO public.event_managers (event_id, user_id, source)
VALUES ('00000000-0000-4000-8000-0000000fa1e1', '00000000-0000-4000-8000-0000000fa101', 'ADMIN');

-- 1. Unggahan satu INSERT masuk di belakang, berurutan sesuai pilihan.
INSERT INTO public.event_photos (id, event_id, storage_path, content_type, width, height) VALUES
  ('00000000-0000-4000-8000-0000000fa1f1', '00000000-0000-4000-8000-0000000fa1e1',
   '00000000-0000-4000-8000-0000000fa1e1/00000000-0000-4000-8000-0000000fa1f1.jpg', 'image/jpeg', 800, 1000),
  ('00000000-0000-4000-8000-0000000fa1f2', '00000000-0000-4000-8000-0000000fa1e1',
   '00000000-0000-4000-8000-0000000fa1e1/00000000-0000-4000-8000-0000000fa1f2.jpg', 'image/jpeg', 1200, 800),
  ('00000000-0000-4000-8000-0000000fa1f3', '00000000-0000-4000-8000-0000000fa1e1',
   '00000000-0000-4000-8000-0000000fa1e1/00000000-0000-4000-8000-0000000fa1f3.jpg', 'image/jpeg', 1200, 800);
DO $$
BEGIN
  IF (SELECT array_agg(sort_order ORDER BY id) FROM public.event_photos WHERE event_id = '00000000-0000-4000-8000-0000000fa1e1')
     IS DISTINCT FROM ARRAY[0, 1, 2]::SMALLINT[] THEN
    RAISE EXCEPTION 'unggahan satu kiriman harus bernomor 0,1,2 sesuai urutan';
  END IF;
END$$;

-- 2. Orang asing tidak bisa menyusun ulang, mengubah keterangan, atau menulis urutan langsung.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fa102';
DO $$
BEGIN
  BEGIN
    PERFORM public.reorder_event_photos('00000000-0000-4000-8000-0000000fa1e1',
      ARRAY['00000000-0000-4000-8000-0000000fa1f3']::UUID[]);
    RAISE EXCEPTION 'orang asing tidak boleh menyusun slide';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'not_event_manager' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_event_photo_caption('00000000-0000-4000-8000-0000000fa1f1', 'Susupan');
    RAISE EXCEPTION 'orang asing tidak boleh mengubah keterangan';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'photo_not_found' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.event_photos SET sort_order = 9 WHERE id = '00000000-0000-4000-8000-0000000fa1f1';
    RAISE EXCEPTION 'klien tidak boleh menulis sort_order langsung';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

-- 3. Pengelola: urutan baru, id asing & ganda diabaikan, yang tidak disebut tetap di belakang.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fa101';
SELECT public.reorder_event_photos('00000000-0000-4000-8000-0000000fa1e1', ARRAY[
  '00000000-0000-4000-8000-0000000fa1f3',
  '00000000-0000-4000-8000-00000000dead',
  '00000000-0000-4000-8000-0000000fa1f3',
  '00000000-0000-4000-8000-0000000fa1f1'
]::UUID[]);
DO $$
BEGIN
  IF (SELECT array_agg(id ORDER BY sort_order) FROM public.event_photos WHERE event_id = '00000000-0000-4000-8000-0000000fa1e1')
     IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-0000000fa1f3', '00000000-0000-4000-8000-0000000fa1f1', '00000000-0000-4000-8000-0000000fa1f2']::UUID[] THEN
    RAISE EXCEPTION 'urutan harus f3, f1, lalu f2 yang tidak disebut';
  END IF;
END$$;

-- 4. Keterangan: dirapikan, kosong = NULL, > 140 karakter ditolak.
SELECT public.set_event_photo_caption('00000000-0000-4000-8000-0000000fa1f3', E'  Alur\tlomba  ');
SELECT public.set_event_photo_caption('00000000-0000-4000-8000-0000000fa1f1', '   ');
DO $$
BEGIN
  IF (SELECT caption FROM public.event_photos WHERE id = '00000000-0000-4000-8000-0000000fa1f3') IS DISTINCT FROM 'Alur lomba' THEN
    RAISE EXCEPTION 'keterangan harus dirapikan';
  END IF;
  IF (SELECT caption FROM public.event_photos WHERE id = '00000000-0000-4000-8000-0000000fa1f1') IS NOT NULL THEN
    RAISE EXCEPTION 'keterangan kosong harus NULL';
  END IF;
  BEGIN
    PERFORM public.set_event_photo_caption('00000000-0000-4000-8000-0000000fa1f1', repeat('x', 141));
    RAISE EXCEPTION 'keterangan > 140 harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_caption' THEN RAISE; END IF;
  END;
END$$;
RESET ROLE;

-- 5. Gambar pendukung kiriman: tertutup untuk klien, maksimal lima.
INSERT INTO public.ugc_submissions (id, submitted_by_email, submitted_by, payload, poster_id, poster_type, poster_width, poster_height) VALUES
  ('00000000-0000-4000-8000-0000000fa1b1', 'panitia@slide', '00000000-0000-4000-8000-0000000fa101',
   jsonb_build_object(
     'title', 'Lomba Bergambar Uji 2026', 'organizer', 'Himpunan Slide', 'event_type', 'LOMBA',
     'registration_link', 'https://daftar.example/slide-1', 'education_levels', jsonb_build_array('D4_S1'),
     'deadline_at', to_char(now() + interval '20 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
   '00000000-0000-4000-8000-0000000fa1a0', 'image/jpeg', 800, 1000),
  ('00000000-0000-4000-8000-0000000fa1b2', 'panitia@slide', '00000000-0000-4000-8000-0000000fa101',
   jsonb_build_object(
     'title', 'Lomba Ditolak Bergambar 2026', 'organizer', 'Himpunan Slide', 'event_type', 'LOMBA',
     'registration_link', 'https://daftar.example/slide-2', 'education_levels', jsonb_build_array('D4_S1'),
     'deadline_at', to_char(now() + interval '20 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
   NULL, NULL, NULL, NULL);
INSERT INTO public.ugc_submission_photos (id, submission_id, content_type, width, height, caption, sort_order) VALUES
  ('00000000-0000-4000-8000-0000000fa1a2', '00000000-0000-4000-8000-0000000fa1b1', 'image/png', 1200, 800, 'Hadiah', 1),
  ('00000000-0000-4000-8000-0000000fa1a1', '00000000-0000-4000-8000-0000000fa1b1', 'image/webp', 1200, 800, 'Alur', 0),
  ('00000000-0000-4000-8000-0000000fa1a3', '00000000-0000-4000-8000-0000000fa1b2', 'image/jpeg', 900, 900, NULL, 0);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.ugc_submission_photos (id, submission_id, content_type, width, height, sort_order)
    VALUES (gen_random_uuid(), '00000000-0000-4000-8000-0000000fa1b1', 'image/jpeg', 10, 10, 5);
    RAISE EXCEPTION 'gambar keenam harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.ugc_submission_photos (id, submission_id, content_type, width, height, sort_order)
    VALUES (gen_random_uuid(), '00000000-0000-4000-8000-0000000fa1b1', 'image/jpeg', 10, 10, 0);
    RAISE EXCEPTION 'urutan ganda dalam satu kiriman harus ditolak';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END$$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fa101';
DO $$
DECLARE v_path TEXT;
BEGIN
  BEGIN
    PERFORM 1 FROM public.ugc_submission_photos;
    RAISE EXCEPTION 'klien tidak boleh membaca tabel gambar kiriman';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.ugc_submission_photos (id, submission_id, content_type, width, height, sort_order)
    VALUES (gen_random_uuid(), '00000000-0000-4000-8000-0000000fa1b1', 'image/jpeg', 10, 10, 3);
    RAISE EXCEPTION 'klien tidak boleh menulis tabel gambar kiriman';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT path INTO v_path FROM public.submission_photo_file('00000000-0000-4000-8000-0000000fa1b1', '00000000-0000-4000-8000-0000000fa1a1');
  IF v_path IS DISTINCT FROM '00000000-0000-4000-8000-0000000fa1b1/00000000-0000-4000-8000-0000000fa1a1.webp' THEN
    RAISE EXCEPTION 'pengirim harus mendapat path gambarnya, dapat %', v_path;
  END IF;
  -- Id gambar dari kiriman lain di bawah id kiriman ini = tidak ada.
  IF EXISTS (SELECT 1 FROM public.submission_photo_file('00000000-0000-4000-8000-0000000fa1b1', '00000000-0000-4000-8000-0000000fa1a3')) THEN
    RAISE EXCEPTION 'gambar kiriman lain tidak boleh terbuka lewat id kiriman ini';
  END IF;
  BEGIN
    PERFORM public.take_submission_photos('00000000-0000-4000-8000-0000000fa1b2');
    RAISE EXCEPTION 'authenticated tidak boleh memanggil take_submission_photos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fa102';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.submission_photo_file('00000000-0000-4000-8000-0000000fa1b1', '00000000-0000-4000-8000-0000000fa1a1')) THEN
    RAISE EXCEPTION 'orang lain tidak boleh membuka gambar kiriman';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fa103';
SET LOCAL request.jwt.claims = '{"aal":"aal2"}';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.submission_photo_file('00000000-0000-4000-8000-0000000fa1b1', '00000000-0000-4000-8000-0000000fa1a2')) THEN
    RAISE EXCEPTION 'moderator ber-MFA harus bisa menilai gambar kiriman';
  END IF;
END$$;
RESET request.jwt.claims;
RESET ROLE;

-- 6. PENDING tidak bisa dilepas; disetujui = poster lalu slide dalam urutan pengirim.
DO $$
DECLARE v_event UUID; v_ids UUID[]; v_captions TEXT[];
BEGIN
  IF EXISTS (SELECT 1 FROM public.take_submission_photos('00000000-0000-4000-8000-0000000fa1b1')) THEN
    RAISE EXCEPTION 'gambar kiriman yang menunggu tidak boleh dilepas';
  END IF;

  v_event := public.approve_submission('00000000-0000-4000-8000-0000000fa1b1', '00000000-0000-4000-8000-0000000fa103');
  SELECT array_agg(id ORDER BY is_poster DESC, sort_order), array_agg(caption ORDER BY is_poster DESC, sort_order)
  INTO v_ids, v_captions
  FROM public.event_photos WHERE event_id = v_event;
  IF v_ids IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-0000000fa1a0', '00000000-0000-4000-8000-0000000fa1a1', '00000000-0000-4000-8000-0000000fa1a2']::UUID[] THEN
    RAISE EXCEPTION 'slide harus poster, Alur, Hadiah — dapat %', v_ids;
  END IF;
  IF v_captions IS DISTINCT FROM ARRAY[NULL, 'Alur', 'Hadiah']::TEXT[] THEN
    RAISE EXCEPTION 'keterangan kiriman harus ikut, dapat %', v_captions;
  END IF;
  IF (SELECT storage_path FROM public.event_photos WHERE id = '00000000-0000-4000-8000-0000000fa1a2')
     IS DISTINCT FROM '00000000-0000-4000-8000-0000000fa1b1/00000000-0000-4000-8000-0000000fa1a2.png' THEN
    RAISE EXCEPTION 'slide harus menunjuk berkas kiriman yang sama';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_photos WHERE event_id = v_event AND uploaded_by IS DISTINCT FROM '00000000-0000-4000-8000-0000000fa101') THEN
    RAISE EXCEPTION 'pengunggah asli harus tercatat di setiap slide';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ugc_submission_photos WHERE submission_id = '00000000-0000-4000-8000-0000000fa1b1') THEN
    RAISE EXCEPTION 'baris kiriman harus kosong setelah disetujui';
  END IF;
END$$;

-- 7. Ditolak: gambar dilepas sekali, path dikembalikan untuk dihapus dari Storage.
UPDATE public.ugc_submissions SET status = 'REJECTED', reviewed_at = now() WHERE id = '00000000-0000-4000-8000-0000000fa1b2';
DO $$
DECLARE v_paths TEXT[];
BEGIN
  SELECT array_agg(p) INTO v_paths FROM public.take_submission_photos('00000000-0000-4000-8000-0000000fa1b2') AS p;
  IF v_paths IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-0000000fa1b2/00000000-0000-4000-8000-0000000fa1a3.jpg'] THEN
    RAISE EXCEPTION 'path gambar kiriman ditolak harus dikembalikan, dapat %', v_paths;
  END IF;
  IF EXISTS (SELECT 1 FROM public.take_submission_photos('00000000-0000-4000-8000-0000000fa1b2')) THEN
    RAISE EXCEPTION 'melepas kedua kali harus kosong';
  END IF;
END$$;

ROLLBACK;
