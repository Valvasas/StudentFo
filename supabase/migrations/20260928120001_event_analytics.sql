-- =====================================================================
-- StudentFo — Analitik acara untuk penyelenggara terverifikasi (ADR-043)
--
-- Skala & privasi dirancang sejak awal:
--   * AGREGAT HARIAN, bukan satu baris per kunjungan. Acara populer dengan
--     ribuan kunjungan/hari tetap satu baris per hari.
--   * Pengunjung unik dihitung lewat hash HMAC(ip + user-agent + hari) yang
--     dibuat APLIKASI dengan kunci rahasia server. IP tidak pernah sampai ke
--     database, dan karena harinya ikut di-hash, pengunjung yang sama tidak
--     bisa dilacak lintas hari. Tabel dedup dibersihkan setelah 2 hari.
--   * Rincian audiens hanya dari penyimpan (akun yang masuk), dan kelompok
--     berisi < 5 orang DISEMBUNYIKAN (k-anonimitas) supaya penyelenggara
--     tidak bisa menebak individu.
--   * Hanya pengelola terverifikasi (manages_event) atau admin yang bisa
--     membaca; tidak ada tabel yang bisa dibaca/ditulis klien langsung.
-- =====================================================================

CREATE TABLE public.event_daily_stats (
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- Hari kalender WIB (sama dengan aturan tenggat, AGENTS.md §8).
  day      DATE NOT NULL,
  views    INT NOT NULL DEFAULT 0 CHECK (views >= 0),
  visitors INT NOT NULL DEFAULT 0 CHECK (visitors >= 0),
  PRIMARY KEY (event_id, day)
);

CREATE TABLE public.event_view_dedup (
  event_id     UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  visitor_hash CHAR(64) NOT NULL CHECK (visitor_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (event_id, day, visitor_hash)
);
CREATE INDEX idx_event_view_dedup_day ON public.event_view_dedup (day);

-- Tanpa policy = hanya pemilik fungsi (DEFINER) & service_role.
ALTER TABLE public.event_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_view_dedup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_daily_stats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.event_view_dedup FROM PUBLIC, anon, authenticated;

-- Analitik per acara membaca klik "Daftar" per acara per rentang waktu.
-- Indeks lama hanya (created_at) — di ribuan acara itu = pindai seluruh tabel.
CREATE INDEX IF NOT EXISTS idx_recommendation_signals_event
  ON public.recommendation_signals (event_id, kind, created_at);

-- ---------------------------------------------------------------------
-- Pencatatan kunjungan — dipanggil server (service_role) setelah filter
-- bot & batas laju di aplikasi. Acara yang tidak publik diabaikan diam-diam.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_event_view(p_event UUID, p_visitor_hash TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  today DATE := (now() AT TIME ZONE 'Asia/Jakarta')::DATE;
  new_visitor INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event AND status IN ('APPROVED', 'EXPIRED')) THEN
    RETURN;
  END IF;

  INSERT INTO public.event_view_dedup (event_id, day, visitor_hash)
  VALUES (p_event, today, p_visitor_hash)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS new_visitor = ROW_COUNT;

  INSERT INTO public.event_daily_stats (event_id, day, views, visitors)
  VALUES (p_event, today, 1, new_visitor)
  ON CONFLICT (event_id, day) DO UPDATE
  SET views = public.event_daily_stats.views + 1,
      visitors = public.event_daily_stats.visitors + EXCLUDED.visitors;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_event_view_dedup()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  removed INT;
BEGIN
  DELETE FROM public.event_view_dedup
  WHERE day < (now() AT TIME ZONE 'Asia/Jakarta')::DATE - 1;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.record_event_view(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_event_view_dedup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_view(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_event_view_dedup() TO service_role;

-- ---------------------------------------------------------------------
-- Laporan untuk dasbor. Satu panggilan = satu JSON; bentuknya dikontrak
-- di src/lib/organizer-analytics.ts dan dicerminkan MemoryEventRepository.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_analytics(p_event UUID, p_days INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Ambang k-anonimitas: HARUS sama dengan ANALYTICS_MIN_GROUP di aplikasi.
  k CONSTANT INT := 5;
  span INT := LEAST(GREATEST(COALESCE(p_days, 30), 7), 90);
  today DATE := (now() AT TIME ZONE 'Asia/Jakarta')::DATE;
  first_day DATE;
  -- Bukan `kind`: nama itu bentrok dengan kolom recommendation_signals.kind
  -- (plpgsql variable_conflict = error → "ambiguous").
  v_event_type event_type;
  result JSONB;
BEGIN
  IF NOT (public.manages_event(p_event) OR public.is_admin()) THEN
    RAISE EXCEPTION 'analytics_forbidden' USING ERRCODE = '42501';
  END IF;
  first_day := today - (span - 1);
  SELECT event_type INTO v_event_type FROM public.events WHERE id = p_event;

  WITH days AS (
    SELECT d::DATE AS day FROM generate_series(first_day, today, INTERVAL '1 day') AS d
  ),
  saves AS (
    SELECT (saved_at AT TIME ZONE 'Asia/Jakarta')::DATE AS day, count(*)::INT AS n
    FROM public.saved_events
    WHERE event_id = p_event AND saved_at >= (first_day::TIMESTAMP AT TIME ZONE 'Asia/Jakarta')
    GROUP BY 1
  ),
  clicks AS (
    SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::DATE AS day, count(*)::INT AS n
    FROM public.recommendation_signals
    WHERE event_id = p_event AND kind = 'register_click'
      AND created_at >= (first_day::TIMESTAMP AT TIME ZONE 'Asia/Jakarta')
    GROUP BY 1
  ),
  series AS (
    SELECT d.day, COALESCE(s.views, 0) AS views, COALESCE(s.visitors, 0) AS visitors,
           COALESCE(sv.n, 0) AS saves, COALESCE(c.n, 0) AS clicks
    FROM days d
    LEFT JOIN public.event_daily_stats s ON s.event_id = p_event AND s.day = d.day
    LEFT JOIN saves sv ON sv.day = d.day
    LEFT JOIN clicks c ON c.day = d.day
  ),
  savers AS (
    SELECT u.education_level, u.interests
    FROM public.saved_events se JOIN public.users u ON u.id = se.user_id
    WHERE se.event_id = p_event
  ),
  levels AS (
    SELECT education_level::TEXT AS label, count(*)::INT AS n
    FROM savers WHERE education_level IS NOT NULL GROUP BY 1
  ),
  interests AS (
    SELECT i AS label, count(*)::INT AS n
    FROM savers, unnest(interests) AS i GROUP BY 1
  ),
  peer AS (
    -- Pembanding: median kunjungan acara lain berjenis sama di rentang yang sama.
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY total) AS median_views, count(*)::INT AS peers
    FROM (
      SELECT s.event_id, sum(s.views) AS total
      FROM public.event_daily_stats s JOIN public.events e ON e.id = s.event_id
      WHERE s.day >= first_day AND e.event_type = v_event_type AND e.id <> p_event
      GROUP BY s.event_id
    ) t
  )
  SELECT jsonb_build_object(
    'days', span,
    'series', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'views', views, 'visitors', visitors, 'saves', saves, 'clicks', clicks) ORDER BY day), '[]'::JSONB) FROM series),
    'totals', jsonb_build_object(
      'views', (SELECT COALESCE(sum(views), 0) FROM public.event_daily_stats WHERE event_id = p_event),
      'visitors', (SELECT COALESCE(sum(visitors), 0) FROM public.event_daily_stats WHERE event_id = p_event),
      'saves', (SELECT count(*) FROM public.saved_events WHERE event_id = p_event),
      'clicks', (SELECT count(*) FROM public.recommendation_signals WHERE event_id = p_event AND kind = 'register_click'),
      'applied', (SELECT count(*) FROM public.application_tracker WHERE event_id = p_event AND status IN ('APPLIED', 'INTERVIEW', 'ACCEPTED'))
    ),
    'audience', jsonb_build_object(
      'minGroup', k,
      'levels', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC), '[]'::JSONB) FROM levels WHERE n >= k),
      'interests', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC), '[]'::JSONB) FROM (SELECT * FROM interests WHERE n >= k ORDER BY n DESC LIMIT 8) top),
      'hidden', (SELECT COALESCE(sum(n), 0) FROM levels WHERE n < k)
    ),
    'benchmark', (SELECT jsonb_build_object('medianViews', COALESCE(median_views, 0), 'peers', peers) FROM peer)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.event_analytics(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_analytics(UUID, INT) TO authenticated;

-- Pembersihan harian tabel dedup (bersyarat, pola 20260926120001).
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     OR coalesce(current_setting('shared_preload_libraries', true), '') NOT LIKE '%pg_cron%'
     OR coalesce(current_setting('cron.database_name', true), 'postgres') <> current_database() THEN
    RAISE NOTICE 'pg_cron tidak tersedia — jadwalkan purge_event_view_dedup() dari luar.';
    RETURN;
  END IF;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('studentfo-purge-event-view-dedup', '23 18 * * *', 'SELECT public.purge_event_view_dedup()');
END
$migration$;
