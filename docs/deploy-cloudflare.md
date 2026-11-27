# Deploy ke Cloudflare Workers

Stack: Next.js 15 → `@opennextjs/cloudflare` → Worker `studentfo`. Alasan & batasan: `DECISION.md` ADR-103.

## Sekali saja
1. Akun Cloudflare dengan **Workers Paid** (bundle ±4,2 MiB gzip; free = 3 MiB).
2. `npx wrangler login` (atau `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` di CI).
3. Rahasia server (jangan ditempel di chat):
   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put RATE_LIMIT_SECRET
   npx wrangler secret put CRON_SECRET
   npx wrangler secret put TURNSTILE_SECRET_KEY
   npx wrangler secret put ERROR_ALERT_WEBHOOK_URL
   ```
   Env non-rahasia (`TURNSTILE_SITE_KEY`, `PRIVACY_*`, dst.) → blok `vars` di `wrangler.jsonc` atau dasbor Workers.

## Setiap deploy
`NEXT_PUBLIC_*` dibekukan saat build, jadi isi dulu di shell/CI:
```bash
export NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... NEXT_PUBLIC_SITE_URL=https://...
npm run cf:deploy
```
Pratinjau lokal di workerd: `npm run cf:preview` (isi `.dev.vars`, lihat `.dev.vars.example`).

## Setelah pindah
- Supabase → Auth → URL Configuration (Site URL, Redirect URLs `…/auth/callback`).
- Google OAuth: Authorized JavaScript origins; Turnstile: hostname widget.
- GitHub Actions cron (`.github/workflows/*`): ganti base URL/`CRON_SECRET` ke host baru.
- Monitor `GET /api/health` harus `"dataMode":"supabase"`.
- Rollback: `npx wrangler rollback`.
