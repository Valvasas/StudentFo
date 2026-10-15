-- =====================================================================
-- Formulir pendaftaran internal, pembayaran (bukti transfer), dan galeri
-- foto acara — ADR-056.
--
-- Prinsip yang sama dengan penyelenggara terverifikasi (ADR-042):
--   * Yang menyusun formulir, membaca pendaftar, memverifikasi pembayaran,
--     dan mengunggah foto HANYA pengelola terverifikasi acara itu
--     (`manages_event()`) atau admin.
--   * Pendaftar hanya melihat pendaftarannya sendiri. Penyelenggara tidak
--     pernah membaca tabel `users`: nama & email disalin saat mendaftar.
--   * Semua perubahan status lewat RPC SECURITY DEFINER yang memeriksa
--     transisi — klien tidak punya hak INSERT/UPDATE langsung atas
--     `event_registrations`. Mesin transisinya kembar dengan
--     `registrationTransition()` di src/lib/registration-form.ts.
--   * Berkas (foto & bukti) di bucket Storage PRIVAT tanpa policy
--     `storage.objects`: hanya service_role (server) yang membaca/menulis,
--     SETELAH aplikasi memeriksa hak lewat baris metadata yang dijaga RLS
--     di bawah. URL publik Storage tidak pernah keluar ke peramban.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. event_registration_forms — satu formulir per acara
-- ---------------------------------------------------------------------
CREATE TABLE public.event_registration_forms (
  event_id             UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  is_open              BOOLEAN NOT NULL DEFAULT false,
  intro                TEXT CHECK (intro IS NULL OR char_length(intro) <= 1000),
  -- Bentuk tiap kolom divalidasi aplikasi (`formFieldsSchema`); di sini
  -- hanya batas yang mencegah baris raksasa.
  fields               JSONB NOT NULL DEFAULT '[]'::jsonb
                       CHECK (jsonb_typeof(fields) = 'array'
                              AND jsonb_array_length(fields) <= 25
                              AND pg_column_size(fields) <= 65536),
  capacity             INTEGER CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 100000),
  fee_amount           INTEGER CHECK (fee_amount IS NULL OR fee_amount BETWEEN 1 AND 100000000),
  payment_instructions TEXT CHECK (payment_instructions IS NULL OR char_length(payment_instructions) <= 1000),
  updated_by           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Acara berbayar tanpa tujuan transfer = peserta terjebak "menunggu pembayaran".
  CONSTRAINT event_registration_forms_paid_needs_instructions
    CHECK (fee_amount IS NULL OR char_length(btrim(coalesce(payment_instructions, ''))) >= 10)
);

CREATE OR REPLACE FUNCTION public.stamp_registration_form()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_registration_form() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_registration_form_stamp
  BEFORE INSERT OR UPDATE ON public.event_registration_forms
  FOR EACH ROW EXECUTE FUNCTION public.stamp_registration_form();

ALTER TABLE public.event_registration_forms ENABLE ROW LEVEL SECURITY;

-- Formulir acara yang tayang boleh dibaca siapa pun (isinya pertanyaan &
-- instruksi bayar yang memang ditujukan ke calon peserta). Dua policy, bukan
-- satu berisi OR: `anon` tidak punya hak EXECUTE atas manages_event/is_admin,
-- dan policy yang memanggilnya untuk anon gagal dengan "permission denied".
CREATE POLICY registration_forms_select_public ON public.event_registration_forms
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status IN ('APPROVED', 'EXPIRED')));

CREATE POLICY registration_forms_select_manager ON public.event_registration_forms
  FOR SELECT TO authenticated
  USING (public.manages_event(event_id) OR (select public.is_admin()));

CREATE POLICY registration_forms_insert ON public.event_registration_forms
  FOR INSERT TO authenticated
  WITH CHECK (public.manages_event(event_id) OR (select public.is_admin()));

CREATE POLICY registration_forms_update ON public.event_registration_forms
  FOR UPDATE TO authenticated
  USING (public.manages_event(event_id) OR (select public.is_admin()))
  WITH CHECK (public.manages_event(event_id) OR (select public.is_admin()));

-- Hak per KOLOM (AGENTS.md §14): `updated_by` (UUID pengelola) tidak ikut
-- terbaca publik, dan tidak bisa ditulis klien (diisi trigger).
REVOKE ALL ON public.event_registration_forms FROM PUBLIC, anon, authenticated;
GRANT SELECT (event_id, is_open, intro, fields, capacity, fee_amount, payment_instructions, updated_at)
  ON public.event_registration_forms TO anon, authenticated;
GRANT INSERT (event_id, is_open, intro, fields, capacity, fee_amount, payment_instructions)
  ON public.event_registration_forms TO authenticated;
GRANT UPDATE (is_open, intro, fields, capacity, fee_amount, payment_instructions)
  ON public.event_registration_forms TO authenticated;

-- ---------------------------------------------------------------------
-- 2. event_registrations — pendaftar & status pembayaran
-- ---------------------------------------------------------------------
CREATE TABLE public.event_registrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(11) NOT NULL UNIQUE CHECK (code ~ '^SF-[0-9A-F]{8}$'),
  event_id          UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name         VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  answers           JSONB NOT NULL DEFAULT '{}'::jsonb
                    CHECK (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) <= 65536),
  status            VARCHAR(20) NOT NULL
                    CHECK (status IN ('AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED', 'REJECTED', 'CANCELLED')),
  fee_amount        INTEGER CHECK (fee_amount IS NULL OR fee_amount > 0),
  proof_path        TEXT CHECK (proof_path IS NULL OR proof_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  proof_uploaded_at TIMESTAMPTZ,
  review_note       VARCHAR(500),
  reviewed_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu pendaftaran hidup per orang per acara. Yang DITOLAK tetap
-- menghalangi (keputusan panitia final); yang dibatalkan sendiri tidak.
CREATE UNIQUE INDEX event_registrations_one_active
  ON public.event_registrations (event_id, user_id)
  WHERE status <> 'CANCELLED';
-- Daftar pendaftar per acara (studio) & hitungan kuota.
CREATE INDEX idx_event_registrations_event ON public.event_registrations (event_id, created_at DESC);
-- "Pembayaran" milik peserta.
CREATE INDEX idx_event_registrations_user ON public.event_registrations (user_id, created_at DESC);

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_registrations_select ON public.event_registrations
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.manages_event(event_id)
    OR (select public.is_admin())
  );

-- Tanpa hak tulis apa pun untuk klien: semua lewat RPC di bawah. Kolom
-- `reviewed_by` (UUID panitia/moderator) tidak terbaca (rencana-produksi §2.1).
REVOKE ALL ON public.event_registrations FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, code, event_id, user_id, full_name, email, answers, status, fee_amount, proof_path,
              proof_uploaded_at, review_note, reviewed_at, created_at, updated_at)
  ON public.event_registrations TO authenticated;

-- Sisa kuota butuh hitungan pendaftar orang lain, yang tersembunyi oleh RLS.
CREATE OR REPLACE FUNCTION public.event_registration_count(p_event UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::int
  FROM public.event_registrations r
  JOIN public.event_registration_forms f ON f.event_id = r.event_id
  WHERE r.event_id = p_event AND r.status NOT IN ('CANCELLED', 'REJECTED');
$$;
REVOKE ALL ON FUNCTION public.event_registration_count(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_registration_count(UUID) TO anon, authenticated;

-- Ringkasan dasbor penyelenggara: satu baris per acara KELOLAAN. INVOKER —
-- RLS di atas sudah membatasi baris; syarat pengelola diulang supaya
-- peserta yang memanggilnya tidak mendapat "statistik" pendaftarannya sendiri.
CREATE OR REPLACE FUNCTION public.registration_stats(p_events UUID[])
RETURNS TABLE (event_id UUID, total INTEGER, confirmed INTEGER, awaiting_payment INTEGER, payment_review INTEGER, recent INTEGER)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT r.event_id,
         count(*) FILTER (WHERE r.status NOT IN ('CANCELLED', 'REJECTED'))::int,
         count(*) FILTER (WHERE r.status = 'CONFIRMED')::int,
         count(*) FILTER (WHERE r.status = 'AWAITING_PAYMENT')::int,
         count(*) FILTER (WHERE r.status = 'PAYMENT_REVIEW')::int,
         count(*) FILTER (WHERE r.created_at >= now() - interval '7 days')::int
  FROM public.event_registrations r
  WHERE r.event_id = ANY (p_events)
    AND (public.manages_event(r.event_id) OR public.is_admin())
  GROUP BY r.event_id;
$$;
REVOKE ALL ON FUNCTION public.registration_stats(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registration_stats(UUID[]) TO authenticated;

-- Kabar ke satu orang tentang satu acara. idx_notifications_dedupe (user,
-- event, type) membuat kabar kedua bertipe sama MENYEGARKAN yang lama
-- (naik ke atas, belum dibaca) alih-alih menumpuk atau tertelan.
CREATE OR REPLACE FUNCTION public.notify_registration(p_user UUID, p_event UUID, p_type TEXT, p_message TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.notifications (user_id, event_id, type, message)
  VALUES (p_user, p_event, p_type, p_message)
  ON CONFLICT (user_id, event_id, type) WHERE event_id IS NOT NULL
  DO UPDATE SET message = EXCLUDED.message, is_read = false, sent_at = now();
$$;
REVOKE ALL ON FUNCTION public.notify_registration(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. RPC pendaftaran
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_for_event(p_event UUID, p_answers JSONB)
RETURNS public.event_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_form public.event_registration_forms%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_row  public.event_registrations%ROWTYPE;
  v_used INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'registration_requires_login' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'invalid_registration' USING ERRCODE = 'P0001';
  END IF;

  -- FOR UPDATE menyerialkan pendaftar acara yang sama: tanpa kunci, dua
  -- orang yang menekan "Kirim" bersamaan sama-sama melihat sisa kuota 1.
  SELECT * INTO v_form FROM public.event_registration_forms WHERE event_id = p_event FOR UPDATE;
  IF NOT FOUND OR NOT v_form.is_open THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.status = 'APPROVED')
     OR EXISTS (SELECT 1 FROM public.event_deadlines d WHERE d.event_id = p_event AND d.is_primary AND d.deadline_at < now()) THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.event_registrations r
             WHERE r.event_id = p_event AND r.user_id = v_uid AND r.status <> 'CANCELLED') THEN
    RAISE EXCEPTION 'registration_exists' USING ERRCODE = 'P0001';
  END IF;

  IF v_form.capacity IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM public.event_registrations r
    WHERE r.event_id = p_event AND r.status NOT IN ('CANCELLED', 'REJECTED');
    IF v_used >= v_form.capacity THEN
      RAISE EXCEPTION 'registration_full' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NOT public.consume_rate_limit('registration:' || v_uid::text, 10, 3600) THEN
    RAISE EXCEPTION 'registration_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_requires_login' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.event_registrations (code, event_id, user_id, full_name, email, answers, status, fee_amount)
  VALUES (
    'SF-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)),
    p_event, v_uid, v_user.full_name, v_user.email, p_answers,
    CASE WHEN v_form.fee_amount IS NULL THEN 'CONFIRMED' ELSE 'AWAITING_PAYMENT' END,
    v_form.fee_amount
  )
  RETURNING * INTO v_row;

  -- Papan pendaftaran pribadi ikut maju — tanpa memundurkan tahap yang
  -- sudah lebih jauh (wawancara/diterima).
  INSERT INTO public.application_tracker (user_id, event_id, status)
  VALUES (v_uid, p_event, 'APPLIED')
  ON CONFLICT (user_id, event_id) DO UPDATE SET status = 'APPLIED', updated_at = now()
  WHERE public.application_tracker.status = 'SAVED';

  RETURN v_row;
END;
$$;

-- Dipanggil SETELAH server mengunggah berkas ke Storage. Mengembalikan path
-- bukti lama supaya server bisa menghapus berkas yang tergantikan.
CREATE OR REPLACE FUNCTION public.submit_payment_proof(p_registration UUID, p_path TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row   public.event_registrations%ROWTYPE;
  v_title TEXT;
  v_mgr   UUID;
BEGIN
  SELECT * INTO v_row FROM public.event_registrations WHERE id = p_registration FOR UPDATE;
  IF NOT FOUND OR v_row.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.status NOT IN ('AWAITING_PAYMENT', 'PAYMENT_REVIEW') THEN
    RAISE EXCEPTION 'registration_invalid_transition' USING ERRCODE = 'P0001';
  END IF;
  IF p_path IS NULL OR p_path NOT LIKE p_registration::text || '/%' THEN
    RAISE EXCEPTION 'invalid_registration' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.event_registrations
  SET proof_path = p_path, proof_uploaded_at = now(), status = 'PAYMENT_REVIEW',
      review_note = NULL, updated_at = now()
  WHERE id = p_registration;

  SELECT left(title, 150) INTO v_title FROM public.events WHERE id = v_row.event_id;
  FOR v_mgr IN
    SELECT m.user_id FROM public.event_managers m
    JOIN public.organizer_profiles o ON o.user_id = m.user_id AND o.status = 'VERIFIED'
    WHERE m.event_id = v_row.event_id
  LOOP
    PERFORM public.notify_registration(v_mgr, v_row.event_id, 'PAYMENT_SUBMITTED',
      format('Ada bukti pembayaran baru untuk "%s". Periksa di daftar pendaftar.', v_title));
  END LOOP;

  RETURN v_row.proof_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_event_registration(p_registration UUID, p_decision TEXT, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row   public.event_registrations%ROWTYPE;
  v_note  TEXT := left(NULLIF(btrim(coalesce(p_note, '')), ''), 500);
  v_next  TEXT;
  v_title TEXT;
BEGIN
  SELECT * INTO v_row FROM public.event_registrations WHERE id = p_registration FOR UPDATE;
  -- Bukan pengelola = "tidak ada", bukan "dilarang": tidak membocorkan id.
  IF NOT FOUND OR NOT (public.manages_event(v_row.event_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF p_decision IN ('reject_payment', 'reject') AND v_note IS NULL THEN
    RAISE EXCEPTION 'review_note_required' USING ERRCODE = 'P0001';
  END IF;

  v_next := CASE
    WHEN p_decision = 'confirm' AND v_row.status IN ('AWAITING_PAYMENT', 'PAYMENT_REVIEW') THEN 'CONFIRMED'
    WHEN p_decision = 'reject_payment' AND v_row.status = 'PAYMENT_REVIEW' THEN 'AWAITING_PAYMENT'
    WHEN p_decision = 'reject' AND v_row.status IN ('AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED') THEN 'REJECTED'
  END;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'registration_invalid_transition' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.event_registrations
  SET status = v_next, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_registration;

  SELECT left(title, 150) INTO v_title FROM public.events WHERE id = v_row.event_id;
  PERFORM public.notify_registration(
    v_row.user_id, v_row.event_id,
    CASE v_next WHEN 'CONFIRMED' THEN 'REGISTRATION_CONFIRMED'
                WHEN 'REJECTED' THEN 'REGISTRATION_REJECTED'
                ELSE 'PAYMENT_REJECTED' END,
    CASE v_next WHEN 'CONFIRMED' THEN format('Pendaftaranmu di "%s" sudah dikonfirmasi panitia.', v_title)
                WHEN 'REJECTED' THEN format('Pendaftaranmu di "%s" tidak diterima panitia. Lihat catatannya di Pembayaran.', v_title)
                ELSE format('Bukti pembayaran "%s" perlu diunggah ulang. Lihat catatan panitia.', v_title) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_event_registration(p_registration UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.event_registrations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.event_registrations WHERE id = p_registration FOR UPDATE;
  IF NOT FOUND OR v_row.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.status NOT IN ('AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED') THEN
    RAISE EXCEPTION 'registration_invalid_transition' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.event_registrations SET status = 'CANCELLED', updated_at = now() WHERE id = p_registration;
END;
$$;

REVOKE ALL ON FUNCTION public.register_for_event(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_payment_proof(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_event_registration(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_event_registration(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_event(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_event_registration(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_event_registration(UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. event_photos — galeri acara
-- ---------------------------------------------------------------------
CREATE TABLE public.event_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE CHECK (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  width        INTEGER NOT NULL CHECK (width BETWEEN 1 AND 10000),
  height       INTEGER NOT NULL CHECK (height BETWEEN 1 AND 10000),
  caption      VARCHAR(140),
  uploaded_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Galeri per acara, terbaru dulu.
CREATE INDEX idx_event_photos_event ON public.event_photos (event_id, created_at DESC);

-- Batas 30 foto per acara. DEFINER + kunci per acara: hitungan harus
-- melihat semua baris, dan dua unggahan bersamaan tidak boleh sama-sama lolos.
CREATE OR REPLACE FUNCTION public.enforce_event_photo_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('photos:' || NEW.event_id::text, 0));
  IF (SELECT count(*) FROM public.event_photos WHERE event_id = NEW.event_id) >= 30 THEN
    RAISE EXCEPTION 'gallery_full' USING ERRCODE = 'P0001';
  END IF;
  NEW.uploaded_by := auth.uid();
  -- clock_timestamp, bukan now(): semua baris satu INSERT berbagi now() dan
  -- urutan galeri (created_at DESC) jadi acak di antara foto satu unggahan.
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_event_photo_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_event_photo_insert
  BEFORE INSERT ON public.event_photos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_photo_insert();

ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_photos_select_public ON public.event_photos
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status IN ('APPROVED', 'EXPIRED')));

CREATE POLICY event_photos_select_manager ON public.event_photos
  FOR SELECT TO authenticated
  USING (public.manages_event(event_id) OR (select public.is_admin()));

CREATE POLICY event_photos_insert ON public.event_photos
  FOR INSERT TO authenticated
  WITH CHECK (public.manages_event(event_id) OR (select public.is_admin()));

CREATE POLICY event_photos_delete ON public.event_photos
  FOR DELETE TO authenticated
  USING (public.manages_event(event_id) OR (select public.is_admin()));

REVOKE ALL ON public.event_photos FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, event_id, storage_path, content_type, width, height, caption, created_at)
  ON public.event_photos TO anon, authenticated;
GRANT INSERT (id, event_id, storage_path, content_type, width, height, caption) ON public.event_photos TO authenticated;
GRANT DELETE ON public.event_photos TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Bucket Storage privat (hanya bila schema `storage` Supabase ada —
--    database uji Postgres polos tidak memilikinya).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      ('event-photos', 'event-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
      ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;

COMMENT ON TABLE public.event_registrations IS
  'Pendaftar formulir internal (ADR-056). Tulis hanya lewat RPC register_for_event/submit_payment_proof/review_event_registration/cancel_event_registration.';
COMMENT ON TABLE public.event_photos IS
  'Galeri acara (ADR-056). Berkas di bucket privat event-photos, disajikan server lewat /media/foto/[id].';
