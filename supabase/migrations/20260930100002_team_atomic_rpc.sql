-- =====================================================================
-- `create_team_with_leader`: buat tim + daftarkan ketua dalam SATU transaksi.
--
-- Sebelumnya SupabaseEventRepository.createTeam() melakukan dua request
-- PostgREST (INSERT teams, lalu INSERT team_members) dan "membatalkan" yang
-- pertama dengan DELETE kalau yang kedua gagal. Kompensasi itu sendiri bisa
-- gagal (koneksi putus di tengah, timeout) dan meninggalkan tim tanpa ketua
-- — tim yang tampil di publik tapi tidak bisa dikelola siapa pun.
--
-- SECURITY INVOKER, BUKAN DEFINER — sengaja:
--   * Semua aturan (event harus APPROVED, created_by = pemanggil, ketua hanya
--     untuk tim milik sendiri, kapasitas) sudah ditegakkan RLS
--     (`teams_owner_insert`, `team_members_self_join`) dan trigger
--     `enforce_team_capacity`. INVOKER berarti fungsi ini tunduk pada
--     semuanya tanpa menyalin satu baris pun. DEFINER mem-bypass RLS dan
--     memaksa aturan itu ditulis ulang di sini — dua salinan yang pasti
--     suatu saat berbeda.
--   * Atomisitas tidak butuh DEFINER: badan fungsi plpgsql sudah berjalan
--     dalam satu transaksi.
--   * Pembuat diambil dari `auth.uid()`, TIDAK dari parameter. Parameter
--     `p_user_id` akan membuat siapa pun bisa membuat tim atas nama orang lain.
-- `SET search_path` tetap dipasang walau INVOKER: nama tak berkualifikasi di
-- badan fungsi tidak boleh bisa dibajak lewat search_path pemanggil.
--
-- Tidak ada `join_team_atomic`: bergabung adalah SATU INSERT, dan race slot
-- terakhir sudah dijaga `enforce_team_capacity` (20260923100001) yang
-- mengunci baris tim dengan `FOR UPDATE` sebelum menghitung anggota.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_team_with_leader(
  p_event_id     UUID,
  p_title        TEXT,
  p_description  TEXT,
  p_slots_needed INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_team  UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.teams (event_id, created_by, title, description, slots_needed)
  VALUES (p_event_id, v_actor, p_title, p_description, p_slots_needed)
  RETURNING id INTO v_team;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (v_team, v_actor, 'leader');

  RETURN v_team;
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_with_leader(UUID, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_with_leader(UUID, TEXT, TEXT, INT) TO authenticated;
