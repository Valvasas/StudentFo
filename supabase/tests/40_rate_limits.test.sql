-- Regresi: pembatas laju bersama.
BEGIN;

DO $$
BEGIN
  -- Batas 3 per jendela: tiga lolos, keempat ditolak, ember lain tidak terpengaruh.
  IF NOT public.consume_rate_limit('uji:a', 3, 60) THEN RAISE EXCEPTION 'hit 1 harus lolos'; END IF;
  IF NOT public.consume_rate_limit('uji:a', 3, 60) THEN RAISE EXCEPTION 'hit 2 harus lolos'; END IF;
  IF NOT public.consume_rate_limit('uji:a', 3, 60) THEN RAISE EXCEPTION 'hit 3 harus lolos'; END IF;
  IF public.consume_rate_limit('uji:a', 3, 60) THEN RAISE EXCEPTION 'hit 4 harus ditolak'; END IF;
  IF NOT public.consume_rate_limit('uji:b', 3, 60) THEN RAISE EXCEPTION 'ember lain harus bebas'; END IF;

  -- Penolakan tidak dicatat: tetap 3 baris, bukan 4.
  IF (SELECT count(*) FROM public.rate_limit_hits WHERE bucket = 'uji:a') <> 3 THEN
    RAISE EXCEPTION 'hit yang ditolak tidak boleh dicatat';
  END IF;

  -- Jendela bergeser: hit tua kedaluwarsa dan membuka slot.
  UPDATE public.rate_limit_hits SET hit_at = now() - interval '2 minutes' WHERE bucket = 'uji:a';
  IF NOT public.consume_rate_limit('uji:a', 3, 60) THEN RAISE EXCEPTION 'jendela harus bergeser'; END IF;
  IF (SELECT count(*) FROM public.rate_limit_hits WHERE bucket = 'uji:a') <> 1 THEN
    RAISE EXCEPTION 'hit kedaluwarsa harus terhapus';
  END IF;
END$$;

-- Tamu & pengguna tidak boleh memanggil atau membaca apa pun di sini
-- (kalau bisa, penyerang tinggal menghapus embernya sendiri).
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.consume_rate_limit('uji:c', 1, 60);
    RAISE EXCEPTION 'anon tidak boleh memanggil consume_rate_limit';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.rate_limit_hits;
    RAISE EXCEPTION 'anon tidak boleh membaca rate_limit_hits';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    DELETE FROM public.rate_limit_hits;
    RAISE EXCEPTION 'authenticated tidak boleh menghapus rate_limit_hits';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

ROLLBACK;
