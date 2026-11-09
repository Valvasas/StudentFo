-- =====================================================================
-- Lencana di profil publik & lobi (ADR-072, melanjutkan ADR-068)
--
-- Lencana tetap DIHITUNG di aplikasi (`evaluateBadges`, src/lib/achievements.ts)
-- — satu salinan aturan anti-curang. Fungsi ini hanya menyerahkan FAKTA yang
-- dibutuhkan aturan itu, untuk orang yang MEMILIH menampilkan lencananya:
--   * pendaftaran CONFIRMED pada acara tayang/kedaluwarsa, tanpa acara yang ia
--     kelola sendiri, satu baris per acara — TANPA id, judul, atau jawaban
--     formulir (cukup jenis, status, tenggat, waktu konfirmasi);
--   * jumlah kiriman yang disetujui moderator;
--   * status penyelenggara & waktu verifikasinya;
--   * waktu tutup acara kelolaan (hanya bila masih terverifikasi, cermin
--     organizer_event_history()).
--
-- Siapa yang menerima: pemilik sendiri, atau pembaca yang boleh melihat
-- profilnya (`can_view_profile`) / sesama anggota lobi lomba — dan tidak
-- saling memblokir. Bawaan show_badges = FALSE: lencana pernah dijanjikan
-- privat (tab "Lencana" di profil sendiri), jadi menampilkannya harus pilihan.
-- =====================================================================

ALTER TABLE public.users ADD COLUMN show_badges BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.users.show_badges IS
  'TRUE = lencana yang sudah diraih terlihat di profil publik & lobi lomba (public_badge_facts).';

-- Hak UPDATE tabel ini PER KOLOM (migration 20260913100001, AGENTS §14).
GRANT UPDATE (show_badges) ON public.users TO authenticated;

CREATE OR REPLACE FUNCTION public.public_badge_facts(p_users UUID[])
RETURNS TABLE (user_id UUID, facts JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.id,
    jsonb_build_object(
      'registrations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'event_type', r.event_type,
          'event_status', r.event_status,
          'deadline_at', r.deadline_at,
          'confirmed_at', r.confirmed_at
        ))
        FROM (
          SELECT DISTINCT ON (er.event_id)
            e.event_type, e.status AS event_status, d.deadline_at, COALESCE(er.reviewed_at, er.created_at) AS confirmed_at
          FROM public.event_registrations er
          JOIN public.events e ON e.id = er.event_id AND e.status IN ('APPROVED', 'EXPIRED')
          LEFT JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
          WHERE er.user_id = u.id
            AND er.status = 'CONFIRMED'
            AND NOT EXISTS (SELECT 1 FROM public.event_managers m WHERE m.event_id = er.event_id AND m.user_id = u.id)
          ORDER BY er.event_id, er.created_at
        ) r
      ), '[]'::jsonb),
      'approved_submissions', (
        SELECT count(*) FROM public.ugc_submissions s WHERE s.submitted_by = u.id AND s.status = 'APPROVED'
      ),
      'organizer_status', o.status,
      'organizer_reviewed_at', o.reviewed_at,
      'hosted_closed_at', COALESCE((
        SELECT jsonb_agg(d.deadline_at)
        FROM public.event_managers m
        JOIN public.events e ON e.id = m.event_id
        LEFT JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
        WHERE m.user_id = u.id
          AND o.status = 'VERIFIED'
          AND (e.status = 'EXPIRED' OR (e.status = 'APPROVED' AND d.deadline_at < now()))
      ), '[]'::jsonb)
    )
  FROM public.users u
  LEFT JOIN public.organizer_profiles o ON o.user_id = u.id
  WHERE u.id = ANY (p_users[1:100])
    AND u.suspended_at IS NULL
    AND (
      u.id = (select auth.uid())
      OR (
        u.show_badges
        AND (
          public.can_view_profile(u.id)
          OR (public.shares_lobby_with(u.id) AND NOT public.is_blocked((select auth.uid()), u.id))
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.public_badge_facts(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_badge_facts(UUID[]) TO authenticated;
