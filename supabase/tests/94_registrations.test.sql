-- Pendaftaran langsung (ADR-055): formulir hanya diatur pengelola
-- terverifikasi, kuota diserialkan, daftar tunggu FIFO naik otomatis,
-- keputusan dikabarkan, dan klien tidak bisa menulis tabelnya langsung.
-- Kembaran perilaku mode seed: src/lib/data/registrations.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000e0b01', 'org@daftar', '{"full_name":"Panitia Daftar"}'),
  ('00000000-0000-4000-8000-0000000e0b02', 'lain@daftar', '{"full_name":"Orang Lain"}'),
  ('00000000-0000-4000-8000-0000000e0b11', 'p1@daftar', '{"full_name":"Peserta Satu"}'),
  ('00000000-0000-4000-8000-0000000e0b12', 'p2@daftar', '{"full_name":"Peserta Dua"}'),
  ('00000000-0000-4000-8000-0000000e0b13', 'p3@daftar', '{"full_name":"Peserta Tiga"}'),
  ('00000000-0000-4000-8000-0000000e0b14', 'p4@daftar', '{"full_name":"Peserta Empat"}');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at, education_levels) VALUES
  ('00000000-0000-4000-8000-0000000e0be1', 'Workshop Daftar Uji', 'Himpunan Daftar', 'WORKSHOP',
   'https://daftar.example/ws', 'https://sumber.example/ws', 'APPROVED', now(), '{D4_S1,S2}'),
  ('00000000-0000-4000-8000-0000000e0be2', 'Lomba Tim Daftar Uji', 'Himpunan Daftar', 'LOMBA',
   'https://daftar.example/lomba', 'https://sumber.example/lomba', 'APPROVED', now(), '{}'),
  ('00000000-0000-4000-8000-0000000e0be3', 'Konferensi Lewat Tenggat', 'Himpunan Daftar', 'KONFERENSI',
   'https://daftar.example/lewat', 'https://sumber.example/lewat', 'APPROVED', now(), '{}');
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-4000-8000-0000000e0be1', 'registration', now() + INTERVAL '20 days', TRUE),
  ('00000000-0000-4000-8000-0000000e0be3', 'registration', now() - INTERVAL '3 days', TRUE);

INSERT INTO public.organizer_profiles (user_id, org_name, evidence)
VALUES ('00000000-0000-4000-8000-0000000e0b01', 'Himpunan Daftar', 'Ketua himpunan, lihat https://himpunan.example');
SELECT public.review_organizer('00000000-0000-4000-8000-0000000e0b01', 'VERIFIED', NULL, NULL);
INSERT INTO public.event_managers (event_id, user_id, source) VALUES
  ('00000000-0000-4000-8000-0000000e0be1', '00000000-0000-4000-8000-0000000e0b01', 'ADMIN'),
  ('00000000-0000-4000-8000-0000000e0be2', '00000000-0000-4000-8000-0000000e0b01', 'ADMIN'),
  ('00000000-0000-4000-8000-0000000e0be3', '00000000-0000-4000-8000-0000000e0b01', 'ADMIN');

-- Tim untuk lomba: p1 ketua, sendirian dulu.
INSERT INTO public.teams (id, event_id, created_by, title, slots_needed)
VALUES ('00000000-0000-4000-8000-0000000e0c01', '00000000-0000-4000-8000-0000000e0be2', '00000000-0000-4000-8000-0000000e0b11', 'Tim Kilat', 2);
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('00000000-0000-4000-8000-0000000e0c01', '00000000-0000-4000-8000-0000000e0b11', 'leader');

-- 1. Formulir: hanya pengelola, tanpa pertanyaan sensitif.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b02';
DO $$
BEGIN
  PERFORM public.save_registration_form('00000000-0000-4000-8000-0000000e0be1', 'AUTO', 2, TRUE, NULL, NULL, '[]', NULL, NULL);
  RAISE EXCEPTION 'bukan pengelola tidak boleh membuat formulir';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'not_event_manager' THEN RAISE; END IF;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b01';
DO $$
BEGIN
  BEGIN
    PERFORM public.save_registration_form('00000000-0000-4000-8000-0000000e0be1', 'AUTO', 2, TRUE, NULL, NULL,
      '[{"id":"q1","label":"Nomor KTP kamu","kind":"SHORT","required":true,"options":[]}]', NULL, NULL);
    RAISE EXCEPTION 'pertanyaan yang meminta KTP harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_registration_form' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_registration_form('00000000-0000-4000-8000-0000000e0be1', 'AUTO', 0, TRUE, NULL, NULL, '[]', NULL, NULL);
    RAISE EXCEPTION 'kuota 0 harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_registration_form' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_registration_form('00000000-0000-4000-8000-0000000e0be1', 'AUTO', 2, TRUE, NULL, NULL,
      '[{"id":"q1","label":"Pilih sesi","kind":"CHOICE","required":true,"options":["Pagi"]}]', NULL, NULL);
    RAISE EXCEPTION 'pilihan ganda dengan satu opsi harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_registration_form' THEN RAISE; END IF;
  END;
  PERFORM public.save_registration_form('00000000-0000-4000-8000-0000000e0be1', 'AUTO', 2, TRUE, NULL, NULL,
    '[{"id":"q1","label":"Ukuran kaos","kind":"CHOICE","required":true,"options":["S","M","L"]},
      {"id":"q2","label":"Portofolio","kind":"URL","required":false,"options":[]}]',
    'Halo! Isi data singkat ini.', 'Sampai jumpa di lab.');
  IF (SELECT status FROM public.event_registration_forms WHERE event_id = '00000000-0000-4000-8000-0000000e0be1') <> 'DRAFT' THEN
    RAISE EXCEPTION 'formulir baru harus DRAFT';
  END IF;
  BEGIN
    PERFORM public.set_registration_form_status('00000000-0000-4000-8000-0000000e0be3', 'OPEN');
    RAISE EXCEPTION 'acara lewat tenggat tanpa formulir tidak bisa dibuka';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'registration_form_unavailable' THEN RAISE; END IF;
  END;
  PERFORM public.save_registration_form('00000000-0000-4000-8000-0000000e0be3', 'AUTO', NULL, FALSE, NULL, NULL, '[]', NULL, NULL);
  BEGIN
    PERFORM public.set_registration_form_status('00000000-0000-4000-8000-0000000e0be3', 'OPEN');
    RAISE EXCEPTION 'acara lewat tenggat tidak bisa dibuka pendaftarannya';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'registration_form_unavailable' THEN RAISE; END IF;
  END;
END$$;
RESET ROLE;

-- 2. DRAFT tidak terlihat tamu & tidak menerima pendaftaran.
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_registration_forms) THEN
    RAISE EXCEPTION 'formulir DRAFT tidak boleh terbaca tamu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.registration_seats(ARRAY['00000000-0000-4000-8000-0000000e0be1'::UUID])) THEN
    RAISE EXCEPTION 'kursi formulir DRAFT tidak boleh terbaca tamu';
  END IF;
  BEGIN
    PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567890', 'Univ', NULL, 'D4_S1', '[]', NULL);
    RAISE EXCEPTION 'tamu tidak boleh mendaftar';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b11';
DO $$
BEGIN
  PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567890', 'Univ', NULL, 'D4_S1',
    '[{"questionId":"q1","value":"M"}]', NULL);
  RAISE EXCEPTION 'formulir DRAFT tidak boleh menerima pendaftaran';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'registration_closed' THEN RAISE; END IF;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b01';
SELECT public.set_registration_form_status('00000000-0000-4000-8000-0000000e0be1', 'OPEN');
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_registration_forms) <> 1 THEN
    RAISE EXCEPTION 'formulir OPEN harus terbaca tamu';
  END IF;
  IF (SELECT (capacity, taken, waitlisted) FROM public.registration_seats(ARRAY['00000000-0000-4000-8000-0000000e0be1'::UUID]))
     IS DISTINCT FROM (2, 0, 0) THEN
    RAISE EXCEPTION 'kursi awal harus 2/0/0';
  END IF;
END$$;
RESET ROLE;

-- 3. Peserta: validasi isian, kelayakan, tiket, pelacak.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b11';
DO $$
DECLARE
  v_id UUID;
  v_row public.event_registrations;
BEGIN
  BEGIN
    PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567890', 'Univ', NULL, 'D4_S1',
      '[{"questionId":"q1","value":"XXL"}]', NULL);
    RAISE EXCEPTION 'opsi di luar daftar harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_registration' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567890', 'Univ', NULL, 'D4_S1', '[]', NULL);
    RAISE EXCEPTION 'pertanyaan wajib kosong harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_registration' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567890', 'Univ', NULL, 'D4_S1',
      '[{"questionId":"q1","value":"M"},{"questionId":"q2","value":"javascript:alert(1)"}]', NULL);
    RAISE EXCEPTION 'tautan selain https harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_registration' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567890', 'SMA Contoh', NULL, 'SMA_SMK',
      '[{"questionId":"q1","value":"M"}]', NULL);
    RAISE EXCEPTION 'jenjang di luar ketentuan harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'registration_not_eligible' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '081234567890', 'Univ', NULL, 'D4_S1',
      '[{"questionId":"q1","value":"M"}]', NULL);
    RAISE EXCEPTION 'nomor HP yang belum dinormalisasi harus ditolak CHECK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  v_id := public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567890', '  Univ Contoh ', '', 'D4_S1',
    '[{"questionId":"q1","value":"M","label":"label palsu dari klien"},{"questionId":"q9","value":"pertanyaan yang tidak ada"}]', NULL);
  SELECT * INTO v_row FROM public.event_registrations WHERE id = v_id;
  IF v_row.status <> 'CONFIRMED' OR v_row.full_name <> 'Peserta Satu' OR v_row.institution <> 'Univ Contoh' OR v_row.major IS NOT NULL THEN
    RAISE EXCEPTION 'pendaftaran AUTO pertama harus CONFIRMED dengan salinan data diri: %', row_to_json(v_row);
  END IF;
  IF v_row.answers <> '[{"questionId":"q1","label":"Ukuran kaos","value":"M"}]'::JSONB THEN
    RAISE EXCEPTION 'label jawaban harus dari formulir, pertanyaan asing dibuang: %', v_row.answers;
  END IF;
  IF (SELECT status FROM public.application_tracker WHERE user_id = '00000000-0000-4000-8000-0000000e0b11'
      AND event_id = '00000000-0000-4000-8000-0000000e0be1') <> 'APPLIED' THEN
    RAISE EXCEPTION 'pelacak harus naik ke APPLIED';
  END IF;
  BEGIN
    PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567890', 'Univ', NULL, 'D4_S1',
      '[{"questionId":"q1","value":"M"}]', NULL);
    RAISE EXCEPTION 'daftar dua kali harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'registration_exists' THEN RAISE; END IF;
  END;

  -- Klien tidak punya hak tulis langsung — kuota tidak bisa diakali lewat PostgREST.
  BEGIN
    UPDATE public.event_registrations SET status = 'CONFIRMED' WHERE id = v_id;
    RAISE EXCEPTION 'klien tidak boleh mengubah status pendaftarannya sendiri';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.event_registration_forms (event_id) VALUES ('00000000-0000-4000-8000-0000000e0be2');
    RAISE EXCEPTION 'klien tidak boleh menulis formulir langsung';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

-- 4. Kuota penuh → daftar tunggu FIFO.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b12';
SELECT public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567891', 'Univ', NULL, 'S2', '[{"questionId":"q1","value":"S"}]', NULL);
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b13';
SELECT public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567892', 'Univ', NULL, 'D4_S1', '[{"questionId":"q1","value":"L"}]', NULL);
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b14';
SELECT public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567893', 'Univ', NULL, 'D4_S1', '[{"questionId":"q1","value":"L"}]', NULL);
RESET ROLE;
-- Satu transaksi uji = satu now(); urutan kedatangan dibuat eksplisit
-- (p1 → p4, selang 10 detik) seperti pendaftaran sungguhan yang bergantian.
UPDATE public.event_registrations r SET created_at = now() - make_interval(secs => 50 - 10 * o.n)
FROM (VALUES ('00000000-0000-4000-8000-0000000e0b11'::UUID, 1), ('00000000-0000-4000-8000-0000000e0b12', 2),
             ('00000000-0000-4000-8000-0000000e0b13', 3), ('00000000-0000-4000-8000-0000000e0b14', 4)) AS o(uid, n)
WHERE r.user_id = o.uid;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b14';
DO $$
BEGIN
  IF (SELECT status FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b14') <> 'WAITLISTED' THEN
    RAISE EXCEPTION 'pendaftar ke-4 untuk 2 kursi harus di daftar tunggu';
  END IF;
  IF public.my_waitlist_position('00000000-0000-4000-8000-0000000e0be1') <> 2 THEN
    RAISE EXCEPTION 'p4 harus urutan ke-2 di daftar tunggu, dapat %', public.my_waitlist_position('00000000-0000-4000-8000-0000000e0be1');
  END IF;
  -- RLS: peserta hanya melihat barisnya sendiri.
  IF (SELECT count(*) FROM public.event_registrations) <> 1 THEN
    RAISE EXCEPTION 'peserta tidak boleh melihat pendaftaran orang lain';
  END IF;
  BEGIN
    PERFORM public.registration_stats('00000000-0000-4000-8000-0000000e0be1', 30);
    RAISE EXCEPTION 'peserta tidak boleh membaca statistik';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'analytics_forbidden' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.registration_summaries(ARRAY['00000000-0000-4000-8000-0000000e0be1'::UUID])) THEN
    RAISE EXCEPTION 'ringkasan studio hanya untuk pengelola';
  END IF;
END$$;

-- 5. p1 batal → p3 (antre paling awal) naik dan dikabari; p4 maju ke urutan 1.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b11';
SELECT public.cancel_event_registration('00000000-0000-4000-8000-0000000e0be1');
DO $$
BEGIN
  PERFORM public.cancel_event_registration('00000000-0000-4000-8000-0000000e0be1');
  RAISE EXCEPTION 'batal dua kali harus ditolak';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'registration_not_found' THEN RAISE; END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b14';
DO $$
BEGIN
  IF public.my_waitlist_position('00000000-0000-4000-8000-0000000e0be1') <> 1 THEN
    RAISE EXCEPTION 'p4 harus maju ke urutan 1';
  END IF;
END$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b13') <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'p3 (antre pertama) harus naik ke CONFIRMED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000e0b13' AND type = 'REGISTRATION_PROMOTED') THEN
    RAISE EXCEPTION 'p3 harus dikabari naik dari daftar tunggu';
  END IF;
END$$;

-- 6. Daftar ulang setelah batal: kode tiket sama, antre dari belakang.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b11';
DO $$
DECLARE
  v_code TEXT := (SELECT code FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b11');
  v_row public.event_registrations;
BEGIN
  PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567890', 'Univ', NULL, 'D4_S1',
    '[{"questionId":"q1","value":"S"}]', NULL);
  SELECT * INTO v_row FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b11';
  IF v_row.code <> v_code OR v_row.status <> 'WAITLISTED' OR v_row.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'daftar ulang harus memakai kode lama dan antre: %', row_to_json(v_row);
  END IF;
  IF public.my_waitlist_position('00000000-0000-4000-8000-0000000e0be1') <> 2 THEN
    RAISE EXCEPTION 'pendaftar ulang antre di belakang p4';
  END IF;
END$$;

-- 7. Keputusan penyelenggara.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b02';
DO $$
BEGIN
  -- Id-nya ada, tetapi bukan acaranya: jawabannya "tidak ditemukan", bukan "dilarang".
  PERFORM public.decide_event_registration(
    (SELECT id FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b02'), 'REJECT', NULL);
  RAISE EXCEPTION 'harus ditolak';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'registration_not_found' THEN RAISE; END IF;
END$$;
RESET ROLE;
CREATE TEMP TABLE reg_p2 ON COMMIT DROP AS
SELECT id FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b12';
GRANT SELECT ON reg_p2 TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b02';
DO $$
BEGIN
  PERFORM public.decide_event_registration((SELECT id FROM reg_p2), 'REJECT', NULL);
  RAISE EXCEPTION 'bukan pengelola tidak boleh memutuskan';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'registration_not_found' THEN RAISE; END IF;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b01';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8000-0000000e0be1') <> 4 THEN
    RAISE EXCEPTION 'pengelola harus melihat semua pendaftar acaranya';
  END IF;
  PERFORM public.decide_event_registration((SELECT id FROM reg_p2), 'REJECT', '  Kuota divisi penuh.  ');
  BEGIN
    PERFORM public.decide_event_registration((SELECT id FROM reg_p2), 'CONFIRM', NULL);
    RAISE EXCEPTION 'REJECTED tidak bisa langsung CONFIRM';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'registration_invalid_transition' THEN RAISE; END IF;
  END;
END$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT (status, decision_note) FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b12')
     IS DISTINCT FROM ('REJECTED'::VARCHAR, 'Kuota divisi penuh.'::VARCHAR) THEN
    RAISE EXCEPTION 'tolak harus menyimpan catatan yang dirapikan';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000e0b12'
                 AND type = 'REGISTRATION_REJECTED' AND message LIKE '%Catatan: Kuota divisi penuh.') THEN
    RAISE EXCEPTION 'p2 harus dikabari penolakan beserta catatannya';
  END IF;
  -- Kursi p2 lepas → p4 (antre pertama) naik.
  IF (SELECT status FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b14') <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'kursi yang dilepas penolakan harus diberikan ke antrean';
  END IF;
END$$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b12';
DO $$
BEGIN
  PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be1', '+6281234567891', 'Univ', NULL, 'S2',
    '[{"questionId":"q1","value":"S"}]', NULL);
  RAISE EXCEPTION 'yang ditolak tidak bisa mendaftar ulang sendiri';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'registration_rejected_before' THEN RAISE; END IF;
END$$;

-- Dibuka lagi saat kursi penuh → antre, bukan menyerobot kuota. Posisinya
-- kembali ke urutan kedatangan aslinya: keputusan yang dibatalkan tidak
-- boleh menghukum peserta.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b01';
SELECT public.decide_event_registration((SELECT id FROM reg_p2), 'REOPEN', NULL);
DO $$
BEGIN
  IF (SELECT status FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b12') <> 'WAITLISTED' THEN
    RAISE EXCEPTION 'REOPEN saat penuh harus masuk daftar tunggu';
  END IF;
END$$;

-- 8. Statistik & ringkasan studio konsisten dengan baris.
DO $$
DECLARE
  report JSONB := public.registration_stats('00000000-0000-4000-8000-0000000e0be1', 30);
BEGIN
  IF jsonb_array_length(report -> 'series') <> 30
     OR (SELECT sum((d ->> 'submitted')::INT) FROM jsonb_array_elements(report -> 'series') AS d) <> 4 THEN
    RAISE EXCEPTION 'deret 30 hari harus memuat 4 pendaftar: %', report -> 'series';
  END IF;
  IF report -> 'byStatus' <> '{"PENDING":0,"CONFIRMED":2,"WAITLISTED":2,"REJECTED":0,"CANCELLED":0}'::JSONB THEN
    RAISE EXCEPTION 'hitungan status salah: %', report -> 'byStatus';
  END IF;
  IF (report ->> 'capacity')::INT <> 2 OR report -> 'levels' <> '[{"label":"D4_S1","count":3},{"label":"S2","count":1}]'::JSONB THEN
    RAISE EXCEPTION 'kapasitas/jenjang salah: %', report;
  END IF;
  IF (SELECT (taken, waitlisted, pending) FROM public.registration_summaries(ARRAY['00000000-0000-4000-8000-0000000e0be1'::UUID]))
     IS DISTINCT FROM (2, 2, 0) THEN
    RAISE EXCEPTION 'ringkasan studio harus 2 kursi terisi, 2 antre';
  END IF;

  -- Kuota dinaikkan → antrean naik saat itu juga, yang datang lebih dulu duluan.
  PERFORM public.save_registration_form('00000000-0000-4000-8000-0000000e0be1', 'AUTO', 3, TRUE, NULL, NULL,
    '[{"id":"q1","label":"Ukuran kaos","kind":"CHOICE","required":true,"options":["S","M","L"]}]', NULL, NULL);
  IF (SELECT taken FROM public.registration_seats(ARRAY['00000000-0000-4000-8000-0000000e0be1'::UUID])) <> 3 THEN
    RAISE EXCEPTION 'kuota naik harus langsung diisi antrean';
  END IF;
  IF (SELECT status FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b12') <> 'CONFIRMED'
     OR (SELECT status FROM public.event_registrations WHERE user_id = '00000000-0000-4000-8000-0000000e0b11') <> 'WAITLISTED' THEN
    RAISE EXCEPTION 'p2 (datang lebih awal) yang naik, p1 (daftar ulang) tetap antre';
  END IF;
END$$;

-- 9. Mode tim: hanya ketua, ukuran sesuai ketentuan; anggota disalin.
SELECT public.save_registration_form('00000000-0000-4000-8000-0000000e0be2', 'MANUAL', NULL, FALSE, 2, 3, '[]', NULL, NULL);
SELECT public.set_registration_form_status('00000000-0000-4000-8000-0000000e0be2', 'OPEN');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b11';
DO $$
BEGIN
  PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be2', '+6281234567890', 'Univ', NULL, 'D4_S1', '[]',
    '00000000-0000-4000-8000-0000000e0c01');
  RAISE EXCEPTION 'tim beranggota 1 (minimal 2) harus ditolak';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'registration_team_invalid' THEN RAISE; END IF;
END$$;
RESET ROLE;
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('00000000-0000-4000-8000-0000000e0c01', '00000000-0000-4000-8000-0000000e0b13', 'member');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b13';
DO $$
BEGIN
  PERFORM public.submit_event_registration('00000000-0000-4000-8000-0000000e0be2', '+6281234567892', 'Univ', NULL, 'D4_S1', '[]',
    '00000000-0000-4000-8000-0000000e0c01');
  RAISE EXCEPTION 'anggota biasa tidak boleh mendaftarkan tim';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'registration_team_invalid' THEN RAISE; END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000e0b11';
DO $$
DECLARE
  v_row public.event_registrations;
BEGIN
  SELECT * INTO v_row FROM public.event_registrations WHERE id = public.submit_event_registration(
    '00000000-0000-4000-8000-0000000e0be2', '+6281234567890', 'Univ', NULL, 'D4_S1', '[]', '00000000-0000-4000-8000-0000000e0c01');
  IF v_row.status <> 'PENDING' OR v_row.team_title <> 'Tim Kilat' OR v_row.team_members <> ARRAY['Peserta Satu', 'Peserta Tiga'] THEN
    RAISE EXCEPTION 'pendaftaran tim MANUAL harus PENDING dengan salinan anggota (ketua dulu): %', row_to_json(v_row);
  END IF;
END$$;
RESET ROLE;

-- 10. Hak eksekusi: pembantu internal tertutup untuk klien.
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.promote_event_waitlist(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.notify_registration(uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.submit_event_registration(uuid, text, text, text, education_level, jsonb, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pembantu internal / RPC peserta tidak boleh bisa dipanggil klien yang salah';
  END IF;
  IF NOT has_function_privilege('anon', 'public.registration_seats(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'hitungan kursi harus terbaca tamu';
  END IF;
END$$;
ROLLBACK;
