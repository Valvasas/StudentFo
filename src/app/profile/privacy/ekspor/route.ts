import { buildAccountExport } from '@/lib/account-export';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { jakartaDateKey } from '@/lib/deadline';
import { CONNECTION_PAGE } from '@/lib/network';

export const dynamic = 'force-dynamic';

/**
 * Unduh salinan data akun (ADR-060, UU PDP Pasal 7 & 13). Tautan biasa, bukan
 * tombol JavaScript: tetap jalan tanpa JS, dan isinya tidak ikut terkirim di
 * setiap pembukaan /profile/privacy. Tamu dialihkan ke halaman masuk.
 */
export async function GET(): Promise<Response> {
  const user = await requireUser('/profile/privacy');
  const repository = await getEventRepository();
  const [saved, tracker, registrations, teams, network, connections, blocked, seeker, submissions, organizer, notifications] = await Promise.all([
    repository.listSavedEvents(user.id),
    repository.listTrackerItems(user.id),
    repository.listMyRegistrations(user.id),
    repository.listTeamLinks([user.id], 200),
    repository.getNetworkProfile(user.id),
    repository.listConnections(user.id, { limit: CONNECTION_PAGE.maxLimit, cursor: null }),
    repository.listBlockedPeople(user.id),
    repository.getSeekerProfile(user.id),
    repository.listMySubmissions(user.id, 200),
    repository.getOrganizerProfile(user.id),
    repository.listNotifications(user.id, 200),
  ]);

  const body = buildAccountExport({
    user,
    saved,
    tracker,
    registrations,
    teams,
    network,
    connections: connections.items,
    connectionsTruncated: connections.nextCursor !== null,
    blocked,
    seeker,
    submissions,
    organizer,
    notifications,
  });

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="studentfo-data-saya-${jakartaDateKey(new Date())}.json"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
