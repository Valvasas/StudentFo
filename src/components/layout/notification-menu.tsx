import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  BadgeCheck,
  Bell,
  CalendarClock,
  CheckCheck,
  DoorOpen,
  CheckCircle2,
  Flag,
  Megaphone,
  MessageCircleQuestion,
  MessageCircleReply,
  MessagesSquare,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import {
  hideNextStepsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/notifications/actions';
import { workspacePath } from '@/components/organizer/event-workspace';
import { getSessionUser, isProfileComplete } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import { isNextStepsHidden, NEXT_STEPS_COOKIE, profileNudge } from '@/lib/next-steps';
import type { NotificationType } from '@/types/domain';

/**
 * Lonceng notifikasi di navbar.
 *
 * Memakai <details> seperti menu akun, dengan alasan yang sama: navbar ikut
 * di setiap halaman, jadi JavaScript di sini dibayar berkali-kali untuk
 * sesuatu yang cuma "buka daftar, klik satu baris".
 *
 * Menandai-dibaca digabung dengan navigasi: satu baris = satu <form> yang
 * menandai notifikasi lalu mengarahkan ke halaman event-nya. Memisahkan
 * keduanya memaksa pengguna menekan dua target berbeda untuk satu maksud,
 * dan menyisakan notifikasi "sudah dibuka tapi masih belum dibaca" yang
 * membuat angka di lonceng tidak lagi bisa dipercaya.
 */
const PREVIEW_LIMIT = 6;

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  DEADLINE_H3: CalendarClock,
  DEADLINE_H1: CalendarClock,
  SYSTEM: Megaphone,
  SUBMISSION_APPROVED: CheckCircle2,
  SUBMISSION_REJECTED: XCircle,
  CONNECTION_REQUEST: UserPlus,
  CONNECTION_ACCEPTED: Users,
  ORGANIZER_VERIFIED: BadgeCheck,
  ORGANIZER_REJECTED: XCircle,
  ORGANIZER_REVOKED: ShieldAlert,
  CLAIM_APPROVED: BadgeCheck,
  CLAIM_REJECTED: XCircle,
  REVISION_APPROVED: CheckCircle2,
  REVISION_REJECTED: XCircle,
  REGISTRATION_CONFIRMED: CheckCircle2,
  REGISTRATION_REJECTED: XCircle,
  PAYMENT_REJECTED: XCircle,
  PAYMENT_SUBMITTED: Receipt,
  REPORT_RESOLVED: ShieldCheck,
  REPORT_DISMISSED: Flag,
  QUESTION_ASKED: MessageCircleQuestion,
  QUESTION_ANSWERED: MessageCircleReply,
  LOBBY_INVITE: DoorOpen,
  COMMUNITY_REPLY: MessagesSquare,
};

const shortDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: 'numeric',
  month: 'short',
});

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : shortDate.format(date);
}

export async function NotificationMenu() {
  const user = await getSessionUser();
  // Tanpa sesi tidak ada apa pun untuk ditampilkan. Lonceng kosong yang
  // selalu tampil hanya mengajari pengguna bahwa lonceng itu tidak berguna.
  if (!user) return null;

  const repository = await getEventRepository();
  const [notifications, unreadCount, cookieStore] = await Promise.all([
    withFallback('daftar notifikasi', () => repository.listNotifications(user.id, PREVIEW_LIMIT), []),
    withFallback('hitungan notifikasi', () => repository.countUnreadNotifications(user.id), 0),
    cookies(),
  ]);
  // Satu saran langkah awal (ADR-086), dari data sesi saja — tanpa query
  // tambahan di setiap halaman. Tidak menambah angka "belum dibaca": saran
  // bukan kabar, dan lonceng yang angkanya tak pernah nol berhenti dipercaya.
  const nudge =
    user.role === 'USER' && !isNextStepsHidden(cookieStore.get(NEXT_STEPS_COOKIE)?.value)
      ? profileNudge({
          profileReady: isProfileComplete(user),
          hasPhoto: user.profileMedia.available ? user.profileMedia.avatarId !== null : null,
        })
      : null;

  return (
    <details className="relative">
      <summary
        className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-card px-2 text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
        aria-label={
          unreadCount > 0
            ? `Notifikasi, ${unreadCount} belum dibaca`
            : nudge
              ? 'Notifikasi, ada saran langkah berikutnya'
              : 'Notifikasi, tidak ada yang baru'
        }
      >
        <span className="relative inline-flex">
          <Bell aria-hidden className="size-5" />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-pill bg-brand px-1 text-[10px] font-semibold leading-4 text-on-brand"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          {unreadCount === 0 && nudge && (
            <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-pill bg-brand ring-2 ring-canvas" />
          )}
        </span>
      </summary>

      <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-panel p-2 shadow-overlay">
        <div className="flex items-baseline justify-between gap-2 border-b border-line px-3 pb-2 pt-1">
          <p className="text-sm font-medium">Notifikasi</p>
          <p className="text-xs text-ink-muted">
            {unreadCount > 0 ? `${unreadCount} belum dibaca` : 'Semua sudah dibaca'}
          </p>
        </div>

        {nudge && (
          <div className="mt-1 rounded-sm border border-line bg-tint-sun">
            <Link href={nudge.href} className="flex min-h-11 items-start gap-2.5 rounded-sm px-3 pb-1 pt-2.5 hover:underline">
              <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-ink-soft">Langkah berikutnya</span>
                <span className="block text-sm font-semibold text-ink">{nudge.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{nudge.body}</span>
              </span>
            </Link>
            <form action={hideNextStepsAction} className="flex justify-end px-1">
              <button type="submit" className="inline-flex min-h-11 items-center rounded-sm px-2.5 text-xs font-medium text-ink-soft hover:text-ink hover:underline">
                Jangan tampilkan lagi
              </button>
            </form>
          </div>
        )}

        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-sm text-ink-muted">
            Belum ada pengingat. Simpan kegiatan yang kamu incar, dan kami ingatkan saat tenggatnya
            tinggal 3 hari dan 1 hari lagi.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col">
            {notifications.map((notification) => {
              const Icon = TYPE_ICON[notification.type];
              const target = notification.communityPostId
                ? `/komunitas/${notification.communityPostId}`
                : /^(ORGANIZER|CLAIM|REVISION)_/.test(notification.type)
                ? '/penyelenggara'
                : notification.type === 'PAYMENT_SUBMITTED' && notification.event
                  ? `${workspacePath(notification.event.id, 'pendaftar')}?status=diperiksa`
                  : /^(REGISTRATION|PAYMENT)_/.test(notification.type)
                    ? '/pembayaran'
                    : notification.event
                  ? `/events/${notification.event.slug}`
                  : notification.type.startsWith('CONNECTION_')
                    ? '/connections'
                    : '/';

              return (
                <li key={notification.id}>
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <input type="hidden" name="returnTo" value={target} />
                    <button
                      type="submit"
                      className="flex w-full min-h-11 items-start gap-2.5 rounded-sm px-3 py-2 text-left transition-colors duration-150 ease-snap hover:bg-panel-nested"
                    >
                      <Icon
                        aria-hidden
                        className={
                          notification.isRead
                            ? 'mt-0.5 size-4 shrink-0 text-ink-faint'
                            : 'mt-0.5 size-4 shrink-0 text-due-warning'
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={
                            notification.isRead
                              ? 'block text-sm text-ink-muted'
                              : 'block text-sm font-medium text-ink'
                          }
                        >
                          {notification.message}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          {formatShortDate(notification.sentAt)}
                          {/* Status dibaca tidak boleh hanya dibedakan lewat
                              ketebalan huruf & warna — keduanya tidak sampai ke
                              pembaca layar. */}
                          <span className="sr-only">
                            {notification.isRead ? ' — sudah dibaca' : ' — belum dibaca'}
                          </span>
                        </span>
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-1 flex items-center justify-between gap-2 border-t border-line pt-1">
          <Link
            href="/tracker"
            className="inline-flex min-h-11 items-center rounded-sm px-3 text-sm text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
          >
            Buka tracker
          </Link>

          {unreadCount > 0 && (
            <form action={markAllNotificationsReadAction}>
              <input type="hidden" name="returnTo" value="/" />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-brand-text transition-colors duration-150 ease-snap hover:bg-panel-nested"
              >
                <CheckCheck aria-hidden className="size-4" />
                Tandai semua
              </button>
            </form>
          )}
        </div>
      </div>
    </details>
  );
}
