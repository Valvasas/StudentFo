-- =====================================================================
-- Pembatas laju bersama untuk Server Action (masuk, daftar, lupa sandi,
-- /submit), dikunci per kunci ember yang sudah di-HMAC di aplikasi.
--
-- Kenapa di Postgres: aplikasi berjalan di banyak instance serverless;
-- penghitung in-memory berlaku per instance saja. Kenapa bukan hanya
-- mengandalkan Supabase Auth: panggilan auth datang dari SERVER Next.js,
-- jadi batas per-IP bawaan Supabase melihat satu IP (server) untuk semua
-- pengguna — satu penyerang menghabiskan kuota masuk semua orang.
--
-- Kunci ember TIDAK berisi IP mentah: aplikasi mengirim HMAC-SHA256(IP),
-- sehingga tabel ini tidak menyimpan data pribadi yang bisa dibaca balik.
-- =====================================================================

CREATE TABLE public.rate_limit_hits (
  bucket TEXT NOT NULL CHECK (length(bucket) BETWEEN 1 AND 128),
  hit_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu-satunya pola query: hitung hit satu ember dalam jendela waktu.
CREATE INDEX idx_rate_limit_hits_bucket_time ON public.rate_limit_hits (bucket, hit_at);

-- Deny-by-default tanpa policy: hanya fungsi SECURITY DEFINER di bawah
-- (dan service_role) yang menyentuh tabel ini.
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM PUBLIC, anon, authenticated;

-- TRUE = diizinkan (dan hit dicatat); FALSE = batas terlampaui (tidak dicatat,
-- supaya penyerang yang terus mencoba tidak memperpanjang hukumannya sendiri
-- tanpa batas — jendelanya tetap bergeser).
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket TEXT,
  p_limit INT,
  p_window_seconds INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  hits INT;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid_rate_limit';
  END IF;

  -- Serialisasi per ember: tanpa kunci, N request bersamaan membaca hitungan
  -- yang sama dan semuanya lolos (pola yang sama dengan batas /submit, ADR-023).
  PERFORM pg_advisory_xact_lock(hashtextextended('rate:' || p_bucket, 0));

  DELETE FROM public.rate_limit_hits
  WHERE bucket = p_bucket AND hit_at < now() - make_interval(secs => p_window_seconds);

  SELECT count(*) INTO hits FROM public.rate_limit_hits WHERE bucket = p_bucket;
  IF hits >= p_limit THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.rate_limit_hits (bucket) VALUES (p_bucket);
  RETURN TRUE;
END;
$$;

-- Ember yang tidak pernah dipakai lagi tidak tersapu oleh DELETE di atas.
-- Dipanggil harian oleh penjadwal (lihat migration pg_cron).
CREATE OR REPLACE FUNCTION public.purge_rate_limit_hits() RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH gone AS (
    DELETE FROM public.rate_limit_hits WHERE hit_at < now() - interval '1 day' RETURNING 1
  )
  SELECT count(*)::int FROM gone;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_rate_limit_hits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_rate_limit_hits() TO service_role;
