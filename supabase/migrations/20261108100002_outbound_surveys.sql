-- =====================================================================
-- Pendataan kinerja postingan (ADR-070, bentuk akhir ADR-073)
--
-- Sebelum keluar ke tautan pendaftaran resmi, pengunjung menjawab beberapa
-- pertanyaan singkat untuk pemilik StudentFo — atau menekan "Lewati".
-- Pertanyaannya DIATUR ADMIN (`outbound_survey_config`, satu baris):
-- tiga pertanyaan bawaan yang bisa dimatikan/diwajibkan + pertanyaan
-- tambahan berbentuk FormField (ADR-056) di JSONB.
--
-- Sengaja TANPA user_id/email: data kinerja tidak butuh identitas, dan
-- tanpa tautan ke akun ia tidak ikut ekspor/hapus akun. `signed_in` hanya
-- membedakan pengunjung masuk dari tamu.
--
-- Migration ini belum pernah diterapkan ke database mana pun saat bentuknya
-- diubah ke ADR-073 — karena itu diubah di tempat, bukan ditambal migration baru.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Konfigurasi pertanyaan — satu baris (id = 1)
-- ---------------------------------------------------------------------
CREATE TABLE public.outbound_survey_config (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ask_education   VARCHAR(8) NOT NULL DEFAULT 'REQUIRED' CHECK (ask_education IN ('OFF', 'OPTIONAL', 'REQUIRED')),
  ask_region      VARCHAR(8) NOT NULL DEFAULT 'OPTIONAL' CHECK (ask_region IN ('OFF', 'OPTIONAL', 'REQUIRED')),
  ask_institution VARCHAR(8) NOT NULL DEFAULT 'OPTIONAL' CHECK (ask_institution IN ('OFF', 'OPTIONAL', 'REQUIRED')),
  -- Bentuk tiap butir divalidasi aplikasi (`parseOutboundConfigInput`); di
  -- sini cukup batas kasar supaya klien yang tidak kita tulis tidak bisa
  -- menyimpan dokumen raksasa. 8 = OUTBOUND_LIMITS.maxQuestions.
  questions       JSONB NOT NULL DEFAULT '[]'::jsonb
                  CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) <= 8 AND pg_column_size(questions) <= 16384),
  updated_at      TIMESTAMPTZ,
  updated_by      UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Bawaan = DEFAULT_OUTBOUND_CONFIG di src/lib/outbound-survey.ts (dikunci supabase/tests/110_*).
INSERT INTO public.outbound_survey_config (id, questions) VALUES (1, '[
  {"id": "f_sumber", "type": "select", "label": "Dari mana kamu tahu info ini?", "help": null, "required": true,
   "options": ["Instagram", "TikTok", "Grup WhatsApp / Telegram", "Teman, guru, atau dosen", "Pencarian Google", "Jelajah di StudentFo", "Lainnya"]},
  {"id": "f_rencana", "type": "select", "label": "Rencanamu untuk acara ini?", "help": null, "required": false,
   "options": ["Ikut sendiri", "Bersama tim yang sudah ada", "Masih mencari tim atau partner", "Baru lihat-lihat"]}
]'::jsonb);

-- Dibaca & ditulis HANYA oleh server (service_role): halaman pendataan
-- merendernya di server, editor admin menulis setelah checkAdminAccess()
-- (pola aksi moderasi). Tanpa policy = tertutup untuk anon/authenticated.
ALTER TABLE public.outbound_survey_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbound_survey_config FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Jawaban — satu baris per kunjungan yang lanjut ke pendaftaran
-- ---------------------------------------------------------------------
CREATE TABLE public.outbound_surveys (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  signed_in       BOOLEAN NOT NULL,
  skipped         BOOLEAN NOT NULL DEFAULT FALSE,
  education_level education_level,
  -- Kode wilayah Kemendagri sampai kab/kota (`32` / `32.73`), lihat src/lib/wilayah.ts.
  region_code     VARCHAR(5) CHECK (region_code IS NULL OR region_code ~ '^[0-9]{2}(\.[0-9]{2})?$'),
  -- NPSN / kode PT dari direktori tempat studi (ADR-076); null = diketik bebas.
  institution_id  VARCHAR(12) CHECK (institution_id IS NULL OR institution_id ~ '^[0-9A-Z]{5,12}$'),
  institution     VARCHAR(120) CHECK (institution IS NULL OR char_length(btrim(institution)) BETWEEN 2 AND 120),
  answers         JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) <= 4096),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- "Lewati" berarti tidak menjawab apa pun — bukan setengah jawaban.
  CONSTRAINT outbound_surveys_skip_is_empty CHECK (
    NOT skipped OR (education_level IS NULL AND region_code IS NULL AND institution_id IS NULL AND institution IS NULL AND answers = '{}'::jsonb)
  )
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
