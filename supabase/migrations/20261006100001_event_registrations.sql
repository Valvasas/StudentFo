-- =====================================================================
-- StudentFo — Pendaftaran langsung di dalam aplikasi (ADR-055).
--
-- Penyelenggara TERVERIFIKASI yang mengelola acara (manages_event) bisa
-- membuka formulir pendaftaran di StudentFo, sebagai pengganti atau
-- pendamping tautan pendaftaran luar. Aturannya kembaran SQL dari
-- src/lib/registration.ts — ubah keduanya bersamaan.
--
-- Prinsip:
--   1. Klien TIDAK punya hak tulis ke kedua tabel. Semua perubahan lewat RPC
--      SECURITY DEFINER yang memeriksa pemanggil sendiri (auth.uid()).
--   2. Kuota ditegakkan di bawah kunci baris formulir (SELECT … FOR UPDATE):
--      dua orang yang menekan "Kirim" bersamaan untuk kursi terakhir
--      diserialkan — yang kedua masuk daftar tunggu, bukan sama-sama dapat.
--   3. Daftar tunggu FIFO (created_at, id). Kursi yang lepas (batal, ditolak,
--      kuota naik) langsung diberikan ke antrean di transaksi yang sama.
--   4. Label pertanyaan & data diri DISALIN ke baris pendaftaran: yang dilihat
--      penyelenggara adalah yang dikirim peserta, bukan profil terkini.
--   5. Formulir tidak boleh meminta data sensitif (kata sandi, OTP, NIK/KTP,
--      rekening) — diperiksa ulang di sini, bukan hanya di aplikasi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Formulir — satu per acara
-- ---------------------------------------------------------------------
CREATE TABLE public.event_registration_forms (
  event_id          UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  status            VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  review_mode       VARCHAR(10) NOT NULL DEFAULT 'AUTO' CHECK (review_mode IN ('AUTO', 'MANUAL')),
  capacity          INT CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 10000),
  waitlist          BOOLEAN NOT NULL DEFAULT TRUE,
  team_min          SMALLINT CHECK (team_min BETWEEN 1 AND 10),
  team_max          SMALLINT CHECK (team_max BETWEEN 1 AND 10),
  questions         JSONB NOT NULL DEFAULT '[]'::JSONB
                    CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) <= 6),
  intro             VARCHAR(400),
  confirmation_note VARCHAR(600),
  opened_at         TIMESTAMPTZ,
  created_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT registration_team_size CHECK ((team_min IS NULL) = (team_max IS NULL) AND (team_min IS NULL OR team_min <= team_max))
);

CREATE TRIGGER trg_event_registration_forms_touch
  BEFORE UPDATE ON public.event_registration_forms
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.event_registration_forms ENABLE ROW LEVEL SECURITY;

-- Dua policy terpisah: is_admin()/manages_event() sengaja TIDAK bisa
-- dieksekusi anon (20260923100001), jadi memanggilnya di policy tamu =
-- "permission denied" untuk SETIAP tamu yang membuka halaman acara.
CREATE POLICY registration_forms_select_anon ON public.event_registration_forms
  FOR SELECT TO anon
  USING (status <> 'DRAFT');
CREATE POLICY registration_forms_select_auth ON public.event_registration_forms
  FOR SELECT TO authenticated
  USING (status <> 'DRAFT' OR (select public.manages_event(event_id)) OR (select public.is_admin()));

REVOKE ALL ON public.event_registration_forms FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_registration_forms TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Pendaftaran — satu baris per (acara, orang); daftar ulang memakai baris lama
-- ---------------------------------------------------------------------
CREATE TABLE public.event_registrations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Alfabet tanpa 0/O/1/I/L — sama dengan TICKET_ALPHABET di aplikasi.
  code           CHAR(8) NOT NULL UNIQUE CHECK (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
  status         VARCHAR(10) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'WAITLISTED', 'REJECTED', 'CANCELLED')),
  full_name      VARCHAR(255) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  phone          VARCHAR(16) NOT NULL CHECK (phone ~ '^\+628[0-9]{8,12}$'),
  institution    VARCHAR(120) NOT NULL CHECK (char_length(btrim(institution)) BETWEEN 2 AND 120),
  major          VARCHAR(100),
  education_level education_level NOT NULL,
  answers        JSONB NOT NULL DEFAULT '[]'::JSONB
                 CHECK (jsonb_typeof(answers) = 'array' AND jsonb_array_length(answers) <= 6),
  team_id        UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  team_title     VARCHAR(255),
  team_members   TEXT[],
  decision_note  VARCHAR(300),
  consent_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ,
  cancelled_at   TIMESTAMPTZ,
  UNIQUE (event_id, user_id)
);

-- Antrean FIFO dibaca setiap kali kursi lepas; parsial supaya kecil.
CREATE INDEX idx_event_registrations_waitlist ON public.event_registrations (event_id, created_at, id) WHERE status = 'WAITLISTED';
-- Daftar pendaftar di studio (terbaru dulu) & statistik harian per acara.
CREATE INDEX idx_event_registrations_event_created ON public.event_registrations (event_id, created_at DESC);

CREATE TRIGGER trg_event_registrations_touch
  BEFORE UPDATE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_registrations_select ON public.event_registrations
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR (select public.manages_event(event_id)) OR (select public.is_admin()));

REVOKE ALL ON public.event_registrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_registrations TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Pembantu
-- ---------------------------------------------------------------------

-- Pola yang sama dengan SENSITIVE_ASK di lib/registration.ts (\y = batas kata Postgres).
CREATE OR REPLACE FUNCTION public.registration_text_is_sensitive(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(p_text, '') ~* '(kata\s*sandi|password|\ypin\y|\yotp\y|kode\s*(verifikasi|otp|keamanan)|\ycvv\y|nomor\s*kartu|kartu\s*kredit|rekening|\yno\.?\s*rek\y|\ynik\y|\yktp\y|kartu\s*keluarga|nomor\s*induk\s*kependudukan|nama\s*ibu\s*kandung)';
$$;

-- Tenggat utama sudah lewat menurut hari kalender WIB (sama dengan daysUntil < 0).
CREATE OR REPLACE FUNCTION public.event_deadline_passed(p_event UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT (d.deadline_at AT TIME ZONE 'Asia/Jakarta')::DATE < (now() AT TIME ZONE 'Asia/Jakarta')::DATE
    FROM public.event_deadlines d
    WHERE d.event_id = p_event AND d.is_primary
  ), FALSE);
$$;

-- Notifikasi keputusan: satu per (orang, acara, jenis) — keputusan terbaru menimpa yang lama.
CREATE OR REPLACE FUNCTION public.notify_registration(p_user UUID, p_event UUID, p_type TEXT, p_message TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.notifications (user_id, event_id, type, message)
  VALUES (p_user, p_event, p_type, p_message)
  ON CONFLICT (user_id, event_id, type) WHERE event_id IS NOT NULL
  DO UPDATE SET message = EXCLUDED.message, is_read = FALSE, sent_at = now();
$$;

-- Kursi lowong → antrean FIFO naik. Dipanggil HANYA dari RPC lain yang
-- sudah memegang kunci baris formulir; tidak pernah dari klien.
CREATE OR REPLACE FUNCTION public.promote_event_waitlist(p_event UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f public.event_registration_forms;
  v_title TEXT;
  v_free INT;
  v_next TEXT;
  r RECORD;
  promoted INT := 0;
BEGIN
  SELECT * INTO f FROM public.event_registration_forms WHERE event_id = p_event;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT title INTO v_title FROM public.events WHERE id = p_event;
  v_next := CASE f.review_mode WHEN 'AUTO' THEN 'CONFIRMED' ELSE 'PENDING' END;
  IF f.capacity IS NOT NULL THEN
    SELECT GREATEST(f.capacity - count(*), 0)::INT INTO v_free
    FROM public.event_registrations WHERE event_id = p_event AND status IN ('PENDING', 'CONFIRMED');
  END IF;

  -- LIMIT NULL = tanpa batas (kuota dihapus → seluruh antrean naik).
  FOR r IN
    SELECT id, user_id FROM public.event_registrations
    WHERE event_id = p_event AND status = 'WAITLISTED'
    ORDER BY created_at, id
    LIMIT v_free
    FOR UPDATE
  LOOP
    UPDATE public.event_registrations SET status = v_next WHERE id = r.id;
    PERFORM public.notify_registration(
      r.user_id, p_event, 'REGISTRATION_PROMOTED',
      CASE v_next
        WHEN 'CONFIRMED' THEN format('Ada kursi kosong di "%s" — kamu naik dari daftar tunggu dan kini terdaftar.', v_title)
        ELSE format('Ada kursi kosong di "%s" — pendaftaranmu naik dari daftar tunggu dan sedang ditinjau penyelenggara.', v_title)
      END
    );
    promoted := promoted + 1;
  END LOOP;
  RETURN promoted;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Peserta
-- ---------------------------------------------------------------------

-- Hitungan kursi untuk publik — angka saja, tanpa data orang.
CREATE OR REPLACE FUNCTION public.registration_seats(p_events UUID[])
RETURNS TABLE (event_id UUID, capacity INT, taken INT, waitlisted INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT f.event_id, f.capacity,
         count(r.id) FILTER (WHERE r.status IN ('PENDING', 'CONFIRMED'))::INT,
         count(r.id) FILTER (WHERE r.status = 'WAITLISTED')::INT
  FROM public.event_registration_forms f
  LEFT JOIN public.event_registrations r ON r.event_id = f.event_id
  WHERE f.event_id = ANY (p_events[1:200]) AND f.status <> 'DRAFT'
  GROUP BY f.event_id, f.capacity;
$$;

CREATE OR REPLACE FUNCTION public.submit_event_registration(
  p_event UUID,
  p_phone TEXT,
  p_institution TEXT,
  p_major TEXT,
  p_level education_level,
  p_answers JSONB,
  p_team UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  f public.event_registration_forms;
  e RECORD;
  existing public.event_registrations;
  u RECORD;
  q JSONB;
  v_value TEXT;
  v_answers JSONB := '[]'::JSONB;
  v_taken INT;
  v_status TEXT;
  v_team_title TEXT;
  v_team_members TEXT[];
  v_team_count INT;
  v_code TEXT;
  v_id UUID;
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'registration_closed' USING ERRCODE = '42501'; END IF;

  -- Kunci formulir dulu: semua pemeriksaan kuota di bawah terjadi berurutan.
  SELECT * INTO f FROM public.event_registration_forms WHERE event_id = p_event FOR UPDATE;
  SELECT id, status, education_levels INTO e FROM public.events WHERE id = p_event;
  IF NOT FOUND OR f.event_id IS NULL OR f.status <> 'OPEN' OR e.status <> 'APPROVED' OR public.event_deadline_passed(p_event) THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;
  IF cardinality(e.education_levels) > 0 AND NOT ('UMUM' = ANY (e.education_levels) OR p_level = ANY (e.education_levels)) THEN
    RAISE EXCEPTION 'registration_not_eligible' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO existing FROM public.event_registrations WHERE event_id = p_event AND user_id = uid FOR UPDATE;
  IF existing.id IS NOT NULL AND existing.status IN ('PENDING', 'CONFIRMED', 'WAITLISTED') THEN
    RAISE EXCEPTION 'registration_exists' USING ERRCODE = 'P0001';
  END IF;
  IF existing.status = 'REJECTED' THEN
    RAISE EXCEPTION 'registration_rejected_before' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.consume_rate_limit('registration:' || uid::TEXT, 10, 3600) THEN
    RAISE EXCEPTION 'registration_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  -- Jawaban: hanya untuk pertanyaan yang ADA di formulir saat ini; label
  -- diambil dari formulir, bukan dari klien.
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN p_answers := '[]'::JSONB; END IF;
  FOR q IN SELECT * FROM jsonb_array_elements(f.questions) LOOP
    SELECT btrim(a ->> 'value') INTO v_value
    FROM jsonb_array_elements(p_answers) AS a
    WHERE a ->> 'questionId' = q ->> 'id'
    LIMIT 1;
    v_value := NULLIF(v_value, '');
    IF v_value IS NULL THEN
      IF (q ->> 'required')::BOOLEAN THEN RAISE EXCEPTION 'invalid_registration' USING ERRCODE = 'P0001'; END IF;
      CONTINUE;
    END IF;
    IF (q ->> 'kind' = 'SHORT' AND char_length(v_value) > 200)
       OR (q ->> 'kind' = 'LONG' AND char_length(v_value) > 1000)
       OR (q ->> 'kind' = 'URL' AND (v_value !~* '^https://[^\s]+$' OR char_length(v_value) > 500))
       OR (q ->> 'kind' = 'CHOICE' AND NOT (q -> 'options') ? v_value) THEN
      RAISE EXCEPTION 'invalid_registration' USING ERRCODE = 'P0001';
    END IF;
    v_answers := v_answers || jsonb_build_array(jsonb_build_object('questionId', q ->> 'id', 'label', q ->> 'label', 'value', v_value));
  END LOOP;

  IF f.team_min IS NOT NULL THEN
    SELECT t.title, array_agg(p.full_name ORDER BY (m.role = 'leader') DESC, m.joined_at), count(*)
    INTO v_team_title, v_team_members, v_team_count
    FROM public.teams t
    JOIN public.team_members m ON m.team_id = t.id
    JOIN public.users p ON p.id = m.user_id
    WHERE t.id = p_team AND t.event_id = p_event
      AND EXISTS (SELECT 1 FROM public.team_members l WHERE l.team_id = t.id AND l.user_id = uid AND l.role = 'leader')
    GROUP BY t.title;
    IF v_team_title IS NULL OR v_team_count NOT BETWEEN f.team_min AND f.team_max THEN
      RAISE EXCEPTION 'registration_team_invalid' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    p_team := NULL;
  END IF;

  SELECT count(*)::INT INTO v_taken FROM public.event_registrations WHERE event_id = p_event AND status IN ('PENDING', 'CONFIRMED');
  IF f.capacity IS NULL OR v_taken < f.capacity THEN
    v_status := CASE f.review_mode WHEN 'AUTO' THEN 'CONFIRMED' ELSE 'PENDING' END;
  ELSIF f.waitlist THEN
    v_status := 'WAITLISTED';
  ELSE
    RAISE EXCEPTION 'registration_full' USING ERRCODE = 'P0001';
  END IF;

  SELECT full_name, email INTO u FROM public.users WHERE id = uid;

  IF existing.id IS NOT NULL THEN
    -- Daftar ulang setelah membatalkan: kode tiket sama, antre dari belakang.
    UPDATE public.event_registrations SET
      status = v_status, full_name = u.full_name, email = u.email, phone = p_phone,
      institution = btrim(p_institution), major = NULLIF(btrim(p_major), ''), education_level = p_level,
      answers = v_answers, team_id = p_team, team_title = v_team_title, team_members = v_team_members,
      decision_note = NULL, consent_at = now(), created_at = now(), decided_at = NULL, cancelled_at = NULL
    WHERE id = existing.id;
    v_id := existing.id;
  ELSE
    FOR attempt IN 1..5 LOOP
      v_code := '';
      FOR i IN 1..8 LOOP
        v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::INT, 1);
      END LOOP;
      BEGIN
        INSERT INTO public.event_registrations (
          event_id, user_id, code, status, full_name, email, phone, institution, major, education_level,
          answers, team_id, team_title, team_members, consent_at
        ) VALUES (
          p_event, uid, v_code, v_status, u.full_name, u.email, p_phone, btrim(p_institution), NULLIF(btrim(p_major), ''), p_level,
          v_answers, p_team, v_team_title, v_team_members, now()
        ) RETURNING id INTO v_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Bentrok kode (1 : 31^8) — coba kode lain. Bentrok (event, user) tidak
        -- mungkin: baris itu sudah dikunci di atas.
        IF attempt = 5 THEN RAISE; END IF;
      END;
    END LOOP;
  END IF;

  -- Pelacak naik ke "Sudah daftar", tidak pernah turun dari tahap yang lebih jauh.
  INSERT INTO public.application_tracker (user_id, event_id, status) VALUES (uid, p_event, 'APPLIED')
  ON CONFLICT (user_id, event_id) DO UPDATE SET status = 'APPLIED', updated_at = now()
  WHERE public.application_tracker.status = 'SAVED';

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_event_registration(p_event UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.event_registration_forms WHERE event_id = p_event FOR UPDATE;
  UPDATE public.event_registrations SET status = 'CANCELLED', cancelled_at = now()
  WHERE event_id = p_event AND user_id = auth.uid() AND status IN ('PENDING', 'CONFIRMED', 'WAITLISTED');
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.promote_event_waitlist(p_event);
END;
$$;

-- Posisi antrean pemanggil sendiri. RLS hanya memperlihatkan baris
-- miliknya, jadi peserta tidak bisa menghitung orang di depannya sendiri —
-- yang keluar hanya satu angka, tanpa data orang lain. 0 = tidak mengantre.
CREATE OR REPLACE FUNCTION public.my_waitlist_position(p_event UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(w.id)::INT
  FROM public.event_registrations me
  JOIN public.event_registrations w
    ON w.event_id = me.event_id AND w.status = 'WAITLISTED' AND (w.created_at, w.id) <= (me.created_at, me.id)
  WHERE me.event_id = p_event AND me.user_id = auth.uid() AND me.status = 'WAITLISTED';
$$;

-- ---------------------------------------------------------------------
-- 5. Studio penyelenggara
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_registration_form(
  p_event UUID,
  p_review_mode TEXT,
  p_capacity INT,
  p_waitlist BOOLEAN,
  p_team_min INT,
  p_team_max INT,
  p_questions JSONB,
  p_intro TEXT,
  p_confirmation TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  q JSONB;
  ids TEXT[] := '{}';
BEGIN
  IF NOT public.manages_event(p_event) THEN RAISE EXCEPTION 'not_event_manager' USING ERRCODE = '42501'; END IF;
  IF NOT public.consume_rate_limit('registration_form:' || auth.uid()::TEXT, 60, 3600) THEN
    RAISE EXCEPTION 'organizer_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' OR jsonb_array_length(p_questions) > 6 THEN
    RAISE EXCEPTION 'invalid_registration_form' USING ERRCODE = 'P0001';
  END IF;
  FOR q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    IF jsonb_typeof(q) <> 'object'
       OR NOT (q ->> 'id' ~ '^q[1-6]$') OR (q ->> 'id') = ANY (ids)
       OR char_length(btrim(COALESCE(q ->> 'label', ''))) NOT BETWEEN 3 AND 160
       OR COALESCE(q ->> 'kind', '') NOT IN ('SHORT', 'LONG', 'CHOICE', 'URL')
       OR jsonb_typeof(q -> 'required') <> 'boolean'
       OR jsonb_typeof(q -> 'options') <> 'array'
       OR jsonb_array_length(q -> 'options') > 8
       OR (q ->> 'kind' = 'CHOICE' AND jsonb_array_length(q -> 'options') < 2)
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(q -> 'options') AS o
         WHERE jsonb_typeof(o) <> 'string' OR char_length(o #>> '{}') NOT BETWEEN 1 AND 80 OR public.registration_text_is_sensitive(o #>> '{}')
       )
       OR public.registration_text_is_sensitive(q ->> 'label') THEN
      RAISE EXCEPTION 'invalid_registration_form' USING ERRCODE = 'P0001';
    END IF;
    ids := ids || (q ->> 'id');
  END LOOP;
  IF public.registration_text_is_sensitive(p_intro) OR public.registration_text_is_sensitive(p_confirmation) THEN
    RAISE EXCEPTION 'invalid_registration_form' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.event_registration_forms AS f (
    event_id, review_mode, capacity, waitlist, team_min, team_max, questions, intro, confirmation_note, created_by
  ) VALUES (
    p_event, p_review_mode, p_capacity, p_waitlist, p_team_min, p_team_max, p_questions,
    NULLIF(btrim(p_intro), ''), NULLIF(btrim(p_confirmation), ''), auth.uid()
  )
  ON CONFLICT (event_id) DO UPDATE SET
    review_mode = EXCLUDED.review_mode, capacity = EXCLUDED.capacity, waitlist = EXCLUDED.waitlist,
    team_min = EXCLUDED.team_min, team_max = EXCLUDED.team_max, questions = EXCLUDED.questions,
    intro = EXCLUDED.intro, confirmation_note = EXCLUDED.confirmation_note;

  -- Kunci, lalu berikan kursi tambahan (kuota naik / dihapus) ke antrean.
  PERFORM 1 FROM public.event_registration_forms WHERE event_id = p_event FOR UPDATE;
  PERFORM public.promote_event_waitlist(p_event);
EXCEPTION
  WHEN check_violation THEN RAISE EXCEPTION 'invalid_registration_form' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_registration_form_status(p_event UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_status event_status;
BEGIN
  IF NOT public.manages_event(p_event) THEN RAISE EXCEPTION 'not_event_manager' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('OPEN', 'CLOSED') THEN RAISE EXCEPTION 'invalid_registration_form' USING ERRCODE = 'P0001'; END IF;
  SELECT status INTO v_event_status FROM public.events WHERE id = p_event;
  IF p_status = 'OPEN' AND (v_event_status IS DISTINCT FROM 'APPROVED' OR public.event_deadline_passed(p_event)) THEN
    RAISE EXCEPTION 'registration_form_unavailable' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.event_registration_forms
  SET status = p_status, opened_at = CASE WHEN p_status = 'OPEN' THEN COALESCE(opened_at, now()) ELSE opened_at END
  WHERE event_id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_form_unavailable' USING ERRCODE = 'P0001'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_event_registration(p_registration UUID, p_decision TEXT, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event UUID;
  f public.event_registration_forms;
  r public.event_registrations;
  v_title TEXT;
  v_taken INT;
  v_has_seat BOOLEAN;
  v_next TEXT;
BEGIN
  SELECT event_id INTO v_event FROM public.event_registrations WHERE id = p_registration;
  -- Bukan pengelola = "tidak ditemukan": tidak membocorkan bahwa id itu ada.
  IF v_event IS NULL OR NOT public.manages_event(v_event) THEN
    RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO f FROM public.event_registration_forms WHERE event_id = v_event FOR UPDATE;
  SELECT * INTO r FROM public.event_registrations WHERE id = p_registration FOR UPDATE;
  SELECT title INTO v_title FROM public.events WHERE id = v_event;
  SELECT count(*)::INT INTO v_taken FROM public.event_registrations WHERE event_id = v_event AND status IN ('PENDING', 'CONFIRMED');
  v_has_seat := f.capacity IS NULL OR v_taken < f.capacity;

  v_next := CASE
    WHEN p_decision = 'CONFIRM' AND r.status = 'PENDING' THEN 'CONFIRMED'
    WHEN p_decision = 'CONFIRM' AND r.status = 'WAITLISTED' AND v_has_seat THEN 'CONFIRMED'
    WHEN p_decision = 'REJECT' AND r.status IN ('PENDING', 'CONFIRMED', 'WAITLISTED') THEN 'REJECTED'
    WHEN p_decision = 'REOPEN' AND r.status = 'REJECTED' AND v_has_seat THEN CASE f.review_mode WHEN 'AUTO' THEN 'CONFIRMED' ELSE 'PENDING' END
    WHEN p_decision = 'REOPEN' AND r.status = 'REJECTED' AND f.waitlist THEN 'WAITLISTED'
  END;
  IF v_next IS NULL THEN RAISE EXCEPTION 'registration_invalid_transition' USING ERRCODE = 'P0001'; END IF;

  UPDATE public.event_registrations
  SET status = v_next, decided_at = now(),
      decision_note = CASE WHEN v_next = 'REJECTED' THEN NULLIF(left(btrim(COALESCE(p_note, '')), 300), '') END
  WHERE id = r.id;

  IF v_next = 'CONFIRMED' THEN
    PERFORM public.notify_registration(r.user_id, v_event, 'REGISTRATION_CONFIRMED',
      format('Pendaftaranmu di "%s" dikonfirmasi penyelenggara. Tiketmu sudah aktif.', v_title));
  ELSIF v_next = 'REJECTED' THEN
    PERFORM public.notify_registration(r.user_id, v_event, 'REGISTRATION_REJECTED',
      format('Pendaftaranmu di "%s" belum bisa diterima penyelenggara.%s', v_title,
             COALESCE(' Catatan: ' || NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''), '')));
  END IF;
  IF r.status IN ('PENDING', 'CONFIRMED') AND v_next NOT IN ('PENDING', 'CONFIRMED') THEN
    PERFORM public.promote_event_waitlist(v_event);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.registration_stats(p_event UUID, p_days INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  span INT := LEAST(GREATEST(COALESCE(p_days, 30), 7), 90);
  today DATE := (now() AT TIME ZONE 'Asia/Jakarta')::DATE;
  first_day DATE;
  result JSONB;
BEGIN
  IF NOT (public.manages_event(p_event) OR public.is_admin()) THEN
    RAISE EXCEPTION 'analytics_forbidden' USING ERRCODE = '42501';
  END IF;
  first_day := today - (span - 1);

  WITH days AS (
    SELECT d::DATE AS day FROM generate_series(first_day, today, INTERVAL '1 day') AS d
  ),
  regs AS (
    SELECT * FROM public.event_registrations WHERE event_id = p_event
  ),
  submitted AS (
    SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::DATE AS day, count(*)::INT AS n FROM regs GROUP BY 1
  ),
  cancelled AS (
    SELECT (COALESCE(cancelled_at, created_at) AT TIME ZONE 'Asia/Jakarta')::DATE AS day, count(*)::INT AS n
    FROM regs WHERE status = 'CANCELLED' GROUP BY 1
  ),
  active AS (
    SELECT * FROM regs WHERE status IN ('PENDING', 'CONFIRMED', 'WAITLISTED')
  )
  SELECT jsonb_build_object(
    'days', span,
    'series', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d.day, 'submitted', COALESCE(s.n, 0), 'cancelled', COALESCE(c.n, 0)) ORDER BY d.day), '[]'::JSONB)
      FROM days d LEFT JOIN submitted s ON s.day = d.day LEFT JOIN cancelled c ON c.day = d.day
    ),
    'byStatus', (
      SELECT jsonb_build_object(
        'PENDING', count(*) FILTER (WHERE status = 'PENDING'),
        'CONFIRMED', count(*) FILTER (WHERE status = 'CONFIRMED'),
        'WAITLISTED', count(*) FILTER (WHERE status = 'WAITLISTED'),
        'REJECTED', count(*) FILTER (WHERE status = 'REJECTED'),
        'CANCELLED', count(*) FILTER (WHERE status = 'CANCELLED'))
      FROM regs
    ),
    'capacity', (SELECT capacity FROM public.event_registration_forms WHERE event_id = p_event),
    'visitors', (SELECT COALESCE(sum(visitors), 0) FROM public.event_daily_stats WHERE event_id = p_event AND day >= first_day),
    'levels', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC, label), '[]'::JSONB)
      FROM (SELECT education_level::TEXT AS label, count(*)::INT AS n FROM active GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 6) t
    ),
    'institutions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC, label), '[]'::JSONB)
      FROM (SELECT institution AS label, count(*)::INT AS n FROM active GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 6) t
    ),
    'medianDecisionHours', (
      SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM decided_at - created_at) / 3600))::NUMERIC, 1)
      FROM regs WHERE decided_at IS NOT NULL AND status IN ('CONFIRMED', 'REJECTED')
    )
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.registration_summaries(p_events UUID[])
RETURNS TABLE (event_id UUID, status TEXT, capacity INT, taken INT, waitlisted INT, pending INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT f.event_id, f.status::TEXT, f.capacity,
         count(r.id) FILTER (WHERE r.status IN ('PENDING', 'CONFIRMED'))::INT,
         count(r.id) FILTER (WHERE r.status = 'WAITLISTED')::INT,
         count(r.id) FILTER (WHERE r.status = 'PENDING')::INT
  FROM public.event_registration_forms f
  LEFT JOIN public.event_registrations r ON r.event_id = f.event_id
  WHERE f.event_id = ANY (p_events[1:200]) AND public.manages_event(f.event_id)
  GROUP BY f.event_id, f.status, f.capacity;
$$;

-- ---------------------------------------------------------------------
-- 6. Hak eksekusi — REVOKE dari anon & authenticated, bukan hanya PUBLIC (ADR-020)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.registration_text_is_sensitive(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.event_deadline_passed(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_registration(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_event_waitlist(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registration_seats(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_event_registration(UUID, TEXT, TEXT, TEXT, education_level, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_event_registration(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_waitlist_position(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_registration_form(UUID, TEXT, INT, BOOLEAN, INT, INT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_registration_form_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_event_registration(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registration_stats(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registration_summaries(UUID[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registration_seats(UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_event_registration(UUID, TEXT, TEXT, TEXT, education_level, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_event_registration(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_waitlist_position(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_registration_form(UUID, TEXT, INT, BOOLEAN, INT, INT, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_registration_form_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_event_registration(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registration_stats(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registration_summaries(UUID[]) TO authenticated;
