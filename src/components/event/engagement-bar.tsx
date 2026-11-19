import Link from 'next/link';
import { Heart, MessageCircle } from 'lucide-react';
import { toggleEventLikeAction } from '@/app/events/[slug]/actions';
import { LikeSubmit } from '@/components/event/like-submit';
import { ShareMenu } from '@/components/event/share-menu';
import { loginHref } from '@/lib/safe-redirect';
import { cn } from '@/lib/utils';
import type { EventEngagement } from '@/types/domain';

const pill =
  'inline-flex h-11 items-center gap-1.5 rounded-pill border border-line px-3 text-sm font-medium text-ink-soft transition-colors duration-150 ease-snap hover:border-line-strong hover:text-ink sm:gap-2 sm:px-4';

/**
 * Baris interaksi postingan (ADR-092): Suka · Komentar · Bagikan — pola yang
 * sudah dikenal pelajar dari media sosial, di bawah judul supaya terlihat
 * tanpa menggulir. Tamu melihat angkanya (bukti sosial) dan diarahkan masuk
 * untuk ikut menyukai/berkomentar. `id="interaksi"` = jangkar kembali setelah
 * menyukai, supaya halaman tidak melompat ke atas.
 */
export function EngagementBar({
  event,
  engagement,
  signedIn,
  tab,
  className,
}: {
  event: { readonly id: string; readonly slug: string; readonly title: string };
  engagement: EventEngagement;
  signedIn: boolean;
  /** Tab yang sedang dibuka — dibawa kembali setelah menyukai. */
  tab: string;
  className?: string;
}) {
  const path = `/events/${event.slug}`;
  const here = tab === 'ringkasan' ? path : `${path}?tab=${tab}`;
  const comments = engagement.comments.toLocaleString('id-ID');
  return (
    <div id="interaksi" className={cn('flex scroll-mt-28 flex-wrap items-center gap-2', className)}>
      {engagement.available &&
        (signedIn ? (
          <form action={toggleEventLikeAction}>
            <input type="hidden" name="slug" value={event.slug} />
            <input type="hidden" name="eventId" value={event.id} />
            {tab === 'komentar' && <input type="hidden" name="tab" value="komentar" />}
            <LikeSubmit liked={engagement.liked} likes={engagement.likes} />
          </form>
        ) : (
          <Link
            href={loginHref(here)}
            className={pill}
            aria-label={
              engagement.likes > 0 ? `Masuk untuk menyukai — ${engagement.likes.toLocaleString('id-ID')} orang menyukai` : 'Masuk untuk menyukai'
            }
          >
            <Heart aria-hidden className="size-4" />
            <span aria-hidden>Suka</span>
            {/* Nol disembunyikan: "Suka 0" di samping "Disimpan 619 orang" = bukti sosial negatif. */}
            {engagement.likes > 0 && (
              <span aria-hidden className="tabular-nums">
                {engagement.likes.toLocaleString('id-ID')}
              </span>
            )}
          </Link>
        ))}
      {engagement.available && (
        <Link
          href={`${path}?tab=komentar#komentar`}
          scroll={false}
          className={pill}
          aria-label={engagement.comments > 0 ? `Komentar, ${comments}` : 'Komentar, belum ada'}
          aria-current={tab === 'komentar' ? 'location' : undefined}
        >
          <MessageCircle aria-hidden className="size-4" />
          <span aria-hidden>Komentar</span>
          {engagement.comments > 0 && (
            <span aria-hidden className="tabular-nums">
              {comments}
            </span>
          )}
        </Link>
      )}
      <ShareMenu title={event.title} path={path} connectHref={signedIn ? `${path}/bagikan` : null} />
    </div>
  );
}
