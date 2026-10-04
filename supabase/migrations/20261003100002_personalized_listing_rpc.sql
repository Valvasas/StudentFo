-- =====================================================================
-- list_personalized_events(): skor relevansi dihitung di Postgres SEBELUM
-- LIMIT/OFFSET (ADR-050, menggantikan jendela kandidat ADR-021/035).
--
-- Sebelumnya `sort=relevance` di produksi menarik ≤240 kandidat terbaru,
-- memeringkatnya di Node, lalu memotong halaman. Halaman 21 ke atas jatuh
-- diam-diam ke urutan "terbaru", dan kegiatan yang sangat relevan tapi
-- dibuat sebelum 240 kegiatan terakhir tidak pernah bisa muncul di halaman
-- mana pun. Di sini SEMUA baris yang lolos filter diberi skor, diurutkan,
-- baru dipotong — halaman berapa pun benar.
--
-- RUMUS = `rankEvents()` di src/lib/recommendation.ts (ADR-026), BUKAN rumus
-- blueprint 0.5/0.3/0.2. Mode seed memakai fungsi TypeScript itu; kalau SQL
-- memakai bobot lain, urutan demo dan produksi berbeda tanpa ada yang tahu.
-- Ubah bobot/definisi komponen di KEDUA tempat dalam PR yang sama — uji
-- paritasnya `tests/integration/listing.test.ts` (relevansi RPC vs Node).
--
--   personal   = 0.45*kategori + 0.25*jenjang + 0.15*tenggat + 0.15*recency
--   cold start = 0.45*recency  + 0.30*popularitas + 0.25*tenggat
--   (cold start = minat kosong ATAU jenjang NULL, sama dengan isColdStart())
--
-- SECURITY INVOKER: fungsi membaca `events_listing` (security_invoker) dengan
-- hak pemanggil, jadi RLS publik (`APPROVED`/`EXPIRED`) tetap penjaganya —
-- tidak ada jalan pintas ke event PENDING lewat RPC ini.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.list_personalized_events(
  p_interests      TEXT[],
  p_education      education_level,
  p_limit          INT,
  p_offset         INT,
  p_search         TEXT DEFAULT NULL,
  p_types          event_type[] DEFAULT NULL,
  p_categories     TEXT[] DEFAULT NULL,
  p_levels         education_level[] DEFAULT NULL,
  p_locations      TEXT[] DEFAULT NULL,
  p_online         BOOLEAN DEFAULT NULL,
  p_cost           TEXT DEFAULT NULL,
  p_include_closed BOOLEAN DEFAULT FALSE,
  p_promoted       BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id                     UUID,
  slug                   VARCHAR,
  title                  VARCHAR,
  organizer              VARCHAR,
  description            TEXT,
  event_type             event_type,
  registration_link      TEXT,
  source_url             TEXT,
  education_levels       education_level[],
  location               VARCHAR,
  is_online              BOOLEAN,
  status                 event_status,
  saved_count            INT,
  created_at             TIMESTAMPTZ,
  primary_deadline_at    TIMESTAMPTZ,
  primary_deadline_label VARCHAR,
  category_slugs         VARCHAR[],
  is_free                BOOLEAN,
  price_amount           NUMERIC,
  is_featured            BOOLEAN,
  featured_until         TIMESTAMPTZ,
  verification_badge     VARCHAR,
  guidebook_url          TEXT,
  is_promoted            BOOLEAN,
  relevance_score        DOUBLE PRECISION,
  total_count            BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
-- JIT mengompilasi ekspresi skor untuk setiap panggilan (±20 ms) lalu tetap
-- lebih lambat dari interpreter pada 50.000 baris (diukur: 896 → 716 ms).
SET jit = off
SET search_path = public, pg_temp
AS $$
  WITH params AS (
    SELECT
      -- Batas halaman = MAX_PAGE_SIZE (src/lib/data/repository.ts): RPC ini
      -- terbuka untuk anon, jadi `p_limit` 1.000.000 tidak boleh memaksa
      -- server menyerialkan seluruh katalog.
      LEAST(GREATEST(COALESCE(p_limit, 12), 1), 48) AS lim,
      GREATEST(COALESCE(p_offset, 0), 0) AS off,
      NOW() AS ts,
      (NOW() AT TIME ZONE 'Asia/Jakarta')::date AS today,
      COALESCE(cardinality(p_interests), 0) = 0 OR p_education IS NULL AS cold_start,
      -- Dijepit: siapa pun yang memegang anon key bisa memanggil RPC ini
      -- langsung. Array 100.000 minat × 50.000 baris = beban CPU gratis.
      -- Batas jauh di atas pemakaian aplikasi (12 kategori, 7 jenis, 40 kota;
      -- pencarian sudah dipotong 120 karakter oleh sanitizeSearchQuery()).
      NULLIF(btrim(left(COALESCE(p_search, ''), 200)), '') AS search,
      p_interests[1:50] AS interests,
      p_types[1:50] AS types,
      p_categories[1:50] AS categories,
      p_levels[1:50] AS levels,
      p_locations[1:50] AS locations
  ),
  -- Baris SEMPIT: skor dihitung & diurutkan tanpa membawa description /
  -- search_vector (diukur: mengurutkan 50.000 baris lebar = +40% waktu).
  -- Membaca `events` langsung, bukan view — RLS `events_public_read` tetap
  -- berlaku karena fungsi ini INVOKER; filter = cermin queryListingPage().
  candidates AS (
    SELECT
      e.id,
      e.created_at,
      e.saved_count,
      e.category_slugs,
      e.education_levels,
      (
        e.is_featured
        AND e.featured_until > params.ts
        AND e.status = 'APPROVED'
        AND (d.deadline_at IS NULL OR d.deadline_at >= params.ts)
      ) AS is_promoted,
      (d.deadline_at AT TIME ZONE 'Asia/Jakarta')::date - params.today AS days_left,
      GREATEST(EXTRACT(EPOCH FROM (params.ts - e.created_at))::DOUBLE PRECISION / 86400, 0) AS age_days
    FROM public.events e
    LEFT JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
    CROSS JOIN params
    WHERE (
        CASE WHEN p_include_closed
          THEN e.status IN ('APPROVED', 'EXPIRED')
          ELSE e.status = 'APPROVED' AND (d.deadline_at IS NULL OR d.deadline_at >= params.ts)
        END
      )
      AND (params.search IS NULL OR e.search_vector @@ websearch_to_tsquery('indonesian', params.search))
      AND (COALESCE(cardinality(params.types), 0) = 0 OR e.event_type = ANY (params.types))
      AND (COALESCE(cardinality(params.categories), 0) = 0 OR e.category_slugs && params.categories::VARCHAR[])
      AND (COALESCE(cardinality(params.levels), 0) = 0 OR e.education_levels && params.levels)
      AND (COALESCE(cardinality(params.locations), 0) = 0 OR e.location = ANY (params.locations::VARCHAR[]))
      AND (p_online IS NULL OR e.is_online = p_online)
      AND (
        p_cost IS NULL
        OR (p_cost = 'free' AND e.is_free IS TRUE)
        OR (p_cost = 'paid' AND e.is_free IS FALSE)
      )
  ),
  components AS (
    SELECT
      c.id,
      c.created_at,
      c.saved_count,
      c.is_promoted,
      -- recencyBoost(): paruh 14 hari dari created_at.
      LEAST(GREATEST(power(2::DOUBLE PRECISION, -c.age_days / 14), 0), 1) AS recency,
      -- deadlineFit(): hari kalender WIB, sama dengan daysUntil().
      CASE
        WHEN c.days_left IS NULL THEN 0.3::DOUBLE PRECISION
        WHEN c.days_left < 0 THEN 0
        WHEN c.days_left = 0 THEN 0.6
        WHEN c.days_left <= 14 THEN 1
        ELSE LEAST(GREATEST(power(2::DOUBLE PRECISION, -(c.days_left - 14)::DOUBLE PRECISION / 14), 0), 1)
      END AS deadline_fit,
      -- categoryMatch(): proporsi minat (termasuk duplikat, sama dengan
      -- `interests.filter(...)` di TS) yang tersentuh kategori event.
      CASE
        WHEN COALESCE(cardinality(params.interests), 0) = 0 THEN 0::DOUBLE PRECISION
        ELSE (
          SELECT count(*)::DOUBLE PRECISION
          FROM unnest(params.interests) AS i(slug)
          WHERE i.slug = ANY (c.category_slugs::TEXT[])
        ) / cardinality(params.interests)
      END AS category_match,
      -- educationMatch().
      CASE
        WHEN COALESCE(cardinality(c.education_levels), 0) = 0 THEN 0.5::DOUBLE PRECISION
        WHEN p_education IS NULL THEN CASE WHEN 'UMUM' = ANY (c.education_levels) THEN 0.5 ELSE 0 END
        WHEN p_education = ANY (c.education_levels) THEN 1
        WHEN 'UMUM' = ANY (c.education_levels) THEN 0.5
        ELSE 0
      END AS education_match
    FROM candidates c
    CROSS JOIN params
  ),
  ranked AS (
    SELECT
      k.id,
      k.created_at,
      k.is_promoted,
      LEAST(GREATEST(
        CASE WHEN params.cold_start THEN
          0.45 * k.recency
          -- popularityBoost(): log terhadap kandidat terpopuler HASIL FILTER,
          -- sama dengan `maxSaved` di rankEvents() atas daftar yang disaring.
          + 0.3 * CASE
              WHEN max(k.saved_count) OVER () <= 0 THEN 0
              ELSE LEAST(GREATEST(
                ln(1 + GREATEST(k.saved_count, 0)::DOUBLE PRECISION) / ln(1 + (max(k.saved_count) OVER ())::DOUBLE PRECISION),
                0), 1)
            END
          + 0.25 * k.deadline_fit
        ELSE
          0.45 * k.category_match
          + 0.25 * k.education_match
          + 0.15 * k.deadline_fit
          + 0.15 * k.recency
        END,
      0), 1) AS relevance_score,
      count(*) OVER () AS total_count
    FROM components k CROSS JOIN params
    -- Tiebreak = rankEvents(): skor → terbaru → id. Urutan UUID Postgres
    -- (byte) sama dengan urutan string hex huruf kecil yang dipakai TS.
    ORDER BY (p_promoted AND k.is_promoted) DESC, relevance_score DESC, k.created_at DESC, k.id ASC
    LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  -- Kolom lengkap hanya untuk ≤48 baris halaman ini (lewat PK).
  SELECT
    l.id, l.slug, l.title, l.organizer, l.description, l.event_type,
    l.registration_link, l.source_url, l.education_levels, l.location,
    l.is_online, l.status, l.saved_count, l.created_at,
    l.primary_deadline_at, l.primary_deadline_label, l.category_slugs,
    l.is_free, l.price_amount, l.is_featured, l.featured_until,
    l.verification_badge, l.guidebook_url, l.is_promoted,
    r.relevance_score,
    r.total_count
  FROM ranked r
  JOIN public.events_listing l ON l.id = r.id
  ORDER BY (p_promoted AND r.is_promoted) DESC, r.relevance_score DESC, r.created_at DESC, r.id ASC
$$;

REVOKE ALL ON FUNCTION public.list_personalized_events(
  TEXT[], education_level, INT, INT, TEXT, event_type[], TEXT[], education_level[], TEXT[], BOOLEAN, TEXT, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon, authenticated;
-- Katalog publik: tamu boleh memanggilnya (yang dibaca tetap disaring RLS).
GRANT EXECUTE ON FUNCTION public.list_personalized_events(
  TEXT[], education_level, INT, INT, TEXT, event_type[], TEXT[], education_level[], TEXT[], BOOLEAN, TEXT, BOOLEAN, BOOLEAN
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.list_personalized_events(
  TEXT[], education_level, INT, INT, TEXT, event_type[], TEXT[], education_level[], TEXT[], BOOLEAN, TEXT, BOOLEAN, BOOLEAN
) IS 'Listing urut relevansi (ADR-050). Bobot WAJIB sama dengan rankEvents() di src/lib/recommendation.ts.';
