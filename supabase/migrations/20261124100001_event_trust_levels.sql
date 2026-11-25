-- =====================================================================
-- Tingkat kepercayaan kegiatan + data uji (ADR-096)
--
-- 1. `events.verification_level` — dua klaim yang bisa dibedakan pembaca:
--    MODERATOR_VERIFIED = moderator mencocokkan detailnya LANGSUNG dengan
--      kanal resmi penyelenggara (atau acara dibuat StudentFo sendiri /
--      dikelola penyelenggara terverifikasi);
--    PUBLIC_SOURCE (bawaan) = disalin dari pengumuman publik dan lolos
--      moderasi, tetapi tidak dicocokkan langsung dengan penyelenggaranya.
--    Sebelumnya UI menyebut SEMUA kegiatan "diverifikasi manual" — klaim
--    yang lebih kuat dari pemeriksaan yang benar-benar dilakukan untuk
--    hasil scraping. Ditulis hanya admin/service_role: klien biasa tidak
--    punya hak UPDATE atas events (policy `events_admin_all`).
-- 2. `events.is_demo` — data uji/dummy. Ditutup di SATU titik, policy
--    `events_public_read`: view `events_listing` & RPC
--    `list_personalized_events` adalah SECURITY INVOKER, dan policy tabel
--    anak (kategori, tenggat, foto, tim, interaksi) memeriksa induknya lewat
--    subquery yang ikut tunduk pada RLS ini. Admin tetap melihatnya lewat
--    `events_admin_all` untuk menguji alur.
--
-- Tanpa DROP: ALTER POLICY & CREATE OR REPLACE saja (aman diterapkan lewat MCP).
-- =====================================================================

ALTER TABLE public.events
  ADD COLUMN verification_level VARCHAR(20) NOT NULL DEFAULT 'PUBLIC_SOURCE'
    CONSTRAINT events_verification_level_check CHECK (verification_level IN ('MODERATOR_VERIFIED', 'PUBLIC_SOURCE')),
  ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.verification_level IS
  'MODERATOR_VERIFIED = dicocokkan langsung dengan kanal resmi penyelenggara; PUBLIC_SOURCE = dari pengumuman publik, lolos moderasi. Cermin VERIFICATION_LEVELS (src/types/domain.ts). ADR-096.';
COMMENT ON COLUMN public.events.is_demo IS
  'Data uji: tidak pernah terbaca anon/anggota (policy events_public_read). ADR-096.';

-- Backfill konservatif: hanya kegiatan yang SUDAH punya jejak pemeriksaan
-- langsung. Menaikkan semua baris lama ke MODERATOR_VERIFIED = mengulang
-- klaim berlebihan yang justru sedang diperbaiki.
UPDATE public.events e
SET verification_level = 'MODERATOR_VERIFIED'
WHERE e.verification_badge IS NOT NULL
   OR e.registration_mode = 'studentfo'
   OR EXISTS (
     SELECT 1
     FROM public.event_managers m
     JOIN public.organizer_profiles o ON o.user_id = m.user_id AND o.status = 'VERIFIED'
     WHERE m.event_id = e.id
   );

ALTER POLICY events_public_read ON public.events
  USING (status IN ('APPROVED', 'EXPIRED') AND NOT is_demo);

-- SECURITY DEFINER (melewati RLS): angka "penyelenggara" di beranda tidak boleh ikut menghitung data uji.
CREATE OR REPLACE FUNCTION public.get_distinct_organizer_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(DISTINCT organizer)::integer
  FROM public.events
  WHERE status = 'APPROVED' AND NOT is_demo;
$$;
