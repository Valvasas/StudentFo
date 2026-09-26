-- =====================================================================
-- RLS: auth.uid() dan is_admin() dibungkus `(select …)`.
--
-- Kenapa: fungsi STABLE di dalam ekspresi policy dievaluasi ulang untuk
-- SETIAP baris yang dipindai (terlihat sebagai `Filter: current_setting(…)`
-- di EXPLAIN). Dibungkus subquery skalar, planner menjadikannya InitPlan —
-- dievaluasi sekali per statement, lalu hasilnya dipakai sebagai konstanta.
-- Semantik tidak berubah: nilainya memang konstan sepanjang satu query.
--
-- ALTER POLICY (bukan DROP + CREATE) supaya tidak ada satu momen pun
-- tabel tanpa policy di tengah migration.
--
-- Dikunci oleh supabase/tests/30_rls_initplan.test.sql: policy baru yang
-- memanggil auth.uid()/is_admin() telanjang membuat `npm run db:test` gagal.
-- =====================================================================

-- users --------------------------------------------------------------
ALTER POLICY users_select_own ON public.users
  USING ((select auth.uid()) = id OR (select public.is_admin()));

ALTER POLICY users_update_own ON public.users
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- policy admin -------------------------------------------------------
ALTER POLICY categories_admin_write ON public.categories
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

ALTER POLICY events_admin_all ON public.events
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

ALTER POLICY event_categories_admin_all ON public.event_categories
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

ALTER POLICY event_deadlines_admin_all ON public.event_deadlines
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

ALTER POLICY ugc_admin_read ON public.ugc_submissions
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

-- data milik pengguna ------------------------------------------------
ALTER POLICY saved_events_own ON public.saved_events
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = saved_events.event_id AND e.status IN ('APPROVED', 'EXPIRED')
    )
  );

ALTER POLICY tracker_own ON public.application_tracker
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = application_tracker.event_id AND e.status IN ('APPROVED', 'EXPIRED')
    )
  );

ALTER POLICY notifications_own_read ON public.notifications
  USING ((select auth.uid()) = user_id);

ALTER POLICY notifications_own_update ON public.notifications
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- tim ------------------------------------------------------------------
ALTER POLICY teams_owner_insert ON public.teams
  WITH CHECK (
    (select public.is_admin())
    OR (
      (select auth.uid()) = created_by
      AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = teams.event_id AND e.status = 'APPROVED')
    )
  );

ALTER POLICY teams_owner_update ON public.teams
  USING ((select auth.uid()) = created_by OR (select public.is_admin()))
  WITH CHECK ((select auth.uid()) = created_by OR (select public.is_admin()));

ALTER POLICY teams_owner_delete ON public.teams
  USING ((select auth.uid()) = created_by OR (select public.is_admin()));

ALTER POLICY team_members_self_join ON public.team_members
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      role = 'member'
      OR (
        role = 'leader'
        AND EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = team_members.team_id AND t.created_by = (select auth.uid())
        )
      )
    )
  );

ALTER POLICY team_members_self_leave ON public.team_members
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id AND t.created_by = (select auth.uid())
    )
  );
