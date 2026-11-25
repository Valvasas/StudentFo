-- Pipeline: guidebook + upsert aman (ADR-102, migration 20261125100004).
BEGIN;
DO $$
DECLARE r JSONB; v_id UUID; v_g TEXT; v_b TEXT; v_n INT; v_status TEXT;
  base JSONB := jsonb_build_object('title','Lomba Uji Upsert','organizer','Penyelenggara Upsert','event_type','LOMBA',
    'registration_link','https://daftar.example/u','source_url','https://sumber.example/u','media','[]'::jsonb,
    'categories','[]'::jsonb);
  dl JSONB := jsonb_build_array(jsonb_build_object('label','registration','deadline_at',(now()+interval '10 days')::text,'is_primary',true));
BEGIN
  -- 1. Baru: dibuat PENDING, guidebook https tersimpan, non-https jadi NULL.
  r := public.upsert_scraped_event(base || jsonb_build_object('deadlines', dl, 'guidebook_url','https://x.example/g.pdf','benefits','Hadiah A'));
  IF r ->> 'action' <> 'created' THEN RAISE EXCEPTION 'harus created: %', r; END IF;
  v_id := (r ->> 'id')::UUID;
  SELECT guidebook_url, benefits INTO v_g, v_b FROM public.events WHERE id = v_id;
  IF v_g <> 'https://x.example/g.pdf' OR v_b <> 'Hadiah A' THEN RAISE EXCEPTION 'isi awal salah: % %', v_g, v_b; END IF;

  -- 2. Sama & PENDING: diperbarui di tempat; tenggat diganti; kosong tidak menghapus isi lama.
  r := public.upsert_scraped_event(base || jsonb_build_object(
    'deadlines', jsonb_build_array(jsonb_build_object('label','registration','deadline_at',(now()+interval '20 days')::text,'is_primary',true)),
    'benefits','   ', 'requirements','Syarat baru', 'guidebook_url','http://tidak-https.example/g.pdf'));
  IF r ->> 'action' <> 'updated' OR (r ->> 'id')::UUID <> v_id THEN RAISE EXCEPTION 'harus updated: %', r; END IF;
  SELECT guidebook_url, benefits INTO v_g, v_b FROM public.events WHERE id = v_id;
  IF v_b <> 'Hadiah A' OR v_g <> 'https://x.example/g.pdf' THEN RAISE EXCEPTION 'kosong/non-https tidak boleh menghapus isi lama: % %', v_g, v_b; END IF;
  SELECT count(*) INTO v_n FROM public.event_deadlines WHERE event_id = v_id AND deadline_at > now() + interval '15 days';
  IF v_n <> 1 OR (SELECT count(*) FROM public.event_deadlines WHERE event_id = v_id) <> 1 THEN RAISE EXCEPTION 'tenggat harus diganti utuh'; END IF;

  -- 3. Sudah disetujui moderator: TIDAK disentuh.
  UPDATE public.events SET status = 'APPROVED', reviewed_at = now() WHERE id = v_id;
  r := public.upsert_scraped_event(base || jsonb_build_object('deadlines', dl, 'benefits','TIMPA!', 'requirements','TIMPA!'));
  IF r ->> 'action' <> 'locked' THEN RAISE EXCEPTION 'harus locked: %', r; END IF;
  SELECT benefits, status::text INTO v_b, v_status FROM public.events WHERE id = v_id;
  IF v_b <> 'Hadiah A' OR v_status <> 'APPROVED' THEN RAISE EXCEPTION 'kegiatan tayang tidak boleh berubah: % %', v_b, v_status; END IF;
END$$;

-- 4. Hanya service_role.
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.upsert_scraped_event('{}'::jsonb);
  RAISE EXCEPTION 'anon tidak boleh memanggil';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
ROLLBACK;
