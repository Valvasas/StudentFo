import { NextResponse } from 'next/server';
import { getEventRepository } from '@/lib/data';
import { dataMode } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Untuk monitor uptime & pemeriksaan kesiapan platform hosting:
 * 200 = aplikasi hidup DAN database terjangkau, 503 = database tidak.
 *
 * `dataMode` ikut dilaporkan karena salah konfigurasi paling mahal justru
 * yang "sehat": deploy produksi yang kehilangan env Supabase dan menyala
 * dengan ALLOW_DEMO_IN_PRODUCTION melayani data fiktif dengan status 200.
 * Monitor bisa menegaskan `dataMode === "supabase"`.
 * Penyebab kegagalan hanya ditulis ke log server, tidak ke respons publik.
 */
export async function GET(): Promise<NextResponse> {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await (await getEventRepository()).checkHealth();
    return NextResponse.json({ status: 'ok', dataMode }, { headers });
  } catch (error) {
    console.error('[health]', error);
    return NextResponse.json({ status: 'unavailable', dataMode }, { status: 503, headers });
  }
}
