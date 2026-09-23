-- =====================================================================
-- StudentFo — Migration 0007: profil anggota tim (Phase 3)
--
-- Tabel `teams` dan `team_members` sudah ada sejak migration 0001, dan
-- policy-nya sejak 0003. Yang belum ada: cara MENAMPILKAN nama anggota.
--
-- MASALAHNYA. Policy `users_select_own` (migration 0003) membatasi SELECT
-- di tabel `users` ke baris sendiri saja. Itu benar dan tidak boleh
-- dilonggarkan — tabel `users` memuat email, jenjang, dan jurusan. Tapi
-- akibatnya, anggota tim tidak bisa melihat nama satu sama lain, dan fitur
-- "cari rekan tim" berisi daftar UUID.
--
-- YANG TIDAK DILAKUKAN: menambah policy `users_select_all`. Itu akan
-- membuka SELURUH baris users — termasuk email — ke setiap pengguna yang
-- masuk. Satu kueri PostgREST dari browser sudah cukup untuk memanen
-- seluruh basis pengguna.
--
-- YANG DILAKUKAN: satu view sempit yang HANYA memuat nama tampilan, dan
-- hanya untuk orang yang benar-benar bergabung ke sebuah tim. Bergabung ke
-- tim publik adalah tindakan publik — itulah gunanya fitur ini — jadi
-- namanya memang dimaksudkan terlihat oleh calon rekan setim. Email,
-- jenjang, jurusan, dan peran sistem TIDAK ikut.
-- =====================================================================

-- security_invoker = off (bawaan) DIPILIH SECARA SADAR, kebalikan dari
-- `events_listing` di migration 0004 yang justru menyalakannya.
--
-- Dengan invoker = off, view berjalan dengan hak PEMILIKNYA, sehingga bisa
-- menembus `users_select_own`. Itu memang satu-satunya cara membaca
-- `full_name` orang lain tanpa melonggarkan policy tabelnya. Pembatasnya
-- dipindah ke BENTUK view: daftar kolomnya tetap, tidak menerima parameter,
-- dan tidak memuat satu pun kolom sensitif. Menambah kolom ke view ini
-- sama dengan membukanya ke seluruh pengguna yang masuk — jangan lakukan
-- tanpa membaca ulang catatan di atas.
CREATE OR REPLACE VIEW public.team_member_profiles AS
SELECT
  tm.team_id,
  tm.user_id,
  tm.role,
  tm.joined_at,
  u.full_name
FROM public.team_members tm
JOIN public.users u ON u.id = tm.user_id;

-- `anon` sengaja TIDAK diberi akses. Policy `teams_public_read` memang
-- mengizinkan tamu melihat daftar tim, tapi nama orang tidak ikut dibuka
-- ke publik yang tidak masuk — halaman /teams menuntut login (lihat
-- src/app/teams/page.tsx).
REVOKE ALL ON public.team_member_profiles FROM PUBLIC;
GRANT SELECT ON public.team_member_profiles TO authenticated;

COMMENT ON VIEW public.team_member_profiles IS
  'Nama tampilan anggota tim. Sengaja security_invoker = off untuk menembus users_select_own; hanya memuat full_name, tanpa email/jenjang/jurusan. Jangan tambah kolom.';

-- ---------------------------------------------------------------------
-- INDEX.
--
-- Halaman detail kegiatan dan halaman /teams sama-sama menanyakan "tim apa
-- saja untuk event ini". Tanpa index, tiap pertanyaan itu memindai seluruh
-- tabel teams. `team_members` tidak butuh index tambahan: primary key-nya
-- (team_id, user_id) sudah melayani pencarian anggota per tim.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_teams_event ON public.teams (event_id, created_at DESC);
