-- =====================================================================
-- StudentFo — Migration 0002: functions & triggers
--
-- CATATAN KEAMANAN PENTING:
-- Setiap fungsi SECURITY DEFINER di bawah ini WAJIB punya
-- `SET search_path = public, pg_temp`. Tanpa itu, siapa pun yang bisa
-- membuat objek di schema lain dapat membajak resolusi nama di dalam
-- fungsi dan mengeksekusi kode dengan privilese owner (CVE-2018-1058).
-- Blueprint §3.9 melewatkan ini — ini bukan gaya penulisan, ini lubang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- utils: slugify
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slugify(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(
           regexp_replace(
             regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'),
             '-{2,}', '-', 'g'
           ),
           '-'
         );
$$;

-- ---------------------------------------------------------------------
-- utils: dedup hash
-- KOREKSI BLUEPRINT: §7 langkah 4b menghitung hash dari
-- (title + organizer + source_url). source_url ikut di-hash = dedup rusak,
-- karena event yang sama sering muncul di beberapa URL sumber (halaman
-- listing, halaman detail, mirror, URL dengan query string tracking).
-- Hasilnya duplikat tetap lolos. Di sini source_url dikeluarkan dan input
-- dinormalisasi (lowercase + rapikan whitespace) supaya "Lomba  Esai"
-- dan "lomba esai" menghasilkan hash yang sama.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_dedup_hash(p_title TEXT, p_organizer TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT encode(
           digest(
             regexp_replace(lower(btrim(coalesce(p_title, ''))), '\s+', ' ', 'g')
             || '|' ||
             regexp_replace(lower(btrim(coalesce(p_organizer, ''))), '\s+', ' ', 'g'),
             'sha256'
           ),
           'hex'
         );
$$;

-- ---------------------------------------------------------------------
-- trigger: isi slug & dedup_hash otomatis kalau tidak disuplai
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.events_fill_derived()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  n         INT := 0;
BEGIN
  IF NEW.dedup_hash IS NULL OR btrim(NEW.dedup_hash) = '' THEN
    NEW.dedup_hash := public.compute_dedup_hash(NEW.title, NEW.organizer);
  END IF;

  IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    base_slug := left(public.slugify(NEW.title), 90);
    IF base_slug = '' THEN
      base_slug := 'event';
    END IF;
    candidate := base_slug;
    -- Tabrakan slug dibereskan dengan suffix numerik, bukan UUID penuh:
    -- URL tetap enak dibaca & dibagikan.
    WHILE EXISTS (SELECT 1 FROM public.events e WHERE e.slug = candidate AND e.id <> NEW.id) LOOP
      n := n + 1;
      candidate := base_slug || '-' || n;
      IF n > 50 THEN
        candidate := base_slug || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
        EXIT;
      END IF;
    END LOOP;
    NEW.slug := candidate;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_events_fill_derived
  BEFORE INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION public.events_fill_derived();

-- ---------------------------------------------------------------------
-- trigger: updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_events_touch    BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_users_touch     BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tracker_touch   BEFORE UPDATE ON application_tracker
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------
-- trigger: sinkronisasi auth.users -> public.users (Blueprint §3.9)
-- Tanpa ini user berhasil signup tapi baris profilnya tidak pernah ada.
-- Ditambah: search_path hardening + ON CONFLICT (idempoten kalau trigger
-- di-replay atau user dibuat ulang dengan id yang sama).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- helper: is_admin()
-- KOREKSI BLUEPRINT: §3.10 menaruh subquery
-- `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role='ADMIN')`
-- langsung di dalam policy. Dua masalah:
--   1. Subquery itu ikut dievaluasi di bawah RLS tabel `users`. Begitu
--      tabel users punya policy admin sendiri, ini jadi rekursi tak
--      berhingga ("infinite recursion detected in policy").
--   2. Dieksekusi PER BARIS pada setiap scan events.
-- Dibungkus jadi fungsi SECURITY DEFINER + STABLE: bypass RLS secara
-- terkendali, dan hasilnya di-cache per statement oleh planner.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'ADMIN'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------------------------------------------------------------------
-- trigger: jaga events.saved_count tetap akurat
-- Didenormalisasi supaya popularity_boost (§6) tidak perlu COUNT(*) join
-- di setiap request homepage.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_saved_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.events SET saved_count = saved_count + 1 WHERE id = NEW.event_id;
    RETURN NEW;
  ELSE
    UPDATE public.events SET saved_count = GREATEST(saved_count - 1, 0) WHERE id = OLD.event_id;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_saved_count_ins AFTER INSERT ON saved_events
  FOR EACH ROW EXECUTE FUNCTION public.sync_saved_count();
CREATE TRIGGER trg_saved_count_del AFTER DELETE ON saved_events
  FOR EACH ROW EXECUTE FUNCTION public.sync_saved_count();

-- ---------------------------------------------------------------------
-- job: expiry harian (§7 langkah 9)
-- Event TIDAK dihapus — statusnya digeser ke EXPIRED supaya riwayat &
-- analytics tetap utuh. Panggil dari cron: SELECT public.expire_past_events();
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_past_events()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected INT;
BEGIN
  WITH due AS (
    SELECT e.id
    FROM public.events e
    JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
    WHERE e.status = 'APPROVED' AND d.deadline_at < NOW()
  )
  UPDATE public.events e
  SET status = 'EXPIRED'
  FROM due
  WHERE e.id = due.id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_past_events() FROM PUBLIC;
