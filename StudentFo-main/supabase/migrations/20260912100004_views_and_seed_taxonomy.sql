-- =====================================================================
-- StudentFo — Migration 0004: view pembantu + taksonomi awal
-- =====================================================================

-- View listing: menyatukan event dengan primary deadline-nya supaya
-- frontend tidak perlu N+1 query atau join manual di setiap halaman.
-- security_invoker = on  -> view tunduk pada RLS pemanggil, bukan owner.
-- Tanpa flag ini view justru jadi jalan pintas yang menembus RLS.
CREATE OR REPLACE VIEW public.events_listing
WITH (security_invoker = on) AS
SELECT
  e.id,
  e.slug,
  e.title,
  e.organizer,
  e.description,
  e.event_type,
  e.registration_link,
  e.source_url,
  e.education_levels,
  e.location,
  e.is_online,
  e.status,
  e.saved_count,
  e.created_at,
  d.deadline_at AS primary_deadline_at,
  d.label       AS primary_deadline_label,
  COALESCE(
    (SELECT array_agg(c.slug ORDER BY c.slug)
     FROM event_categories ec
     JOIN categories c ON c.id = ec.category_id
     WHERE ec.event_id = e.id),
    '{}'
  ) AS category_slugs
FROM events e
LEFT JOIN event_deadlines d ON d.event_id = e.id AND d.is_primary;

-- ---------------------------------------------------------------------
-- Taksonomi awal. Ini adalah SUMBER enum untuk structured output Gemini
-- (§7 langkah 3) — pipeline membaca tabel ini, bukan hardcode list.
-- Menambah kategori = INSERT di sini, tidak perlu deploy ulang scraper.
-- ---------------------------------------------------------------------
INSERT INTO categories (name, slug) VALUES
  ('Teknologi & IT',        'teknologi'),
  ('Bisnis & Kewirausahaan','bisnis'),
  ('Sains & Riset',         'sains'),
  ('Desain & Kreatif',      'desain'),
  ('Karya Tulis & Esai',    'karya-tulis'),
  ('Debat & Public Speaking','debat'),
  ('Seni & Budaya',         'seni'),
  ('Olahraga',              'olahraga'),
  ('Kesehatan & Kedokteran','kesehatan'),
  ('Sosial & Lingkungan',   'sosial'),
  ('Pendidikan & Keguruan', 'pendidikan'),
  ('Hukum & Politik',       'hukum')
ON CONFLICT (slug) DO NOTHING;
