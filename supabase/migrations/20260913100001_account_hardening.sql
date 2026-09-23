-- =====================================================================
-- StudentFo — Migration 0005: pengerasan sistem akun (Phase 2)
--
-- Dijalankan bersamaan dengan dinyalakannya pendaftaran & login. Dua
-- perubahan, keduanya soal apa yang terjadi ketika tabel `users` akhirnya
-- benar-benar berisi orang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. KOREKSI KRITIS — `REVOKE UPDATE (role)` di migration 0003 TIDAK BEKERJA
--
-- Di PostgreSQL, hak level KOLOM tidak bisa mengurangi hak level TABEL.
-- Supabase memberi `authenticated` hak UPDATE se-tabel secara default, dan
-- selama hak itu masih ada, `REVOKE UPDATE (role) ON users` tidak berefek
-- apa pun — PostgreSQL bahkan hanya mengeluarkan WARNING, bukan error,
-- sehingga migration-nya terlihat sukses.
--
-- Akibatnya, sampai migration ini: setiap pemilik akun bisa mengirim satu
-- PATCH ke PostgREST untuk BARISNYA SENDIRI — yang memang diizinkan policy
-- `users_update_own` — dengan body {"role":"ADMIN"}. Setelah itu ia lolos
-- policy `events_admin_all` dan bisa menerbitkan, mengubah, atau menghapus
-- event apa pun, termasuk menyetujui kiriman scraper tanpa verifikasi.
--
-- Lubang ini tidak bisa dipakai selama belum ada satu pun pengguna. Ia jadi
-- nyata persis pada hari sistem akun dinyalakan — yaitu sekarang.
--
-- Perbaikannya: cabut hak se-tabel lebih dulu, lalu berikan kembali HANYA
-- kolom yang memang boleh diubah pemiliknya.
--   - `role`       : promosi admin hanya lewat service_role / SQL editor.
--   - `id`, `email`: identitas, dikelola auth.users + trigger.
--   - `created_at` : jejak waktu, bukan milik klien.
--   - `updated_at` : sengaja TIDAK diberikan. Trigger touch_updated_at()
--                    mengisinya sendiri, dan trigger BEFORE tidak butuh hak
--                    kolom — jadi memberikannya hanya membuka peluang klien
--                    memalsukan waktu perubahan.
-- ---------------------------------------------------------------------
REVOKE UPDATE ON public.users FROM authenticated, anon;

GRANT UPDATE (full_name, education_level, major, interests)
  ON public.users TO authenticated;

-- ---------------------------------------------------------------------
-- 2. handle_new_user(): jangan sampai pembuatan profil menjatuhkan signup
--
-- Fungsi ini berjalan di dalam transaksi INSERT ke auth.users. Kalau ia
-- melempar exception, seluruh pendaftaran ikut batal dan pengguna menerima
-- error 500 tanpa penjelasan.
--
-- Satu kasus nyata yang bisa memicunya: `users.email` bersifat UNIQUE,
-- sementara Supabase bisa membuat baris auth.users KEDUA dengan email yang
-- sama ketika identitas email dan identitas Google belum tertaut (mis.
-- alamatnya belum pernah dikonfirmasi). Insert profil kedua melanggar
-- UNIQUE, dan tanpa penanganan di bawah, login Google-nya gagal total.
--
-- Ditambahkan juga fallback ke klaim `name`: sebagian penyedia OAuth hanya
-- mengisi itu, bukan `full_name`.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

  RETURN NEW;

EXCEPTION
  WHEN unique_violation THEN
    -- Profil untuk email ini sudah dipegang baris lain. Pendaftaran tetap
    -- diloloskan: sesi auth-nya sah, dan aplikasi sudah menangani profil
    -- yang absen (lihat getSessionUser() di src/lib/auth.ts) dengan
    -- menampilkan nama dari metadata.
    RETURN NEW;
END;
$$;
