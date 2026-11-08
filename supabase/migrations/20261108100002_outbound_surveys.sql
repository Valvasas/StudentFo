-- =====================================================================
-- Pendataan kinerja postingan (ADR-070)
--
-- Sebelum keluar ke tautan pendaftaran resmi, pengunjung menjawab beberapa
-- pertanyaan singkat untuk pemilik StudentFo: jenjang, dari mana tahu info
-- ini, rencana ikut (lomba saja), dan — opsional — provinsi & asal sekolah/
-- kampus. Gunanya mengukur postingan mana yang benar-benar dipakai sampai
-- ke pendaftaran, dan saluran mana yang mendatangkannya.
--
-- Sengaja TANPA user_id/email: data kinerja tidak butuh identitas, dan
-- tanpa tautan ke akun ia tidak ikut ekspor/hapus akun. `signed_in` hanya
-- membedakan pengunjung masuk dari tamu.
--
-- Daftar nilai CHECK HARUS sama dengan OUTBOUND_SOURCES/OUTBOUND_PLANS di
-- src/types/domain.ts (dikunci src/lib/outbound-survey.test.ts).
-- =====================================================================

CREATE TABLE public.outbound_surveys (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  signed_in       BOOLEAN NOT NULL,
  education_level education_level NOT NULL,
  source          VARCHAR(12) NOT NULL CHECK (source IN ('INSTAGRAM', 'TIKTOK', 'WHATSAPP', 'TEMAN', 'GOOGLE', 'STUDENTFO', 'LAINNYA')),
  plan            VARCHAR(10) CHECK (plan IS NULL OR plan IN ('SENDIRI', 'TIM', 'CARI_TIM', 'LIHAT')),
  province        VARCHAR(60) CHECK (province IS NULL OR char_length(btrim(province)) BETWEEN 2 AND 60),
  institution     VARCHAR(120) CHECK (institution IS NULL OR char_length(btrim(institution)) BETWEEN 2 AND 120),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dasbor admin membaca per rentang waktu (7/30/90 hari); purge juga memakai kolom ini.
CREATE INDEX idx_outbound_surveys_time ON public.outbound_surveys (created_at);

-- Ditulis HANYA oleh server (service_role) setelah saringan bot & batas laju
-- per IP di aplikasi — pola recommendation_signals (ADR-032). Kalau anon bisa
-- INSERT, siapa pun bisa menggelembungkan "kinerja" sebuah postingan.
ALTER TABLE public.outbound_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY outbound_surveys_admin_read ON public.outbound_surveys
  FOR SELECT USING ((select public.is_admin()));
REVOKE ALL ON public.outbound_surveys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.outbound_surveys TO authenticated;

-- Retensi (pola ADR-060): jawaban > 365 hari tidak lagi berguna untuk menilai
-- postingan yang sedang tayang.
CREATE OR REPLACE FUNCTION public.purge_old_outbound_surveys() RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH gone AS (
    DELETE FROM public.outbound_surveys
    WHERE created_at < now() - interval '365 days'
    RETURNING 1
  )
  SELECT count(*)::int FROM gone;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_outbound_surveys() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_outbound_surveys() TO service_role;

-- Penjaga yang sama dengan 20260926120001: tanpa pg_cron hanya NOTICE.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     OR coalesce(current_setting('shared_preload_libraries', true), '') NOT LIKE '%pg_cron%'
     OR coalesce(current_setting('cron.database_name', true), 'postgres') <> current_database() THEN
    RAISE NOTICE 'pg_cron tidak tersedia — jadwalkan purge_old_outbound_surveys() dari luar.';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;
  -- 01:53 WIB: menit ganjil, tidak berebut dengan job harian lain.
  PERFORM cron.schedule('studentfo-purge-outbound-surveys', '53 18 * * *', 'SELECT public.purge_old_outbound_surveys()');
END
$migration$;
