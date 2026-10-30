import Link from 'next/link';
import { ArrowRight, Building2, CircleCheck, Flag, Inbox, type LucideIcon, PencilLine, Send, ShieldCheck } from 'lucide-react';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { PersonalHome } from '@/components/home/personal-home';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { checkAdminAccess, type AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import { firstNameOf, greetingFor, todayLabel } from '@/lib/greeting';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { MODERATION_STATUS_TEXT, MODERATION_STATUS_VARIANT, MODERATION_SUBJECT_TEXT } from '@/lib/moderation-labels';

/** Sama dengan batas antrean /admin; angka di atasnya ditulis "50+" — menghitung pasti butuh query lain. */
const QUEUE_LIMIT = 50;
const LOG_LIMIT = 5;

interface Queue {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly count: number;
}

/**
 * Beranda admin (ADR-056): tujuan utamanya mengosongkan antrean moderasi,
 * jadi isinya hanya berapa yang menunggu di tiap antrean + keputusan
 * terakhir. Keputusan sendiri tetap diambil di /admin.
 */
export async function AdminHome({ user, params }: { user: AuthUser; params: RawSearchParams }) {
  // Peran tampilan bukan hak akses: antrean hanya dibaca setelah gerbang yang sama dengan /admin.
  const gate = await checkAdminAccess();
  if (!gate.allowed) return <PersonalHome user={user} params={params} />;

  const repository = await getEventRepository();
  const [events, submissions, organizers, claims, revisions, log] = await Promise.all([
    repository.listByStatus('PENDING', QUEUE_LIMIT),
    repository.listSubmissions('PENDING', QUEUE_LIMIT),
    repository.listOrganizerApplications('PENDING', QUEUE_LIMIT),
    repository.listClaims('PENDING', QUEUE_LIMIT),
    repository.listRevisions('PENDING', QUEUE_LIMIT),
    repository.listModerationLog(LOG_LIMIT),
  ]);
  const queues: Queue[] = [
    { key: 'acara', label: 'Kegiatan hasil ekstraksi', href: '/admin#antrean-acara', icon: Inbox, count: events.length },
    { key: 'kiriman', label: 'Kiriman komunitas', href: '/admin#kiriman-komunitas', icon: Send, count: submissions.length },
    { key: 'penyelenggara', label: 'Pengajuan penyelenggara', href: '/admin/penyelenggara', icon: Building2, count: organizers.length },
    { key: 'klaim', label: 'Klaim acara', href: '/admin/penyelenggara?tab=klaim', icon: Flag, count: claims.length },
    { key: 'perubahan', label: 'Perubahan acara', href: '/admin/penyelenggara?tab=perubahan', icon: PencilLine, count: revisions.length },
  ];
  const total = queues.reduce((sum, queue) => sum + queue.count, 0);
  const capped = queues.some((queue) => queue.count >= QUEUE_LIMIT);
  const now = new Date();

  return (
    <div className="container-page pb-12 pt-8 sm:pt-12">
      <div className="mb-6 max-w-2xl empty:hidden">
        <AuthFeedback params={params} />
      </div>
      <header className="enter flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-sm text-ink-muted">{todayLabel(now)}</p>
          <h1 className="text-[clamp(30px,4.6vw,44px)] leading-[1.05]">
            {greetingFor(now)}, {firstNameOf(user.fullName)}.
          </h1>
          <p className="text-ink-soft">
            {total > 0 ? `${total}${capped ? '+' : ''} item menunggu keputusan` : 'Semua antrean kosong'}
          </p>
        </div>
        <Link href="/admin" className={buttonVariants({ className: 'self-start md:self-auto' })}>
          <ShieldCheck aria-hidden className="size-4" />
          Buka antrean moderasi
        </Link>
      </header>

      <section aria-labelledby="antrean" className="mt-8">
        <h2 id="antrean" className="sr-only">
          Antrean
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {queues.map((queue) => (
            <li key={queue.key} className="max-lg:last:col-span-2">
              <Link
                href={queue.href}
                className={cn(
                  'flex h-full min-h-[104px] flex-col justify-between gap-3 rounded-card border bg-panel p-4 transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested',
                  queue.count > 0 ? 'border-line-strong' : 'border-line',
                )}
              >
                <span className="flex items-start gap-2 text-sm font-medium">
                  <queue.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                  {queue.label}
                </span>
                {queue.count > 0 ? (
                  <span className="font-display text-[28px] font-bold leading-none tabular-nums">
                    {queue.count >= QUEUE_LIMIT ? `${QUEUE_LIMIT}+` : queue.count}
                    <span className="sr-only"> menunggu</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                    <CircleCheck aria-hidden className="size-4" />
                    Kosong
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="keputusan-terakhir" className="mt-8 rounded-panel border border-line bg-panel p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id="keputusan-terakhir" className="text-xl">
            Keputusan terakhir
          </h2>
          <Link href="/admin/riwayat" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink">
            Riwayat <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
        {log.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line border-t border-line">
            {log.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{entry.title}</span>
                  <span className="truncate text-[13px] text-ink-muted">
                    {MODERATION_SUBJECT_TEXT[entry.subjectType]} · {entry.actorName ?? 'Sistem'} · {formatDateTimeId(entry.createdAt)}
                  </span>
                </span>
                <Badge variant={MODERATION_STATUS_VARIANT[entry.toStatus]} className="shrink-0">
                  {MODERATION_STATUS_TEXT[entry.toStatus]}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Belum ada keputusan moderasi.</p>
        )}
      </section>
    </div>
  );
}
