import { loadMyRegistrationsStrict } from '@/components/home/account-role';
import type { AchievementFacts } from '@/lib/achievements';
import type { AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import type { OrganizerProfile } from '@/types/domain';

/** Batas aman: tingkat tertinggi Kontributor = 20 kiriman. */
const SUBMISSION_WINDOW = 200;

/**
 * Bahan lencana (ADR-068) dari repository yang sudah ada — tidak ada tabel
 * lencana. Setiap sumber dibaca dengan sesi pemilik (RLS), jadi hanya
 * catatannya sendiri, dan statusnya ditulis pihak lain (panitia, moderator).
 *
 * `null` = salah satu sumber gagal. Lencana yang dihitung dari data setengah
 * jadi akan terbaca "kamu belum punya apa-apa" — lebih menyesatkan daripada
 * kabar gagal dimuat.
 */
export async function loadBadgeFacts(user: AuthUser, organizer: OrganizerProfile | null): Promise<AchievementFacts | null> {
  return withFallback(
    'lencana',
    async () => {
      const repository = await getEventRepository();
      const isOrganizer = organizer !== null;
      const [registrations, submissions, managed, history] = await Promise.all([
        // Cache per request yang sama dengan menu akun: tidak ada query tambahan.
        loadMyRegistrationsStrict(user.id),
        repository.listMySubmissions(user.id, SUBMISSION_WINDOW),
        isOrganizer ? repository.listManagedEvents(user.id) : Promise.resolve([]),
        isOrganizer ? repository.listOrganizerHistory(user.id) : Promise.resolve([]),
      ]);
      return {
        registrations: registrations.map((registration) => ({
          eventId: registration.event.id,
          eventType: registration.event.eventType,
          eventStatus: registration.event.status,
          deadlineAt: registration.event.primaryDeadlineAt,
          status: registration.status,
          confirmedAt: registration.reviewedAt ?? registration.createdAt,
        })),
        managedEventIds: managed.map((entry) => entry.event.id),
        approvedSubmissions: submissions.filter((submission) => submission.status === 'APPROVED').length,
        organizerStatus: organizer?.status ?? null,
        organizerReviewedAt: organizer?.reviewedAt ?? null,
        hostedEventClosedAt: history.filter((entry) => entry.status === 'APPROVED' || entry.status === 'EXPIRED').map((entry) => entry.closedAt),
      } satisfies AchievementFacts;
    },
    null,
  );
}
