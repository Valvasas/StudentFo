-- Benefit & persyaratan via pipeline (ADR-101, migration 20261125100003).
BEGIN;
DO $$
DECLARE v_id UUID; v_again UUID; v_b TEXT; v_r TEXT; v_status TEXT;
BEGIN
  v_id := public.stage_scraped_event(jsonb_build_object(
    'title', 'Lomba Uji Benefit', 'organizer', 'Penyelenggara Uji Benefit', 'event_type', 'LOMBA',
    'registration_link', 'https://daftar.example/b1', 'source_url', 'https://sumber.example/b1',
    'benefits', '  Uang tunai Rp10.000.000 + sertifikat  ', 'requirements', 'Mahasiswa aktif D4/S1',
    'deadlines', jsonb_build_array(jsonb_build_object('label', 'registration', 'deadline_at', (now() + interval '10 days')::text, 'is_primary', true)),
    'media', '[]'::jsonb));
  IF v_id IS NULL THEN RAISE EXCEPTION 'event baru harus tertulis'; END IF;
  SELECT benefits, requirements, status::text INTO v_b, v_r, v_status FROM public.events WHERE id = v_id;
  IF v_b <> 'Uang tunai Rp10.000.000 + sertifikat' OR v_r <> 'Mahasiswa aktif D4/S1' THEN
    RAISE EXCEPTION 'benefit/persyaratan tidak tersimpan rapi: % / %', v_b, v_r;
  END IF;
  IF v_status <> 'PENDING' THEN RAISE EXCEPTION 'pipeline harus selalu PENDING, dapat %', v_status; END IF;

  -- Tanpa kunci / string kosong = NULL (bukan string kosong).
  v_again := public.stage_scraped_event(jsonb_build_object(
    'title', 'Lomba Uji Tanpa Benefit', 'organizer', 'Penyelenggara Uji Benefit', 'event_type', 'LOMBA',
    'registration_link', 'https://daftar.example/b2', 'source_url', 'https://sumber.example/b2', 'benefits', '   ',
    'deadlines', jsonb_build_array(jsonb_build_object('label', 'registration', 'deadline_at', (now() + interval '10 days')::text, 'is_primary', true)),
    'media', '[]'::jsonb));
  IF EXISTS (SELECT 1 FROM public.events WHERE id = v_again AND (benefits IS NOT NULL OR requirements IS NOT NULL)) THEN
    RAISE EXCEPTION 'kosong harus NULL';
  END IF;

  BEGIN
    UPDATE public.events SET benefits = repeat('x', 2001) WHERE id = v_id;
    RAISE EXCEPTION '2001 karakter harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;
ROLLBACK;
