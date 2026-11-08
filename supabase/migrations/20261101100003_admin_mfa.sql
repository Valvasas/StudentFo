-- =====================================================================
-- Hak admin lewat token pengguna mensyaratkan MFA (aal2) — ADR-062 #4.
--
-- Gerbang aplikasi (/admin) saja tidak cukup: PostgREST bisa dipanggil
-- langsung dengan anon key + access token. Sandi admin yang bocor (aal1)
-- tanpa ini tetap membuka semua policy & fungsi yang memanggil is_admin()
-- — mis. membaca seluruh pendaftaran & bukti bayar.
--
-- `aal` dibaca dari klaim JWT yang sudah diverifikasi PostgREST (sama dengan
-- auth.jwt() Supabase). Rute admin yang memakai service_role tidak lewat
-- fungsi ini; di sana gerbangnya checkAdminAccess() (aal2 juga).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', '') = 'aal2'
     AND EXISTS (
       SELECT 1 FROM public.users u
       WHERE u.id = auth.uid() AND u.role = 'ADMIN'
     );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
