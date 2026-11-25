-- =====================================================================
-- Waktu pelaksanaan kegiatan (ADR-100)
--
-- Workshop, seminar, dan konferensi punya JADWAL acara (12 Des 09.00–16.00),
-- bukan hanya tenggat daftar. Tanpa jadwal, halaman detailnya tidak bisa
-- diberi data terstruktur `Event` (Google mewajibkan `startDate`) — per
-- 25 Nov 2026 lima kegiatan tayang jenis itu di produksi tidak punya satu
-- pun tanggal selain tenggat pendaftaran.
--
-- Sengaja kolom sendiri, BUKAN label baru di `event_deadlines`: tenggat
-- dipakai pengingat email H-3/H-1, urgensi kartu, dan kalender tenggat —
-- hari acara di sana akan mengirim "tutup 3 hari lagi" untuk acara yang
-- pendaftarannya sudah lama ditutup.
--
-- Kolom baru di tabel yang sudah ber-RLS: policy & GRANT tabel yang ada
-- berlaku (dibaca tamu hanya bila kegiatannya tayang, `events_public_read`).
-- Penulisan HANYA lewat RPC di bawah (pengelola acara atau admin), pola yang
-- sama dengan `set_event_video` (20261109100002). Tanpa DROP.
-- =====================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

COMMENT ON COLUMN public.events.starts_at IS 'Mulai pelaksanaan acara (bukan tenggat). NULL = belum diketahui. ADR-100.';
COMMENT ON COLUMN public.events.ends_at IS 'Selesai pelaksanaan; NULL = tidak diketahui / acara satu waktu. Tidak boleh tanpa starts_at. ADR-100.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_schedule_order') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_schedule_order
      CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at >= starts_at));
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.set_event_schedule(p_event UUID, p_starts TIMESTAMPTZ, p_ends TIMESTAMPTZ)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_event IS NULL OR NOT (public.manages_event(p_event) OR public.is_admin()) THEN
    RAISE EXCEPTION 'not_event_manager' USING ERRCODE = 'P0001';
  END IF;
  -- Jadwal tampil di halaman publik & data terstruktur: laju dibatasi seperti video.
  IF NOT public.consume_rate_limit('event-schedule:' || auth.uid()::text, 30, 86400) THEN
    RAISE EXCEPTION 'schedule_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  IF p_ends IS NOT NULL AND (p_starts IS NULL OR p_ends < p_starts) THEN
    RAISE EXCEPTION 'invalid_schedule' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.events SET starts_at = p_starts, ends_at = p_ends WHERE id = p_event;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_event_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Pasang/hapus waktu pelaksanaan — pengelola acara atau admin. ADR-100.';

REVOKE ALL ON FUNCTION public.set_event_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
