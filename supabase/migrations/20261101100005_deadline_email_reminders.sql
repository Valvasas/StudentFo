-- =====================================================================
-- Pengingat tenggat lewat email, opt-in (ADR-062 #6) — menutup dua
-- penghalang ADR-051: persetujuan per pengguna & pengirim sungguhan.
--
-- Persetujuan = `users.deadline_email_opt_in_at` (waktu persetujuan, bukti
-- UU PDP Pasal 22/24), hanya ditulis lewat RPC milik sendiri; kolom ini tidak
-- termasuk hak UPDATE per-kolom `authenticated` (migration 20260913100001).
-- Antrean klaim (ADR-051) kini HANYA membagikan pengingat milik yang setuju —
-- tidak ada kanal luar yang bisa mengirim tanpa persetujuan.
-- =====================================================================

ALTER TABLE public.users ADD COLUMN deadline_email_opt_in_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_deadline_email_reminders(p_enabled BOOLEAN)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid    UUID := auth.uid();
  result TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE = '42501';
  END IF;
  -- Menyalakan ulang yang sudah menyala tidak menggeser waktu persetujuan.
  UPDATE public.users
  SET deadline_email_opt_in_at = CASE WHEN p_enabled THEN COALESCE(deadline_email_opt_in_at, now()) END
  WHERE id = uid
  RETURNING deadline_email_opt_in_at INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_deadline_email_reminders(BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_deadline_email_reminders(BOOLEAN) TO authenticated;

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
    JOIN public.users u ON u.id = n.user_id
    WHERE n.dispatched_at IS NULL
      AND n.type IN ('DEADLINE_H3', 'DEADLINE_H1')
      -- Hanya pemilik yang MENYETUJUI pengingat email, untuk pengingat yang
      -- dibuat SESUDAH persetujuannya, dan bukan akun yang ditangguhkan.
      AND u.deadline_email_opt_in_at IS NOT NULL
      AND n.sent_at >= u.deadline_email_opt_in_at
      AND u.suspended_at IS NULL
      -- Pengingat H-3 tertua yang masih bisa relevan berumur 3 hari; batas ini
      -- juga membatasi pindaian index pada baris milik yang tidak menyetujui
      -- (tidak pernah terkirim, tetap dispatched_at IS NULL sampai retensi).
      AND n.sent_at >= NOW() - interval '4 days'
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

REVOKE ALL ON FUNCTION public.claim_notification_dispatch(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_dispatch(INT, INT) TO service_role;
