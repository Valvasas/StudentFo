-- =====================================================================
-- 20261119100001 — pengerasan "Lagi ramai" & koneksi bersama (ADR-093)
--
-- 1. refresh_event_trends(): sumbangan pengunjung anonim per acara per hari
--    dijepit 20 orang (= 5 poin). Dulu tanpa batas: satu IP yang berganti
--    User-Agent bisa mencetak ±300 "pengunjung unik"/jam ke SATU acara dan
--    memaku acara mana pun di "Lagi ramai" beranda tanpa akun. Isi lain
--    IDENTIK dengan versi 20261116100001 (kembaran src/lib/popularity.ts —
--    TREND_VISITOR_DAILY_CAP).
-- 2. mutual_connection_counts(): kandidat disaring can_view_profile() —
--    dulu jumlah koneksi bersama bisa diukur untuk uuid siapa pun, termasuk
--    orang yang memblokir pemanggil atau menyembunyikan profilnya.
--
-- Hanya CREATE OR REPLACE (dikunci migrations-manifest.test.ts). Bergantung
-- pada 20261116100001 (event_engagement): terapkan SESUDAHNYA.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. "Lagi ramai"
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_event_trends()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  since   TIMESTAMPTZ := now() - interval '14 days';
  scored  INT;
BEGIN
  WITH open_events AS (
    SELECT e.id
    FROM public.events e
    LEFT JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
    WHERE e.status = 'APPROVED' AND (d.deadline_at IS NULL OR d.deadline_at >= now())
  ),
  signals (event_id, weight, at) AS (
    SELECT l.event_id, 1.0::float8, l.created_at
    FROM public.event_likes l
    JOIN public.users u ON u.id = l.user_id AND u.suspended_at IS NULL
    WHERE l.created_at > since
    UNION ALL
    -- Sekali per orang per kegiatan: banjir komentar satu akun tidak menaikkan skor.
    SELECT c.event_id, 2.0::float8, max(c.created_at)
    FROM public.event_comments c
    JOIN public.users u ON u.id = c.author_id AND u.suspended_at IS NULL
    WHERE c.created_at > since AND c.hidden_at IS NULL
    GROUP BY c.event_id, c.author_id
    UNION ALL
    SELECT s.event_id, 3.0::float8, s.saved_at
    FROM public.saved_events s
    WHERE s.saved_at > since
    UNION ALL
    SELECT r.event_id, 4.0::float8, max(r.created_at)
    FROM public.recommendation_signals r
    WHERE r.kind = 'register_click' AND r.user_id IS NOT NULL AND r.created_at > since
    GROUP BY r.event_id, r.user_id
    UNION ALL
    SELECT g.event_id, 6.0::float8, g.created_at
    FROM public.event_registrations g
    WHERE g.status NOT IN ('CANCELLED', 'REJECTED') AND g.created_at > since
    UNION ALL
    -- Pengunjung unik per hari WIB, "terjadi" tengah hari WIB (jakartaNoonOf).
    -- Dijepit TREND_VISITOR_DAILY_CAP (20): sinyal termurah untuk dipalsukan
    -- (tanpa akun) tidak boleh mengalahkan simpanan/klik/pendaftaran sungguhan.
    SELECT v.event_id, 0.25::float8 * least(v.visitors, 20), (v.day::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Jakarta'
    FROM public.event_daily_stats v
    WHERE v.visitors > 0 AND (v.day::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Jakarta' > since
  ),
  totals AS (
    SELECT s.event_id,
           sum(s.weight * power(2::float8, -GREATEST(extract(epoch FROM now() - s.at)::float8 / 3600.0, 0) / 72.0)) AS score
    FROM signals s
    JOIN open_events o ON o.id = s.event_id
    GROUP BY s.event_id
  ),
  upserted AS (
    INSERT INTO public.event_engagement (event_id, trend_score, trend_at)
    SELECT event_id, score, now() FROM totals
    ON CONFLICT (event_id) DO UPDATE SET trend_score = EXCLUDED.trend_score, trend_at = EXCLUDED.trend_at
    RETURNING event_id
  ),
  -- Yang tak lagi bersinyal / sudah tutup turun ke nol. Himpunan barisnya
  -- terpisah dari `upserted` (NOT IN totals), jadi satu pernyataan aman.
  zeroed AS (
    UPDATE public.event_engagement g
    SET trend_score = 0, trend_at = now()
    WHERE g.trend_score <> 0 AND g.event_id NOT IN (SELECT event_id FROM totals)
    RETURNING g.event_id
  )
  SELECT count(*) INTO scored FROM upserted;
  RETURN scored;
END;
$$;

COMMENT ON FUNCTION public.refresh_event_trends() IS
  'ADR-092/093: skor "Lagi ramai" (kembaran src/lib/popularity.ts), pengunjung dijepit 20/hari/acara. Dijadwalkan pg_cron tiap 15 menit; idempoten.';

REVOKE ALL ON FUNCTION public.refresh_event_trends() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_event_trends() TO service_role;

-- ---------------------------------------------------------------------
-- 2. Koneksi bersama — hanya untuk kandidat yang boleh dilihat pemanggil
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mutual_connection_counts(p_candidates UUID[])
RETURNS TABLE (user_id UUID, mutual_count INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  my_peers AS (
    SELECT CASE WHEN c.requester_id = me.uid THEN c.addressee_id ELSE c.requester_id END AS peer
    FROM public.connections c, me
    WHERE c.status = 'ACCEPTED' AND me.uid IN (c.requester_id, c.addressee_id)
  ),
  candidates AS (
    SELECT DISTINCT unnest(p_candidates[1:200]) AS id
  )
  SELECT cand.id, count(*)::int
  FROM candidates cand
  JOIN public.connections c
    ON c.status = 'ACCEPTED' AND cand.id IN (c.requester_id, c.addressee_id)
  JOIN my_peers mp
    ON mp.peer = CASE WHEN c.requester_id = cand.id THEN c.addressee_id ELSE c.requester_id END
  -- Blokir dua arah & keterlihatan profil (ADR-077) — aturan yang sama dengan halaman profil.
  WHERE public.can_view_profile(cand.id)
  GROUP BY cand.id;
$$;

REVOKE ALL ON FUNCTION public.mutual_connection_counts(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutual_connection_counts(UUID[]) TO authenticated;
