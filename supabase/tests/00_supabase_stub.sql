-- =====================================================================
-- Stub minimal lingkungan Supabase, HANYA untuk menguji migration di
-- Postgres polos (CI & lokal). JANGAN dijalankan di project Supabase:
-- di sana role, schema `auth`, dan `auth.uid()` sudah disediakan platform.
--
-- `auth.uid()` membaca `request.jwt.claim.sub`, sama seperti PostgREST
-- mengisinya. Test meniru pengguna dengan:
--   SET ROLE authenticated; SET request.jwt.claim.sub = '<uuid>';
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT,
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Definisi yang sama dengan Supabase: PostgREST >= 9 hanya mengisi
-- `request.jwt.claims` (JSON); `request.jwt.claim.sub` tetap dibaca untuk
-- test SQL yang meniru pengguna dengan SET.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Default privileges yang diberikan Supabase ke schema public. Tanpa ini
-- test RLS akan lolos karena alasan yang salah (tidak ada GRANT sama sekali).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
