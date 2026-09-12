# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StudentFo: a Next.js aggregator for Indonesian student opportunities (competitions,
scholarships, internships, workshops). Phase 1 of a 3-phase roadmap — see
`supabase/DEVIATIONS.md` for the full product spec and every place the implementation
intentionally deviates from the original design blueprint (that file is the
single most important doc in this repo — read it before touching schema, RLS,
or the deadline/recommendation logic).

## Commands

```bash
npm install          # no DB, no API keys needed — see "Data layer" below
npm run dev           # dev server, localhost:3000
npm run build          # production build
npm run typecheck       # tsc --noEmit
npm run lint            # eslint src
npm test                # vitest run (all tests, single pass)
npm run test:watch      # vitest watch mode
npm run verify           # typecheck + lint + test — run this before committing

npx vitest run src/lib/deadline.test.ts       # single test file
npx vitest run -t "urgencyFromDays"           # single test by name

python pipeline/tests/test_models.py          # pipeline validation tests (no pytest needed)
python pipeline/run.py --config pipeline/config/sources.yaml --dry-run   # pipeline dry run
```

No build step for the pipeline (`pipeline/`) — it's a standalone Python script, not
wired into the npm scripts. It needs its own venv: `pip install -r pipeline/requirements.txt`.

## Architecture

### Repository pattern is the load-bearing abstraction

Every page/component talks to `EventRepository` (`src/lib/data/repository.ts`), never
to Supabase directly. `src/lib/data/index.ts` picks the implementation at runtime based
on `dataMode` (`src/lib/env.ts`): if `NEXT_PUBLIC_SUPABASE_URL` + anon key are both set,
it's `SupabaseEventRepository`; otherwise `MemoryEventRepository` backed by
`src/lib/data/seed-data.ts`. This is why `npm run dev` works with zero configuration —
don't break that by importing supabase-js directly in a component. When adding a new
repository method, implement it in both classes or the seed mode silently diverges from
production behavior.

The Supabase repository imports (`src/lib/data/supabase-repository.ts` and
`src/lib/supabase/server.ts`) are dynamic (`await import(...)`) inside `getEventRepository()`
specifically so bundling doesn't pull `server-only` Supabase code into the seed-mode path.

### Database: migrations are the source of truth, apply in order

Four migration files in `supabase/migrations/`, meant to run in filename order:
1. `..._init_types_and_tables.sql` — enums, tables, indexes (includes a custom
   `public.indonesian` text search config — PostgreSQL has no built-in one, see below)
2. `..._functions_and_triggers.sql` — slug/dedup-hash generation, `is_admin()`,
   the `auth.users` → `public.users` sync trigger, `expire_past_events()`
3. `..._row_level_security.sql` — RLS on **all** public tables, not just the ones
   with user data (a table with no RLS is writable by anyone holding the anon key)
4. `..._views_and_seed_taxonomy.sql` — `events_listing` view (`security_invoker = on`)
   and the initial `categories` rows

`src/types/database.ts` is a hand-written mirror of `events_listing` columns — if you
change a migration's selected columns, update this file too (no `supabase gen types`
step is wired up yet).

**Before changing schema or RLS, read `supabase/DEVIATIONS.md` section by section.**
It documents *why* things are structured the way they are (e.g. why `dedup_hash`
deliberately excludes `source_url`, why `is_admin()` is `SECURITY DEFINER STABLE`
instead of an inline RLS subquery, why public read access includes `EXPIRED` events
not just `APPROVED`). Re-deriving these from the SQL alone risks "fixing" something
that was already fixed once.

### Deadline math is timezone-sensitive — always test at the boundary

`src/lib/deadline.ts` computes "H-n" (days until deadline) in **Asia/Jakarta calendar
days**, not `(deadline - now) / 86400000`. Millisecond division gives wrong answers
near midnight WIB. If you touch this file, run `npx vitest run src/lib/deadline.test.ts`
— it has explicit UTC-midnight-crossing cases that will catch timezone regressions.
`DeadlineTag`/`DeadlineRing` are Server Components computed fresh per request
(pages using them are `force-dynamic`) — don't add `loading.tsx` at the app root or
in `src/app/events/` (see note below on why).

### Recommendation scoring has a cold-start path

`src/lib/recommendation.ts` implements two scoring formulas: the personalized one
(category/education/recency match) and a cold-start fallback (recency + log-scaled
popularity) used whenever `interests` is empty or `educationLevel` is null. New users
must never see an empty or randomly-ordered homepage — `isColdStart()` is the gate.

### URL-driven filtering, no client state

`src/lib/search-params.ts` parses/builds all `/events` filter state from the URL
query string; `FilterBar` and `SearchForm` (`src/components/event/filter-bar.tsx`)
render as plain `<form>`/`<a>` elements, not client components with `useState`.
This is deliberate — filters must work without JS, be bookmarkable, and support
browser back/forward. Don't reintroduce client-side filter state.

### Do not add a root or `events/` `loading.tsx`

A `loading.tsx` at `src/app/` or `src/app/events/` wraps the whole route tree in
a Suspense boundary, which streams the shell with HTTP 200 before `notFound()`
in `src/app/events/[slug]/page.tsx` can flip the status to 404 — a soft-404 that
gets indexed by search engines. This already happened once and was fixed by
scoping the loading UI to a `<Suspense>` inside `src/app/events/page.tsx` around
just the results region. If you need a loading skeleton elsewhere, scope it the
same way — don't add a route-level `loading.tsx` file.

### Design tokens: Tailwind v4, not v3 syntax

`src/app/globals.css` defines all design tokens (colors, spacing, radius, motion)
once as CSS custom properties, then bridges them to Tailwind utilities via
`@theme inline`. This is Tailwind v4 — arbitrary-value syntax like `rounded-[--radius-card]`
does **not** work here; use the generated utility (`rounded-card`) instead. Token names
follow the original design blueprint's naming (`--color-accent`, `--color-deadline-*`)
even though the actual hue values were changed (see DEVIATIONS.md #13) — don't rename
tokens without checking every component that references them.

Dark mode is controlled by `data-theme` attribute (not pure `prefers-color-scheme`),
set by the inline script in `src/components/layout/theme-script.tsx` before hydration
to avoid a flash. `ThemeToggle` reads/writes `data-theme` + `localStorage`.

### Pipeline: category enum is fetched from the DB, never hardcoded

`pipeline/studentfo_pipeline/extractor.py` builds the Gemini JSON schema's
`categories` enum from `publisher.fetch_category_slugs()` (a live query against the
`categories` table), not a Python constant. If category taxonomy changes, it changes
via `INSERT INTO categories` — no code deploy needed. Validation in
`pipeline/studentfo_pipeline/models.py` (Pydantic) is a second gate after Gemini's
structured output — structured output only guarantees JSON *shape*, not that a
deadline isn't in the past or a URL isn't `javascript:`. `compute_dedup_hash()` here
must stay byte-for-byte consistent with `public.compute_dedup_hash()` in the SQL
migration (both hash `title|organizer`, normalized, excluding `source_url`).

Ethical scraping constraints (`pipeline/studentfo_pipeline/fetcher.py`) are enforced
in code, not left to operator discipline: robots.txt is checked before every fetch
(unreadable robots.txt = source skipped, not "assumed allowed"), and per-domain delay
minimums are floored in `config.py` so a config typo can't turn the scraper into a
denial-of-service source.
