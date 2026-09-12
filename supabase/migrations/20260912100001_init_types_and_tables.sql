-- =====================================================================
-- StudentFo — Migration 0001: extensions, enum types, core tables
-- Berbasis Blueprint v3 §3, dengan koreksi yang didokumentasikan di
-- supabase/DEVIATIONS.md. Urutan CREATE TABLE mengikuti dependensi FK.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- digest() untuk dedup_hash sisi DB

-- ---------------------------------------------------------------------
-- TEXT SEARCH CONFIGURATION
-- KOREKSI BLUEPRINT: PostgreSQL TIDAK punya konfigurasi FTS bawaan
-- bernama 'indonesian'. `to_tsvector('indonesian', ...)` di §3.3 akan
-- gagal dengan "text search configuration ... does not exist" dan
-- menghentikan seluruh migration.
-- Solusi: bikin config 'indonesian' sendiri sebagai turunan 'simple'
-- (tokenisasi + lowercase, tanpa stemming). Trade-off yang disadari:
-- "beasiswa" tidak otomatis match "beasiswanya". Untuk skala MVP ini
-- jauh lebih aman daripada migration yang tidak bisa jalan; ketika data
-- > 10rb baris dan recall jadi masalah, ini titik migrasi ke Meilisearch
-- (sesuai §2) atau pasang dictionary Snowball Indonesia.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'indonesian') THEN
    CREATE TEXT SEARCH CONFIGURATION public.indonesian (COPY = pg_catalog.simple);
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('USER', 'ADMIN');
CREATE TYPE event_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- KOREKSI BLUEPRINT: §3 mendefinisikan event_type hanya ('LOMBA','BEASISWA'),
-- padahal scope produk (README + §1) mencakup magang, workshop, dan
-- "kegiatan pengembangan lain". Enum 2-nilai membuat seluruh kategori itu
-- tidak punya tempat dan memaksa data masuk sebagai LOMBA (salah).
-- Enum diperluas; menambah nilai baru nanti tetap aman via ALTER TYPE.
CREATE TYPE event_type AS ENUM (
  'LOMBA',
  'BEASISWA',
  'MAGANG',
  'WORKSHOP',
  'KONFERENSI',
  'PELATIHAN',
  'VOLUNTEER'
);

CREATE TYPE education_level AS ENUM ('SMA_SMK', 'D3', 'D4_S1', 'S2', 'S3', 'UMUM');
CREATE TYPE tracker_status AS ENUM ('SAVED', 'APPLIED', 'INTERVIEW', 'ACCEPTED', 'REJECTED');

-- ---------------------------------------------------------------------
-- 1. USERS — profil publik, disinkronkan dari auth.users lewat trigger
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           VARCHAR(255) UNIQUE NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  role            user_role NOT NULL DEFAULT 'USER',
  education_level education_level,
  major           VARCHAR(100),
  interests       TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 2. CATEGORIES — taksonomi bidang/topik (many-to-many ke events).
-- Tabel ini adalah sumber enum untuk structured output LLM (§7 langkah 3).
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL UNIQUE,
  slug VARCHAR(50) NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- 3. EVENTS — tabel master
-- ---------------------------------------------------------------------
CREATE TABLE events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- slug: URL kanonik & stabil untuk SEO. Produk agregator hidup dari
  -- organic search; URL /events/<uuid> praktis tidak bisa di-rank.
  slug              VARCHAR(120) NOT NULL UNIQUE,
  title             VARCHAR(255) NOT NULL CHECK (length(btrim(title)) > 0),
  organizer         VARCHAR(255) NOT NULL CHECK (length(btrim(organizer)) > 0),
  description       TEXT,
  event_type        event_type NOT NULL,
  registration_link TEXT NOT NULL CHECK (registration_link ~* '^https?://'),
  source_url        TEXT NOT NULL CHECK (source_url ~* '^https?://'),
  -- dedup_hash: sha256 dari (title+organizer) ternormalisasi. Lihat catatan
  -- di migration 0003 kenapa source_url TIDAK ikut di-hash.
  dedup_hash        VARCHAR(64) NOT NULL UNIQUE,
  education_levels  education_level[] NOT NULL DEFAULT '{}',
  location          VARCHAR(120),        -- NULL = tidak diketahui
  is_online         BOOLEAN NOT NULL DEFAULT FALSE,
  status            event_status NOT NULL DEFAULT 'PENDING',
  reviewed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  saved_count       INT NOT NULL DEFAULT 0,   -- denormalisasi untuk popularity_boost (§6)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('public.indonesian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('public.indonesian', coalesce(organizer, '')), 'B') ||
    setweight(to_tsvector('public.indonesian', coalesce(description, '')), 'C')
  ) STORED,

  -- Integritas: status REJECTED/APPROVED harus punya jejak siapa & kapan.
  CONSTRAINT events_review_trail CHECK (
    (status IN ('PENDING', 'EXPIRED')) OR (reviewed_at IS NOT NULL)
  )
);

CREATE INDEX idx_events_status      ON events(status);
CREATE INDEX idx_events_type        ON events(event_type);
CREATE INDEX idx_events_search      ON events USING GIN(search_vector);
CREATE INDEX idx_events_levels      ON events USING GIN(education_levels);
-- Index parsial: 99% query publik hanya menyentuh baris APPROVED.
CREATE INDEX idx_events_approved_recent ON events(created_at DESC) WHERE status = 'APPROVED';
-- idx_events_dedup dari blueprint dihapus: kolom sudah UNIQUE, dan UNIQUE
-- constraint otomatis membuat index. Membuat index kedua = duplikat mati
-- yang memperlambat setiap INSERT scraper tanpa manfaat apa pun.

-- ---------------------------------------------------------------------
-- 4. EVENT_CATEGORIES — join table
-- ---------------------------------------------------------------------
CREATE TABLE event_categories (
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, category_id)
);

-- PK sudah mengcover (event_id, category_id). Index ini untuk arah balik:
-- "semua event di kategori X".
CREATE INDEX idx_event_categories_category ON event_categories(category_id);

-- ---------------------------------------------------------------------
-- 5. EVENT_DEADLINES — multi-stage
-- ---------------------------------------------------------------------
CREATE TABLE event_deadlines (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label       VARCHAR(50) NOT NULL
              CHECK (label IN ('registration', 'submission', 'final', 'announcement')),
  deadline_at TIMESTAMPTZ NOT NULL,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_deadlines_event ON event_deadlines(event_id);
-- Untuk job expiry harian (§7 langkah 9) — tanpa ini job full-scan tiap hari.
CREATE INDEX idx_deadlines_primary_at ON event_deadlines(deadline_at) WHERE is_primary;
-- Cegah >1 primary deadline per event.
CREATE UNIQUE INDEX idx_one_primary_deadline ON event_deadlines(event_id) WHERE is_primary;

-- ---------------------------------------------------------------------
-- 6. SAVED_EVENTS (Phase 2)
-- ---------------------------------------------------------------------
CREATE TABLE saved_events (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX idx_saved_events_event ON saved_events(event_id, saved_at DESC);

-- ---------------------------------------------------------------------
-- 7. APPLICATION_TRACKER (Phase 2)
-- ---------------------------------------------------------------------
CREATE TABLE application_tracker (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status     tracker_status NOT NULL DEFAULT 'SAVED',
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX idx_tracker_user_status ON application_tracker(user_id, status);

-- ---------------------------------------------------------------------
-- 8. UGC / TEAMS / NOTIFICATIONS (Phase 3)
-- ---------------------------------------------------------------------
CREATE TABLE ugc_submissions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submitted_by_email  VARCHAR(255) NOT NULL,
  payload             JSONB NOT NULL,
  status              event_status NOT NULL DEFAULT 'PENDING',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE teams (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  slots_needed INT NOT NULL DEFAULT 1 CHECK (slots_needed BETWEEN 1 AND 50),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_members (
  team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      VARCHAR(50) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE notifications (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  type     VARCHAR(50) NOT NULL,
  message  TEXT NOT NULL,
  is_read  BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_unread ON notifications(user_id, sent_at DESC) WHERE NOT is_read;
