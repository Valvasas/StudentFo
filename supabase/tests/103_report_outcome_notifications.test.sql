-- Pelapor dikabari hasil laporannya; "ditindak" menutup semua laporan atas subjek yang sama (ADR-062 #1).
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000f6a01', 'pelapor-a@x'),
  ('00000000-0000-4000-8000-0000000f6a02', 'pelapor-b@x'),
  ('00000000-0000-4000-8000-0000000f6a03', 'terlapor@x'),
  ('00000000-0000-4000-8000-0000000f6a04', 'admin@x'),
  ('00000000-0000-4000-8000-0000000f6a05', 'pelapor-c@x');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000f6a04';

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at, education_levels) VALUES
  ('00000000-0000-4000-8000-0000000f6e01', 'Lomba Hadiah Transfer Dulu', 'Org Curiga', 'LOMBA', 'https://d.example/61', 'https://s.example/61', 'APPROVED', now(), ARRAY['D4_S1']::education_level[]);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f6a01';
SELECT public.report_content('event', '00000000-0000-4000-8000-0000000f6e01', 'scam', 'Minta transfer biaya hadiah');
SELECT public.report_content('user', '00000000-0000-4000-8000-0000000f6a03', 'harassment', 'Pesan kasar berulang');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f6a02';
SELECT public.report_content('event', '00000000-0000-4000-8000-0000000f6e01', 'misleading', NULL);
SELECT public.report_content('user', '00000000-0000-4000-8000-0000000f6a03', 'harassment', NULL);
RESET ROLE;

DO $$
DECLARE
  admin_id CONSTANT UUID := '00000000-0000-4000-8000-0000000f6a04';
  a        CONSTANT UUID := '00000000-0000-4000-8000-0000000f6a01';
  b        CONSTANT UUID := '00000000-0000-4000-8000-0000000f6a02';
  event_a  UUID;
  user_a   UUID;
  msg      TEXT;
BEGIN
  SELECT id INTO event_a FROM public.content_reports WHERE reporter_id = a AND subject_type = 'event';
  SELECT id INTO user_a FROM public.content_reports WHERE reporter_id = a AND subject_type = 'user';

  -- ---------------------------------------------------------------------
  -- 1. Ditindak: semua laporan atas kegiatan itu tertutup, setiap pelapor dikabari
  -- ---------------------------------------------------------------------
  PERFORM public.resolve_content_report(event_a, admin_id, 'RESOLVED', 'Rekening pribadi, diturunkan; panitia dihubungi');
  IF EXISTS (SELECT 1 FROM public.content_reports WHERE subject_type = 'event' AND subject_id = '00000000-0000-4000-8000-0000000f6e01' AND status <> 'RESOLVED') THEN
    RAISE EXCEPTION 'laporan lain atas kegiatan yang sudah ditindak harus ikut tertutup';
  END IF;
  IF (SELECT count(*) FROM public.moderation_log WHERE subject_type = 'report' AND subject_id = event_a) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_id = event_a AND title LIKE '%+ 1 laporan lain%') THEN
    RAISE EXCEPTION 'satu entri riwayat yang menyebut jumlah laporan lain yang ikut ditutup';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE type = 'REPORT_RESOLVED' AND user_id IN (a, b)) <> 2 THEN
    RAISE EXCEPTION 'kedua pelapor kegiatan harus dikabari';
  END IF;
  SELECT message INTO msg FROM public.notifications WHERE type = 'REPORT_RESOLVED' AND user_id = b;
  IF msg NOT LIKE '%"Lomba Hadiah Transfer Dulu"%' THEN RAISE EXCEPTION 'pesan harus menyebut kegiatan yang dilaporkan: %', msg; END IF;
  IF msg LIKE '%Rekening pribadi%' THEN RAISE EXCEPTION 'catatan internal moderator tidak boleh sampai ke pelapor'; END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE type LIKE 'REPORT_%' AND event_id IS NOT NULL) THEN
    RAISE EXCEPTION 'notifikasi hasil laporan tanpa event_id (kegiatan yang diturunkan tidak bisa dibuka pelapor)';
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. Diabaikan: HANYA laporan itu; laporan lain atas akun yang sama tetap antre
  -- ---------------------------------------------------------------------
  PERFORM public.resolve_content_report(user_a, admin_id, 'DISMISSED', 'Percakapan dua arah, bukan pelecehan');
  IF (SELECT status FROM public.content_reports WHERE reporter_id = b AND subject_type = 'user') <> 'OPEN' THEN
    RAISE EXCEPTION 'mengabaikan satu laporan tidak boleh menutup laporan orang lain atas subjek yang sama';
  END IF;
  SELECT message INTO msg FROM public.notifications WHERE type = 'REPORT_DISMISSED' AND user_id = a;
  IF msg IS NULL OR msg NOT LIKE '%akun yang kamu laporkan%' THEN RAISE EXCEPTION 'pelapor akun dikabari tanpa menyebut nama terlapor: %', msg; END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = a) <> 2 THEN
    RAISE EXCEPTION 'keputusan kedua (transaksi yang sama) tidak boleh mengabari ulang pelapor keputusan pertama';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE type = 'REPORT_DISMISSED' AND user_id = b) THEN
    RAISE EXCEPTION 'pelapor yang laporannya belum diputuskan tidak boleh dikabari';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000f6a03') THEN
    RAISE EXCEPTION 'pihak terlapor tidak boleh dikabari soal laporan';
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 3. Pelapor yang sudah menghapus akun: laporan tetap bisa diputuskan
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f6a05';
SELECT public.report_content('user', '00000000-0000-4000-8000-0000000f6a03', 'spam', NULL);
RESET ROLE;
DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000f6a05';
DO $$
DECLARE
  orphan UUID;
  before INT := (SELECT count(*) FROM public.notifications);
BEGIN
  SELECT id INTO orphan FROM public.content_reports WHERE reporter_id IS NULL AND subject_id = '00000000-0000-4000-8000-0000000f6a03';
  PERFORM public.resolve_content_report(orphan, '00000000-0000-4000-8000-0000000f6a04', 'DISMISSED', NULL);
  IF (SELECT count(*) FROM public.notifications) <> before THEN RAISE EXCEPTION 'laporan tanpa pelapor tidak menghasilkan notifikasi'; END IF;
END$$;
ROLLBACK;
