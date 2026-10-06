import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { jakartaDateKey } from '@/lib/deadline';
import { AppError } from '@/lib/errors';
import { registrationsToCsv } from '@/lib/registration';
import { loginHref } from '@/lib/safe-redirect';
import { siteUrl } from '@/lib/env';

const PRIVATE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } as const;

/**
 * Ekspor CSV pendaftar (ADR-055). Route Handler, bukan Server Action: unduhan
 * berkas butuh respons GET biasa. Otorisasinya sama dengan halaman studio —
 * repository melempar `not_event_manager` untuk selain pengelola
 * terverifikasi — dan responsnya tidak pernah boleh tersimpan di cache
 * bersama (data pribadi peserta).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL(loginHref(`/penyelenggara/acara/${encodeURIComponent(id)}/pendaftar`), siteUrl), 303);
  }

  const repository = await getEventRepository();
  const managed = (await repository.listManagedEvents(user.id)).find((entry) => entry.event.id === id);
  if (!managed) return new NextResponse('Acara ini tidak ada di dasbormu.', { status: 403, headers: PRIVATE });

  try {
    const [form, registrations] = await Promise.all([repository.getManagedRegistrationForm(user.id, id), repository.listRegistrations(user.id, id)]);
    if (!form) return new NextResponse('Acara ini belum memakai pendaftaran langsung.', { status: 404, headers: PRIVATE });

    const filename = `pendaftar-${managed.event.slug.slice(0, 60)}-${jakartaDateKey(new Date())}.csv`;
    return new NextResponse(registrationsToCsv(form, registrations), {
      headers: {
        ...PRIVATE,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.reason === 'not_event_manager') {
      return new NextResponse('Acara ini tidak ada di dasbormu.', { status: 403, headers: PRIVATE });
    }
    throw error;
  }
}
