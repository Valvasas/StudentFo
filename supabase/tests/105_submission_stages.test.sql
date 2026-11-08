-- Tahapan jadwal kiriman → event_deadlines non-utama (ADR-062 #5).
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000f7a01', 'admin-tahap@x');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000f7a01';

INSERT INTO public.ugc_submissions (id, submitted_by_email, payload) VALUES
  ('00000000-0000-4000-8000-0000000f7c01', 'bertahap@x',
   '{"title":"Lomba Bertahap Uji","organizer":"Org Tahap","event_type":"LOMBA","registration_link":"https://t.example",
     "deadline_at":"2099-01-10T16:59:00Z",
     "stages":[{"label":"submission","deadline_at":"2099-02-01T16:59:00Z"},
               {"label":"final","deadline_at":"2099-03-01T16:59:00Z"},
               {"label":"final","deadline_at":"2099-03-05T16:59:00Z"},
               {"label":"registration","deadline_at":"2099-04-01T16:59:00Z"},
               {"label":"pesta","deadline_at":"2099-04-01T16:59:00Z"},
               {"label":"announcement","deadline_at":"bukan tanggal"}]}'),
  -- Kiriman sebelum migration ini: tanpa kunci "stages" sama sekali.
  ('00000000-0000-4000-8000-0000000f7c02', 'lama@x',
   '{"title":"Lomba Tanpa Tahap Uji","organizer":"Org Lama","event_type":"LOMBA","registration_link":"https://l.example","deadline_at":"2099-01-10T16:59:00Z"}'),
  -- "stages" bukan larik (ditulis langsung lewat PostgREST) tidak boleh menggagalkan persetujuan.
  ('00000000-0000-4000-8000-0000000f7c03', 'aneh@x',
   '{"title":"Lomba Tahap Aneh Uji","organizer":"Org Aneh","event_type":"LOMBA","registration_link":"https://a.example","deadline_at":"2099-01-10T16:59:00Z","stages":"final besok"}');

DO $$
DECLARE
  staged UUID;
  plain  UUID;
  odd    UUID;
BEGIN
  staged := public.approve_submission('00000000-0000-4000-8000-0000000f7c01', '00000000-0000-4000-8000-0000000f7a01');
  plain := public.approve_submission('00000000-0000-4000-8000-0000000f7c02', '00000000-0000-4000-8000-0000000f7a01');
  odd := public.approve_submission('00000000-0000-4000-8000-0000000f7c03', '00000000-0000-4000-8000-0000000f7a01');

  IF (SELECT array_agg(label || '@' || to_char(deadline_at AT TIME ZONE 'UTC', 'MM-DD') || CASE WHEN is_primary THEN '*' ELSE '' END ORDER BY deadline_at)
      FROM public.event_deadlines WHERE event_id = staged)
     <> ARRAY['registration@01-10*', 'submission@02-01', 'final@03-01'] THEN
    RAISE EXCEPTION 'tahapan: satu per label, label dikenal saja, tanggal rusak dibuang, pendaftaran tetap satu-satunya utama: %',
      (SELECT array_agg(label || '@' || deadline_at::text ORDER BY deadline_at) FROM public.event_deadlines WHERE event_id = staged);
  END IF;
  IF (SELECT count(*) FROM public.event_deadlines WHERE event_id = plain) <> 1
     OR (SELECT count(*) FROM public.event_deadlines WHERE event_id = odd) <> 1 THEN
    RAISE EXCEPTION 'kiriman tanpa tahapan (lama / rusak) tetap disetujui dengan tenggat pendaftaran saja';
  END IF;
  -- Kedaluwarsa tetap dihitung dari tenggat UTAMA, bukan tahapan terakhir.
  IF (SELECT primary_deadline_at FROM public.events_listing WHERE id = staged) <> '2099-01-10T16:59:00Z'::timestamptz THEN
    RAISE EXCEPTION 'tenggat utama di listing harus tetap tenggat pendaftaran';
  END IF;
END$$;
ROLLBACK;
