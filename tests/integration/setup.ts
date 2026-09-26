import { vi } from 'vitest';
import { adminClient, clientFor, serverClient } from './harness';

// Pengganti klien berbasis cookie Next.js: klien supabase-js ASLI dengan JWT
// peran yang dipilih test (actAs). Query, RLS, RPC, dan trigger semuanya
// berjalan di Postgres/PostgREST sungguhan.
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => serverClient(),
  createSupabaseAdminClient: () => adminClient(),
  createSupabasePublicClient: () => clientFor(null),
}));
