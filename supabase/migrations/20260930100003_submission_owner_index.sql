-- =====================================================================
-- Index pemilik kiriman.
--
-- "Kiriman saya" (/submit, studio penyelenggara) membaca
--   WHERE submitted_by = $1 ORDER BY created_at DESC LIMIT n
-- Tanpa index ini setiap pembukaan halaman memindai seluruh
-- `ugc_submissions`. Index yang sama juga dipakai FK
-- `submitted_by → users ON DELETE SET NULL`: tanpa index, menghapus satu akun
-- memindai seluruh tabel kiriman di dalam transaksi penghapusan.
-- Partial: kiriman tamu (submitted_by NULL) tidak pernah dicari lewat jalur ini.
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_ugc_submissions_owner
  ON public.ugc_submissions (submitted_by, created_at DESC)
  WHERE submitted_by IS NOT NULL;
