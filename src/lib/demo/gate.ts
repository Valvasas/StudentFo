import 'server-only';
import { headers } from 'next/headers';
import { dataMode, env } from '@/lib/env';
import { isDemoAdminAllowed, isDemoHostAllowed, parseHostList } from './access';

const isProduction = env.NODE_ENV === 'production';

/**
 * Apakah request ini boleh memakai akun demo: mode seed DAN host yang sah.
 * Dipanggil di halaman /demo dan di Server Action masuk-demo (Server Action
 * adalah endpoint HTTP sendiri, jadi menyembunyikan tombolnya tidak cukup).
 */
export async function isDemoAvailable(): Promise<boolean> {
  if (dataMode !== 'seed') return false;
  return isDemoHostAllowed({
    isProduction,
    allowedHosts: parseHostList(env.DEMO_ALLOWED_HOSTS),
    host: (await headers()).get('host'),
  });
}

export function isDemoAdminPersonaAllowed(presentedKey: string | undefined): boolean {
  return isDemoAdminAllowed({ isProduction, configuredKey: env.DEMO_ADMIN_KEY, presentedKey });
}
