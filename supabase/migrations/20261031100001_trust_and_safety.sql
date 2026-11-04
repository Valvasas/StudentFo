-- =====================================================================
-- Keamanan & kepercayaan menjelang publik (ADR-061):
--   1. content_reports  — pengguna melaporkan kegiatan / pengguna lain
--   2. penangguhan akun — users.suspended_at + auth.users.banned_until
--   3. hapus akun       — delete_user_account(): satu pintu, cascade penuh
--   4. ugc_submissions.rejection_reason — pengirim tahu alasan penolakan
-- Semua tindakan admin atas pengguna & laporan masuk moderation_log, sama
-- dengan keputusan moderasi lain: jejak siapa berbuat apa tidak boleh hilang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. moderation_log menampung subjek & status baru
-- ---------------------------------------------------------------------
ALTER TABLE public.moderation_log DROP CONSTRAINT moderation_log_subject_type_check;
ALTER TABLE public.moderation_log
  ADD CONSTRAINT moderation_log_subject_type_check
  CHECK (subject_type IN ('event', 'submission', 'organizer', 'claim', 'revision', 'user', 'report'));
ALTER TABLE public.moderation_log DROP CONSTRAINT moderation_log_status_check;
ALTER TABLE public.moderation_log
  ADD CONSTRAINT moderation_log_status_check CHECK (
    to_status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'VERIFIED', 'REVOKED', 'OPEN', 'RESOLVED', 'DISMISSED', 'ACTIVE', 'SUSPENDED', 'DELETED')
    AND (from_status IS NULL OR from_status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'VERIFIED', 'REVOKED', 'OPEN', 'RESOLVED', 'DISMISSED', 'ACTIVE', 'SUSPENDED', 'DELETED'))
  );

-- ---------------------------------------------------------------------
-- 1. Laporan konten
-- ---------------------------------------------------------------------
CREATE TABLE public.content_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL: laporan tetap berguna sebagai arsip walau pelapor menghapus akun.
  reporter_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  subject_type    TEXT NOT NULL CHECK (subject_type IN ('event', 'user')),
  -- Tanpa FK: subjek (acara/akun) bisa dihapus, laporannya tidak boleh ikut hilang.
  subject_id      UUID NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('scam', 'misleading', 'inappropriate', 'harassment', 'spam', 'impersonation', 'other')),
  details         TEXT CHECK (char_length(details) <= 1000),
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
  resolution_note TEXT CHECK (char_length(resolution_note) <= 500),
  reviewed_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_review_trail CHECK ((status = 'OPEN') = (reviewed_at IS NULL))
);

-- Satu laporan TERBUKA per (pelapor, subjek): klik berulang tidak menumpuk antrean.
CREATE UNIQUE INDEX content_reports_one_open
  ON public.content_reports (reporter_id, subject_type, subject_id) WHERE status = 'OPEN';
CREATE INDEX idx_content_reports_queue ON public.content_reports (status, created_at DESC);
CREATE INDEX idx_content_reports_subject ON public.content_reports (subject_type, subject_id);

-- Tanpa policy: tidak ada role API yang membaca/menulis langsung. Tulis lewat
-- report_content() (DEFINER), baca & putuskan lewat service_role (rute admin).
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.content_reports TO service_role;

CREATE OR REPLACE FUNCTION public.report_content(
  p_subject_type TEXT,
  p_subject_id   UUID,
  p_reason       TEXT,
  p_details      TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'report_requires_login' USING ERRCODE = '42501';
  END IF;

  -- Subjek harus sesuatu yang memang bisa dilihat pelapor; laporan untuk UUID
  -- sembarang = alat menebak keberadaan akun/acara.
  IF p_subject_type = 'event' THEN
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_subject_id AND status IN ('APPROVED', 'EXPIRED')) THEN
      RAISE EXCEPTION 'report_subject_unavailable' USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_subject_type = 'user' THEN
    IF p_subject_id = uid OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_subject_id) THEN
      RAISE EXCEPTION 'report_subject_unavailable' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_report' USING ERRCODE = '23514';
  END IF;

  IF NOT public.consume_rate_limit('report:' || uid::text, 10, 86400) THEN
    RAISE EXCEPTION 'report_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.content_reports (reporter_id, subject_type, subject_id, reason, details)
  VALUES (uid, p_subject_type, p_subject_id, p_reason, NULLIF(btrim(p_details), ''))
  ON CONFLICT (reporter_id, subject_type, subject_id) WHERE status = 'OPEN' DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.report_content(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_content(TEXT, UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_content_report(
  p_report  UUID,
  p_actor   UUID,
  p_outcome TEXT,
  p_note    TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  report public.content_reports%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('RESOLVED', 'DISMISSED') THEN
    RAISE EXCEPTION 'invalid_report' USING ERRCODE = '23514';
  END IF;

  UPDATE public.content_reports
  SET status = p_outcome, resolution_note = NULLIF(btrim(p_note), ''), reviewed_by = p_actor, reviewed_at = now()
  WHERE id = p_report AND status = 'OPEN'
  RETURNING * INTO report;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES ('report', report.id, format('Laporan %s (%s)', CASE report.subject_type WHEN 'event' THEN 'kegiatan' ELSE 'pengguna' END, report.reason),
          'OPEN', p_outcome, p_actor, report.resolution_note);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_content_report(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_content_report(UUID, UUID, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- 2. Penangguhan akun
-- ---------------------------------------------------------------------
-- Kolom baru tidak termasuk hak UPDATE per-kolom `authenticated` (0005), jadi
-- pengguna bisa MEMBACA status akunnya sendiri (RLS baris-sendiri) tapi tidak
-- bisa mencabut penangguhannya.
ALTER TABLE public.users
  ADD COLUMN suspended_at TIMESTAMPTZ,
  ADD COLUMN suspension_reason TEXT CHECK (char_length(suspension_reason) <= 500);

CREATE OR REPLACE FUNCTION public.set_user_suspension(
  p_user    UUID,
  p_actor   UUID,
  p_suspend BOOLEAN,
  p_reason  TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.users%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.users WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Admin tidak bisa saling menangguhkan dari aplikasi: peran ADMIN hanya
  -- diubah lewat service_role (SCHEMA.md), jadi pencabutannya juga di sana.
  IF target.role = 'ADMIN' OR p_user = p_actor THEN
    RAISE EXCEPTION 'user_protected' USING ERRCODE = '42501';
  END IF;
  IF p_suspend AND char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'suspension_reason_required' USING ERRCODE = '23514';
  END IF;
  IF p_suspend = (target.suspended_at IS NOT NULL) THEN
    RETURN;
  END IF;

  UPDATE public.users
  SET suspended_at = CASE WHEN p_suspend THEN now() END,
      suspension_reason = CASE WHEN p_suspend THEN btrim(p_reason) END
  WHERE id = p_user;

  IF p_suspend THEN
    -- Keluar dari semua etalase: orang lain tidak lagi menemukannya. Tidak
    -- dipulihkan otomatis saat penangguhan dicabut — pemilik menyalakan lagi.
    UPDATE public.network_profiles SET is_discoverable = false WHERE user_id = p_user;
    UPDATE public.team_seekers SET is_open = false WHERE user_id = p_user;
  END IF;

  -- GoTrue menolak masuk & penyegaran token selama `banned_until` di masa
  -- depan; sesi yang sudah ada diputus supaya refresh token tidak berlaku lagi.
  -- Dengan ini penangguhan berlaku juga untuk akses PostgREST langsung (paling
  -- lama sampai access token ±1 jam habis), bukan hanya di aplikasi.
  -- 100 tahun, BUKAN 'infinity': GoTrue (Go) tidak bisa membaca timestamp tak
  -- hingga dan menjawab 500 di setiap login akun itu — terbukti dengan GoTrue
  -- sungguhan (`npm run test:integration:services`). Sama dengan `ban_duration`
  -- "876000h" milik API admin GoTrue.
  UPDATE auth.users SET banned_until = CASE WHEN p_suspend THEN now() + interval '100 years' END WHERE id = p_user;
  IF p_suspend AND to_regclass('auth.sessions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.sessions WHERE user_id = $1' USING p_user;
  END IF;

  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES ('user', p_user, left(target.full_name, 300),
          CASE WHEN p_suspend THEN 'ACTIVE' ELSE 'SUSPENDED' END,
          CASE WHEN p_suspend THEN 'SUSPENDED' ELSE 'ACTIVE' END,
          p_actor, NULLIF(btrim(COALESCE(p_reason, '')), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_suspension(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_suspension(UUID, UUID, BOOLEAN, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- 3. Hapus akun
-- ---------------------------------------------------------------------
-- Satu pintu untuk hapus mandiri dan hapus atas permintaan (admin). Baris
-- auth.users dihapus → users → semua tabel milik pengguna ikut (CASCADE),
-- jejak bersama (tim yang dibuat, log, sinyal) diputus tautannya (SET NULL).
-- BERKAS di Storage TIDAK ikut: aplikasi menghapusnya lewat Storage API lebih
-- dulu (Supabase menolak DELETE langsung di storage.objects) dengan daftar
-- dari account_storage_paths().
CREATE OR REPLACE FUNCTION public.account_storage_paths(p_user UUID)
RETURNS TABLE (bucket TEXT, path TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 'payment-proofs', r.proof_path FROM public.event_registrations r
  WHERE r.user_id = p_user AND r.proof_path IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user UUID, p_actor UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.users%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.users WHERE id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Admin dihapus hanya di luar aplikasi (dicabut perannya dulu lewat service_role).
  IF target.role = 'ADMIN' THEN
    RAISE EXCEPTION 'user_protected' USING ERRCODE = '42501';
  END IF;

  -- Log ditulis SEBELUM baris hilang. Judul hanya "Akun dihapus": menyimpan
  -- nama orang yang meminta datanya dihapus bertentangan dengan permintaannya.
  -- Penghapusan mandiri (aktor = pemilik) tidak dicatat sebagai aktor: id
  -- aktor akan SET NULL begitu barisnya terhapus.
  IF p_actor IS NOT NULL AND p_actor <> p_user THEN
    INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
    VALUES ('user', p_user, 'Akun dihapus', CASE WHEN target.suspended_at IS NULL THEN 'ACTIVE' ELSE 'SUSPENDED' END,
            'DELETED', p_actor, NULLIF(btrim(COALESCE(p_reason, '')), ''));
  END IF;

  DELETE FROM auth.users WHERE id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.account_storage_paths(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_user_account(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_storage_paths(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_account(UUID, UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- 4. Alasan penolakan kiriman
-- ---------------------------------------------------------------------
-- Kolom baru di luar hak INSERT per-kolom tamu (0008): pengirim tidak bisa
-- mengisinya sendiri. Ditulis service_role saat menolak, dibaca pemiliknya
-- lewat listMySubmissions (klien admin, kolom eksplisit).
ALTER TABLE public.ugc_submissions
  ADD COLUMN rejection_reason TEXT CHECK (char_length(rejection_reason) <= 500);

CREATE OR REPLACE FUNCTION public.notify_submission_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  title    TEXT := left(COALESCE(NEW.payload ->> 'title', 'kegiatan'), 200);
  event_id UUID;
BEGIN
  IF NEW.submitted_by IS NULL OR OLD.status <> 'PENDING' OR NEW.status NOT IN ('APPROVED', 'REJECTED') THEN
    RETURN NULL;
  END IF;

  IF NEW.status = 'APPROVED' THEN
    SELECT e.id INTO event_id FROM public.events e
    WHERE e.dedup_hash = public.compute_dedup_hash(NEW.payload ->> 'title', NEW.payload ->> 'organizer')
      AND e.status <> 'EXPIRED'
    LIMIT 1;

    INSERT INTO public.notifications (user_id, event_id, type, message)
    VALUES (NEW.submitted_by, event_id, 'SUBMISSION_APPROVED',
            format('Kirimanmu "%s" sudah dicek dan kini tayang. Terima kasih!', title))
    ON CONFLICT DO NOTHING;
  ELSIF NEW.rejection_reason IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, message)
    VALUES (NEW.submitted_by, 'SUBMISSION_REJECTED',
            format('Kirimanmu "%s" belum bisa ditayangkan. Alasan moderator: %s', title, left(NEW.rejection_reason, 300)));
  ELSE
    INSERT INTO public.notifications (user_id, type, message)
    VALUES (NEW.submitted_by, 'SUBMISSION_REJECTED',
            format('Kirimanmu "%s" belum bisa ditayangkan setelah dicek moderator. Pastikan tautan resmi & tenggatnya benar, lalu kirim ulang.', title));
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_submission_decision() FROM PUBLIC, anon, authenticated;
