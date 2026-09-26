import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { signJwt } from './jwt';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const POSTGREST_URL = process.env.POSTGREST_URL ?? 'http://127.0.0.1:3900';
const DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;

/**
 * supabase-js memanggil `<url>/rest/v1/...`; PostgREST mandiri melayani di
 * root. Selain awalan path itu, request yang sampai ke PostgREST identik
 * dengan produksi — termasuk header Authorization yang menentukan peran RLS.
 */
const rewriteFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return fetch(url.replace(`${SUPABASE_URL}/rest/v1`, POSTGREST_URL), init);
};

let currentUserId: string | null = null;

/** Pengguna yang "sedang masuk" untuk createSupabaseServerClient(); null = tamu (anon). */
export function actAs(userId: string | null): void {
  currentUserId = userId;
}

export function clientFor(userId: string | null): SupabaseClient {
  const secret = process.env.INTEGRATION_JWT_SECRET!;
  const token = userId ? signJwt({ role: 'authenticated', sub: userId }, secret) : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: rewriteFetch, headers: { Authorization: `Bearer ${token}` } },
  });
}

export function serverClient(): SupabaseClient {
  return clientFor(currentUserId);
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: rewriteFetch },
  });
}

/** SQL langsung sebagai pemilik database (untuk menyiapkan data yang tidak lewat API, mis. auth.users). */
export function sql(statement: string): string {
  if (!DATABASE_URL) throw new Error('INTEGRATION_DATABASE_URL kosong — jalankan lewat npm run test:integration.');
  return execFileSync('psql', ['--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', DATABASE_URL, '-c', statement], {
    encoding: 'utf8',
  }).trim();
}

export function createUser({ role = 'USER', fullName = 'Pengguna Uji' }: { role?: 'USER' | 'ADMIN'; fullName?: string } = {}): string {
  const id = randomUUID();
  sql(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${id}', '${id}@uji.example', '{"full_name":"${fullName}"}')`);
  if (role === 'ADMIN') sql(`UPDATE public.users SET role = 'ADMIN' WHERE id = '${id}'`);
  return id;
}

export interface EventSeed {
  title?: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  deadlineInDays?: number | null;
  categories?: string[];
  levels?: string[];
  eventType?: string;
  createdDaysAgo?: number;
}

export function createEvent(seed: EventSeed = {}): { id: string; slug: string; title: string } {
  const id = randomUUID();
  const title = (seed.title ?? `Lomba Integrasi ${id.slice(0, 8)}`).replace(/'/g, "''");
  const status = seed.status ?? 'APPROVED';
  const reviewed = status === 'APPROVED' || status === 'REJECTED' ? 'now()' : 'NULL';
  const levels = `ARRAY[${(seed.levels ?? ['D4_S1']).map((l) => `'${l}'`).join(',')}]::education_level[]`;
  sql(`INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at, education_levels, created_at)
       VALUES ('${id}', '${title}', 'Penyelenggara ${id.slice(0, 8)}', '${seed.eventType ?? 'LOMBA'}', 'https://daftar.example/${id}',
               'https://sumber.example/${id}', '${status}', ${reviewed}, ${levels}, now() - interval '${seed.createdDaysAgo ?? 1} days')`);
  if (seed.deadlineInDays !== null) {
    sql(`INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
         VALUES ('${id}', 'registration', now() + interval '${seed.deadlineInDays ?? 10} days', true)`);
  }
  for (const slug of seed.categories ?? []) {
    sql(`INSERT INTO public.event_categories (event_id, category_id) SELECT '${id}', id FROM public.categories WHERE slug = '${slug}'`);
  }
  const slug = sql(`SELECT slug FROM public.events WHERE id = '${id}'`);
  return { id, slug, title: seed.title ?? title };
}
