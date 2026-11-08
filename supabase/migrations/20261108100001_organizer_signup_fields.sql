-- =====================================================================
-- Data lembaga dari form daftar penyelenggara (ADR-069)
--
-- Pintu daftar penyelenggara kini meminta jenis lembaga dan jabatan
-- penanggung jawab — bahan moderator untuk menilai "orang ini memang
-- mewakili lembaga itu". Keduanya NULL untuk pengajuan lama; aplikasi
-- mewajibkannya untuk pengajuan baru (skema `organizerApplicationSchema`).
--
-- Daftar jenis lembaga HARUS sama dengan `ORGANIZER_TYPES` di
-- src/types/domain.ts (dikunci src/lib/organizer.test.ts).
-- =====================================================================

ALTER TABLE public.organizer_profiles
  ADD COLUMN org_type VARCHAR(12)
    CHECK (org_type IS NULL OR org_type IN ('KAMPUS', 'ORMAWA', 'SEKOLAH', 'KOMUNITAS', 'PERUSAHAAN', 'PEMERINTAH', 'NIRLABA', 'LAINNYA')),
  ADD COLUMN contact_role VARCHAR(80)
    CHECK (contact_role IS NULL OR char_length(btrim(contact_role)) BETWEEN 2 AND 80);

COMMENT ON COLUMN public.organizer_profiles.org_type IS 'Jenis lembaga yang dinyatakan pengaju; diperiksa moderator, bukan izin.';
COMMENT ON COLUMN public.organizer_profiles.contact_role IS 'Jabatan penanggung jawab di lembaga, mis. Ketua Panitia.';

-- Hak per KOLOM (AGENTS §14): GRANT menambah kolom ke daftar yang sudah ada
-- di 20260928110001; kolom status & jejak review tetap tidak bisa ditulis klien.
GRANT INSERT (org_type, contact_role) ON public.organizer_profiles TO authenticated;
GRANT UPDATE (org_type, contact_role) ON public.organizer_profiles TO authenticated;

-- Isi identik dengan 20260928110001, kecuali dua kolom baru ikut dihitung
-- sebagai IDENTITAS: lembaga yang terverifikasi lalu mengganti jenisnya atau
-- penanggung jawabnya kembali ke antrean — klaim "siapa yang mewakili" yang
-- diperiksa moderator sudah tidak sama.
CREATE OR REPLACE FUNCTION public.enforce_organizer_profile_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'PENDING';
    NEW.review_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  ELSIF (NEW.org_name, NEW.website, NEW.evidence, NEW.org_type, NEW.contact_role)
        IS DISTINCT FROM (OLD.org_name, OLD.website, OLD.evidence, OLD.org_type, OLD.contact_role) THEN
    NEW.status := 'PENDING';
    NEW.review_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  ELSE
    RETURN NEW;
  END IF;

  IF NOT public.consume_rate_limit('organizer:' || NEW.user_id::text, 5, 86400) THEN
    RAISE EXCEPTION 'organizer_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_organizer_profile_write() FROM PUBLIC, anon, authenticated;
