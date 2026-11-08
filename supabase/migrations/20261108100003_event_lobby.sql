-- =====================================================================
-- Lobi lomba (ADR-071)
--
-- Setelah mendaftar sebuah lomba, peserta bisa masuk lobi lomba itu untuk
-- mencari tim/partner dan mengajak teman ikut sebelum lomba. "Sudah
-- mendaftar" = tahap Papan lamaran APPLIED/INTERVIEW/ACCEPTED, ATAU
-- pendaftaran formulir StudentFo yang masih hidup. Tahap Papan lamaran
-- dilaporkan sendiri (ADR-046) — diterima: lobi adalah ruang sapa, bukan
-- sumber hak atau lencana, dan setiap anggota tetap bisa memblokir.
--
-- Privasi (pola kartu pemain ADR-057): bergabung adalah pilihan sendiri,
-- dan daftar anggota hanya terbaca oleh sesama anggota (timbal-balik).
-- Sebelum bergabung yang terlihat hanya JUMLAH anggota.
--
-- Aturan kelayakan HARUS sama dengan src/lib/lobby.ts (`hasRegistered`,
-- `isLobbyEvent`, `isLobbyOpen`) — dicerminkan mode seed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Penilai kelayakan (hanya dipanggil fungsi DEFINER di bawah)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_use_lobby(p_event UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event AND e.event_type = 'LOMBA' AND e.status IN ('APPROVED', 'EXPIRED')
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.application_tracker t
        WHERE t.event_id = p_event AND t.user_id = auth.uid() AND t.status IN ('APPLIED', 'INTERVIEW', 'ACCEPTED')
      )
      OR EXISTS (
        SELECT 1 FROM public.event_registrations r
        WHERE r.event_id = p_event AND r.user_id = auth.uid() AND r.status IN ('AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED')
      )
    );
$$;

-- Bisa bergabung/mengajak = tayang dan tenggat utama belum lewat.
CREATE OR REPLACE FUNCTION public.lobby_is_open(p_event UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event
      AND e.status = 'APPROVED'
      AND NOT EXISTS (
        SELECT 1 FROM public.event_deadlines d
        WHERE d.event_id = e.id AND d.is_primary AND d.deadline_at <= now()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_use_lobby(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lobby_is_open(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. lobby_members — kartu "aku di lobi" per lomba
-- ---------------------------------------------------------------------
CREATE TABLE public.lobby_members (
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  intent     VARCHAR(12) NOT NULL CHECK (intent IN ('CARI_TIM', 'CARI_ANGGOTA', 'SIAP')),
  note       VARCHAR(160) CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- "Lobi lomba saya" dimulai dari pengguna; PK melayani arah sebaliknya (roster per lomba).
CREATE INDEX idx_lobby_members_user ON public.lobby_members (user_id);

CREATE TRIGGER trg_lobby_members_touch
  BEFORE UPDATE ON public.lobby_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tulis hanya lewat join_lobby() (kelayakan + upsert atomik); klien hanya
-- membaca & menghapus barisnya sendiri. Roster orang lain lewat lobby_roster().
ALTER TABLE public.lobby_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY lobby_members_select_own ON public.lobby_members
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
CREATE POLICY lobby_members_delete_own ON public.lobby_members
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
REVOKE ALL ON public.lobby_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.lobby_members TO authenticated;

-- ---------------------------------------------------------------------
-- 3. lobby_invites — siapa sudah mengajak siapa (satu kali per lomba)
-- ---------------------------------------------------------------------
CREATE TABLE public.lobby_invites (
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, inviter_id, invitee_id),
  CONSTRAINT lobby_invites_not_self CHECK (inviter_id <> invitee_id)
);
-- Tidak ada index tambahan: "ajakanku di lomba ini" = awalan PK (event_id, inviter_id).

ALTER TABLE public.lobby_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY lobby_invites_select_own ON public.lobby_invites
  FOR SELECT TO authenticated
  USING (inviter_id = (select auth.uid()));
REVOKE ALL ON public.lobby_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lobby_invites TO authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_lobby(p_event UUID, p_intent TEXT, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.can_use_lobby(p_event) THEN
    RAISE EXCEPTION 'lobby_forbidden' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.lobby_is_open(p_event) THEN
    RAISE EXCEPTION 'lobby_closed' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.lobby_members (event_id, user_id, intent, note)
  VALUES (p_event, auth.uid(), p_intent, NULLIF(btrim(p_note), ''))
  ON CONFLICT (event_id, user_id) DO UPDATE SET intent = EXCLUDED.intent, note = EXCLUDED.note;
END;
$$;

-- Anggota lain, hanya untuk sesama anggota. Tanpa yang memblokir/diblokir
-- pembaca dan tanpa akun yang ditangguhkan (ADR-061).
CREATE OR REPLACE FUNCTION public.lobby_roster(p_event UUID)
RETURNS TABLE (user_id UUID, full_name TEXT, intent TEXT, note TEXT, joined_at TIMESTAMPTZ, relation TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.user_id,
    u.full_name::text,
    m.intent::text,
    m.note::text,
    m.created_at,
    CASE
      WHEN c.status = 'ACCEPTED' THEN 'connected'
      WHEN c.status = 'PENDING' THEN 'pending'
      ELSE 'none'
    END
  FROM public.lobby_members m
  JOIN public.users u ON u.id = m.user_id
  LEFT JOIN public.connections c
    ON (c.requester_id = auth.uid() AND c.addressee_id = m.user_id)
    OR (c.addressee_id = auth.uid() AND c.requester_id = m.user_id)
  WHERE m.event_id = p_event
    AND m.user_id <> auth.uid()
    AND u.suspended_at IS NULL
    AND EXISTS (SELECT 1 FROM public.lobby_members me WHERE me.event_id = p_event AND me.user_id = auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.connection_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = m.user_id)
         OR (b.blocker_id = m.user_id AND b.blocked_id = auth.uid())
    )
  ORDER BY m.created_at DESC
  LIMIT 200;
$$;

-- Jumlah anggota (tanpa nama) untuk lomba yang lobinya bisa dimasuki pembaca.
CREATE OR REPLACE FUNCTION public.lobby_member_counts(p_events UUID[])
RETURNS TABLE (event_id UUID, member_count INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.id, (
    SELECT count(*)::int
    FROM public.lobby_members m
    JOIN public.users u ON u.id = m.user_id
    WHERE m.event_id = e.id AND u.suspended_at IS NULL
  )
  FROM unnest(p_events[1:100]) AS e(id)
  WHERE public.can_use_lobby(e.id);
$$;

-- Ajak koneksi ikut lomba ini. TRUE = ajakan baru; FALSE = sudah pernah
-- diajak pembaca (tidak memakan jatah). Notifikasinya satu per orang per
-- lomba (idx_notifications_dedupe): diajak tiga teman = satu kabar, bukan tiga.
CREATE OR REPLACE FUNCTION public.invite_to_lobby(p_event UUID, p_invitee UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_name TEXT;
  v_title TEXT;
BEGIN
  IF NOT public.can_use_lobby(p_event) THEN
    RAISE EXCEPTION 'lobby_forbidden' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.lobby_is_open(p_event) THEN
    RAISE EXCEPTION 'lobby_closed' USING ERRCODE = 'P0001';
  END IF;
  IF p_invitee IS NULL OR p_invitee = v_me
     OR NOT EXISTS (
       SELECT 1 FROM public.connections c
       WHERE c.status = 'ACCEPTED'
         AND ((c.requester_id = v_me AND c.addressee_id = p_invitee) OR (c.addressee_id = v_me AND c.requester_id = p_invitee))
     )
     OR EXISTS (
       SELECT 1 FROM public.connection_blocks b
       WHERE (b.blocker_id = v_me AND b.blocked_id = p_invitee) OR (b.blocker_id = p_invitee AND b.blocked_id = v_me)
     ) THEN
    RAISE EXCEPTION 'lobby_invite_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.lobby_invites WHERE event_id = p_event AND inviter_id = v_me AND invitee_id = p_invitee) THEN
    RETURN FALSE;
  END IF;
  IF NOT public.consume_rate_limit('lobby-invite:' || v_me::text, 20, 86400) THEN
    RAISE EXCEPTION 'lobby_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.lobby_invites (event_id, inviter_id, invitee_id) VALUES (p_event, v_me, p_invitee);
  SELECT full_name INTO v_name FROM public.users WHERE id = v_me;
  SELECT title INTO v_title FROM public.events WHERE id = p_event;
  INSERT INTO public.notifications (user_id, event_id, type, message)
  VALUES (p_invitee, p_event, 'LOBBY_INVITE',
          left(format('%s mengajakmu ikut %s. Daftar, lalu masuk lobinya untuk mencari tim bersama.', coalesce(v_name, 'Temanmu'), v_title), 500))
  ON CONFLICT DO NOTHING;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.join_lobby(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lobby_roster(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lobby_member_counts(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_to_lobby(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_lobby(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lobby_roster(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lobby_member_counts(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_to_lobby(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Bergabung ke lobi = boleh disapa sesama anggota lobi itu
--
-- Ajakan koneksi mensyaratkan target "bisa ditemukan" (ADR-040). Tanpa
-- klausa ini, anggota lobi yang tidak membuka profil di Koneksi tidak bisa
-- diajak terhubung — padahal ia bergabung justru untuk mencari tim. Hanya
-- sesama anggota lobi yang SAMA; blokir tetap berlaku.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shares_lobby_with(p_other UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lobby_members mine
    JOIN public.lobby_members theirs ON theirs.event_id = mine.event_id
    WHERE mine.user_id = auth.uid() AND theirs.user_id = p_other
  );
$$;

REVOKE ALL ON FUNCTION public.shares_lobby_with(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shares_lobby_with(UUID) TO authenticated;

-- Isi identik dengan 20260928100001, ditambah klausa lobi.
DROP POLICY connections_insert_requester ON public.connections;
CREATE POLICY connections_insert_requester ON public.connections
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = (select auth.uid())
    AND status = 'PENDING'
    AND (public.is_discoverable(addressee_id) OR public.shares_lobby_with(addressee_id))
    AND NOT public.is_blocked(requester_id, addressee_id)
  );
