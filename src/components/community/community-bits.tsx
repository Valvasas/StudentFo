import Link from 'next/link';
import { Flag, ThumbsUp, Trash2 } from 'lucide-react';
import { deleteCommunityPostAction, deleteCommunityReplyAction, reportCommunityContentAction, toggleCommunityHelpfulAction } from '@/app/komunitas/actions';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { TextArea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { COMMUNITY_TOPIC_LABEL, communityTimeLabel, type CommunityTopic } from '@/lib/community';
import { REPORT_REASON_TEXT, REPORT_REASONS_FOR } from '@/lib/moderation-labels';
import { cn } from '@/lib/utils';
import type { CommunityAuthor } from '@/types/domain';

/** Warna topik dari tint catatan tempel (ADR-054) — teks tetap tinta, kontrasnya dikunci check-contrast. */
const TOPIC_TINT: Record<CommunityTopic, string> = {
  tanya: 'bg-tint-sky',
  'cari-tim': 'bg-tint-mint',
  info: 'bg-tint-sun',
  cerita: 'bg-tint-lilac',
};

export function TopicChip({ topic, className }: { topic: CommunityTopic; className?: string }) {
  return (
    <span className={cn('inline-flex h-[24px] items-center rounded-[6px] px-2 text-[12px] font-semibold text-ink', TOPIC_TINT[topic], className)}>
      {COMMUNITY_TOPIC_LABEL[topic]}
    </span>
  );
}

/**
 * Penulis + waktu. Nama selalu tersingkat; tautan profil hanya bila pembaca
 * boleh membukanya (username terisi). Avatar & nama satu tautan setinggi 44 px.
 */
export function AuthorLine({ author, at, now, isOp = false, link = true }: { author: CommunityAuthor; at: string; now: Date; isOp?: boolean; link?: boolean }) {
  const face = (
    <>
      <Avatar name={author.name} seed={author.username ?? author.name} photo={author.avatarId} size="sm" />
      <span className="font-semibold text-ink">{author.name}</span>
    </>
  );
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
      {link && author.username ? (
        <Link href={`/u/${author.username}`} className="inline-flex min-h-11 items-center gap-2 hover:underline">
          {face}
        </Link>
      ) : (
        <span className="inline-flex items-center gap-2">{face}</span>
      )}
      {isOp && <span className="rounded-[6px] border border-line-strong px-1.5 text-[11.5px] font-semibold text-ink">Penulis</span>}
      <time dateTime={at}>{communityTimeLabel(at, now)}</time>
    </span>
  );
}

/** "Bermanfaat": tombol untuk tulisan orang lain, angka saja untuk tulisan sendiri. */
export function HelpfulControl({
  kind,
  id,
  postId,
  count,
  helped,
  mine,
}: {
  kind: 'post' | 'reply';
  id: string;
  postId: string;
  count: number;
  helped: boolean;
  mine: boolean;
}) {
  if (mine) {
    return (
      <span className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[13px] text-ink-muted">
        <ThumbsUp aria-hidden className="size-4" />
        {count} <span className="sr-only">orang menandai</span> bermanfaat
      </span>
    );
  }
  return (
    <form action={toggleCommunityHelpfulAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="postId" value={postId} />
      <SubmitButton
        aria-pressed={helped}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-3.5 text-[13px] font-medium transition-colors duration-150 ease-snap',
          helped ? 'border-brand bg-panel-nested text-ink' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink',
        )}
      >
        <ThumbsUp aria-hidden className={cn('size-4', helped && 'fill-current')} />
        Bermanfaat
        <span className="tabular-nums">{count}</span>
      </SubmitButton>
    </form>
  );
}

/** Lapor di balik <details> — tanpa JavaScript, tanpa halaman terpisah. */
export function ReportControl({ kind, id, postId }: { kind: 'post' | 'reply'; id: string; postId: string }) {
  const reasons = REPORT_REASONS_FOR.question;
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 text-[13px] text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <Flag aria-hidden className="size-3.5" />
        Laporkan
        <span className="sr-only">{kind === 'post' ? ' postingan ini' : ' balasan ini'}</span>
      </summary>
      <form action={reportCommunityContentAction} className="mt-2 flex max-w-md flex-col gap-3 rounded-card border border-line bg-panel-nested p-3.5">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="postId" value={postId} />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[13.5px] font-semibold">Alasan</legend>
          {reasons.map((reason, index) => (
            <label key={reason} className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-sm py-1.5 text-[13.5px]">
              <input type="radio" name="reason" value={reason} required={index === 0} className="check mt-0.5 shrink-0" />
              <span className="flex flex-col">
                <span className="font-medium">{REPORT_REASON_TEXT[reason].label}</span>
                <span className="text-[12.5px] text-ink-muted">{REPORT_REASON_TEXT[reason].hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-[13.5px]">
          <span className="font-medium">Keterangan (opsional)</span>
          <TextArea name="details" rows={2} maxLength={1000} />
        </label>
        <p className="text-[12.5px] text-ink-muted">Identitasmu tidak diberitahukan ke penulisnya.</p>
        <SubmitButton className={buttonVariants({ variant: 'danger', size: 'sm', className: 'self-start' })}>Kirim laporan</SubmitButton>
      </form>
    </details>
  );
}

export function DeleteControl({ kind, id, postId }: { kind: 'post' | 'reply'; id: string; postId: string }) {
  return (
    <form action={kind === 'post' ? deleteCommunityPostAction : deleteCommunityReplyAction}>
      <input type="hidden" name="postId" value={postId} />
      {kind === 'reply' && <input type="hidden" name="replyId" value={id} />}
      <ConfirmSubmit
        className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-[13px] text-ink-muted hover:text-danger"
        confirm={{
          title: kind === 'post' ? 'Hapus postingan ini?' : 'Hapus balasan ini?',
          description:
            kind === 'post'
              ? 'Postingan beserta semua balasan di dalamnya terhapus permanen dari StudentFo.'
              : 'Balasanmu terhapus permanen dari StudentFo.',
          confirmLabel: kind === 'post' ? 'Ya, hapus postingan' : 'Ya, hapus balasan',
          icon: <Trash2 />,
        }}
      >
        <Trash2 aria-hidden className="size-3.5" />
        Hapus
        <span className="sr-only">{kind === 'post' ? ' postingan ini' : ' balasan ini'}</span>
      </ConfirmSubmit>
    </form>
  );
}
