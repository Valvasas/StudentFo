-- =====================================================================
-- events_listing mengekspos search_vector.
--
-- Bug: SupabaseEventRepository.listEvents memanggil
-- `.textSearch('search_vector', …)` pada view ini, tapi view 0004 tidak
-- punya kolom itu — SETIAP pencarian di mode Supabase gagal dengan
-- 42703 (undefined_column) dan pengguna melihat "Gagal memuat daftar event".
-- Tidak pernah ketahuan karena repository Supabase belum pernah dijalankan
-- terhadap database sampai integration test (ADR-033).
--
-- CREATE OR REPLACE VIEW boleh menambah kolom di UJUNG daftar tanpa DROP,
-- jadi hak akses dan security_invoker = on tetap utuh. Index GIN
-- idx_events_search tetap terpakai karena view security_invoker di-inline.
-- =====================================================================
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
  ) AS category_slugs,
  e.search_vector
FROM events e
LEFT JOIN event_deadlines d ON d.event_id = e.id AND d.is_primary;
