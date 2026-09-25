-- Regresi: staging pipeline (P7), dedup edisi tahunan (P3), notifikasi
-- berbasis rentang hari (P4). Lihat migration 20260925100001.
BEGIN;

-- Tenggat n hari kalender WIB dari sekarang, pukul 23:59 WIB.
CREATE FUNCTION pg_temp.deadline_in(n INT) RETURNS TIMESTAMPTZ LANGUAGE sql AS $$
  SELECT (((NOW() AT TIME ZONE 'Asia/Jakarta')::date + n) + TIME '23:59') AT TIME ZONE 'Asia/Jakarta'
$$;

CREATE FUNCTION pg_temp.payload(title TEXT, days INT) RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'title', title, 'organizer', 'Kemdikbud', 'event_type', 'LOMBA',
    'registration_link', 'https://daftar.example', 'source_url', 'https://sumber.example',
    'education_levels', jsonb_build_array('D4_S1'), 'is_online', true,
    'status', 'APPROVED',  -- harus DIABAIKAN: pipeline tidak boleh menerbitkan
    'categories', jsonb_build_array('teknologi', 'slug-tidak-ada'),
    'deadlines', jsonb_build_array(jsonb_build_object(
      'label', 'registration', 'deadline_at', pg_temp.deadline_in(days), 'is_primary', true))
  )
$$;

-- ---- P7: staging atomik ------------------------------------------------
DO $$
DECLARE
  first_id  UUID;
  second_id UUID;
  third_id  UUID;
BEGIN
  first_id := public.stage_scraped_event(pg_temp.payload('Gemastik', 30));
  IF first_id IS NULL THEN RAISE EXCEPTION 'P7: event baru harus mengembalikan id'; END IF;

  IF (SELECT status FROM public.events WHERE id = first_id) <> 'PENDING' THEN
    RAISE EXCEPTION 'P7: pipeline tidak boleh menulis selain PENDING';
  END IF;
  IF (SELECT count(*) FROM public.event_deadlines WHERE event_id = first_id AND is_primary) <> 1 THEN
    RAISE EXCEPTION 'P7: tenggat utama harus ikut tertulis dalam transaksi yang sama';
  END IF;
  IF (SELECT count(*) FROM public.event_categories WHERE event_id = first_id) <> 1 THEN
    RAISE EXCEPTION 'P7: kategori dikenal ditautkan, slug tak dikenal diabaikan';
  END IF;

  -- Judul beda kapitalisasi/spasi = event yang sama.
  second_id := public.stage_scraped_event(pg_temp.payload('  GEMASTIK ', 30));
  IF second_id IS NOT NULL THEN RAISE EXCEPTION 'P3: duplikat aktif harus mengembalikan NULL'; END IF;

  -- ---- P3: edisi tahun depan boleh masuk setelah edisi lama EXPIRED ----
  UPDATE public.events SET status = 'EXPIRED' WHERE id = first_id;
  third_id := public.stage_scraped_event(pg_temp.payload('Gemastik', 30));
  IF third_id IS NULL THEN RAISE EXCEPTION 'P3: edisi baru harus diterima setelah edisi lama EXPIRED'; END IF;

  -- REJECTED tetap memblokir, supaya kiriman yang ditolak tidak masuk tiap malam.
  UPDATE public.events SET status = 'REJECTED', reviewed_at = NOW() WHERE id = third_id;
  IF public.stage_scraped_event(pg_temp.payload('Gemastik', 30)) IS NOT NULL THEN
    RAISE EXCEPTION 'P3: event yang pernah ditolak tidak boleh masuk antrean lagi';
  END IF;
END$$;

-- Tidak ada rollback parsial: tenggat rusak = tidak ada baris events yatim.
DO $$
DECLARE
  before_count INT := (SELECT count(*) FROM public.events);
BEGIN
  BEGIN
    PERFORM public.stage_scraped_event(
      pg_temp.payload('Event Cacat', 5) || jsonb_build_object('deadlines',
        jsonb_build_array(jsonb_build_object('label', 'registration', 'deadline_at', 'bukan-tanggal', 'is_primary', true))));
    RAISE EXCEPTION 'P7: tenggat rusak seharusnya ditolak';
  EXCEPTION WHEN invalid_datetime_format THEN
    NULL;
  END;
  IF (SELECT count(*) FROM public.events) <> before_count THEN
    RAISE EXCEPTION 'P7: kegagalan tenggat meninggalkan event yatim';
  END IF;
END$$;

-- Hanya service_role yang boleh memanggil staging.
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.stage_scraped_event('{}'::jsonb);
  RAISE EXCEPTION 'Keamanan: authenticated tidak boleh memanggil stage_scraped_event';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END$$;
RESET ROLE;

-- ---- P4: notifikasi berbasis rentang -----------------------------------
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000000b1', 'pembaca@example.com');

DO $$
DECLARE
  uid       UUID := '00000000-0000-4000-8000-0000000000b1';
  e_h2      UUID;
  e_h0      UUID;
  e_h5      UUID;
  created   INT;
BEGIN
  e_h2 := public.stage_scraped_event(pg_temp.payload('Lomba H2', 2));
  e_h0 := public.stage_scraped_event(pg_temp.payload('Lomba H0', 0));
  e_h5 := public.stage_scraped_event(pg_temp.payload('Lomba H5', 5));
  UPDATE public.events SET status = 'APPROVED', reviewed_at = NOW() WHERE id IN (e_h2, e_h0, e_h5);
  INSERT INTO public.saved_events (user_id, event_id) VALUES (uid, e_h2), (uid, e_h0), (uid, e_h5);

  created := public.create_deadline_notifications();
  IF created <> 2 THEN
    RAISE EXCEPTION 'P4: harus membuat 2 notifikasi susulan (H-2 dan H-0), dapat %', created;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.notifications
                 WHERE event_id = e_h2 AND type = 'DEADLINE_H3' AND message LIKE '%2 hari lagi%') THEN
    RAISE EXCEPTION 'P4: H-2 harus menjadi DEADLINE_H3 dengan sisa hari yang benar';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                 WHERE event_id = e_h0 AND type = 'DEADLINE_H1' AND message LIKE '%hari ini%') THEN
    RAISE EXCEPTION 'P4: H-0 harus menjadi susulan DEADLINE_H1 "hari ini"';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE event_id = e_h5) THEN
    RAISE EXCEPTION 'P4: H-5 belum waktunya dinotifikasi';
  END IF;

  IF public.create_deadline_notifications() <> 0 THEN
    RAISE EXCEPTION 'P4: menjalankan ulang harus idempoten';
  END IF;
END$$;

ROLLBACK;
