import type { AuthUser } from '@/lib/auth';
import type {
  AppNotification,
  BlockedPerson,
  Connection,
  EventRegistration,
  EventSummary,
  NetworkProfile,
  OrganizerProfile,
  Submission,
  TeamLink,
  TeamSeekerProfile,
  TrackerItem,
} from '@/types/domain';

export interface AccountExportInput {
  readonly user: AuthUser;
  readonly saved: readonly EventSummary[];
  readonly tracker: readonly TrackerItem[];
  readonly registrations: readonly EventRegistration[];
  readonly teams: readonly TeamLink[];
  readonly network: NetworkProfile;
  readonly connections: readonly Connection[];
  readonly connectionsTruncated: boolean;
  readonly blocked: readonly BlockedPerson[];
  readonly seeker: TeamSeekerProfile | null;
  readonly submissions: readonly Submission[];
  readonly organizer: OrganizerProfile | null;
  readonly notifications: readonly AppNotification[];
  /** Waktu persetujuan pengingat email (ADR-062 #6), null = mati. */
  readonly deadlineEmailOptIn: string | null;
}

/**
 * Salinan data akun untuk hak akses & portabilitas (UU PDP Pasal 7 dan 13):
 * JSON berkunci Inggris yang stabil, bisa dibaca mesin dan manusia.
 *
 * Yang SENGAJA tidak ikut: berkas bukti bayar (gambar — diunduh dari halaman
 * pendaftarannya), data orang lain selain yang memang terlihat olehmu (nama
 * dan headline koneksi), dan kolom internal moderasi (`reviewed_by`).
 */
export function buildAccountExport(input: AccountExportInput, now: Date = new Date()) {
  const { user } = input;
  return {
    exportedAt: now.toISOString(),
    format: 'studentfo-account-export/1',
    account: {
      fullName: user.fullName,
      email: user.email,
      educationLevel: user.educationLevel,
      major: user.major,
      interests: user.interests,
      signInMethods: user.providers,
    },
    emailReminders: { deadlineReminders: input.deadlineEmailOptIn !== null, consentedAt: input.deadlineEmailOptIn },
    savedEvents: input.saved.map((event) => ({ title: event.title, url: `/events/${event.slug}` })),
    applicationBoard: input.tracker.map((item) => ({
      event: item.event.title,
      url: `/events/${item.event.slug}`,
      status: item.status,
      notes: item.notes,
      achievement: item.achievement,
      achievementNote: item.achievementNote,
      proofUrl: item.proofUrl,
      portfolioVisible: item.portfolioVisible,
      updatedAt: item.updatedAt,
    })),
    registrations: input.registrations.map((registration) => ({
      code: registration.code,
      event: registration.event.title,
      fullName: registration.fullName,
      email: registration.email,
      answers: registration.answers,
      status: registration.status,
      feeAmount: registration.feeAmount,
      paymentProofUploadedAt: registration.proofUploadedAt,
      organizerNote: registration.reviewNote,
      createdAt: registration.createdAt,
    })),
    teams: input.teams.map((link) => ({ teamId: link.teamId, event: link.event.title })),
    network: {
      discoverable: input.network.discoverable,
      headline: input.network.headline,
      connections: input.connections.map((connection) => ({
        name: connection.person.fullName,
        status: connection.status,
        direction: connection.direction,
        message: connection.message,
        createdAt: connection.createdAt,
      })),
      connectionsTruncated: input.connectionsTruncated,
      blocked: input.blocked.map((person) => ({ name: person.fullName, since: person.blockedAt })),
    },
    playerCard: input.seeker,
    submissions: input.submissions.map((submission) => ({
      title: submission.payload?.title ?? null,
      status: submission.status,
      email: submission.submittedByEmail,
      createdAt: submission.createdAt,
    })),
    organizer: input.organizer
      ? { organization: input.organizer.orgName, website: input.organizer.website, evidence: input.organizer.evidence, status: input.organizer.status }
      : null,
    notifications: input.notifications.map((notification) => ({
      type: notification.type,
      message: notification.message,
      read: notification.isRead,
      sentAt: notification.sentAt,
    })),
  };
}
