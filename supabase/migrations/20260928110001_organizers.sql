-- =====================================================================
-- StudentFo — Penyelenggara terverifikasi, klaim acara, dan permintaan
-- perubahan (ADR-042).
--
-- Prinsip (keputusan pemilik produk): kepercayaan tidak boleh dikorbankan
-- demi kecepatan. Karena itu:
--   1. Status penyelenggara hanya bisa diberikan ADMIN. Pengguna hanya bisa
--      mengajukan (org_name, situs, bukti peran). Mengubah data itu setelah
--      terverifikasi = verifikasi ULANG (tidak bisa ganti nama jadi lembaga
--      lain sambil tetap membawa lencana).
--   2. Hak kelola acara (event_managers) HANYA dibuat server lewat RPC
--      service_role: saat kiriman penyelenggara terverifikasi disetujui,
--      atau saat admin menyetujui klaim. Klien tidak punya hak tulis.
--   3. Hak itu berlaku HANYA selama status VERIFIED — mencabut verifikasi
--      langsung memutus akses analitik & pengajuan perubahan, tanpa perlu
--      menghapus baris satu per satu.
--   4. Penyelenggara TIDAK bisa mengubah acara yang tayang secara langsung.
--      Perubahan = permintaan (event_revisions) yang diterapkan admin.
--      Setiap postingan baru tetap lewat antrean ugc_submissions biasa.
--   5. Setiap keputusan masuk moderation_log (append-only, diisi trigger).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. moderation_log menampung jenis keputusan baru
--    Status penyelenggara (VERIFIED/REVOKED) tidak ada di enum
--    event_status, jadi kolom status dijadikan TEXT + CHECK daftar tertutup.
-- ---------------------------------------------------------------------
ALTER TABLE public.moderation_log DROP CONSTRAINT moderation_log_subject_type_check;
ALTER TABLE public.moderation_log
  ADD CONSTRAINT moderation_log_subject_type_check
  CHECK (subject_type IN ('event', 'submission', 'organizer', 'claim', 'revision'));
ALTER TABLE public.moderation_log
  ALTER COLUMN from_status TYPE TEXT USING from_status::TEXT,
  ALTER COLUMN to_status TYPE TEXT USING to_status::TEXT;
ALTER TABLE public.moderation_log
  ADD CONSTRAINT moderation_log_status_check CHECK (
    to_status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'VERIFIED', 'REVOKED')
    AND (from_status IS NULL OR from_status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'VERIFIED', 'REVOKED'))
  );

-- ---------------------------------------------------------------------
-- 1. organizer_profiles — pengajuan & status penyelenggara
-- ---------------------------------------------------------------------
CREATE TABLE public.organizer_profiles (
  user_id     UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  org_name    VARCHAR(160) NOT NULL CHECK (char_length(btrim(org_name)) BETWEEN 2 AND 160),
  website     TEXT CHECK (website IS NULL OR (website ~* '^https://[^\s]+$' AND char_length(website) <= 500)),
  -- Penjelasan peran + tautan bukti (halaman resmi yang menyebut kontak,
  -- akun media sosial resmi, dsb.). Dibaca admin, tidak pernah publik.
  evidence    TEXT NOT NULL CHECK (char_length(btrim(evidence)) BETWEEN 20 AND 1000),
  status      VARCHAR(10) NOT NULL DEFAULT 'PENDING'
              CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED', 'REVOKED')),
  review_note VARCHAR(500),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organizer_review_trail CHECK ((status = 'PENDING') = (reviewed_at IS NULL))
);

CREATE INDEX idx_organizer_profiles_queue ON public.organizer_profiles (created_at) WHERE status = 'PENDING';

CREATE TRIGGER trg_organizer_profiles_touch
  BEFORE UPDATE ON public.organizer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Mengubah identitas = kembali ke antrean. Kolom status tidak bisa ditulis
-- klien (hak per kolom di bawah), jadi hanya jalur ini yang mengembalikan
-- ke PENDING; RPC admin tidak menyentuh kolom identitas sehingga tidak ikut
-- mereset. Batas laju mencegah antrean admin dibanjiri pengajuan ulang.
CREATE OR REPLACE FUNCTION public.enforce_organizer_profile_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'PENDING';
    NEW.review_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  ELSIF (NEW.org_name, NEW.website, NEW.evidence) IS DISTINCT FROM (OLD.org_name, OLD.website, OLD.evidence) THEN
    NEW.status := 'PENDING';
    NEW.review_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  ELSE
    RETURN NEW;
  END IF;

  IF NOT public.consume_rate_limit('organizer:' || NEW.user_id::text, 5, 86400) THEN
    RAISE EXCEPTION 'organizer_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_organizer_profile_write() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_organizer_profiles_write
  BEFORE INSERT OR UPDATE ON public.organizer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organizer_profile_write();

ALTER TABLE public.organizer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizer_profiles_select ON public.organizer_profiles
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY organizer_profiles_insert_own ON public.organizer_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
-- Yang dicabut karena penyalahgunaan tidak bisa mengajukan ulang sendiri.
CREATE POLICY organizer_profiles_update_own ON public.organizer_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()) AND status <> 'REVOKED')
  WITH CHECK (user_id = (select auth.uid()));

REVOKE ALL ON public.organizer_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organizer_profiles TO authenticated;
GRANT INSERT (user_id, org_name, website, evidence) ON public.organizer_profiles TO authenticated;
GRANT UPDATE (org_name, website, evidence) ON public.organizer_profiles TO authenticated;

-- ---------------------------------------------------------------------
-- 2. event_managers — siapa mengelola acara apa (tulis: server saja)
-- ---------------------------------------------------------------------
CREATE TABLE public.event_managers (
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source     VARCHAR(12) NOT NULL CHECK (source IN ('SUBMISSION', 'CLAIM', 'ADMIN')),
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- "Acara saya" dimulai dari pengguna, bukan dari acara.
CREATE INDEX idx_event_managers_user ON public.event_managers (user_id, event_id);

ALTER TABLE public.event_managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_managers_select ON public.event_managers
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR (select public.is_admin()));

REVOKE ALL ON public.event_managers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_managers TO authenticated;

-- Satu bit untuk policy & RPC: apakah PEMANGGIL mengelola acara ini DAN
-- masih terverifikasi. Hanya menjawab tentang diri pemanggil.
CREATE OR REPLACE FUNCTION public.manages_event(p_event UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_managers m
    JOIN public.organizer_profiles o ON o.user_id = m.user_id
    WHERE m.event_id = p_event
      AND m.user_id = auth.uid()
      AND o.status = 'VERIFIED'
  );
$$;

REVOKE ALL ON FUNCTION public.manages_event(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manages_event(UUID) TO authenticated;

-- Lencana publik "dikelola penyelenggara terverifikasi" di halaman acara.
-- security_invoker = off (pola ADR-018): kolom dipatok, tanpa user_id,
-- hanya acara yang memang publik dan penyelenggara yang MASIH terverifikasi.
CREATE VIEW public.verified_event_organizers AS
SELECT DISTINCT m.event_id, o.org_name
FROM public.event_managers m
JOIN public.organizer_profiles o ON o.user_id = m.user_id AND o.status = 'VERIFIED'
JOIN public.events e ON e.id = m.event_id AND e.status IN ('APPROVED', 'EXPIRED');

REVOKE ALL ON public.verified_event_organizers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.verified_event_organizers TO anon, authenticated;

COMMENT ON VIEW public.verified_event_organizers IS
  'Lencana publik: acara tayang + nama lembaga penyelenggara terverifikasi. security_invoker = off; tanpa user_id. Jangan tambah kolom (ADR-042).';

-- ---------------------------------------------------------------------
-- 3. event_claims — "Acara ini milik lembaga kami"
-- ---------------------------------------------------------------------
CREATE TABLE public.event_claims (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  evidence    TEXT NOT NULL CHECK (char_length(btrim(evidence)) BETWEEN 20 AND 1000),
  status      VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_note VARCHAR(500),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_claims_review_trail CHECK ((status = 'PENDING') = (reviewed_at IS NULL))
);

CREATE UNIQUE INDEX idx_event_claims_one_pending ON public.event_claims (event_id, user_id) WHERE status = 'PENDING';
CREATE INDEX idx_event_claims_queue ON public.event_claims (created_at) WHERE status = 'PENDING';
CREATE INDEX idx_event_claims_user ON public.event_claims (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_event_claim_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.status := 'PENDING';
  NEW.review_note := NULL;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.created_at := now();
  IF NOT public.consume_rate_limit('event-claim:' || NEW.user_id::text, 10, 86400) THEN
    RAISE EXCEPTION 'claim_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_event_claim_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_event_claims_insert
  BEFORE INSERT ON public.event_claims
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_claim_insert();

ALTER TABLE public.event_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_claims_select ON public.event_claims
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR (select public.is_admin()));
-- Hanya penyelenggara terverifikasi, hanya acara yang tayang, dan bukan
-- acara yang sudah dikelolanya.
CREATE POLICY event_claims_insert_verified ON public.event_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.organizer_profiles o
      WHERE o.user_id = (select auth.uid()) AND o.status = 'VERIFIED'
    )
    AND EXISTS (
      SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status IN ('APPROVED', 'EXPIRED')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.event_managers m WHERE m.event_id = event_claims.event_id AND m.user_id = (select auth.uid())
    )
  );

REVOKE ALL ON public.event_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_claims TO authenticated;
GRANT INSERT (event_id, user_id, evidence) ON public.event_claims TO authenticated;

-- ---------------------------------------------------------------------
-- 4. event_revisions — permintaan perubahan acara yang sudah tayang
-- ---------------------------------------------------------------------
CREATE TABLE public.event_revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Bentuknya dikontrak di src/lib/organizer.ts; RPC penerap hanya membaca
  -- kunci yang diizinkan dan memvalidasi ulang nilainya.
  changes     JSONB NOT NULL CHECK (jsonb_typeof(changes) = 'object' AND pg_column_size(changes) <= 16384),
  note        VARCHAR(500),
  status      VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_note VARCHAR(500),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_revisions_review_trail CHECK ((status = 'PENDING') = (reviewed_at IS NULL))
);

CREATE INDEX idx_event_revisions_queue ON public.event_revisions (created_at) WHERE status = 'PENDING';
CREATE INDEX idx_event_revisions_event ON public.event_revisions (event_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_event_revision_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.status := 'PENDING';
  NEW.review_note := NULL;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.created_at := now();
  IF NOT public.consume_rate_limit('event-revision:' || NEW.proposed_by::text, 20, 86400) THEN
    RAISE EXCEPTION 'revision_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_event_revision_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_event_revisions_insert
  BEFORE INSERT ON public.event_revisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_revision_insert();

ALTER TABLE public.event_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_revisions_select ON public.event_revisions
  FOR SELECT TO authenticated
  USING (proposed_by = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY event_revisions_insert_manager ON public.event_revisions
  FOR INSERT TO authenticated
  WITH CHECK (proposed_by = (select auth.uid()) AND public.manages_event(event_id));

REVOKE ALL ON public.event_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_revisions TO authenticated;
GRANT INSERT (event_id, proposed_by, changes, note) ON public.event_revisions TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Log moderasi untuk keputusan baru (trigger → tidak bisa "lupa")
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_trust_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  subject UUID;
  label   TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;

  IF TG_ARGV[0] = 'organizer' THEN
    subject := NEW.user_id;
    label := NEW.org_name;
  ELSE
    subject := NEW.id;
    SELECT (CASE WHEN TG_ARGV[0] = 'claim' THEN 'Klaim: ' ELSE 'Perubahan: ' END) || e.title
      INTO label FROM public.events e WHERE e.id = NEW.event_id;
  END IF;

  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES (
    TG_ARGV[0],
    subject,
    left(COALESCE(label, '(tanpa judul)'), 300),
    OLD.status,
    NEW.status,
    -- Aktor hanya kalau baris membawa jejak keputusan manusia yang baru.
    CASE WHEN NEW.reviewed_at IS NOT NULL AND NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN NEW.reviewed_by END,
    COALESCE(
      left(NEW.review_note, 500),
      CASE WHEN TG_ARGV[0] = 'organizer' AND NEW.status = 'PENDING'
        THEN 'Data lembaga diubah pemiliknya — perlu verifikasi ulang' END
    )
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_trust_decision() FROM PUBLIC, anon, authenticated;

-- Tanpa `OF status`: verifikasi yang GUGUR karena pemilik mengubah nama
-- lembaga diubah oleh trigger BEFORE, dan `UPDATE OF kolom` hanya menyala
-- untuk kolom yang ada di klausa SET — kejadian itu akan lolos dari log.
CREATE TRIGGER trg_organizer_profiles_log
  AFTER UPDATE ON public.organizer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_trust_decision('organizer');
CREATE TRIGGER trg_event_claims_log
  AFTER UPDATE OF status ON public.event_claims
  FOR EACH ROW EXECUTE FUNCTION public.log_trust_decision('claim');
CREATE TRIGGER trg_event_revisions_log
  AFTER UPDATE OF status ON public.event_revisions
  FOR EACH ROW EXECUTE FUNCTION public.log_trust_decision('revision');

-- ---------------------------------------------------------------------
-- 6. RPC keputusan admin — service_role saja; otorisasi admin diperiksa
--    di Server Action (checkAdminAccess) sebelum memanggil.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_organizer(p_user_id UUID, p_decision TEXT, p_reviewer UUID, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_status TEXT;
  org TEXT;
BEGIN
  SELECT status, org_name INTO current_status, org
  FROM public.organizer_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organizer_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Transisi yang sah saja: tidak ada "verifikasi ulang diam-diam" dari
  -- REVOKED, dan penolakan butuh pengajuan baru dari pemiliknya.
  IF NOT (
    (current_status = 'PENDING' AND p_decision IN ('VERIFIED', 'REJECTED'))
    OR (current_status = 'VERIFIED' AND p_decision = 'REVOKED')
  ) THEN
    RAISE EXCEPTION 'organizer_invalid_transition' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.organizer_profiles
  SET status = p_decision, reviewed_by = p_reviewer, reviewed_at = now(), review_note = left(NULLIF(btrim(p_note), ''), 500)
  WHERE user_id = p_user_id;

  INSERT INTO public.notifications (user_id, type, message)
  VALUES (
    p_user_id,
    'ORGANIZER_' || p_decision,
    CASE p_decision
      WHEN 'VERIFIED' THEN format('%s kini terverifikasi sebagai penyelenggara. Kiriman & klaim acaramu mendapat lencana terverifikasi.', left(org, 120))
      WHEN 'REJECTED' THEN 'Pengajuan penyelenggara belum bisa diverifikasi. Lengkapi bukti peranmu, lalu ajukan ulang.'
      ELSE 'Status penyelenggara terverifikasi akunmu dicabut. Hubungi moderator bila ini keliru.'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_event_claim(p_claim_id UUID, p_decision TEXT, p_reviewer UUID, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claim public.event_claims%ROWTYPE;
  event_title TEXT;
BEGIN
  IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'claim_invalid_decision' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO claim FROM public.event_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND OR claim.status <> 'PENDING' THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Verifikasi bisa dicabut SETELAH klaim diajukan.
  IF p_decision = 'APPROVED' AND NOT EXISTS (
    SELECT 1 FROM public.organizer_profiles WHERE user_id = claim.user_id AND status = 'VERIFIED'
  ) THEN
    RAISE EXCEPTION 'claim_not_verified' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.event_claims
  SET status = p_decision, reviewed_by = p_reviewer, reviewed_at = now(), review_note = left(NULLIF(btrim(p_note), ''), 500)
  WHERE id = p_claim_id;

  IF p_decision = 'APPROVED' THEN
    INSERT INTO public.event_managers (event_id, user_id, source, granted_by)
    VALUES (claim.event_id, claim.user_id, 'CLAIM', p_reviewer)
    ON CONFLICT (event_id, user_id) DO NOTHING;
  END IF;

  -- Tanpa event_id: idx_notifications_dedupe (user, event, type) akan
  -- menelan keputusan kedua untuk acara yang sama (klaim ulang setelah
  -- ditolak). Tujuan klik notifikasi ini memang /penyelenggara.
  SELECT left(title, 150) INTO event_title FROM public.events WHERE id = claim.event_id;
  INSERT INTO public.notifications (user_id, type, message)
  VALUES (
    claim.user_id,
    'CLAIM_' || p_decision,
    CASE WHEN p_decision = 'APPROVED'
      THEN format('Klaim "%s" disetujui. Acara ini kini muncul di dasbor penyelenggaramu.', event_title)
      ELSE format('Klaim "%s" belum bisa disetujui moderator.', event_title)
    END
  );
END;
$$;

-- Kunci yang boleh diubah lewat permintaan perubahan. Judul & nama
-- penyelenggara SENGAJA tidak termasuk: keduanya membentuk dedup_hash dan
-- identitas acara — perubahan semacam itu lewat moderator langsung.
CREATE OR REPLACE FUNCTION public.review_event_revision(p_revision_id UUID, p_decision TEXT, p_reviewer UUID, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rev public.event_revisions%ROWTYPE;
  c JSONB;
  event_title TEXT;
  new_deadline TIMESTAMPTZ;
BEGIN
  IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'revision_invalid_decision' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO rev FROM public.event_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND OR rev.status <> 'PENDING' THEN
    RAISE EXCEPTION 'revision_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_decision = 'APPROVED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.event_managers m
      JOIN public.organizer_profiles o ON o.user_id = m.user_id AND o.status = 'VERIFIED'
      WHERE m.event_id = rev.event_id AND m.user_id = rev.proposed_by
    ) THEN
      RAISE EXCEPTION 'revision_not_manager' USING ERRCODE = 'P0001';
    END IF;

    c := rev.changes;
    -- Validasi ulang di database: aplikasi sudah memvalidasi, tapi baris ini
    -- bisa berasal dari klien mana pun yang memegang sesi penyelenggara.
    IF c ? 'registration_link' AND (c ->> 'registration_link') !~* '^https://[^\s]+$' THEN
      RAISE EXCEPTION 'revision_invalid_link' USING ERRCODE = 'P0001';
    END IF;
    IF c ? 'deadline_at' THEN
      new_deadline := (c ->> 'deadline_at')::TIMESTAMPTZ;
      IF new_deadline <= now() THEN
        RAISE EXCEPTION 'revision_deadline_past' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    UPDATE public.events e SET
      description = CASE WHEN c ? 'description' THEN NULLIF(btrim(c ->> 'description'), '') ELSE e.description END,
      registration_link = CASE WHEN c ? 'registration_link' THEN c ->> 'registration_link' ELSE e.registration_link END,
      location = CASE WHEN c ? 'location' THEN NULLIF(btrim(c ->> 'location'), '') ELSE e.location END,
      is_online = CASE WHEN c ? 'is_online' THEN (c ->> 'is_online')::BOOLEAN ELSE e.is_online END,
      education_levels = CASE WHEN c ? 'education_levels' THEN ARRAY(
        SELECT value::education_level FROM jsonb_array_elements_text(c -> 'education_levels') AS value
      ) ELSE e.education_levels END,
      -- Perpanjangan pendaftaran yang disetujui manusia membuka kembali acara
      -- yang sudah kedaluwarsa (tercatat di log atas nama moderator ini).
      status = CASE WHEN new_deadline IS NOT NULL AND e.status = 'EXPIRED' THEN 'APPROVED'::event_status ELSE e.status END,
      reviewed_by = CASE WHEN new_deadline IS NOT NULL AND e.status = 'EXPIRED' THEN p_reviewer ELSE e.reviewed_by END,
      reviewed_at = CASE WHEN new_deadline IS NOT NULL AND e.status = 'EXPIRED' THEN now() ELSE e.reviewed_at END
    WHERE e.id = rev.event_id;

    IF new_deadline IS NOT NULL THEN
      UPDATE public.event_deadlines SET deadline_at = new_deadline
      WHERE event_id = rev.event_id AND is_primary;
    END IF;
  END IF;

  UPDATE public.event_revisions
  SET status = p_decision, reviewed_by = p_reviewer, reviewed_at = now(), review_note = left(NULLIF(btrim(p_note), ''), 500)
  WHERE id = p_revision_id;

  -- Tanpa event_id, alasan sama dengan review_event_claim().
  SELECT left(title, 150) INTO event_title FROM public.events WHERE id = rev.event_id;
  INSERT INTO public.notifications (user_id, type, message)
  VALUES (
    rev.proposed_by,
    'REVISION_' || p_decision,
    CASE WHEN p_decision = 'APPROVED'
      THEN format('Perubahan untuk "%s" sudah diterapkan.', event_title)
      ELSE format('Perubahan untuk "%s" belum bisa diterapkan moderator.', event_title)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_organizer(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_event_claim(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_event_revision(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_organizer(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_event_claim(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_event_revision(UUID, TEXT, UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- 7. approve_submission(): kiriman penyelenggara TERVERIFIKASI yang
--    disetujui otomatis tercatat sebagai acara yang dikelolanya.
--    Isi lain identik dengan versi 20260926130001.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_submission(p_submission_id UUID, p_reviewer_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  submission   public.ugc_submissions%ROWTYPE;
  p            JSONB;
  new_event_id UUID;
BEGIN
  SELECT * INTO submission FROM public.ugc_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR submission.status <> 'PENDING' THEN
    RAISE EXCEPTION 'submission_not_found' USING ERRCODE = 'P0002';
  END IF;
  p := submission.payload;

  INSERT INTO public.events (
    title, organizer, description, event_type, registration_link, source_url,
    education_levels, location, is_online, status, reviewed_by, reviewed_at
  )
  VALUES (
    btrim(p ->> 'title'),
    btrim(p ->> 'organizer'),
    NULLIF(btrim(p ->> 'description'), ''),
    (p ->> 'event_type')::event_type,
    p ->> 'registration_link',
    COALESCE(NULLIF(p ->> 'source_url', ''), p ->> 'registration_link'),
    ARRAY(
      SELECT value::education_level
      FROM jsonb_array_elements_text(COALESCE(p -> 'education_levels', '[]'::JSONB)) AS value
    ),
    NULLIF(btrim(p ->> 'location'), ''),
    COALESCE((p ->> 'is_online')::BOOLEAN, FALSE),
    'APPROVED',
    p_reviewer_id,
    NOW()
  )
  RETURNING id INTO new_event_id;

  INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
  VALUES (new_event_id, 'registration', (p ->> 'deadline_at')::TIMESTAMPTZ, TRUE);

  INSERT INTO public.event_categories (event_id, category_id)
  SELECT new_event_id, c.id
  FROM public.categories c
  WHERE c.slug IN (
    SELECT jsonb_array_elements_text(COALESCE(p -> 'category_slugs', '[]'::JSONB))
  );

  IF submission.submitted_by IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organizer_profiles WHERE user_id = submission.submitted_by AND status = 'VERIFIED'
  ) THEN
    INSERT INTO public.event_managers (event_id, user_id, source, granted_by)
    VALUES (new_event_id, submission.submitted_by, 'SUBMISSION', p_reviewer_id)
    ON CONFLICT (event_id, user_id) DO NOTHING;
  END IF;

  UPDATE public.ugc_submissions
  SET status = 'APPROVED', reviewed_by = p_reviewer_id, reviewed_at = NOW()
  WHERE id = p_submission_id;

  RETURN new_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_submission(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_submission(UUID, UUID) TO service_role;
