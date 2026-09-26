-- =====================================================================
-- Notifikasi in-app ke pengirim kiriman komunitas saat disetujui/ditolak
-- (ADR-037).
--
-- Pengirim diidentifikasi lewat `submitted_by` (akun yang SEDANG MASUK saat
-- mengirim), BUKAN dengan mencocokkan `submitted_by_email`: email di form
-- bebas diketik, jadi pencocokan email membuat siapa pun bisa mengirim
-- sampah atas nama alamat orang lain dan korbannya menerima kabar
-- "kiriman ditolak". Tamu tetap boleh mengirim — hanya tidak dikabari.
-- =====================================================================

ALTER TABLE public.ugc_submissions
  ADD COLUMN submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Hak INSERT per kolom (0008): pengguna yang masuk boleh mengisi
-- submitted_by, tamu tidak. Policy memastikan nilainya DIRINYA sendiri.
GRANT INSERT (submitted_by) ON public.ugc_submissions TO authenticated;
ALTER POLICY ugc_public_insert ON public.ugc_submissions
  WITH CHECK (status = 'PENDING' AND (submitted_by IS NULL OR submitted_by = (select auth.uid())));

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
    -- approve_submission() memasukkan event lebih dulu dalam transaksi yang
    -- sama; dedup_hash unik di antara event yang belum EXPIRED (0925).
    SELECT e.id INTO event_id FROM public.events e
    WHERE e.dedup_hash = public.compute_dedup_hash(NEW.payload ->> 'title', NEW.payload ->> 'organizer')
      AND e.status <> 'EXPIRED'
    LIMIT 1;

    INSERT INTO public.notifications (user_id, event_id, type, message)
    VALUES (NEW.submitted_by, event_id, 'SUBMISSION_APPROVED',
            format('Kirimanmu "%s" sudah dicek dan kini tayang. Terima kasih!', title))
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.notifications (user_id, type, message)
    VALUES (NEW.submitted_by, 'SUBMISSION_REJECTED',
            format('Kirimanmu "%s" belum bisa ditayangkan setelah dicek moderator. Pastikan tautan resmi & tenggatnya benar, lalu kirim ulang.', title));
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_submission_decision() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_ugc_submissions_notify_submitter
  AFTER UPDATE OF status ON public.ugc_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_submission_decision();
