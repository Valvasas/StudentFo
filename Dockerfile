# Image produksi dari build `output: 'standalone'` (next.config.ts).
#
# NEXT_PUBLIC_* dibekukan ke bundle klien SAAT BUILD, jadi harus dioper
# sebagai --build-arg, bukan hanya env saat container jalan:
#   docker build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://studentfo.id \
#     -t studentfo .
# Rahasia server (SUPABASE_SERVICE_ROLE_KEY, TURNSTILE_SECRET_KEY, …) JANGAN
# dijadikan build-arg — nilainya tersimpan di riwayat layer image. Berikan
# saat `docker run -e …`.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# Standalone tidak menyalin aset statis sendiri; tanpa baris kedua halaman
# tayang tanpa CSS/JS. Proyek ini tidak punya folder public/.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
