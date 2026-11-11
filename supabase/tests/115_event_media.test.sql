-- Media kegiatan (ADR-079): poster = satu foto galeri per acara, video =
-- tautan YouTube/Vimeo kanonis; keduanya hanya diubah lewat RPC oleh
-- pengelola terverifikasi atau admin ber-MFA. Tamu bisa membaca keduanya
-- untuk acara tayang, tapi tidak bisa memanggil RPC-nya.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000fd001', 'panitia@media', '{"full_name":"Panitia Media"}'),
  ('00000000-0000-4000-8000-0000000fd002', 'asing@media', '{"full_name":"Orang Asing"}'),
  ('00000000-0000-4000-8000-0000000fd003', 'admin@media', '{"full_name":"Admin Media"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000fd003';

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-0000000fde01', 'Lomba Poster Uji', 'Himpunan Media', 'LOMBA',
   'https://daftar.example/m1', 'https://sumber.example/m1', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000fde02', 'Lomba Lain Uji', 'Himpunan Lain', 'LOMBA',
   'https://daftar.example/m2', 'https://sumber.example/m2', 'APPROVED', now());

INSERT INTO public.organizer_profiles (user_id, org_name, evidence)
VALUES ('00000000-0000-4000-8000-0000000fd001', 'Himpunan Media', 'Ketua himpunan, https://himpunan.example');
SELECT public.review_organizer('00000000-0000-4000-8000-0000000fd001', 'VERIFIED', NULL, NULL);
INSERT INTO public.event_managers (event_id, user_id, source)
VALUES ('00000000-0000-4000-8000-0000000fde01', '00000000-0000-4000-8000-0000000fd001', 'ADMIN');

INSERT INTO public.event_photos (id, event_id, storage_path, content_type, width, height) VALUES
  ('00000000-0000-4000-8000-0000000fdf01', '00000000-0000-4000-8000-0000000fde01',
   '00000000-0000-4000-8000-0000000fde01/00000000-0000-4000-8000-0000000fdf01.jpg', 'image/jpeg', 800, 1000),
  ('00000000-0000-4000-8000-0000000fdf02', '00000000-0000-4000-8000-0000000fde01',
   '00000000-0000-4000-8000-0000000fde01/00000000-0000-4000-8000-0000000fdf02.jpg', 'image/jpeg', 1200, 800),
  ('00000000-0000-4000-8000-0000000fdf03', '00000000-0000-4000-8000-0000000fde02',
   '00000000-0000-4000-8000-0000000fde02/00000000-0000-4000-8000-0000000fdf03.jpg', 'image/jpeg', 800, 800);

-- 1. Orang asing tidak bisa menandai poster, dan foto yang ada terdengar sama dengan yang tidak ada.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fd002';
DO $$
BEGIN
  BEGIN
    PERFORM public.set_event_poster('00000000-0000-4000-8000-0000000fdf01', true);
    RAISE EXCEPTION 'orang asing tidak boleh memilih poster';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'photo_not_found' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.event_photos SET is_poster = true WHERE id = '00000000-0000-4000-8000-0000000fdf01';
    RAISE EXCEPTION 'klien tidak boleh mengubah is_poster langsung';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.set_event_video('00000000-0000-4000-8000-0000000fde01', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    RAISE EXCEPTION 'orang asing tidak boleh memasang video';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'not_event_manager' THEN RAISE; END IF;
  END;
END$$;

-- 2. Pengelola: satu poster per acara; memilih yang lain melepas yang lama.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fd001';
SELECT public.set_event_poster('00000000-0000-4000-8000-0000000fdf01', true);
SELECT public.set_event_poster('00000000-0000-4000-8000-0000000fdf02', true);
DO $$
BEGIN
  IF (SELECT array_agg(id ORDER BY id) FROM public.event_photos WHERE is_poster AND event_id = '00000000-0000-4000-8000-0000000fde01')
     IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-0000000fdf02'::uuid] THEN
    RAISE EXCEPTION 'harus tepat satu poster: foto kedua';
  END IF;
  BEGIN
    PERFORM public.set_event_poster('00000000-0000-4000-8000-0000000fdf03', true);
    RAISE EXCEPTION 'pengelola acara lain tidak boleh menyentuh foto acara ini';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'photo_not_found' THEN RAISE; END IF;
  END;

  -- Video: kanonis diterima, string kosong = hapus, bentuk lain ditolak CHECK.
  PERFORM public.set_event_video('00000000-0000-4000-8000-0000000fde01', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  IF (SELECT video_url FROM public.events WHERE id = '00000000-0000-4000-8000-0000000fde01') <> 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' THEN
    RAISE EXCEPTION 'video kanonis harus tersimpan';
  END IF;
  PERFORM public.set_event_video('00000000-0000-4000-8000-0000000fde01', 'https://vimeo.com/76979871');
  BEGIN
    PERFORM public.set_event_video('00000000-0000-4000-8000-0000000fde01', 'https://youtu.be/dQw4w9WgXcQ');
    RAISE EXCEPTION 'bentuk non-kanonis harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.set_event_video('00000000-0000-4000-8000-0000000fde01', 'https://evil.example/watch?v=dQw4w9WgXcQ');
    RAISE EXCEPTION 'domain lain harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.events SET video_url = NULL WHERE id = '00000000-0000-4000-8000-0000000fde01';
    IF FOUND THEN RAISE EXCEPTION 'klien tidak boleh mengubah events langsung'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT video_url FROM public.events WHERE id = '00000000-0000-4000-8000-0000000fde01') <> 'https://vimeo.com/76979871' THEN
    RAISE EXCEPTION 'update langsung oleh pengelola tidak boleh mengubah video';
  END IF;
END$$;

-- 3. Melepas poster.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fd001';
SELECT public.set_event_poster('00000000-0000-4000-8000-0000000fdf02', false);
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_photos WHERE is_poster AND event_id = '00000000-0000-4000-8000-0000000fde01') THEN
    RAISE EXCEPTION 'poster harus bisa dilepas';
  END IF;
END$$;

-- 4. Admin ber-MFA boleh di acara mana pun; tanpa MFA tidak.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fd003';
DO $$
BEGIN
  BEGIN
    PERFORM public.set_event_poster('00000000-0000-4000-8000-0000000fdf03', true);
    RAISE EXCEPTION 'admin tanpa aal2 tidak boleh';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'photo_not_found' THEN RAISE; END IF;
  END;
END$$;
SET LOCAL request.jwt.claims = '{"aal":"aal2"}';
SELECT public.set_event_poster('00000000-0000-4000-8000-0000000fdf03', true);
SELECT public.set_event_video('00000000-0000-4000-8000-0000000fde02', NULL);
RESET ROLE;

-- 5. Tamu membaca poster & video acara tayang, tapi tidak bisa memanggil RPC.
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.event_photos WHERE id = '00000000-0000-4000-8000-0000000fdf03' AND is_poster) THEN
    RAISE EXCEPTION 'tamu harus bisa membaca tanda poster';
  END IF;
  IF (SELECT video_url FROM public.events WHERE id = '00000000-0000-4000-8000-0000000fde01') IS DISTINCT FROM 'https://vimeo.com/76979871' THEN
    RAISE EXCEPTION 'tamu harus bisa membaca video acara tayang';
  END IF;
  BEGIN
    PERFORM public.set_event_poster('00000000-0000-4000-8000-0000000fdf01', true);
    RAISE EXCEPTION 'anon tidak boleh memanggil set_event_poster';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.set_event_video('00000000-0000-4000-8000-0000000fde01', NULL);
    RAISE EXCEPTION 'anon tidak boleh memanggil set_event_video';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- 6. Persetujuan kiriman menyalin video kanonis; bentuk lain (payload bisa
--    ditulis lewat PostgREST oleh siapa pun) dibuang tanpa menggagalkan persetujuan.
INSERT INTO public.ugc_submissions (id, submitted_by_email, payload) VALUES
  ('00000000-0000-4000-8000-0000000fdc01', 'video@media',
   '{"title":"Lomba Video Uji","organizer":"Org Video","event_type":"LOMBA","registration_link":"https://v.example",
     "deadline_at":"2099-01-10T16:59:00Z","video_url":"https://www.youtube.com/watch?v=aqz-KE-bpKQ"}'),
  ('00000000-0000-4000-8000-0000000fdc02', 'licik@media',
   '{"title":"Lomba Video Licik","organizer":"Org Licik","event_type":"LOMBA","registration_link":"https://w.example",
     "deadline_at":"2099-01-10T16:59:00Z","video_url":"https://evil.example/watch?v=aqz-KE-bpKQ"}');
DO $$
DECLARE good UUID; bad UUID;
BEGIN
  good := public.approve_submission('00000000-0000-4000-8000-0000000fdc01', '00000000-0000-4000-8000-0000000fd003');
  bad := public.approve_submission('00000000-0000-4000-8000-0000000fdc02', '00000000-0000-4000-8000-0000000fd003');
  IF (SELECT video_url FROM public.events WHERE id = good) IS DISTINCT FROM 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' THEN
    RAISE EXCEPTION 'video kanonis dari kiriman harus tersalin';
  END IF;
  IF (SELECT video_url FROM public.events WHERE id = bad) IS NOT NULL THEN
    RAISE EXCEPTION 'video non-kanonis dari kiriman harus dibuang';
  END IF;
END$$;
ROLLBACK;
