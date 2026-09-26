import Link from 'next/link';
import { Bell, CalendarClock, CheckCheck, CheckCircle2, Megaphone, XCircle } from 'lucide-react';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/notifications/actions';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
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
  const [notifications, unreadCount] = await Promise.all([
    repository.listNotifications(user.id, PREVIEW_LIMIT),
    repository.countUnreadNotifications(user.id),
  ]);

  return (
    <details className="relative">
      <summary
        className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-card px-2 text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
        aria-label={
          unreadCount > 0
            ? `Notifikasi, ${unreadCount} belum dibaca`
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
        </span>
      </summary>

      <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-panel p-2 shadow-overlay">
        <div className="flex items-baseline justify-between gap-2 border-b border-line px-3 pb-2 pt-1">
          <p className="text-sm font-medium">Notifikasi</p>
          <p className="text-xs text-ink-muted">
            {unreadCount > 0 ? `${unreadCount} belum dibaca` : 'Semua sudah dibaca'}
          </p>
        </div>

        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-sm text-ink-muted">
            Belum ada pengingat. Simpan kegiatan yang kamu incar, dan kami ingatkan saat tenggatnya
            tinggal 3 hari dan 1 hari lagi.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col">
            {notifications.map((notification) => {
              const Icon = TYPE_ICON[notification.type];
              const target = notification.event ? `/events/${notification.event.slug}` : '/';

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
