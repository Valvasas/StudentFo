-- =====================================================================
-- StudentFo — Migration 0003: Row Level Security
--
-- KOREKSI BLUEPRINT (paling kritikal di seluruh dokumen):
-- §3.10 hanya menyalakan RLS di 5 tabel (users, events, saved_events,
-- application_tracker, notifications). Di Supabase, SETIAP tabel di schema
-- `public` otomatis ter-ekspos lewat PostgREST ke role `anon`. Tabel tanpa
-- RLS berarti siapa pun yang punya anon key — yang memang dikirim ke
-- browser — bisa INSERT/UPDATE/DELETE isinya.
-- Artinya di skema v3 apa adanya: publik bisa menghapus seluruh
-- `categories`, `event_deadlines`, `teams`, dan `event_categories`.
-- Di sini RLS dinyalakan di SEMUA tabel publik tanpa kecuali.
--
-- Prinsip: deny-by-default. RLS aktif tanpa policy = tidak ada yang bisa
-- apa-apa. Akses dibuka satu per satu, se-sempit mungkin.
-- =====================================================================

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_deadlines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_tracker ENABLE ROW LEVEL SECURITY;
ALTER TABLE ugc_submissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- USERS — tiap orang hanya baris sendiri. Admin boleh baca semua (butuh
-- untuk audit moderasi), tapi TIDAK boleh mengubah profil orang lain.
-- ---------------------------------------------------------------------
CREATE POLICY users_select_own ON users
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY users_update_own ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Escalation guard: tanpa ini user bisa UPDATE barisnya sendiri dan
-- menyetel role = 'ADMIN'. USING/WITH CHECK di atas hanya membatasi BARIS
-- mana, bukan KOLOM apa. Hak UPDATE kolom `role` dicabut dari user biasa;
-- promosi admin hanya lewat service_role / SQL editor.
REVOKE UPDATE (role) ON users FROM authenticated, anon;

-- ---------------------------------------------------------------------
-- CATEGORIES — taksonomi publik, read-only untuk semua. Tulis hanya admin
-- atau service_role (service_role bypass RLS by design).
-- ---------------------------------------------------------------------
CREATE POLICY categories_public_read ON categories
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY categories_admin_write ON categories
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- EVENTS
-- Catatan deviasi: publik boleh membaca APPROVED *dan* EXPIRED.
-- Blueprint membatasi ke APPROVED saja, tapi job expiry harian akan
-- mengubah status otomatis — kalau EXPIRED langsung tak terbaca, setiap
-- halaman event yang sudah ramai & ter-index berubah jadi 404. Untuk
-- produk yang hidup dari organic search itu kerugian permanen. Halaman
-- tetap tayang dengan penanda "Pendaftaran ditutup"; yang difilter dari
-- listing adalah urusan query di aplikasi, bukan urusan RLS.
-- ---------------------------------------------------------------------
CREATE POLICY events_public_read ON events
  FOR SELECT TO anon, authenticated
  USING (status IN ('APPROVED', 'EXPIRED'));

CREATE POLICY events_admin_all ON events
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
-- INSERT dari pipeline scraper memakai service_role key (bypass RLS, §7).

-- ---------------------------------------------------------------------
-- EVENT_CATEGORIES & EVENT_DEADLINES — ikut visibilitas event induknya.
-- ---------------------------------------------------------------------
CREATE POLICY event_categories_public_read ON event_categories
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_categories.event_id AND e.status IN ('APPROVED', 'EXPIRED')
  ));

CREATE POLICY event_categories_admin_all ON event_categories
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY event_deadlines_public_read ON event_deadlines
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_deadlines.event_id AND e.status IN ('APPROVED', 'EXPIRED')
  ));

CREATE POLICY event_deadlines_admin_all ON event_deadlines
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- SAVED_EVENTS & APPLICATION_TRACKER — milik sendiri, titik.
-- WITH CHECK wajib ditulis eksplisit: tanpa itu, policy FOR ALL hanya
-- memfilter baris yang dibaca, dan user masih bisa INSERT baris
-- atas nama user_id orang lain.
-- ---------------------------------------------------------------------
CREATE POLICY saved_events_own ON saved_events
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY tracker_own ON application_tracker
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS — user hanya baca miliknya & hanya boleh menandai dibaca.
-- Pembuatan notifikasi adalah urusan backend (service_role).
-- ---------------------------------------------------------------------
CREATE POLICY notifications_own_read ON notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY notifications_own_update ON notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- UGC_SUBMISSIONS — publik boleh kirim, TIDAK boleh membaca.
-- Kolom submitted_by_email berisi data pribadi; kalau dibuka untuk SELECT
-- publik, tabel ini langsung jadi sumber panen alamat email.
-- ---------------------------------------------------------------------
CREATE POLICY ugc_public_insert ON ugc_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'PENDING');

CREATE POLICY ugc_admin_read ON ugc_submissions
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- TEAMS & TEAM_MEMBERS (Phase 3)
-- ---------------------------------------------------------------------
CREATE POLICY teams_public_read ON teams
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY teams_owner_write ON teams
  FOR ALL TO authenticated
  USING (auth.uid() = created_by OR public.is_admin())
  WITH CHECK (auth.uid() = created_by OR public.is_admin());

CREATE POLICY team_members_read ON team_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY team_members_self_join ON team_members
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY team_members_self_leave ON team_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.created_by = auth.uid())
  );
