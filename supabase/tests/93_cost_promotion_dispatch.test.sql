-- Migration 20261003100001..03: atribut biaya/promosi/lencana/panduan,
-- RPC list_personalized_events, dan antrean dispatch notifikasi.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000d0a1', 'pemantau@example.com');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at, education_levels, created_at, is_free, price_amount) VALUES
  ('00000000-0000-0000-0000-00000000d0e1', 'Lomba Robot Tenggat Dekat', 'Kampus A', 'LOMBA', 'https://a.example', 'https://a.example', 'APPROVED', now(), '{D4_S1}', now() - interval '1 day', TRUE, NULL),
  ('00000000-0000-0000-0000-00000000d0e2', 'Beasiswa Riset Berbayar', 'Kampus B', 'BEASISWA', 'https://b.example', 'https://b.example', 'APPROVED', now(), '{S2}', now() - interval '2 days', FALSE, 150000),
  ('00000000-0000-0000-0000-00000000d0e3', 'Workshop Promosi', 'Mitra C', 'WORKSHOP', 'https://c.example', 'https://c.example', 'APPROVED', now(), '{UMUM}', now() - interval '20 days', NULL, NULL),
  ('00000000-0000-0000-0000-00000000d0e4', 'Lomba Sudah Tutup', 'Kampus D', 'LOMBA', 'https://d.example', 'https://d.example', 'APPROVED', now(), '{D4_S1}', now() - interval '3 days', NULL, NULL),
  ('00000000-0000-0000-0000-00000000d0e5', 'Lomba Menunggu', 'Kampus E', 'LOMBA', 'https://e.example', 'https://e.example', 'PENDING', NULL, '{D4_S1}', now(), NULL, NULL);

INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-0000-0000-00000000d0e1', 'registration', now() + interval '2 days', TRUE),
  ('00000000-0000-0000-0000-00000000d0e2', 'registration', now() + interval '40 days', TRUE),
  ('00000000-0000-0000-0000-00000000d0e3', 'registration', now() + interval '10 days', TRUE),
  ('00000000-0000-0000-0000-00000000d0e4', 'registration', now() - interval '1 day', TRUE),
  ('00000000-0000-0000-0000-00000000d0e5', 'registration', now() + interval '5 days', TRUE);

INSERT INTO public.event_categories (event_id, category_id)
SELECT '00000000-0000-0000-0000-00000000d0e1', id FROM public.categories WHERE slug = 'teknologi';

-- ---------------------------------------------------------------------
-- 1. CHECK constraint: data yang saling membantah ditolak.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  UPDATE public.events SET price_amount = 50000 WHERE id = '00000000-0000-0000-0000-00000000d0e1';
  RAISE EXCEPTION 'gratis + nominal seharusnya ditolak';
EXCEPTION WHEN check_violation THEN NULL;
END$$;

DO $$
BEGIN
  UPDATE public.events SET price_amount = 50000, is_free = NULL WHERE id = '00000000-0000-0000-0000-00000000d0e3';
  RAISE EXCEPTION 'nominal tanpa status biaya seharusnya ditolak';
EXCEPTION WHEN check_violation THEN NULL;
END$$;

DO $$
BEGIN
  UPDATE public.events SET is_featured = TRUE, featured_until = NULL WHERE id = '00000000-0000-0000-0000-00000000d0e3';
  RAISE EXCEPTION 'promosi tanpa tanggal akhir seharusnya ditolak';
EXCEPTION WHEN check_violation THEN NULL;
END$$;

DO $$
BEGIN
  UPDATE public.events SET verification_badge = 'PALSU' WHERE id = '00000000-0000-0000-0000-00000000d0e3';
  RAISE EXCEPTION 'lencana tak dikenal seharusnya ditolak';
EXCEPTION WHEN check_violation THEN NULL;
END$$;

DO $$
BEGIN
  UPDATE public.events SET guidebook_url = 'http://tidak-aman.example/panduan.pdf' WHERE id = '00000000-0000-0000-0000-00000000d0e3';
  RAISE EXCEPTION 'buku panduan http seharusnya ditolak';
EXCEPTION WHEN check_violation THEN NULL;
END$$;

-- ---------------------------------------------------------------------
-- 2. is_promoted: aktif hanya bila promosi berjalan DAN kegiatan masih buka.
-- ---------------------------------------------------------------------
UPDATE public.events SET is_featured = TRUE, featured_until = now() + interval '7 days', verification_badge = 'CAMPUS_VERIFIED'
WHERE id IN ('00000000-0000-0000-0000-00000000d0e3', '00000000-0000-0000-0000-00000000d0e4');

DO $$
BEGIN
  IF NOT (SELECT is_promoted FROM public.events_listing WHERE id = '00000000-0000-0000-0000-00000000d0e3') THEN
    RAISE EXCEPTION 'promosi berjalan pada kegiatan terbuka harus aktif';
  END IF;
  IF (SELECT is_promoted FROM public.events_listing WHERE id = '00000000-0000-0000-0000-00000000d0e4') THEN
    RAISE EXCEPTION 'promosi tidak boleh mengangkat kegiatan yang sudah tutup';
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 3. list_personalized_events: tamu boleh, RLS tetap penjaga, promosi opt-in.
-- ---------------------------------------------------------------------
SET LOCAL ROLE anon;

DO $$
DECLARE
  ids UUID[];
  total BIGINT;
BEGIN
  SELECT array_agg(r.id ORDER BY r.ord), max(r.total_count)
  INTO ids, total
  FROM (
    SELECT x.id, x.total_count, row_number() OVER () AS ord
    FROM public.list_personalized_events(ARRAY['teknologi'], 'D4_S1', 10, 0) x
  ) r;

  IF '00000000-0000-0000-0000-00000000d0e5' = ANY (ids) THEN
    RAISE EXCEPTION 'event PENDING bocor lewat RPC';
  END IF;
  IF '00000000-0000-0000-0000-00000000d0e4' = ANY (ids) THEN
    RAISE EXCEPTION 'event yang sudah tutup harus disembunyikan tanpa p_include_closed';
  END IF;
  IF ids[1] <> '00000000-0000-0000-0000-00000000d0e1' THEN
    RAISE EXCEPTION 'minat teknologi + jenjang D4/S1 seharusnya memimpin, dapat %', ids;
  END IF;
  IF total <> 3 THEN
    RAISE EXCEPTION 'total_count harus menghitung SEMUA hasil filter, dapat %', total;
  END IF;
END$$;

-- Promosi hanya mengangkat bila diminta (p_promoted), dan selalu ke puncak.
DO $$
DECLARE
  first_id UUID;
BEGIN
  SELECT x.id INTO first_id FROM public.list_personalized_events(ARRAY['teknologi'], 'D4_S1', 1, 0, p_promoted => TRUE) x;
  IF first_id <> '00000000-0000-0000-0000-00000000d0e3' THEN
    RAISE EXCEPTION 'kegiatan berpromosi harus di puncak saat p_promoted, dapat %', first_id;
  END IF;
END$$;

-- Filter biaya: gratis/berbayar; NULL (belum diketahui) tidak masuk keduanya.
DO $$
BEGIN
  IF (SELECT array_agg(x.id) FROM public.list_personalized_events(NULL, NULL, 10, 0, p_cost => 'free') x)
     <> ARRAY['00000000-0000-0000-0000-00000000d0e1']::UUID[] THEN
    RAISE EXCEPTION 'filter gratis salah';
  END IF;
  IF (SELECT array_agg(x.id) FROM public.list_personalized_events(NULL, NULL, 10, 0, p_cost => 'paid') x)
     <> ARRAY['00000000-0000-0000-0000-00000000d0e2']::UUID[] THEN
    RAISE EXCEPTION 'filter berbayar salah';
  END IF;
END$$;

-- p_limit raksasa dijepit ke MAX_PAGE_SIZE (48).
DO $$
BEGIN
  IF (SELECT count(*) FROM public.list_personalized_events(NULL, NULL, 1000000, 0, p_include_closed => TRUE)) > 48 THEN
    RAISE EXCEPTION 'p_limit tidak dijepit';
  END IF;
END$$;

-- Array raksasa dari pemanggil langsung (anon key) dijepit, bukan dipindai
-- 200.000 × jumlah baris; hasilnya tetap sama dengan array kecil.
DO $$
BEGIN
  IF (SELECT array_agg(x.id) FROM public.list_personalized_events(
        array_fill('teknologi'::TEXT, ARRAY[200000]), 'D4_S1', 10, 0,
        p_types => array_fill('LOMBA'::event_type, ARRAY[200000])) x)
     IS DISTINCT FROM
     (SELECT array_agg(x.id) FROM public.list_personalized_events(ARRAY['teknologi'], 'D4_S1', 10, 0, p_types => ARRAY['LOMBA']::event_type[]) x) THEN
    RAISE EXCEPTION 'array yang dijepit harus memberi hasil yang sama';
  END IF;
END$$;

-- Antrean dispatch memuat email: anon tidak boleh menyentuhnya.
DO $$
BEGIN
  PERFORM public.claim_notification_dispatch(10, 900);
  RAISE EXCEPTION 'anon seharusnya tidak bisa mengklaim antrean dispatch';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- 4. Dispatch: klaim → sewa → ack; pengingat basi dilewati.
-- ---------------------------------------------------------------------
INSERT INTO public.notifications (id, user_id, event_id, type, message) VALUES
  ('00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000d0e1', 'DEADLINE_H3', 'Pendaftaran Lomba Robot ditutup 2 hari lagi.'),
  ('00000000-0000-0000-0000-00000000d0b2', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000d0e4', 'DEADLINE_H1', 'Basi — sudah tutup.'),
  ('00000000-0000-0000-0000-00000000d0b3', '00000000-0000-0000-0000-00000000d0a1', NULL, 'SYSTEM', 'Bukan pengingat tenggat.');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-00000000d0a1';
DO $$
BEGIN
  UPDATE public.notifications SET dispatched_at = now() WHERE id = '00000000-0000-0000-0000-00000000d0b1';
  RAISE EXCEPTION 'pemilik notifikasi tidak boleh menulis dispatched_at';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
DO $$
BEGIN
  PERFORM public.ack_notification_dispatch(ARRAY['00000000-0000-0000-0000-00000000d0b1']::UUID[]);
  RAISE EXCEPTION 'authenticated seharusnya tidak bisa ack';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  claimed UUID[];
  again INT;
  acked INT;
  payload RECORD;
BEGIN
  -- Ack sebelum diklaim tidak menandai apa pun.
  IF public.ack_notification_dispatch(ARRAY['00000000-0000-0000-0000-00000000d0b1']::UUID[]) <> 0 THEN
    RAISE EXCEPTION 'ack baris yang belum diklaim harus diabaikan';
  END IF;

  SELECT array_agg(c.notification_id) INTO claimed FROM public.claim_notification_dispatch(10, 900) c;
  IF claimed IS DISTINCT FROM ARRAY['00000000-0000-0000-0000-00000000d0b1']::UUID[] THEN
    RAISE EXCEPTION 'hanya pengingat tenggat yang masih berlaku yang diklaim, dapat %', claimed;
  END IF;

  SELECT * INTO payload FROM public.notifications WHERE id = '00000000-0000-0000-0000-00000000d0b1';
  IF payload.dispatch_claimed_at IS NULL THEN
    RAISE EXCEPTION 'klaim harus mengisi dispatch_claimed_at';
  END IF;

  SELECT count(*) INTO again FROM public.claim_notification_dispatch(10, 900);
  IF again <> 0 THEN
    RAISE EXCEPTION 'baris dalam masa sewa tidak boleh diklaim ulang';
  END IF;

  -- Sewa habis (pekerja mati sebelum ack) → baris kembali ke antrean.
  UPDATE public.notifications SET dispatch_claimed_at = now() - interval '1 hour' WHERE id = '00000000-0000-0000-0000-00000000d0b1';
  SELECT count(*) INTO again FROM public.claim_notification_dispatch(10, 900);
  IF again <> 1 THEN
    RAISE EXCEPTION 'sewa yang habis harus bisa diklaim ulang';
  END IF;

  acked := public.ack_notification_dispatch(ARRAY['00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-0000000fffff']::UUID[]);
  IF acked <> 1 THEN
    RAISE EXCEPTION 'ack harus menandai tepat satu baris, dapat %', acked;
  END IF;

  UPDATE public.notifications SET dispatch_claimed_at = now() - interval '1 hour' WHERE id = '00000000-0000-0000-0000-00000000d0b1';
  SELECT count(*) INTO again FROM public.claim_notification_dispatch(10, 900);
  IF again <> 0 THEN
    RAISE EXCEPTION 'baris yang sudah terkirim tidak boleh diklaim lagi';
  END IF;
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- 5. approve_submission menyalin biaya & buku panduan, bukan kontak/bukti.
-- ---------------------------------------------------------------------
INSERT INTO public.ugc_submissions (id, submitted_by_email, payload) VALUES (
  '00000000-0000-0000-0000-00000000d0c1',
  'panitia@example.com',
  jsonb_build_object(
    'title', 'Seminar Biaya Uji', 'organizer', 'Himpunan Uji', 'description', NULL,
    'event_type', 'KONFERENSI', 'registration_link', 'https://daftar.example/seminar',
    'source_url', NULL, 'education_levels', jsonb_build_array('D4_S1'), 'category_slugs', jsonb_build_array(),
    'location', NULL, 'is_online', TRUE, 'deadline_at', to_jsonb(now() + interval '9 days'),
    'is_free', FALSE, 'price_amount', 75000, 'guidebook_url', 'https://himpunan.example/panduan.pdf',
    'organizer_contact', '0812-0000-0000', 'proof_link', 'https://instagram.example/p/1'
  )
);

DO $$
DECLARE
  new_id UUID;
  row_ RECORD;
BEGIN
  new_id := public.approve_submission('00000000-0000-0000-0000-00000000d0c1', NULL);
  SELECT is_free, price_amount, guidebook_url INTO row_ FROM public.events WHERE id = new_id;
  IF row_.is_free IS DISTINCT FROM FALSE OR row_.price_amount <> 75000 OR row_.guidebook_url <> 'https://himpunan.example/panduan.pdf' THEN
    RAISE EXCEPTION 'biaya/panduan tidak tersalin: %', row_;
  END IF;
END$$;

ROLLBACK;
