-- =====================================================================
-- register_for_event(): ulangi pembuatan kode pendaftaran bila bertabrakan.
--
-- Kode `SF-` + 8 heksadesimal = 32 bit acak dengan UNIQUE. Tabrakan jarang
-- tapi pasti terjadi seiring jumlah pendaftar (paradoks hari ulang tahun),
-- dan tanpa pengulangan ia muncul ke peserta sebagai 500 generik. Hanya
-- konflik `code` yang diulang (ON CONFLICT (code)): pelanggaran indeks
-- `event_registrations_one_active` tetap meledak seperti sebelumnya, dan
-- pendaftaran ganda tetap ditolak lebih dulu sebagai `registration_exists`.
--
-- Migration terpisah — 20261014100001 mungkin sudah diterapkan. Selain
-- perulangan INSERT, isi fungsi identik dengan versi sebelumnya.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.register_for_event(p_event UUID, p_answers JSONB)
RETURNS public.event_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_form public.event_registration_forms%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_row  public.event_registrations%ROWTYPE;
  v_used INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'registration_requires_login' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'invalid_registration' USING ERRCODE = 'P0001';
  END IF;

  -- FOR UPDATE menyerialkan pendaftar acara yang sama: tanpa kunci, dua
  -- orang yang menekan "Kirim" bersamaan sama-sama melihat sisa kuota 1.
  SELECT * INTO v_form FROM public.event_registration_forms WHERE event_id = p_event FOR UPDATE;
  IF NOT FOUND OR NOT v_form.is_open THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.status = 'APPROVED')
     OR EXISTS (SELECT 1 FROM public.event_deadlines d WHERE d.event_id = p_event AND d.is_primary AND d.deadline_at < now()) THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.event_registrations r
             WHERE r.event_id = p_event AND r.user_id = v_uid AND r.status <> 'CANCELLED') THEN
    RAISE EXCEPTION 'registration_exists' USING ERRCODE = 'P0001';
  END IF;

  IF v_form.capacity IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM public.event_registrations r
    WHERE r.event_id = p_event AND r.status NOT IN ('CANCELLED', 'REJECTED');
    IF v_used >= v_form.capacity THEN
      RAISE EXCEPTION 'registration_full' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NOT public.consume_rate_limit('registration:' || v_uid::text, 10, 3600) THEN
    RAISE EXCEPTION 'registration_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_requires_login' USING ERRCODE = '42501';
  END IF;

  FOR v_attempt IN 1..5 LOOP
    INSERT INTO public.event_registrations (code, event_id, user_id, full_name, email, answers, status, fee_amount)
    VALUES (
      'SF-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)),
      p_event, v_uid, v_user.full_name, v_user.email, p_answers,
      CASE WHEN v_form.fee_amount IS NULL THEN 'CONFIRMED' ELSE 'AWAITING_PAYMENT' END,
      v_form.fee_amount
    )
    ON CONFLICT (code) DO NOTHING
    RETURNING * INTO v_row;
    EXIT WHEN FOUND;
  END LOOP;
  -- FOUND sesudah FOR selalu benar (diset oleh perulangannya), jadi yang
  -- diperiksa barisnya: RETURNING tanpa baris mengosongkan v_row.
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'registration_code_exhausted' USING ERRCODE = '23505';
  END IF;

  -- Papan pendaftaran pribadi ikut maju — tanpa memundurkan tahap yang
  -- sudah lebih jauh (wawancara/diterima).
  INSERT INTO public.application_tracker (user_id, event_id, status)
  VALUES (v_uid, p_event, 'APPLIED')
  ON CONFLICT (user_id, event_id) DO UPDATE SET status = 'APPLIED', updated_at = now()
  WHERE public.application_tracker.status = 'SAVED';

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.register_for_event(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_event(UUID, JSONB) TO authenticated;
