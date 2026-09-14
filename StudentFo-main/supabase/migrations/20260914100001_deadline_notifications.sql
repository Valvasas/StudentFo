-- =====================================================================
-- StudentFo — Migration 0006: produsen notifikasi tenggat (Phase 2)
--
-- Tabel `notifications` dan policy-nya sudah ada sejak migration 0001/0003,
-- tapi tidak pernah ada yang MENGISI tabel itu. Migration ini menambahkan
-- produsennya, bukan tabelnya.
--
-- KENAPA PRODUSENNYA DI DALAM DATABASE, BUKAN DI NODE:
-- kandidat notifikasi = hasil join saved_events + application_tracker +
-- event_deadlines untuk SELURUH pengguna. Mengerjakannya di aplikasi berarti
-- menarik seluruh tabel itu lewat jaringan tiap hari hanya untuk membuang
-- 99% barisnya. Di sini ia satu perintah INSERT ... SELECT.
-- =====================================================================

-- ---------------------------------------------------------------------
-- IDEMPOTENSI.
-- Cron bisa gagal separuh jalan lalu diulang, dan operator kadang memicu
-- ulang secara manual. Tanpa batasan ini, setiap pengulangan menambah satu
-- baris duplikat dan lonceng pengguna terisi pesan yang sama berkali-kali.
--
-- Kuncinya (user, event, type): satu pengguna hanya boleh menerima SATU
-- pengingat H-3 dan SATU pengingat H-1 per kegiatan, selamanya.
--
-- Partial index: baris dengan event_id NULL adalah pengumuman sistem, yang
-- memang boleh berulang — dan di UNIQUE biasa, NULL tidak pernah dianggap
-- sama sehingga barisnya lolos tanpa terkunci. Membatasi index ke baris
-- non-NULL membuat maksudnya eksplisit, bukan kebetulan.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON public.notifications (user_id, event_id, type)
  WHERE event_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- PRODUSEN.
--
-- SECURITY DEFINER karena fungsi ini harus membaca saved_events dan
-- application_tracker MILIK SEMUA PENGGUNA lalu menulis ke notifications —
-- sesuatu yang sengaja ditutup RLS untuk siapa pun. Ia dipanggil oleh
-- penjadwal (service_role), bukan oleh pengguna.
--
-- SET search_path = public, pg_temp WAJIB di setiap SECURITY DEFINER:
-- tanpa itu, pemanggil bisa membuat objek bernama sama di schema lain yang
-- ada lebih dulu di search_path-nya dan membajak apa yang dieksekusi fungsi
-- ini dengan hak pemilik (CVE-2018-1058).
--
-- AMBANG H-3 & H-1 DIDUPLIKASI dari src/lib/notifications.ts. Duplikasi ini
-- disengaja dan dicatat di kedua sisi: implementasi memory memakai versi
-- TypeScript, produksi memakai versi SQL ini. Mengubah salah satu tanpa yang
-- lain membuat mode seed dan produksi berperilaku berbeda.
--
-- Selisih dihitung sebagai SELISIH HARI KALENDER DI Asia/Jakarta, bukan
-- (deadline - now). Tenggat besok pukul 08:00 yang dilihat malam ini harus
-- terbaca "H-1", bukan "H-0" — persis alasan yang sama dengan
-- src/lib/deadline.ts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_deadline_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  WITH watched AS (
    -- Sumber minat pengguna: event yang disimpan ATAU dilacak di tracker.
    -- UNION (bukan UNION ALL) supaya event yang sekaligus disimpan dan
    -- dilacak tidak menghasilkan dua notifikasi.
    SELECT user_id, event_id FROM public.saved_events
    UNION
    SELECT user_id, event_id FROM public.application_tracker
  ),
  due AS (
    SELECT
      w.user_id,
      w.event_id,
      e.title,
      (d.deadline_at AT TIME ZONE 'Asia/Jakarta')::date
        - (NOW() AT TIME ZONE 'Asia/Jakarta')::date AS days_left
    FROM watched w
    JOIN public.events e          ON e.id = w.event_id
    JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
    -- Hanya event yang benar-benar tayang. Mengingatkan tenggat kegiatan
    -- yang sedang PENDING moderasi berarti membocorkan antrean moderasi.
    WHERE e.status = 'APPROVED'
  )
  INSERT INTO public.notifications (user_id, event_id, type, message)
  SELECT
    due.user_id,
    due.event_id,
    CASE due.days_left WHEN 3 THEN 'DEADLINE_H3' ELSE 'DEADLINE_H1' END,
    CASE due.days_left
      WHEN 3 THEN 'Pendaftaran ' || due.title || ' ditutup 3 hari lagi.'
      ELSE      'Terakhir — pendaftaran ' || due.title || ' ditutup besok.'
    END
  FROM due
  WHERE due.days_left IN (3, 1)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

-- Fungsi ini tidak boleh bisa dipanggil dari browser. `anon` dan
-- `authenticated` memegang kunci yang memang dikirim ke klien; kalau mereka
-- boleh memanggilnya, siapa pun bisa memicu penulisan massal ke tabel
-- notifikasi. Hanya penjadwal (service_role) yang berhak.
REVOKE ALL ON FUNCTION public.create_deadline_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_deadline_notifications() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_deadline_notifications() TO service_role;

COMMENT ON FUNCTION public.create_deadline_notifications() IS
  'Membuat notifikasi tenggat H-3 dan H-1 untuk event yang disimpan/dilacak pengguna. Idempoten lewat idx_notifications_dedupe. Dijadwalkan harian; lihat .github/workflows/deadline-notifications.yml';
