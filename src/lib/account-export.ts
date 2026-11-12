import type { AuthUser } from '@/lib/auth';
import type { MyEventQuestion } from '@/lib/data/repository';
import { profileMediaSrc } from '@/lib/profile-media';
import type {
  AppNotification,
  ProfileIdentity,
  StudyProfile,
  BlockedPerson,
  Connection,
  EventRegistration,
  EventSummary,
  LobbySummary,
  NetworkProfile,
  NotificationPreferences,
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
  /** null = gagal dimuat (mis. kunci server belum diisi) — ekspor tetap jalan dan mengatakannya terang. */
  readonly submissions: readonly Submission[] | null;
  readonly organizer: OrganizerProfile | null;
  readonly notifications: readonly AppNotification[];
  readonly notificationPreferences: NotificationPreferences;
  /** Waktu persetujuan pengingat email (ADR-062 #6), null = mati. */
  readonly deadlineEmailOptIn: string | null;
  readonly eventQuestions: readonly MyEventQuestion[];
  /** Lobi lomba (ADR-071): hanya yang kartunya pernah kamu pasang. */
  readonly lobbies: readonly LobbySummary[];
  /** Pilihan "tampilkan lencanaku" (ADR-072). */
  readonly showBadges: boolean;
  /** Tempat studi, domisili (sampai kecamatan — ini datamu sendiri) & bidang spesifik (ADR-075/076). */
  readonly studyProfile: StudyProfile;
  /** Username, bio, siapa yang boleh membuka profil (ADR-077). */
  readonly identity: ProfileIdentity;
}

/**
 * Salinan data akun untuk hak akses & portabilitas (UU PDP Pasal 7 dan 13):
 * JSON berkunci Inggris yang stabil, bisa dibaca mesin dan manusia.
 *
 * Yang SENGAJA tidak ikut: berkas gambar (bukti bayar diunduh dari halaman
 * pendaftarannya; foto profil & banner lewat tautan di `profileLook`), data
 * orang lain selain yang memang terlihat olehmu (nama
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
      // Draf pengajuan penyelenggara yang belum dikirim (ADR-069) — tinggal di metadata akun.
      organizerApplicationDraft: user.organizerDraft,
      deadlineReminders: input.notificationPreferences.deadlineReminders,
    },
    emailReminders: { deadlineReminders: input.deadlineEmailOptIn !== null, consentedAt: input.deadlineEmailOptIn },
    eventQuestions: input.eventQuestions.map((question) => ({
      event: question.eventTitle,
      url: question.eventSlug ? `/events/${question.eventSlug}?tab=tanya` : null,
      question: question.body,
      askedAt: question.createdAt,
      answer: question.answer,
      hiddenByModerator: question.hidden,
    })),
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
    submissions:
      input.submissions?.map((submission) => ({
        title: submission.payload?.title ?? null,
        status: submission.status,
        email: submission.submittedByEmail,
        createdAt: submission.createdAt,
      })) ?? { unavailable: 'Kiriman kegiatanmu tidak bisa dimuat saat ekspor ini dibuat. Coba unduh lagi nanti.' },
    organizer: input.organizer
      ? {
          organization: input.organizer.orgName,
          organizationType: input.organizer.orgType,
          role: input.organizer.contactRole,
          website: input.organizer.website,
          evidence: input.organizer.evidence,
          status: input.organizer.status,
        }
      : null,
    lobbies: input.lobbies.flatMap((lobby) =>
      lobby.membership
        ? [{ event: lobby.event.title, url: `/lobi/${lobby.event.slug}`, status: lobby.membership.intent, note: lobby.membership.note, joinedAt: lobby.membership.joinedAt }]
        : [],
    ),
    badges: { shownToOthers: input.showBadges },
    publicProfile: { username: input.identity.username, bio: input.identity.bio, visibleTo: input.identity.visibility },
    // Berkas gambarnya tidak ikut di JSON (sama seperti bukti bayar): tautannya bisa dibuka selama kamu masuk.
    profileLook: {
      photoUrl: user.profileMedia.avatarId ? profileMediaSrc(user.profileMedia.avatarId) : null,
      bannerUrl: user.profileMedia.bannerId ? profileMediaSrc(user.profileMedia.bannerId) : null,
      bannerPreset: user.profileMedia.bannerPreset,
    },
    studyPlace: {
      institutionId: input.studyProfile.institutionId,
      institutionName: input.studyProfile.institutionName,
      domicileCode: input.studyProfile.domicileCode,
      studyFields: input.studyProfile.studyFields,
    },
    notifications: input.notifications.map((notification) => ({
      type: notification.type,
      message: notification.message,
      read: notification.isRead,
      sentAt: notification.sentAt,
    })),
  };
}
