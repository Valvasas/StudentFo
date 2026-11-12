-- =====================================================================
-- Foto profil & banner kartu profil (ADR-083)
--
-- 1. `users.avatar_id/_type`, `users.banner_id/_type` — satu foto profil dan
--    satu banner unggahan per akun. Berkasnya di bucket Storage PRIVAT
--    `profile-media` (pola ADR-056: tanpa policy `storage.objects`, hanya
--    server ber-service_role yang membaca/menulis), di path
--    `<user_id>/<id>.<ext>`. `id` acak & baru di setiap unggahan, jadi alamat
--    `/media/profil/<id>` tidak bisa ditebak dan aman di-cache peramban.
-- 2. `users.banner_preset` — banner bawaan bergaya buku sketsa (tanpa
--    berkas, tanpa moderasi). Daftarnya cermin `BANNER_PRESETS` di
--    src/lib/profile-media.ts (dikunci tes).
-- 3. Siapa yang melihat: aturan yang SAMA dengan detail profil
--    (`public_profile_details`, ADR-077) — pemilik, pembaca yang lolos
--    `can_view_profile()`, atau sesama anggota lobi tanpa blokir. Tamu tidak
--    pernah (semua fungsi butuh auth.uid()); akun ditangguhkan tidak tampil.
--    Jadi "Hanya koneksi" di keterlihatan profil juga menutup fotonya.
-- 4. Menulis id berkas HANYA lewat RPC DEFINER milik sendiri: klien tidak
--    diberi hak UPDATE kolomnya, dan RPC mengembalikan path berkas lama
--    supaya server bisa menghapusnya (tidak ada berkas yatim).
-- 5. Moderator bisa mencabut foto & banner unggahan (`admin_clear_profile_media`,
--    tercatat di riwayat moderasi); hapus akun ikut menghapus berkasnya
--    (`account_storage_paths`).
--
-- Hanya ADD / CREATE / CREATE OR REPLACE: penerapannya tidak meminta
-- konfirmasi "perintah destruktif". Kode aman urutan deploy: tanpa kolom ini
-- semua orang tampil dengan inisial & sampul bawaan seperti sebelumnya.
-- =====================================================================

ALTER TABLE public.users
  ADD COLUMN avatar_id     UUID,
  ADD COLUMN avatar_type   VARCHAR(20),
  ADD COLUMN banner_id     UUID,
  ADD COLUMN banner_type   VARCHAR(20),
  ADD COLUMN banner_preset VARCHAR(16),
  -- Id tanpa jenis = path berkasnya tidak bisa diturunkan.
  ADD CONSTRAINT users_avatar_file CHECK (
    (avatar_id IS NULL) = (avatar_type IS NULL)
    AND (avatar_type IS NULL OR avatar_type IN ('image/jpeg', 'image/png', 'image/webp'))
  ),
  ADD CONSTRAINT users_banner_file CHECK (
    (banner_id IS NULL) = (banner_type IS NULL)
    AND (banner_type IS NULL OR banner_type IN ('image/jpeg', 'image/png', 'image/webp'))
  ),
  ADD CONSTRAINT users_banner_preset_values CHECK (
    banner_preset IS NULL
    OR banner_preset IN ('kertas', 'matahari', 'ombak', 'daun', 'senja', 'bintang', 'kotak', 'stabilo')
  );

-- Rute /media/profil/<id> mencari pemilik dari id berkas; unik sekaligus
-- menjamin satu id tidak pernah menunjuk dua akun.
CREATE UNIQUE INDEX users_avatar_id_key ON public.users (avatar_id) WHERE avatar_id IS NOT NULL;
CREATE UNIQUE INDEX users_banner_id_key ON public.users (banner_id) WHERE banner_id IS NOT NULL;

COMMENT ON COLUMN public.users.avatar_id IS 'Id berkas foto profil di bucket profile-media (ADR-083). Ditulis hanya lewat set_profile_media().';
COMMENT ON COLUMN public.users.banner_id IS 'Id berkas banner unggahan. Bila kosong, banner_preset (atau sampul bawaan) yang tampil.';
COMMENT ON COLUMN public.users.banner_preset IS 'Banner bawaan pilihan pemilik (BANNER_PRESETS di src/lib/profile-media.ts).';

-- Hak UPDATE tabel ini PER KOLOM (migration 20260913100001, AGENTS §14).
-- Hanya preset: id & jenis berkas ditulis RPC di bawah, tidak pernah klien.
GRANT UPDATE (banner_preset) ON public.users TO authenticated;

CREATE OR REPLACE FUNCTION public.profile_media_path(p_user UUID, p_id UUID, p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_user::text || '/' || p_id::text || '.'
    || CASE p_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
$$;

-- ---------------------------------------------------------------------
-- Pasang / ganti. Dipanggil server SETELAH berkasnya terunggah, dengan sesi
-- pemilik. Mengembalikan path berkas LAMA (NULL bila belum ada) untuk dihapus.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_profile_media(p_kind TEXT, p_id UUID, p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid      UUID := auth.uid();
  old_path TEXT;
BEGIN
  IF uid IS NULL OR EXISTS (SELECT 1 FROM public.users WHERE id = uid AND suspended_at IS NOT NULL) THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('avatar', 'banner') OR p_id IS NULL OR p_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'invalid_profile_media' USING ERRCODE = '23514';
  END IF;
  -- Foto tampil ke anggota lain: akun yang dibajak tidak boleh memutar-mutar gambar tanpa batas.
  IF NOT public.consume_rate_limit('profile-media:' || uid::text, 20, 86400) THEN
    RAISE EXCEPTION 'profile_media_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  IF p_kind = 'avatar' THEN
    SELECT public.profile_media_path(u.id, u.avatar_id, u.avatar_type) INTO old_path
    FROM public.users u WHERE u.id = uid AND u.avatar_id IS NOT NULL FOR UPDATE;
    UPDATE public.users SET avatar_id = p_id, avatar_type = p_type WHERE id = uid;
  ELSE
    SELECT public.profile_media_path(u.id, u.banner_id, u.banner_type) INTO old_path
    FROM public.users u WHERE u.id = uid AND u.banner_id IS NOT NULL FOR UPDATE;
    UPDATE public.users SET banner_id = p_id, banner_type = p_type WHERE id = uid;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_missing' USING ERRCODE = 'P0002';
  END IF;
  RETURN old_path;
END;
$$;

-- Lepas foto/banner unggahan milik sendiri. Mengembalikan path berkasnya (NULL bila memang kosong).
CREATE OR REPLACE FUNCTION public.clear_profile_media(p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid      UUID := auth.uid();
  old_path TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'avatar' THEN
    SELECT public.profile_media_path(u.id, u.avatar_id, u.avatar_type) INTO old_path
    FROM public.users u WHERE u.id = uid AND u.avatar_id IS NOT NULL FOR UPDATE;
    UPDATE public.users SET avatar_id = NULL, avatar_type = NULL WHERE id = uid;
  ELSIF p_kind = 'banner' THEN
    SELECT public.profile_media_path(u.id, u.banner_id, u.banner_type) INTO old_path
    FROM public.users u WHERE u.id = uid AND u.banner_id IS NOT NULL FOR UPDATE;
    UPDATE public.users SET banner_id = NULL, banner_type = NULL WHERE id = uid;
  ELSE
    RAISE EXCEPTION 'invalid_profile_media' USING ERRCODE = '23514';
  END IF;
  RETURN old_path;
END;
$$;

-- ---------------------------------------------------------------------
-- Yang boleh dilihat pembaca (maks. 100 orang). Tidak ada baris = tidak
-- boleh dilihat ATAU belum memasang apa pun — sengaja tidak dibedakan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_profile_media(p_users UUID[])
RETURNS TABLE (user_id UUID, avatar_id UUID, banner_id UUID, banner_preset VARCHAR)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.avatar_id, u.banner_id, u.banner_preset
  FROM public.users u
  WHERE u.id = ANY (p_users[1:100])
    AND u.suspended_at IS NULL
    AND (u.avatar_id IS NOT NULL OR u.banner_id IS NOT NULL OR u.banner_preset IS NOT NULL)
    AND (
      u.id = (select auth.uid())
      OR public.can_view_profile(u.id)
      OR (public.shares_lobby_with(u.id) AND NOT public.is_blocked((select auth.uid()), u.id))
    );
$$;

-- Berkas di balik /media/profil/<id>: path & jenisnya, HANYA bila pembaca
-- boleh melihat pemiliknya. Dipanggil dengan sesi pembaca — PostgREST yang
-- memverifikasi tokennya, jadi rute berkas tidak perlu bolak-balik ke server auth.
CREATE OR REPLACE FUNCTION public.profile_media_file(p_id UUID)
RETURNS TABLE (path TEXT, content_type TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.profile_media_path(u.id, p_id, CASE WHEN u.avatar_id = p_id THEN u.avatar_type ELSE u.banner_type END),
    (CASE WHEN u.avatar_id = p_id THEN u.avatar_type ELSE u.banner_type END)::text
  FROM public.users u
  WHERE (u.avatar_id = p_id OR u.banner_id = p_id)
    AND u.suspended_at IS NULL
    AND (
      u.id = (select auth.uid())
      OR public.can_view_profile(u.id)
      OR (public.shares_lobby_with(u.id) AND NOT public.is_blocked((select auth.uid()), u.id))
    )
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- Moderasi: cabut foto & banner unggahan seseorang (preset dibiarkan —
-- gambarnya milik StudentFo). Dipanggil rute admin (service_role) setelah
-- checkAdminAccess(); mengembalikan path berkas untuk dihapus dari Storage.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_clear_profile_media(p_user UUID, p_actor UUID, p_reason TEXT)
RETURNS TABLE (path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.users%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.users WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF target.avatar_id IS NULL AND target.banner_id IS NULL THEN
    RAISE EXCEPTION 'profile_media_empty' USING ERRCODE = 'P0002';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'invalid_moderation_reason' USING ERRCODE = '23514';
  END IF;

  UPDATE public.users
  SET avatar_id = NULL, avatar_type = NULL, banner_id = NULL, banner_type = NULL
  WHERE id = p_user;

  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES ('user', p_user, 'Foto profil & banner dicabut', 'ACTIVE', 'ACTIVE', p_actor, left(btrim(p_reason), 500));

  IF target.avatar_id IS NOT NULL THEN
    path := public.profile_media_path(target.id, target.avatar_id, target.avatar_type);
    RETURN NEXT;
  END IF;
  IF target.banner_id IS NOT NULL THEN
    path := public.profile_media_path(target.id, target.banner_id, target.banner_type);
    RETURN NEXT;
  END IF;
END;
$$;

-- Hapus akun (ADR-061): berkas profil ikut dihapus DULU, bersama bukti bayar.
CREATE OR REPLACE FUNCTION public.account_storage_paths(p_user UUID)
RETURNS TABLE (bucket TEXT, path TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 'payment-proofs', r.proof_path FROM public.event_registrations r
  WHERE r.user_id = p_user AND r.proof_path IS NOT NULL
  UNION ALL
  SELECT 'profile-media', public.profile_media_path(u.id, u.avatar_id, u.avatar_type)
  FROM public.users u WHERE u.id = p_user AND u.avatar_id IS NOT NULL
  UNION ALL
  SELECT 'profile-media', public.profile_media_path(u.id, u.banner_id, u.banner_type)
  FROM public.users u WHERE u.id = p_user AND u.banner_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.profile_media_path(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_profile_media(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_profile_media(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_profile_media(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profile_media_file(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_clear_profile_media(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_storage_paths(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_media(TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_profile_media(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_profile_media(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_media_file(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_profile_media(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_storage_paths(UUID) TO service_role;

-- Bucket Storage privat (hanya bila schema `storage` Supabase ada — database
-- uji Postgres polos tidak memilikinya). 2 MB: foto profil ≤ 1 MB dan banner
-- ≤ 2 MB sudah diperiksa aplikasi dari byte-nya; ini plafon kedua.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('profile-media', 'profile-media', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;
