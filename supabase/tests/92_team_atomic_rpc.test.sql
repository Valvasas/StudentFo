-- `create_team_with_leader` (20260930100002): tim dan ketuanya lahir
-- bersamaan atau tidak sama sekali, dan fungsi tetap tunduk pada RLS.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'ketua@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'lain@example.com');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'Lomba Tim', 'Kampus', 'LOMBA', 'https://t.example', 'https://t.example', 'APPROVED', now()),
  ('00000000-0000-0000-0000-0000000000e2', 'Lomba Antre', 'Kampus', 'LOMBA', 'https://u.example', 'https://u.example', 'PENDING', NULL);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

DO $$
DECLARE
  v_team UUID;
BEGIN
  v_team := public.create_team_with_leader('00000000-0000-0000-0000-0000000000e1', 'Tim A', NULL, 3);
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = v_team AND user_id = '00000000-0000-0000-0000-0000000000a1' AND role = 'leader'
  ) THEN
    RAISE EXCEPTION 'ketua harus terdaftar bersama timnya';
  END IF;
  IF (SELECT created_by FROM public.teams WHERE id = v_team) <> '00000000-0000-0000-0000-0000000000a1' THEN
    RAISE EXCEPTION 'created_by harus auth.uid(), bukan masukan pemanggil';
  END IF;
END$$;

-- Event belum tayang: RLS menolak, dan TIDAK ada tim yatim yang tertinggal.
DO $$
BEGIN
  PERFORM public.create_team_with_leader('00000000-0000-0000-0000-0000000000e2', 'Tim Intip', NULL, 3);
  RAISE EXCEPTION 'tim untuk event PENDING seharusnya ditolak';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.teams WHERE event_id = '00000000-0000-0000-0000-0000000000e2') THEN
    RAISE EXCEPTION 'penolakan tidak boleh meninggalkan baris teams';
  END IF;
END$$;

-- Tamu tidak boleh memanggilnya sama sekali.
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.create_team_with_leader('00000000-0000-0000-0000-0000000000e1', 'Tim Tamu', NULL, 3);
  RAISE EXCEPTION 'anon seharusnya tidak punya hak EXECUTE';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END$$;
ROLLBACK;
