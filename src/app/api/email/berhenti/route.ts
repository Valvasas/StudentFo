import { NextResponse, type NextRequest } from 'next/server';
import { getEventRepository } from '@/lib/data';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Berhenti satu klik (RFC 8058): tombol "Berhenti langganan" bawaan aplikasi
 * email mengirim POST `List-Unsubscribe=One-Click` ke URL di header email.
 * Tanpa sesi & tanpa CSRF — kuncinya token bertanda tangan per pengguna.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = verifyUnsubscribeToken(request.nextUrl.searchParams.get('token'), env.EMAIL_LINK_SECRET);
  if (!userId) return NextResponse.json({ error: 'Tautan tidak valid.' }, { status: 400, headers: NO_STORE });
  try {
    await (await getEventRepository()).stopDeadlineEmailsByLink(userId);
  } catch (error) {
    console.error('[email] gagal berhenti lewat tautan:', error);
    return NextResponse.json({ error: 'Coba lagi sebentar lagi.' }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** GET tidak mengubah apa pun: pemindai tautan email membuka setiap URL. */
export function GET(request: NextRequest): NextResponse {
  const target = new URL('/berhenti-email', request.nextUrl);
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target, 303);
}
