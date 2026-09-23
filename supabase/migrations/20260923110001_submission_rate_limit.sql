-- =====================================================================
-- StudentFo — Migration 0009: pembatasan laju kiriman komunitas
--
-- `ugc_submissions` terbuka untuk anon (policy `ugc_public_insert`), dan
-- request PostgREST langsung tidak melewati honeypot /submit. Batasnya
-- ditegakkan di sini, bukan di Next.js: pembatas in-memory tidak berlaku
-- lintas instance serverless, dan pembatas di app tidak berlaku sama sekali
-- untuk request yang langsung ke PostgREST.
--
-- Angka HARUS sama dengan SUBMISSION_RATE_LIMIT di
-- src/lib/submission-schema.ts (dipakai MemoryEventRepository). Ubah
-- keduanya bersamaan.
--
--   * per email  : maks 3 kiriman / 60 menit. Email bisa dikarang, jadi ini
--                  hanya menahan pengirim jujur yang menekan kirim berulang.
--   * global     : maks 100 kiriman PENDING / 60 menit. Ini rem banjir yang
--                  sesungguhnya — melindungi antrean moderasi. Harganya:
--                  saat banjir, kiriman sah juga tertolak sementara. Itu
--                  lebih baik daripada admin menyaring ribuan sampah.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.enforce_submission_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
-- DEFINER karena anon tidak boleh membaca `ugc_submissions`; dijalankan
-- sebagai pemanggil, kedua hitungan di bawah selalu 0.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  window_start TIMESTAMPTZ := now() - INTERVAL '60 minutes';
  email_count  INT;
  global_count INT;
BEGIN
  -- Serialisasi per email: dua kiriman bersamaan tidak bisa sama-sama
  -- melihat hitungan 2 lalu sama-sama lolos.
  PERFORM pg_advisory_xact_lock(hashtext('ugc_submission:' || lower(NEW.submitted_by_email)));

  SELECT COUNT(*) INTO email_count
  FROM public.ugc_submissions
  WHERE lower(submitted_by_email) = lower(NEW.submitted_by_email)
    AND created_at >= window_start;

  SELECT COUNT(*) INTO global_count
  FROM public.ugc_submissions
  WHERE status = 'PENDING'
    AND created_at >= window_start;

  IF email_count >= 3 OR global_count >= 100 THEN
    -- Teks 'submission_rate_limited' dibaca SupabaseEventRepository.createSubmission().
    RAISE EXCEPTION 'submission_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_submission_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ugc_submissions_rate_limit ON public.ugc_submissions;
CREATE TRIGGER trg_ugc_submissions_rate_limit
  BEFORE INSERT ON public.ugc_submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_submission_rate_limit();

-- Hitungan global dilayani idx_ugc_submissions_status_created (migration 0008).
CREATE INDEX IF NOT EXISTS idx_ugc_submissions_email_created
  ON public.ugc_submissions (lower(submitted_by_email), created_at);
