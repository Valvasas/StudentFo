-- Laporan konten, penangguhan, dan hapus akun (ADR-061).
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000f5a01', 'pelapor@x'),
  ('00000000-0000-4000-8000-0000000f5a02', 'terlapor@x'),
  ('00000000-0000-4000-8000-0000000f5a03', 'admin@x'),
  ('00000000-0000-4000-8000-0000000f5a04', 'pamit@x');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000f5a03';

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at, education_levels) VALUES
  ('00000000-0000-4000-8000-0000000f5e01', 'Lomba Laporan Tayang', 'Org Laporan', 'LOMBA', 'https://d.example/1', 'https://s.example/1', 'APPROVED', now(), ARRAY['D4_S1']::education_level[]),
  ('00000000-0000-4000-8000-0000000f5e02', 'Lomba Laporan Antre', 'Org Antre', 'LOMBA', 'https://d.example/2', 'https://s.example/2', 'PENDING', NULL, ARRAY['D4_S1']::education_level[]);

-- ---------------------------------------------------------------------
-- 1. Melapor
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f5a01';
SELECT public.report_content('event', '00000000-0000-4000-8000-0000000f5e01', 'scam', '  Minta transfer ke rekening pribadi  ');
-- Klik ulang selagi laporan pertama masih terbuka tidak menumpuk antrean.
SELECT public.report_content('event', '00000000-0000-4000-8000-0000000f5e01', 'misleading', NULL);
SELECT public.report_content('user', '00000000-0000-4000-8000-0000000f5a02', 'harassment', '');

DO $$
BEGIN
  BEGIN
    PERFORM public.report_content('event', '00000000-0000-4000-8000-0000000f5e02', 'scam', NULL);
    RAISE EXCEPTION 'kegiatan yang belum tayang tidak boleh bisa dilaporkan (membocorkan keberadaannya)';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.report_content('user', '00000000-0000-4000-8000-0000000f5a01', 'spam', NULL);
    RAISE EXCEPTION 'tidak boleh melaporkan diri sendiri';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.report_content('user', gen_random_uuid(), 'spam', NULL);
    RAISE EXCEPTION 'akun yang tidak ada tidak boleh bisa dilaporkan';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.report_content('user', '00000000-0000-4000-8000-0000000f5a02', 'karena-saya-mau', NULL);
    RAISE EXCEPTION 'alasan di luar daftar tertutup harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.content_reports;
    RAISE EXCEPTION 'pelapor tidak boleh membaca tabel laporan';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.resolve_content_report(gen_random_uuid(), '00000000-0000-4000-8000-0000000f5a01', 'DISMISSED', NULL);
    RAISE EXCEPTION 'pengguna tidak boleh memutuskan laporan';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.set_user_suspension('00000000-0000-4000-8000-0000000f5a02', '00000000-0000-4000-8000-0000000f5a01', true, 'balas dendam');
    RAISE EXCEPTION 'pengguna tidak boleh menangguhkan orang lain';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.delete_user_account('00000000-0000-4000-8000-0000000f5a02', '00000000-0000-4000-8000-0000000f5a01', NULL);
    RAISE EXCEPTION 'pengguna tidak boleh menghapus akun orang lain';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.report_content('event', '00000000-0000-4000-8000-0000000f5e01', 'scam', NULL);
  RAISE EXCEPTION 'tamu tidak boleh melapor';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
RESET ROLE;

DO $$
DECLARE
  first_report UUID;
BEGIN
  IF (SELECT count(*) FROM public.content_reports) <> 2 THEN RAISE EXCEPTION 'harus tepat 2 laporan terbuka'; END IF;
  SELECT id INTO first_report FROM public.content_reports WHERE subject_type = 'event';
  IF (SELECT details FROM public.content_reports WHERE id = first_report) <> 'Minta transfer ke rekening pribadi' THEN
    RAISE EXCEPTION 'keterangan harus dirapikan, laporan pertama yang dipertahankan';
  END IF;
  IF (SELECT details FROM public.content_reports WHERE subject_type = 'user') IS NOT NULL THEN
    RAISE EXCEPTION 'keterangan kosong disimpan NULL';
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. Memutuskan laporan
  -- ---------------------------------------------------------------------
  PERFORM public.resolve_content_report(first_report, '00000000-0000-4000-8000-0000000f5a03', 'RESOLVED', 'Kegiatan diturunkan');
  IF (SELECT status FROM public.content_reports WHERE id = first_report) <> 'RESOLVED' THEN RAISE EXCEPTION 'status laporan tidak berubah'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_type = 'report' AND subject_id = first_report AND to_status = 'RESOLVED'
                 AND actor_id = '00000000-0000-4000-8000-0000000f5a03' AND reason = 'Kegiatan diturunkan') THEN
    RAISE EXCEPTION 'keputusan laporan wajib tercatat di log moderasi';
  END IF;
  BEGIN
    PERFORM public.resolve_content_report(first_report, '00000000-0000-4000-8000-0000000f5a03', 'DISMISSED', NULL);
    RAISE EXCEPTION 'laporan yang sudah diputuskan tidak boleh diputuskan ulang';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END$$;

-- Setelah diputuskan, pelapor yang sama boleh melapor lagi (kejadian baru).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f5a01';
SELECT public.report_content('event', '00000000-0000-4000-8000-0000000f5e01', 'scam', NULL);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.content_reports WHERE subject_type = 'event') <> 2 THEN
    RAISE EXCEPTION 'laporan baru setelah keputusan harus diterima';
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 3. Penangguhan
-- ---------------------------------------------------------------------
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000f5a02', true);
INSERT INTO auth.sessions (user_id) VALUES ('00000000-0000-4000-8000-0000000f5a02');

DO $$
BEGIN
  BEGIN
    PERFORM public.set_user_suspension('00000000-0000-4000-8000-0000000f5a02', '00000000-0000-4000-8000-0000000f5a03', true, 'x');
    RAISE EXCEPTION 'penangguhan tanpa alasan bermakna harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.set_user_suspension('00000000-0000-4000-8000-0000000f5a03', '00000000-0000-4000-8000-0000000f5a03', true, 'menangguhkan diri');
    RAISE EXCEPTION 'admin tidak bisa ditangguhkan dari aplikasi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM public.set_user_suspension('00000000-0000-4000-8000-0000000f5a02', '00000000-0000-4000-8000-0000000f5a03', true, 'Pelecehan berulang lewat ajakan');
  -- Idempoten: menangguhkan yang sudah ditangguhkan tidak menambah log.
  PERFORM public.set_user_suspension('00000000-0000-4000-8000-0000000f5a02', '00000000-0000-4000-8000-0000000f5a03', true, 'Pelecehan berulang lewat ajakan');

  IF (SELECT suspended_at IS NULL OR suspension_reason IS DISTINCT FROM 'Pelecehan berulang lewat ajakan' FROM public.users WHERE id = '00000000-0000-4000-8000-0000000f5a02') THEN
    RAISE EXCEPTION 'status penangguhan tidak tersimpan';
  END IF;
  -- Berhingga (GoTrue tidak bisa membaca 'infinity') dan jauh di depan.
  IF (SELECT banned_until FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000f5a02') IS NULL
     OR (SELECT banned_until FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000f5a02') < now() + interval '99 years'
     OR (SELECT isfinite(banned_until) FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000f5a02') IS NOT TRUE THEN
    RAISE EXCEPTION 'GoTrue harus menolak masuk (banned_until berhingga, ±100 tahun)';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = '00000000-0000-4000-8000-0000000f5a02') THEN
    RAISE EXCEPTION 'sesi yang ada harus diputus';
  END IF;
  IF (SELECT is_discoverable FROM public.network_profiles WHERE user_id = '00000000-0000-4000-8000-0000000f5a02') THEN
    RAISE EXCEPTION 'akun yang ditangguhkan harus keluar dari direktori';
  END IF;
  IF (SELECT count(*) FROM public.moderation_log WHERE subject_type = 'user' AND to_status = 'SUSPENDED') <> 1 THEN
    RAISE EXCEPTION 'penangguhan tercatat tepat sekali';
  END IF;
END$$;

-- Pemilik bisa MEMBACA status akunnya, tapi tidak mencabut penangguhannya sendiri.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f5a02';
DO $$
BEGIN
  IF (SELECT suspended_at FROM public.users WHERE id = '00000000-0000-4000-8000-0000000f5a02') IS NULL THEN
    RAISE EXCEPTION 'pemilik harus bisa membaca status penangguhannya';
  END IF;
  BEGIN
    UPDATE public.users SET suspended_at = NULL WHERE id = '00000000-0000-4000-8000-0000000f5a02';
    RAISE EXCEPTION 'pemilik tidak boleh mencabut penangguhannya sendiri';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

DO $$
BEGIN
  PERFORM public.set_user_suspension('00000000-0000-4000-8000-0000000f5a02', '00000000-0000-4000-8000-0000000f5a03', false, NULL);
  IF (SELECT suspended_at IS NOT NULL OR suspension_reason IS NOT NULL FROM public.users WHERE id = '00000000-0000-4000-8000-0000000f5a02') THEN
    RAISE EXCEPTION 'pencabutan penangguhan tidak tersimpan';
  END IF;
  IF (SELECT banned_until FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000f5a02') IS NOT NULL THEN
    RAISE EXCEPTION 'banned_until harus dikosongkan';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_type = 'user' AND from_status = 'SUSPENDED' AND to_status = 'ACTIVE') THEN
    RAISE EXCEPTION 'pencabutan penangguhan wajib tercatat';
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 4. Hapus akun: cascade penuh, jejak bersama diputus, berkas terdaftar
-- ---------------------------------------------------------------------
INSERT INTO public.saved_events (user_id, event_id) VALUES ('00000000-0000-4000-8000-0000000f5a04', '00000000-0000-4000-8000-0000000f5e01');
INSERT INTO public.teams (id, event_id, created_by, title) VALUES
  ('00000000-0000-4000-8000-0000000f57e1', '00000000-0000-4000-8000-0000000f5e01', '00000000-0000-4000-8000-0000000f5a04', 'Tim Pamit');
INSERT INTO public.event_registrations (code, event_id, user_id, full_name, email, status, fee_amount, proof_path) VALUES
  ('SF-0000F5A4', '00000000-0000-4000-8000-0000000f5e01', '00000000-0000-4000-8000-0000000f5a04', 'Pamit', 'pamit@x', 'PAYMENT_REVIEW', 50000,
   '00000000-0000-4000-8000-0000000f5e01/00000000-0000-4000-8000-0000000f5b01.jpg');
INSERT INTO public.content_reports (reporter_id, subject_type, subject_id, reason) VALUES
  ('00000000-0000-4000-8000-0000000f5a04', 'user', '00000000-0000-4000-8000-0000000f5a02', 'spam');

DO $$
BEGIN
  IF (SELECT array_agg(bucket || ':' || path) FROM public.account_storage_paths('00000000-0000-4000-8000-0000000f5a04'))
     IS DISTINCT FROM ARRAY['payment-proofs:00000000-0000-4000-8000-0000000f5e01/00000000-0000-4000-8000-0000000f5b01.jpg'] THEN
    RAISE EXCEPTION 'berkas bukti bayar harus terdaftar untuk dihapus lewat Storage API';
  END IF;

  BEGIN
    PERFORM public.delete_user_account('00000000-0000-4000-8000-0000000f5a03', '00000000-0000-4000-8000-0000000f5a03', NULL);
    RAISE EXCEPTION 'akun admin tidak boleh dihapus dari aplikasi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM public.delete_user_account('00000000-0000-4000-8000-0000000f5a04', '00000000-0000-4000-8000-0000000f5a03', 'Permintaan lewat email 30/10');

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000f5a04')
     OR EXISTS (SELECT 1 FROM public.users WHERE id = '00000000-0000-4000-8000-0000000f5a04')
     OR EXISTS (SELECT 1 FROM public.saved_events WHERE user_id = '00000000-0000-4000-8000-0000000f5a04')
     OR EXISTS (SELECT 1 FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000f5a04') THEN
    RAISE EXCEPTION 'data milik akun harus ikut terhapus';
  END IF;
  IF (SELECT created_by FROM public.teams WHERE id = '00000000-0000-4000-8000-0000000f57e1') IS NOT NULL THEN
    RAISE EXCEPTION 'tim yang dibuat tetap ada tanpa tautan ke akun';
  END IF;
  IF EXISTS (SELECT 1 FROM public.content_reports WHERE reporter_id = '00000000-0000-4000-8000-0000000f5a04')
     OR NOT EXISTS (SELECT 1 FROM public.content_reports WHERE subject_id = '00000000-0000-4000-8000-0000000f5a02' AND reporter_id IS NULL) THEN
    RAISE EXCEPTION 'laporan tetap ada sebagai arsip, tanpa tautan ke pelapor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_type = 'user' AND subject_id = '00000000-0000-4000-8000-0000000f5a04'
                 AND to_status = 'DELETED' AND title = 'Akun dihapus' AND reason = 'Permintaan lewat email 30/10') THEN
    RAISE EXCEPTION 'penghapusan oleh admin wajib tercatat tanpa nama pemilik';
  END IF;

  BEGIN
    PERFORM public.delete_user_account('00000000-0000-4000-8000-0000000f5a04', '00000000-0000-4000-8000-0000000f5a03', NULL);
    RAISE EXCEPTION 'menghapus akun yang sudah tidak ada harus memberi tahu';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  -- Hapus mandiri: tidak ada aktor admin, tidak ada baris log.
  PERFORM public.delete_user_account('00000000-0000-4000-8000-0000000f5a02', '00000000-0000-4000-8000-0000000f5a02', NULL);
  IF EXISTS (SELECT 1 FROM public.moderation_log WHERE subject_id = '00000000-0000-4000-8000-0000000f5a02' AND to_status = 'DELETED') THEN
    RAISE EXCEPTION 'hapus mandiri tidak dicatat sebagai tindakan moderasi';
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 5. Alasan penolakan kiriman sampai ke pengirim
-- ---------------------------------------------------------------------
INSERT INTO public.ugc_submissions (id, submitted_by_email, submitted_by, payload) VALUES
  ('00000000-0000-4000-8000-0000000f5c01', 'pelapor@x', '00000000-0000-4000-8000-0000000f5a01', '{"title":"Kiriman Beralasan"}');
UPDATE public.ugc_submissions SET status = 'REJECTED', rejection_reason = 'Tautan pendaftaran tidak bisa dibuka', reviewed_at = now()
WHERE id = '00000000-0000-4000-8000-0000000f5c01';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000f5a01' AND type = 'SUBMISSION_REJECTED'
                 AND message LIKE '%Alasan moderator: Tautan pendaftaran tidak bisa dibuka') THEN
    RAISE EXCEPTION 'notifikasi penolakan harus memuat alasan moderator';
  END IF;
END$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  INSERT INTO public.ugc_submissions (submitted_by_email, payload, rejection_reason) VALUES ('t@x', '{}', 'karang sendiri');
  RAISE EXCEPTION 'tamu tidak boleh mengisi alasan penolakan';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
RESET ROLE;

ROLLBACK;
