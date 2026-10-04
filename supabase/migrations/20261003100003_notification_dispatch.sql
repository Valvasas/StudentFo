-- =====================================================================
-- Pengiriman notifikasi tenggat ke kanal luar (bot WhatsApp/Telegram,
-- penyedia email) — ADR-051.
--
-- Notifikasi H-3/H-1 sudah dibuat `create_deadline_notifications()`
-- (pg_cron 07:00 WIB) untuk lonceng in-app. Migration ini menambahkan
-- antrean KIRIM-KE-LUAR di atas baris yang sama, dengan semantik
-- at-least-once:
--
--   1. claim_notification_dispatch(n)  → tandai `dispatch_claimed_at`,
--      kembalikan payload. Baris yang diklaim tidak dibagikan lagi selama
--      masa sewa (lease), jadi dua pekerja paralel tidak mengirim dobel.
--   2. ack_notification_dispatch(ids)  → `dispatched_at` terisi = selesai.
--   3. Pekerja mati sebelum ack → sewa habis → baris diklaim ulang.
--
-- Kenapa bukan "tandai terkirim saat dibaca": bot yang crash di tengah
-- batch akan menghilangkan pengingat tanpa jejak — dan pengingat tenggat
-- yang hilang adalah satu-satunya kegagalan yang benar-benar merugikan
-- pengguna produk ini. Pesan dobel (ack gagal setelah kirim) lebih murah
-- daripada pesan hilang.
-- =====================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dispatch_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

-- Antrean = notifikasi tenggat yang belum terkirim. Index parsial: baris
-- yang sudah terkirim (mayoritas seiring waktu) tidak ikut disimpan, jadi
-- klaim tidak memindai riwayat notifikasi seumur hidup.
CREATE INDEX IF NOT EXISTS idx_notifications_dispatch_pending
  ON public.notifications (sent_at)
  WHERE dispatched_at IS NULL AND type IN ('DEADLINE_H3', 'DEADLINE_H1');

-- Hak kolom notifikasi untuk klien tetap seperti 0008: UPDATE hanya
-- `is_read`. Dua kolom baru sengaja TIDAK di-GRANT — pengguna yang bisa
-- menulis `dispatched_at` miliknya bisa membungkam pengingatnya sendiri
-- (tidak berbahaya) atau memalsukan status pengiriman (membingungkan audit).
REVOKE UPDATE ON public.notifications FROM anon, authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_notification_dispatch(
  p_limit INT DEFAULT 100,
  p_lease_seconds INT DEFAULT 900
)
RETURNS TABLE (
  notification_id   UUID,
  notification_type VARCHAR,
  message           TEXT,
  created_at        TIMESTAMPTZ,
  user_id           UUID,
  user_email        VARCHAR,
  user_full_name    VARCHAR,
  event_id          UUID,
  event_slug        VARCHAR,
  event_title       VARCHAR,
  event_organizer   VARCHAR,
  deadline_at       TIMESTAMPTZ,
  days_left         INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT n.id
    FROM public.notifications n
    JOIN public.events e ON e.id = n.event_id
    JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
    WHERE n.dispatched_at IS NULL
      AND n.type IN ('DEADLINE_H3', 'DEADLINE_H1')
      AND (n.dispatch_claimed_at IS NULL
           OR n.dispatch_claimed_at < NOW() - make_interval(secs => GREATEST(p_lease_seconds, 60)))
      -- Jangan kirim pengingat basi: kegiatan yang sudah tutup atau
      -- ditarik dari publik setelah notifikasinya dibuat (mis. antrean
      -- tertahan berhari-hari karena bot mati) dilewati, bukan dikirim.
      AND e.status = 'APPROVED'
      AND d.deadline_at >= NOW()
    ORDER BY n.sent_at, n.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
    -- SKIP LOCKED: pekerja kedua yang memanggil bersamaan mendapat baris
    -- LAIN, bukan menunggu lalu mengklaim baris yang sama.
    FOR UPDATE OF n SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.notifications n
    SET dispatch_claimed_at = NOW()
    FROM due
    WHERE n.id = due.id
    RETURNING n.id, n.type, n.message, n.sent_at, n.user_id, n.event_id
  )
  SELECT
    c.id,
    c.type,
    c.message,
    c.sent_at,
    c.user_id,
    u.email,
    u.full_name,
    e.id,
    e.slug,
    e.title,
    e.organizer,
    d.deadline_at,
    ((d.deadline_at AT TIME ZONE 'Asia/Jakarta')::date - (NOW() AT TIME ZONE 'Asia/Jakarta')::date)::INT
  FROM claimed c
  JOIN public.users u ON u.id = c.user_id
  JOIN public.events e ON e.id = c.event_id
  JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
  ORDER BY c.sent_at, c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ack_notification_dispatch(p_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  acked INT;
BEGIN
  -- Hanya baris yang memang sedang diklaim: ack untuk id karangan atau
  -- untuk baris yang belum pernah dibagikan tidak boleh menandainya terkirim.
  UPDATE public.notifications
  SET dispatched_at = NOW()
  WHERE id = ANY (COALESCE(p_ids, '{}'))
    AND dispatched_at IS NULL
    AND dispatch_claimed_at IS NOT NULL;
  GET DIAGNOSTICS acked = ROW_COUNT;
  RETURN acked;
END;
$$;

-- Payload memuat email pengguna: hanya service_role (dipanggil route
-- handler server setelah memeriksa CRON_SECRET), tidak pernah klien.
REVOKE ALL ON FUNCTION public.claim_notification_dispatch(INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ack_notification_dispatch(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_dispatch(INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_notification_dispatch(UUID[]) TO service_role;
