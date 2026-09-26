-- =====================================================================
-- Sinyal untuk kalibrasi bobot rekomendasi (ADR-026 menyebut bobotnya
-- tebakan terdidik; ADR-032 menjelaskan rancangan ini).
--
-- Yang dicatat hanya NIAT: simpan dan klik "Daftar" (keluar ke tautan
-- pendaftaran). TIDAK ada log impression: satu INSERT per kartu per tayangan
-- terlalu mahal untuk manfaatnya. Kandidat negatif (kegiatan yang tayang
-- pada saat yang sama tapi tidak dipilih) direkonstruksi offline dari tabel
-- events oleh scripts/calibrate-recommendation.ts.
--
-- Profil (minat & jenjang) disalin SAAT sinyal terjadi — profil bisa berubah,
-- dan kalibrasi harus memakai profil yang berlaku ketika pengguna memilih.
-- =====================================================================

CREATE TABLE public.recommendation_signals (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- NULL = tamu. ON DELETE SET NULL: akun dihapus → sinyal jadi anonim,
  -- bukan hilang (sinyalnya tetap berguna tanpa identitas).
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('save', 'register_click')),
  interests       TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(interests) <= 20),
  education_level education_level,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Skrip kalibrasi membaca per rentang waktu.
CREATE INDEX idx_recommendation_signals_time ON public.recommendation_signals (created_at);

-- Ditulis HANYA oleh server (service_role), setelah sesi & batas laju dicek
-- di aplikasi. Tidak ada jalur tulis dari browser: kalau anon bisa INSERT,
-- siapa pun bisa menggelembungkan sinyal dan menggeser bobot rekomendasi.
ALTER TABLE public.recommendation_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY recommendation_signals_admin_read ON public.recommendation_signals
  FOR SELECT USING ((select public.is_admin()));
REVOKE ALL ON public.recommendation_signals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.recommendation_signals TO authenticated;
