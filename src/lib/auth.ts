import 'server-only';
import { dataMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type AdminGate =
  | { allowed: true; reason: 'demo' | 'admin'; userId: string | null }
  | { allowed: false; reason: 'unauthenticated' | 'not-admin' };

/**
 * Gerbang dasbor moderasi.
 *
 * CATATAN KONTRADIKSI BLUEPRINT: §8 menaruh dasbor admin di Phase 1,
 * sementara tabel `users` (satu-satunya tempat kolom `role` berada) baru
 * aktif di Phase 2. Artinya secara harfiah Phase 1 meminta halaman
 * persetujuan tanpa cara apa pun untuk tahu siapa adminnya.
 *
 * Jalan keluar yang dipakai: gerbangnya ditulis sekarang dan sudah benar —
 * memeriksa sesi Supabase lalu `users.role`. Di mode data contoh (tanpa
 * backend) halaman terbuka dan ditandai jelas sebagai pratinjau, karena
 * tidak ada data nyata yang bisa dirusak. Begitu Supabase terpasang,
 * gerbangnya langsung berlaku penuh — tidak ada langkah "pasang autentikasi
 * nanti" yang gampang terlupakan.
 */
export async function checkAdminAccess(): Promise<AdminGate> {
  if (dataMode === 'seed') {
    return { allowed: true, reason: 'demo', userId: null };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { allowed: false, reason: 'unauthenticated' };

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>();

  if (profile?.role !== 'ADMIN') return { allowed: false, reason: 'not-admin' };

  return { allowed: true, reason: 'admin', userId: user.id };
}
