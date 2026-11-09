import type { ReactNode } from 'react';
import { AdminSetupNotice } from '@/components/admin/admin-setup-notice';
import { checkAdminAccess } from '@/lib/auth';
import { adminDataAvailable } from '@/lib/env';

/**
 * Satu penjaga untuk semua halaman /admin: admin yang sudah lolos gerbang
 * tetapi servernya belum punya kunci service_role melihat petunjuk, bukan
 * halaman galat. Non-admin & admin yang belum MFA diteruskan ke halamannya
 * sendiri (404 / langkah MFA) — layout ini tidak membuka informasi apa pun ke mereka.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!adminDataAvailable) {
    const gate = await checkAdminAccess();
    if (gate.allowed) return <AdminSetupNotice />;
  }
  return children;
}
