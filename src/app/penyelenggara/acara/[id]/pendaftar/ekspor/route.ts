import { loadManagedEvent } from '@/components/organizer/event-workspace';
import { getSessionUser, toEventActor } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { jakartaDateKey } from '@/lib/deadline';
import { registrationsToCsv } from '@/lib/registration-form';

export const dynamic = 'force-dynamic';

const NOT_FOUND = () => new Response('Tidak ditemukan', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });

/**
 * Ekspor CSV pendaftar (ADR-056). Tamu dan bukan-pengelola mendapat 404 yang
 * sama dengan acara yang tidak ada — tidak membocorkan id acara mana yang
 * punya pendaftar. Sel dinetralkan dari rumus spreadsheet oleh `csvCell()`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NOT_FOUND();
  const context = await loadManagedEvent(user, id);
  if (!context) return NOT_FOUND();

  const repository = await getEventRepository();
  const [form, registrations] = await Promise.all([
    repository.getRegistrationForm(context.event.id),
    repository.listEventRegistrations(toEventActor(user), context.event.id),
  ]);
  const csv = registrationsToCsv(form?.fields ?? [], registrations);
  // Nama berkas ASCII murni: header `Content-Disposition` dengan karakter
  // di luar ASCII dibaca berbeda-beda oleh tiap peramban.
  const slug = context.event.slug.replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'acara';

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pendaftar-${slug}-${jakartaDateKey(new Date())}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
