import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Tanpa incremental cache (R2/KV): halaman produk ini dinamis (CSP bernonce
// per request, ADR-027), jadi tidak ada ISR yang perlu disimpan. Cache data
// 300 dtk untuk listing publik hidup di memori isolate. Kalau nanti butuh
// cache lintas-isolate, tambahkan r2IncrementalCache di sini.
export default defineCloudflareConfig();
