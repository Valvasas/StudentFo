-- Penyelenggara terverifikasi (ADR-042): hanya admin yang memverifikasi,
-- ganti identitas = verifikasi ulang, hak kelola hanya dari server dan
-- hanya berlaku selama terverifikasi, perubahan acara lewat moderasi,
-- setiap keputusan tercatat, dan pihak lain tidak melihat apa pun.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000d0a01', 'org@uji', '{"full_name":"Panitia"}'),
  ('00000000-0000-4000-8000-0000000d0a02', 'lain@uji', '{"full_name":"Orang Lain"}'),
  ('00000000-0000-4000-8000-0000000d0a03', 'admin@uji', '{"full_name":"Admin"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000d0a03';

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at)
VALUES ('00000000-0000-4000-8000-0000000d0e01', 'Lomba Organisasi Uji', 'Himpunan Uji', 'LOMBA',
        'https://daftar.example/uji', 'https://sumber.example/uji', 'APPROVED', now());
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
VALUES ('00000000-0000-4000-8000-0000000d0e01', 'registration', now() + interval '10 days', true);

-- 1. Mengajukan: status dipaksa PENDING walau klien mencoba lain.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.organizer_profiles (user_id, org_name, evidence, status)
    VALUES ('00000000-0000-4000-8000-0000000d0a01', 'Himpunan Uji', 'Saya ketua himpunan, lihat https://himpunan.example/pengurus', 'VERIFIED');
    RAISE EXCEPTION 'klien tidak boleh mengisi status sendiri';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.organizer_profiles (user_id, org_name, evidence)
    VALUES ('00000000-0000-4000-8000-0000000d0a02', 'Palsu', 'Mengajukan atas nama orang lain di sini ya');
    RAISE EXCEPTION 'tidak boleh mengajukan atas nama orang lain';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
INSERT INTO public.organizer_profiles (user_id, org_name, website, evidence)
VALUES ('00000000-0000-4000-8000-0000000d0a01', 'Himpunan Uji', 'https://himpunan.example',
        'Saya ketua himpunan, lihat https://himpunan.example/pengurus');

DO $$
BEGIN
  IF (SELECT status FROM public.organizer_profiles) <> 'PENDING' THEN
    RAISE EXCEPTION 'pengajuan baru harus PENDING';
  END IF;
  -- Belum terverifikasi → tidak bisa mengklaim acara.
  BEGIN
    INSERT INTO public.event_claims (event_id, user_id, evidence)
    VALUES ('00000000-0000-4000-8000-0000000d0e01', '00000000-0000-4000-8000-0000000d0a01', 'Acara ini diselenggarakan himpunan kami');
    RAISE EXCEPTION 'penyelenggara yang belum terverifikasi tidak boleh mengklaim';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Tidak bisa memberi dirinya hak kelola.
  BEGIN
    INSERT INTO public.event_managers (event_id, user_id, source)
    VALUES ('00000000-0000-4000-8000-0000000d0e01', '00000000-0000-4000-8000-0000000d0a01', 'ADMIN');
    RAISE EXCEPTION 'klien tidak boleh menulis event_managers';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Tidak bisa memanggil RPC admin.
  BEGIN
    PERFORM public.review_organizer('00000000-0000-4000-8000-0000000d0a01', 'VERIFIED', '00000000-0000-4000-8000-0000000d0a01', NULL);
    RAISE EXCEPTION 'klien tidak boleh memanggil review_organizer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

-- Pihak lain tidak melihat pengajuan orang.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a02';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizer_profiles) THEN
    RAISE EXCEPTION 'pengajuan penyelenggara orang lain tidak boleh terbaca';
  END IF;
END$$;
RESET ROLE;

-- 2. Admin memverifikasi (lewat RPC service_role). Transisi tidak sah ditolak.
SELECT public.review_organizer('00000000-0000-4000-8000-0000000d0a01', 'VERIFIED', '00000000-0000-4000-8000-0000000d0a03', 'Dicek ke situs resmi');
DO $$
BEGIN
  BEGIN
    PERFORM public.review_organizer('00000000-0000-4000-8000-0000000d0a01', 'VERIFIED', '00000000-0000-4000-8000-0000000d0a03', NULL);
    RAISE EXCEPTION 'VERIFIED → VERIFIED harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'organizer_invalid_transition' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_log
    WHERE subject_type = 'organizer' AND to_status = 'VERIFIED' AND actor_id = '00000000-0000-4000-8000-0000000d0a03'
  ) THEN
    RAISE EXCEPTION 'verifikasi harus tercatat di moderation_log dengan aktor admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000d0a01' AND type = 'ORGANIZER_VERIFIED') THEN
    RAISE EXCEPTION 'penyelenggara harus dikabari';
  END IF;
END$$;

-- 3. Terverifikasi → klaim; admin menyetujui → hak kelola + lencana publik.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
INSERT INTO public.event_claims (event_id, user_id, evidence)
VALUES ('00000000-0000-4000-8000-0000000d0e01', '00000000-0000-4000-8000-0000000d0a01', 'Acara ini diselenggarakan himpunan kami, poster resmi di IG');
DO $$
BEGIN
  IF public.manages_event('00000000-0000-4000-8000-0000000d0e01') THEN
    RAISE EXCEPTION 'klaim yang belum disetujui tidak boleh memberi hak kelola';
  END IF;
  -- Belum mengelola → tidak bisa mengajukan perubahan.
  BEGIN
    INSERT INTO public.event_revisions (event_id, proposed_by, changes)
    VALUES ('00000000-0000-4000-8000-0000000d0e01', '00000000-0000-4000-8000-0000000d0a01', '{"description":"x"}');
    RAISE EXCEPTION 'bukan pengelola tidak boleh mengajukan perubahan';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

SELECT public.review_event_claim(
  (SELECT id FROM public.event_claims LIMIT 1), 'APPROVED', '00000000-0000-4000-8000-0000000d0a03', NULL
);

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT org_name FROM public.verified_event_organizers WHERE event_id = '00000000-0000-4000-8000-0000000d0e01') <> 'Himpunan Uji' THEN
    RAISE EXCEPTION 'lencana publik harus tampil untuk tamu';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'verified_event_organizers' AND column_name = 'user_id') THEN
    RAISE EXCEPTION 'lencana publik tidak boleh membuka user_id';
  END IF;
END$$;
RESET ROLE;

-- 4. Pengelola mengajukan perubahan; acara TIDAK berubah sebelum disetujui.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
DO $$
BEGIN
  IF NOT public.manages_event('00000000-0000-4000-8000-0000000d0e01') THEN
    RAISE EXCEPTION 'klaim yang disetujui harus memberi hak kelola';
  END IF;
  -- Tetap tidak bisa mengubah acara langsung.
  UPDATE public.events SET description = 'diubah langsung' WHERE id = '00000000-0000-4000-8000-0000000d0e01';
  IF EXISTS (SELECT 1 FROM public.events WHERE description = 'diubah langsung') THEN
    RAISE EXCEPTION 'pengelola tidak boleh mengubah acara tanpa moderasi';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
INSERT INTO public.event_revisions (event_id, proposed_by, changes, note)
VALUES ('00000000-0000-4000-8000-0000000d0e01', '00000000-0000-4000-8000-0000000d0a01',
        jsonb_build_object('description', 'Deskripsi baru dari panitia', 'deadline_at', (now() + interval '20 days')::text), 'Tenggat diperpanjang');
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE description = 'Deskripsi baru dari panitia') THEN
    RAISE EXCEPTION 'perubahan tidak boleh berlaku sebelum disetujui';
  END IF;
END$$;

SELECT public.review_event_revision(
  (SELECT id FROM public.event_revisions LIMIT 1), 'APPROVED', '00000000-0000-4000-8000-0000000d0a03', NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE description = 'Deskripsi baru dari panitia') THEN
    RAISE EXCEPTION 'perubahan yang disetujui harus diterapkan';
  END IF;
  IF (SELECT deadline_at FROM public.event_deadlines WHERE event_id = '00000000-0000-4000-8000-0000000d0e01' AND is_primary) < now() + interval '19 days' THEN
    RAISE EXCEPTION 'tenggat baru harus diterapkan';
  END IF;
END$$;

-- Perubahan berbahaya ditolak database walau lolos ke antrean.
INSERT INTO public.event_revisions (event_id, proposed_by, changes)
VALUES ('00000000-0000-4000-8000-0000000d0e01', '00000000-0000-4000-8000-0000000d0a01', '{"registration_link":"javascript:alert(1)"}');
DO $$
BEGIN
  BEGIN
    PERFORM public.review_event_revision(
      (SELECT id FROM public.event_revisions WHERE status = 'PENDING'), 'APPROVED', '00000000-0000-4000-8000-0000000d0a03', NULL
    );
    RAISE EXCEPTION 'tautan non-https harus ditolak saat diterapkan';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'revision_invalid_link' THEN RAISE; END IF;
  END;
END$$;
UPDATE public.event_revisions SET status = 'REJECTED', reviewed_at = now() WHERE status = 'PENDING';

-- 5. Ganti nama lembaga setelah terverifikasi = kembali ke antrean.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
UPDATE public.organizer_profiles SET org_name = 'Kementerian Palsu' WHERE user_id = '00000000-0000-4000-8000-0000000d0a01';
DO $$
BEGIN
  IF (SELECT status FROM public.organizer_profiles) <> 'PENDING' THEN
    RAISE EXCEPTION 'mengganti identitas harus mencabut verifikasi sampai ditinjau ulang';
  END IF;
  IF public.manages_event('00000000-0000-4000-8000-0000000d0e01') THEN
    RAISE EXCEPTION 'hak kelola harus hilang saat tidak lagi terverifikasi';
  END IF;
END$$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.verified_event_organizers) THEN
    RAISE EXCEPTION 'lencana harus hilang saat verifikasi hilang';
  END IF;
END$$;
RESET ROLE;

-- 6. Dicabut → tidak bisa mengajukan ulang sendiri.
SELECT public.review_organizer('00000000-0000-4000-8000-0000000d0a01', 'VERIFIED', '00000000-0000-4000-8000-0000000d0a03', NULL);
SELECT public.review_organizer('00000000-0000-4000-8000-0000000d0a01', 'REVOKED', '00000000-0000-4000-8000-0000000d0a03', 'Penyalahgunaan');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
UPDATE public.organizer_profiles SET evidence = 'Tolong verifikasi lagi, kami sudah berubah kok' WHERE user_id = '00000000-0000-4000-8000-0000000d0a01';
RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.organizer_profiles) <> 'REVOKED' THEN
    RAISE EXCEPTION 'yang dicabut tidak boleh mengembalikan dirinya ke antrean';
  END IF;
END$$;

-- 7. Log append-only: tidak bisa dihapus/diubah lewat API.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a03';
DO $$
BEGIN
  BEGIN
    DELETE FROM public.moderation_log;
    RAISE EXCEPTION 'log moderasi tidak boleh bisa dihapus';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;
ROLLBACK;
