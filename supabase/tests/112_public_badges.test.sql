-- Lencana publik (ADR-072): bawaan privat, opt-in hanya untuk yang boleh
-- melihat profil / sesama anggota lobi, blokir menutup, dan faktanya tidak
-- memuat id atau judul acara. Acara yang dikelola sendiri tidak dihitung.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f3a01', 'pemilik@lencana', '{"full_name":"Pemilik Lencana"}'),
  ('00000000-0000-4000-8000-0000000f3a02', 'pembaca@lencana', '{"full_name":"Pembaca"}'),
  ('00000000-0000-4000-8000-0000000f3a03', 'asing@lencana', '{"full_name":"Orang Asing"}');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-0000000f3e01', 'Lomba Rahasia Judulnya', 'Panitia', 'LOMBA', 'https://daftar.example/l1', 'https://sumber.example/l1', 'EXPIRED', now()),
  ('00000000-0000-4000-8000-0000000f3e02', 'Lomba Kelolaan Sendiri', 'Panitia', 'LOMBA', 'https://daftar.example/l2', 'https://sumber.example/l2', 'EXPIRED', now());
INSERT INTO public.event_registrations (code, event_id, user_id, full_name, email, status, reviewed_at) VALUES
  ('SF-0000F3A1', '00000000-0000-4000-8000-0000000f3e01', '00000000-0000-4000-8000-0000000f3a01', 'Pemilik Lencana', 'pemilik@lencana', 'CONFIRMED', now() - interval '20 days'),
  ('SF-0000F3A2', '00000000-0000-4000-8000-0000000f3e02', '00000000-0000-4000-8000-0000000f3a01', 'Pemilik Lencana', 'pemilik@lencana', 'CONFIRMED', now() - interval '20 days');
INSERT INTO public.event_managers (event_id, user_id, source) VALUES
  ('00000000-0000-4000-8000-0000000f3e02', '00000000-0000-4000-8000-0000000f3a01', 'ADMIN');
-- Pembaca bisa melihat profil pemilik: pemilik bisa ditemukan di Koneksi.
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000f3a01', true);

SET LOCAL ROLE authenticated;

-- 1. Bawaan privat: pembaca tidak menerima apa pun; pemilik menerima faktanya sendiri.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f3a02';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_badge_facts(ARRAY['00000000-0000-4000-8000-0000000f3a01']::uuid[])) THEN
    RAISE EXCEPTION 'lencana bawaan privat';
  END IF;
  BEGIN
    UPDATE public.users SET show_badges = true WHERE id = '00000000-0000-4000-8000-0000000f3a01';
    IF FOUND THEN RAISE EXCEPTION 'tidak boleh menyalakan lencana orang lain'; END IF;
  END;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f3a01';
UPDATE public.users SET show_badges = true WHERE id = '00000000-0000-4000-8000-0000000f3a01';
DO $$
DECLARE v_facts JSONB;
BEGIN
  SELECT facts INTO v_facts FROM public.public_badge_facts(ARRAY['00000000-0000-4000-8000-0000000f3a01']::uuid[]);
  IF jsonb_array_length(v_facts -> 'registrations') <> 1 THEN
    RAISE EXCEPTION 'acara yang dikelola sendiri tidak dihitung — tersisa satu pendaftaran';
  END IF;
  IF v_facts::text LIKE '%Lomba Rahasia Judulnya%' OR v_facts::text LIKE '%0000f3e01%' THEN
    RAISE EXCEPTION 'fakta tidak boleh memuat judul atau id acara';
  END IF;
END$$;

-- 2. Opt-in: pembaca yang boleh melihat profil menerima; orang asing tanpa hubungan & profil tersembunyi tidak.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f3a02';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.public_badge_facts(ARRAY['00000000-0000-4000-8000-0000000f3a01']::uuid[])) THEN
    RAISE EXCEPTION 'setelah opt-in, pembaca yang boleh melihat profil menerima fakta lencana';
  END IF;
END$$;
RESET ROLE;

UPDATE public.network_profiles SET is_discoverable = false WHERE user_id = '00000000-0000-4000-8000-0000000f3a01';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f3a03';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_badge_facts(ARRAY['00000000-0000-4000-8000-0000000f3a01']::uuid[])) THEN
    RAISE EXCEPTION 'tidak bisa melihat profil = tidak menerima lencana walau sudah opt-in';
  END IF;
END$$;
RESET ROLE;

-- 3. Blokir menutup lencana.
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000f3a03', false)
  ON CONFLICT (user_id) DO NOTHING;
UPDATE public.network_profiles SET is_discoverable = true WHERE user_id = '00000000-0000-4000-8000-0000000f3a01';
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000f3a01', '00000000-0000-4000-8000-0000000f3a02');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f3a02';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_badge_facts(ARRAY['00000000-0000-4000-8000-0000000f3a01']::uuid[])) THEN
    RAISE EXCEPTION 'yang diblokir tidak menerima lencana';
  END IF;
END$$;
RESET ROLE;
ROLLBACK;
