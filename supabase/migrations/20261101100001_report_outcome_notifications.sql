-- =====================================================================
-- Pelapor diberi tahu hasil laporannya (ADR-062 #1).
--
-- Sebelumnya laporan diputuskan dalam diam: pelapor tidak tahu apakah
-- laporannya dibaca, jadi cenderung melapor ulang atau berhenti melapor.
-- Pesannya UMUM: tidak menyebut tindakan atas pihak terlapor (penangguhan
-- adalah urusan pemilik akun itu) dan tidak membawa catatan moderator
-- (catatan internal, bisa menyebut data pihak lain).
--
-- Sekalian: "ditindak" menutup SEMUA laporan terbuka atas subjek yang sama
-- (tindakannya sudah menjawab semuanya, setiap pelapor dikabari). "Abaikan"
-- tetap hanya laporan itu — laporan lain bisa membawa bukti yang lebih kuat.
-- =====================================================================

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
  report       public.content_reports%ROWTYPE;
  -- Id eksplisit, bukan "reviewed_at = now()": dua keputusan dalam satu
  -- transaksi berbagi now() dan pelapor keputusan pertama ikut dikabari ulang.
  closed_ids   UUID[];
  also_closed  INT := 0;
  subject_text TEXT;
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

  closed_ids := ARRAY[report.id];
  IF p_outcome = 'RESOLVED' THEN
    WITH closed AS (
      UPDATE public.content_reports
      SET status = 'RESOLVED', resolution_note = report.resolution_note, reviewed_by = p_actor, reviewed_at = now()
      WHERE subject_type = report.subject_type AND subject_id = report.subject_id AND status = 'OPEN'
      RETURNING id
    )
    SELECT closed_ids || COALESCE(array_agg(id), '{}'), count(*) INTO closed_ids, also_closed FROM closed;
  END IF;

  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES ('report', report.id,
          format('Laporan %s (%s)%s', CASE report.subject_type WHEN 'event' THEN 'kegiatan' ELSE 'pengguna' END, report.reason,
                 CASE WHEN also_closed > 0 THEN format(' + %s laporan lain atas subjek yang sama', also_closed) ELSE '' END),
          'OPEN', p_outcome, p_actor, report.resolution_note);

  IF report.subject_type = 'event' THEN
    SELECT format('kegiatan "%s"', left(e.title, 120)) INTO subject_text FROM public.events e WHERE e.id = report.subject_id;
  END IF;
  subject_text := COALESCE(subject_text, CASE report.subject_type WHEN 'event' THEN 'sebuah kegiatan' ELSE 'akun yang kamu laporkan' END);

  -- Tanpa event_id: kegiatan yang diturunkan tidak bisa dibuka pelapor, dan
  -- notifikasi tidak ikut terhapus bila kegiatannya dihapus.
  INSERT INTO public.notifications (user_id, type, message)
  SELECT DISTINCT r.reporter_id,
         CASE p_outcome WHEN 'RESOLVED' THEN 'REPORT_RESOLVED' ELSE 'REPORT_DISMISSED' END,
         CASE p_outcome
           WHEN 'RESOLVED' THEN format('Terima kasih. Laporanmu tentang %s sudah ditindaklanjuti moderator. Demi privasi semua pihak, rincian tindakannya tidak kami bagikan.', subject_text)
           ELSE format('Laporanmu tentang %s sudah ditinjau moderator dan belum ditemukan pelanggaran Syarat & Ketentuan. Punya bukti tambahan? Kirim laporan baru.', subject_text)
         END
  FROM public.content_reports r
  WHERE r.id = ANY (closed_ids) AND r.reporter_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_content_report(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_content_report(UUID, UUID, TEXT, TEXT) TO service_role;
