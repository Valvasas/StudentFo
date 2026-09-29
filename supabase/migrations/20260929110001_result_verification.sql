-- =====================================================================
-- Verifikasi hasil portofolio oleh penyelenggara (ADR-047).
--
--   * Pemilik portofolio yang MEMINTA — penyelenggara tidak pernah bisa
--     menelusuri siapa saja yang mendaftar acaranya. Yang ia lihat hanya
--     permintaan: nama, hasil yang diklaim, catatan, tautan bukti.
--   * Yang dikonfirmasi adalah isi saat itu. Hasil/catatan/bukti berubah
--     atau entri keluar dari portofolio → verifikasi gugur (trigger), kembali
--     "dilaporkan sendiri". Menolak = "tidak sesuai"; minta ulang hanya
--     setelah isinya diperbaiki (barisnya terhapus oleh trigger yang sama).
--   * Penyelenggara tidak bisa memverifikasi dirinya sendiri, dan
--     verifikasi dari penyelenggara yang dicabut (REVOKED) ikut gugur.
--   * Tabel tanpa akses klien sama sekali; semua lewat fungsi di bawah.
-- =====================================================================

CREATE TABLE public.portfolio_verifications (
  user_id      UUID NOT NULL,
  event_id     UUID NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING'
    CONSTRAINT portfolio_verifications_status_known CHECK (status IN ('PENDING', 'VERIFIED', 'DECLINED')),
  -- Presisi milidetik: nilai ini dipakai sebagai token versi oleh
  -- review_result_verification() dan harus selamat melewati Date di JS.
  requested_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
  reviewed_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  -- Nama lembaga saat mengonfirmasi; yang tampil di profil publik.
  org_name     VARCHAR(160),
  review_note  VARCHAR(300)
    CONSTRAINT portfolio_verifications_note_length
      CHECK (review_note IS NULL OR char_length(btrim(review_note)) BETWEEN 1 AND 300),
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (user_id, event_id)
    REFERENCES public.application_tracker (user_id, event_id) ON DELETE CASCADE,
  CONSTRAINT portfolio_verifications_review_consistent CHECK (
    (status = 'PENDING' AND reviewed_at IS NULL AND org_name IS NULL AND review_note IS NULL)
    OR (status <> 'PENDING' AND reviewed_at IS NOT NULL AND org_name IS NOT NULL)
  )
);

CREATE INDEX idx_portfolio_verifications_pending
  ON public.portfolio_verifications (event_id, requested_at) WHERE status = 'PENDING';
CREATE INDEX idx_portfolio_verifications_reviewer
  ON public.portfolio_verifications (reviewed_by) WHERE reviewed_by IS NOT NULL;

ALTER TABLE public.portfolio_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portfolio_verifications FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Verifikasi gugur saat isi yang dikonfirmasi berubah.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_portfolio_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.achievement IS DISTINCT FROM OLD.achievement
     OR NEW.achievement_note IS DISTINCT FROM OLD.achievement_note
     OR NEW.proof_url IS DISTINCT FROM OLD.proof_url
     OR NEW.status NOT IN ('APPLIED', 'INTERVIEW', 'ACCEPTED') THEN
    DELETE FROM public.portfolio_verifications WHERE user_id = NEW.user_id AND event_id = NEW.event_id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_portfolio_verification() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tracker_reset_verification
  AFTER UPDATE OF achievement, achievement_note, proof_url, status ON public.application_tracker
  FOR EACH ROW EXECUTE FUNCTION public.reset_portfolio_verification();

-- Keputusan dari penyelenggara yang DICABUT tidak lagi bisa dipercaya —
-- termasuk penolakan, supaya pemiliknya bisa minta ulang. Kembali ke
-- PENDING karena mengubah nama lembaga BUKAN tanda tidak jujur; kalau itu
-- ikut menggugurkan, satu salah ketik menghapus verifikasi semua peserta.
CREATE OR REPLACE FUNCTION public.drop_verifications_of_unverified_organizer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'REVOKED' AND OLD.status <> 'REVOKED' THEN
    DELETE FROM public.portfolio_verifications WHERE reviewed_by = NEW.user_id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.drop_verifications_of_unverified_organizer() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_organizer_drop_verifications
  AFTER UPDATE OF status ON public.organizer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.drop_verifications_of_unverified_organizer();

-- ---------------------------------------------------------------------
-- 2. Pemilik: minta, batalkan, lihat status.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_result_verification(p_event UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid         UUID := (select auth.uid());
  entry       RECORD;
  existing    TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT t.status, t.achievement, e.status AS event_status, e.title
  INTO entry
  FROM public.application_tracker t
  JOIN public.events e ON e.id = t.event_id
  WHERE t.user_id = uid AND t.event_id = p_event
  FOR UPDATE OF t;

  IF NOT FOUND
     OR entry.status NOT IN ('APPLIED', 'INTERVIEW', 'ACCEPTED')
     OR entry.achievement IS NULL
     OR entry.event_status NOT IN ('APPROVED', 'EXPIRED') THEN
    RAISE EXCEPTION 'verification_not_eligible' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_managers m
    JOIN public.organizer_profiles o ON o.user_id = m.user_id AND o.status = 'VERIFIED'
    WHERE m.event_id = p_event AND m.user_id <> uid
  ) THEN
    RAISE EXCEPTION 'verification_unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO existing FROM public.portfolio_verifications WHERE user_id = uid AND event_id = p_event;
  IF existing = 'DECLINED' THEN
    RAISE EXCEPTION 'verification_declined' USING ERRCODE = 'P0001';
  ELSIF existing IS NOT NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.portfolio_verifications (user_id, event_id) VALUES (uid, p_event);

  -- Satu notifikasi per penyelenggara per acara, disegarkan (bukan
  -- ditumpuk) setiap ada permintaan baru.
  INSERT INTO public.notifications (user_id, event_id, type, message)
  SELECT m.user_id, p_event, 'VERIFICATION_REQUESTED',
         format('Ada permintaan konfirmasi hasil untuk "%s".', left(entry.title, 150))
  FROM public.event_managers m
  JOIN public.organizer_profiles o ON o.user_id = m.user_id AND o.status = 'VERIFIED'
  WHERE m.event_id = p_event AND m.user_id <> uid
  ON CONFLICT (user_id, event_id, type) WHERE event_id IS NOT NULL
  DO UPDATE SET message = EXCLUDED.message, is_read = false, sent_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_result_verification(p_event UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.portfolio_verifications
  WHERE user_id = (select auth.uid()) AND event_id = p_event AND status = 'PENDING';
$$;

CREATE OR REPLACE FUNCTION public.my_result_verifications()
RETURNS TABLE (
  event_id     UUID,
  status       TEXT,
  org_name     TEXT,
  review_note  TEXT,
  requested_at TIMESTAMPTZ,
  reviewed_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.event_id, v.status, v.org_name::TEXT, v.review_note::TEXT, v.requested_at, v.reviewed_at
  FROM public.portfolio_verifications v
  WHERE v.user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 3. Penyelenggara: kotak masuk & keputusan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organizer_pending_verifications()
RETURNS TABLE (
  user_id          UUID,
  full_name        TEXT,
  education_level  education_level,
  major            TEXT,
  event_id         UUID,
  slug             TEXT,
  title            TEXT,
  event_type       event_type,
  achievement      TEXT,
  achievement_note TEXT,
  proof_url        TEXT,
  requested_at     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.id, u.full_name::TEXT, u.education_level, u.major::TEXT,
    e.id, e.slug::TEXT, e.title::TEXT, e.event_type,
    t.achievement::TEXT, t.achievement_note::TEXT, t.proof_url::TEXT,
    v.requested_at
  FROM public.portfolio_verifications v
  JOIN public.event_managers m ON m.event_id = v.event_id AND m.user_id = (select auth.uid())
  JOIN public.organizer_profiles o ON o.user_id = m.user_id AND o.status = 'VERIFIED'
  JOIN public.application_tracker t ON t.user_id = v.user_id AND t.event_id = v.event_id
  JOIN public.events e ON e.id = v.event_id
  JOIN public.users u ON u.id = v.user_id
  WHERE v.status = 'PENDING' AND v.user_id <> (select auth.uid())
  ORDER BY v.requested_at
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.review_result_verification(
  p_user UUID, p_event UUID, p_requested_at TIMESTAMPTZ, p_decision TEXT, p_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid   UUID := (select auth.uid());
  org   TEXT;
  title TEXT;
BEGIN
  IF NOT public.manages_event(p_event) THEN
    RAISE EXCEPTION 'not_event_manager' USING ERRCODE = '42501';
  END IF;
  IF p_user = uid THEN
    RAISE EXCEPTION 'verification_self' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('VERIFIED', 'DECLINED') THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;

  SELECT o.org_name INTO org FROM public.organizer_profiles o WHERE o.user_id = uid;

  -- requested_at = token versi: kalau pemilik mengubah hasil lalu meminta
  -- ulang sementara halaman penyelenggara masih terbuka, keputusan untuk
  -- isi LAMA tidak boleh menempel pada isi BARU.
  UPDATE public.portfolio_verifications
  SET status      = p_decision,
      reviewed_by = uid,
      reviewed_at = now(),
      org_name    = left(org, 160),
      review_note = CASE WHEN p_decision = 'DECLINED' THEN left(NULLIF(btrim(p_note), ''), 300) END
  WHERE user_id = p_user AND event_id = p_event AND status = 'PENDING' AND requested_at = p_requested_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verification_not_pending' USING ERRCODE = 'P0001';
  END IF;

  SELECT left(e.title, 150) INTO title FROM public.events e WHERE e.id = p_event;
  INSERT INTO public.notifications (user_id, event_id, type, message)
  VALUES (
    p_user, p_event, 'RESULT_' || p_decision,
    CASE WHEN p_decision = 'VERIFIED'
      THEN format('%s mengonfirmasi hasilmu di "%s". Kini tampil terverifikasi di portofoliomu.', left(org, 120), title)
      ELSE format('%s belum bisa mengonfirmasi hasilmu di "%s". Lihat alasannya, perbaiki, lalu minta lagi.', left(org, 120), title)
    END
  )
  ON CONFLICT (user_id, event_id, type) WHERE event_id IS NOT NULL
  DO UPDATE SET message = EXCLUDED.message, is_read = false, sent_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.request_result_verification(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_result_verification(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_result_verifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.organizer_pending_verifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_result_verification(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_result_verification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_result_verification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_result_verifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.organizer_pending_verifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_result_verification(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Portofolio publik kini membawa nama lembaga yang mengonfirmasi.
--    Tipe kembalian berubah → DROP + CREATE (bukan REPLACE).
-- ---------------------------------------------------------------------
DROP FUNCTION public.public_portfolio(UUID);
CREATE FUNCTION public.public_portfolio(p_user UUID)
RETURNS TABLE (
  event_id         UUID,
  slug             TEXT,
  title            TEXT,
  organizer        TEXT,
  event_type       event_type,
  tracker_status   tracker_status,
  achievement      TEXT,
  achievement_note TEXT,
  proof_url        TEXT,
  deadline_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ,
  verified_by      TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id,
    e.slug::TEXT,
    e.title::TEXT,
    e.organizer::TEXT,
    e.event_type,
    t.status,
    t.achievement::TEXT,
    t.achievement_note::TEXT,
    t.proof_url::TEXT,
    d.deadline_at,
    t.updated_at,
    v.org_name::TEXT
  FROM public.application_tracker t
  JOIN public.events e ON e.id = t.event_id
  LEFT JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
  LEFT JOIN public.portfolio_verifications v
    ON v.user_id = t.user_id AND v.event_id = t.event_id AND v.status = 'VERIFIED'
  WHERE t.user_id = p_user
    AND public.can_view_profile(p_user)
    AND t.status IN ('APPLIED', 'INTERVIEW', 'ACCEPTED')
    AND e.status IN ('APPROVED', 'EXPIRED')
    AND COALESCE(t.portfolio_visible, public.portfolio_default_visible(e.event_type))
  ORDER BY COALESCE(d.deadline_at, t.updated_at) DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.public_portfolio(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_portfolio(UUID) TO authenticated;

COMMENT ON FUNCTION public.public_portfolio(UUID) IS
  'Portofolio yang boleh dilihat pemanggil (ADR-046/047): APPLIED+ pada acara tayang/selesai, visibilitas per entri, aturan kelihatan = jaringan. verified_by = lembaga yang mengonfirmasi hasil; NULL = dilaporkan sendiri.';
COMMENT ON TABLE public.portfolio_verifications IS
  'Permintaan & keputusan konfirmasi hasil portofolio oleh penyelenggara (ADR-047). Tanpa akses klien; gugur saat isi berubah atau penyelenggara tidak lagi terverifikasi.';
