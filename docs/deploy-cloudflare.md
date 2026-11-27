# Deploy ke Cloudflare Workers

Stack: Next.js 15 → `@opennextjs/cloudflare` → Worker `studentfo`. Alasan & batasan: `DECISION.md` ADR-103.

## Cara termudah: dari dasbor, tanpa terminal (Workers Builds)

Cloudflare men-build & men-deploy otomatis setiap ada push ke `main`.

1. dash.cloudflare.com → **Workers & Pages** → **Plans** → upgrade ke **Workers Paid**.
2. **Workers & Pages → Create → Import a repository** → hubungkan GitHub → pilih `StudentFo`.
3. Isi:
   - Project name: `studentfo` (harus sama dengan `name` di `wrangler.jsonc`)
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
   - **Build variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `NEXT_PUBLIC_SITE_URL` (dibekukan saat build, jadi WAJIB di sini).
4. **Save and Deploy.** Build pertama mungkin hijau tapi situs 500: itu wajar
   (rahasia belum ada, aplikasi sengaja menolak jalan).
5. Worker `studentfo` → **Settings → Variables and Secrets → Add** → tipe **Secret**:
   `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, `CRON_SECRET`,
   `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (berpasangan), `ERROR_ALERT_WEBHOOK_URL`,
   dst. Nilainya salin dari Vercel → Settings → Environment Variables.
6. **Deployments → Retry/Redeploy**, lalu buka `https://studentfo.studentfo.workers.dev/api/health`.

## Lewat terminal

### Sekali saja
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

### Setiap deploy
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
