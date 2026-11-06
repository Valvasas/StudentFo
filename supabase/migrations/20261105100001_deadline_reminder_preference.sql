-- =====================================================================
-- Preferensi pengingat tenggat per akun (ADR-067)
--
-- Halaman Notifikasi sebelumnya hanya MENJELASKAN pengingat H-3/H-1; tidak
-- ada cara mematikannya, padahal pengingat dibuat otomatis untuk setiap
-- kegiatan yang disimpan/dilacak. Kolom ini satu-satunya saklar yang
-- benar-benar dihormati server: `create_deadline_notifications()` melewati
-- akun yang mematikannya, jadi antrean kanal luar (ADR-051) ikut kosong.
--
-- Bawaan TRUE: pengingat yang hilang adalah kegagalan paling merugikan
-- produk ini (ADR-051) — akun lama tetap diingatkan tanpa perlu memilih.
-- Notifikasi yang SUDAH dibuat tidak dihapus saat saklar dimatikan.
-- =====================================================================

ALTER TABLE public.users
  ADD COLUMN deadline_reminders BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.users.deadline_reminders IS
  'FALSE = create_deadline_notifications() tidak membuat pengingat H-3/H-1 untuk akun ini.';

-- Hak UPDATE di tabel ini PER KOLOM (migration 20260913100001, AGENTS §14):
-- tanpa GRANT ini pemilik akun tidak bisa mengubah saklarnya sendiri, dan
-- GRANT se-tabel akan membuka kembali kolom `role`.
GRANT UPDATE (deadline_reminders) ON public.users TO authenticated;

-- Isi identik dengan versi 20260925100001; satu-satunya perubahan adalah
-- saringan `deadline_reminders` lewat LEFT JOIN ke users.
CREATE OR REPLACE FUNCTION public.create_deadline_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  WITH watched AS (
    SELECT user_id, event_id FROM public.saved_events
    UNION
    SELECT user_id, event_id FROM public.application_tracker
  ),
  due AS (
    SELECT
      w.user_id,
      w.event_id,
      e.title,
      (d.deadline_at AT TIME ZONE 'Asia/Jakarta')::date
        - (NOW() AT TIME ZONE 'Asia/Jakarta')::date AS days_left
    FROM watched w
    -- LEFT JOIN: akun yang baris profilnya absen (handle_new_user melewati
    -- insert, lihat src/lib/auth.ts) tetap diingatkan seperti sebelumnya.
    LEFT JOIN public.users u      ON u.id = w.user_id
    JOIN public.events e          ON e.id = w.event_id
    JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
    WHERE e.status = 'APPROVED'
      AND COALESCE(u.deadline_reminders, TRUE)
  )
  INSERT INTO public.notifications (user_id, event_id, type, message)
  SELECT
    due.user_id,
    due.event_id,
    CASE WHEN due.days_left >= 2 THEN 'DEADLINE_H3' ELSE 'DEADLINE_H1' END,
    CASE due.days_left
      WHEN 0 THEN 'Hari terakhir — pendaftaran ' || due.title || ' ditutup hari ini.'
      WHEN 1 THEN 'Terakhir — pendaftaran ' || due.title || ' ditutup besok.'
      ELSE        'Pendaftaran ' || due.title || ' ditutup ' || due.days_left || ' hari lagi.'
    END
  FROM due
  WHERE due.days_left BETWEEN 0 AND 3
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_deadline_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_deadline_notifications() TO service_role;
