-- =====================================================================
-- `events.updated_at` = waktu perubahan ISI, bukan setiap UPDATE (ADR-097)
--
-- Sitemap memakai `updated_at` sebagai <lastmod>. Sebelumnya trigger
-- `trg_events_touch` memperbarui kolom itu pada SETIAP UPDATE — termasuk
-- `sync_saved_count` yang berjalan tiap kali seseorang menekan Simpan.
-- Akibatnya <lastmod> berubah tanpa isi yang berubah, dan Google berhenti
-- memercayai <lastmod> seluruh situs bila nilainya terbukti tidak akurat.
--
-- Fungsi khusus events: kolom penghitung/denormalisasi tidak dihitung
-- sebagai perubahan isi. `search_vector` dikecualikan karena kolom GENERATED
-- belum dihitung di trigger BEFORE (NEW berisi nilai lama/NULL) — tanpa
-- pengecualian, semua UPDATE akan terbaca "berubah".
-- Tanpa DROP: CREATE OR REPLACE FUNCTION + CREATE OR REPLACE TRIGGER (PG 14+).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.touch_event_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['saved_count', 'updated_at', 'search_vector'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['saved_count', 'updated_at', 'search_vector']) THEN
    NEW.updated_at := NOW();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.touch_event_updated_at() IS
  'updated_at events hanya maju saat isinya berubah (bukan saved_count) — dipakai <lastmod> sitemap. ADR-097.';

-- Fungsi trigger tidak dipanggil langsung oleh siapa pun (ADR-020).
REVOKE ALL ON FUNCTION public.touch_event_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_events_touch
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.touch_event_updated_at();
