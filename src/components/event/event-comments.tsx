import Link from 'next/link';
import { EyeOff, Flag, MessageCircle, Reply, Trash2 } from 'lucide-react';
import {
  createEventCommentAction,
  deleteEventCommentAction,
  hideEventCommentAction,
  reportEventCommentAction,
} from '@/app/events/[slug]/actions';
import { AuthorLine } from '@/components/community/community-bits';
import { buttonVariants } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { Field, TextArea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { COMMENT_ROLE_LABEL, EVENT_COMMENT_LIMITS } from '@/lib/event-comments';
import { REPORT_REASON_TEXT, REPORT_REASONS_FOR } from '@/lib/moderation-labels';
import { loginHref } from '@/lib/safe-redirect';
import type { EventComment, EventCommentPage } from '@/types/domain';

const quietAction =
  'inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 text-[13px] text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden';

interface EventRef {
  readonly id: string;
  readonly slug: string;
}

function Hidden({ event }: { event: EventRef }) {
  return (
    <>
      <input type="hidden" name="slug" value={event.slug} />
      <input type="hidden" name="eventId" value={event.id} />
    </>
  );
}

function CommentBody({ comment }: { comment: EventComment }) {
  return <p className="min-w-0 whitespace-pre-line text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">{comment.body}</p>;
}

function ReportForm({ event, comment }: { event: EventRef; comment: EventComment }) {
  return (
    <details className="group">
      <summary className={quietAction}>
        <Flag aria-hidden className="size-3.5" />
        Laporkan<span className="sr-only"> komentar {comment.author.name}</span>
      </summary>
      <form action={reportEventCommentAction} className="mt-2 flex max-w-md flex-col gap-3 rounded-card border border-line bg-panel-nested p-3.5">
        <Hidden event={event} />
        <input type="hidden" name="commentId" value={comment.id} />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[13.5px] font-semibold">Alasan</legend>
          {REPORT_REASONS_FOR.question.map((reason, index) => (
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
        <p className="text-[12.5px] text-ink-muted">Identitasmu tidak diberitahukan ke penulisnya. Tiga laporan dari orang berbeda menyembunyikan komentar sampai moderator memutuskan.</p>
        <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ variant: 'danger', size: 'sm', className: 'self-start' })}>
          Kirim laporan
        </SubmitButton>
      </form>
    </details>
  );
}

function CommentActions({
  event,
  comment,
  signedIn,
  canModerate,
}: {
  event: EventRef;
  comment: EventComment;
  signedIn: boolean;
  canModerate: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1">
      {comment.isMine ? (
        <form action={deleteEventCommentAction}>
          <Hidden event={event} />
          <input type="hidden" name="commentId" value={comment.id} />
          <ConfirmSubmit
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-[13px] text-ink-muted hover:text-danger"
            confirm={{
              title: comment.parentId ? 'Hapus balasan ini?' : 'Hapus komentar ini?',
              description: comment.parentId
                ? 'Balasanmu terhapus permanen dari halaman kegiatan.'
                : 'Komentarmu beserta semua balasannya terhapus permanen dari halaman kegiatan.',
              confirmLabel: 'Ya, hapus',
              icon: <Trash2 />,
            }}
          >
            <Trash2 aria-hidden className="size-3.5" />
            Hapus<span className="sr-only"> komentarmu</span>
          </ConfirmSubmit>
        </form>
      ) : (
        signedIn && <ReportForm event={event} comment={comment} />
      )}
      {canModerate && !comment.isMine && (
        <form action={hideEventCommentAction}>
          <Hidden event={event} />
          <input type="hidden" name="commentId" value={comment.id} />
          <input type="hidden" name="reason" value="Disembunyikan moderator dari halaman kegiatan" />
          <ConfirmSubmit
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-[13px] text-ink-muted hover:text-danger"
            confirm={{
              title: 'Sembunyikan komentar ini?',
              description: 'Komentar (dan balasannya) hilang dari halaman kegiatan untuk semua orang. Tindakan ini final dan tercatat di Riwayat moderasi atas namamu.',
              confirmLabel: 'Ya, sembunyikan',
              icon: <EyeOff />,
            }}
          >
            <EyeOff aria-hidden className="size-3.5" />
            Sembunyikan<span className="sr-only"> komentar {comment.author.name}</span>
          </ConfirmSubmit>
        </form>
      )}
    </div>
  );
}

function CommentComposer({ event, parentId = null, label, id }: { event: EventRef; parentId?: string | null; label: string; id: string }) {
  return (
    <form action={createEventCommentAction} className="flex flex-col gap-3">
      <Hidden event={event} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <Field
        id={id}
        label={label}
        hint={`${EVENT_COMMENT_LIMITS.bodyMin}–${EVENT_COMMENT_LIMITS.bodyMax.toLocaleString('id-ID')} karakter. Semua anggota bisa membacanya — jangan tulis nomor HP, email, atau tautan grup chat.`}
      >
        <TextArea id={id} name="body" rows={parentId ? 2 : 3} required minLength={EVENT_COMMENT_LIMITS.bodyMin} maxLength={EVENT_COMMENT_LIMITS.bodyMax} />
      </Field>
      <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ size: parentId ? 'sm' : 'md', className: 'self-start' })}>
        {parentId ? <Reply aria-hidden /> : <MessageCircle aria-hidden />}
        {parentId ? 'Kirim balasan' : 'Kirim komentar'}
      </SubmitButton>
    </form>
  );
}

/**
 * Tab Komentar (ADR-092): obrolan antar-calon peserta di halaman kegiatan.
 * Beda peran dengan Tanya jawab (ADR-062 #7) yang dijawab resmi panitia —
 * dua-duanya ditautkan supaya orang tahu ke mana bertanya. Rel pengamannya =
 * Komunitas (ADR-087): khusus anggota, nama disingkat, kontak pribadi ditolak,
 * laporan + sembunyi otomatis. Form biasa, jalan tanpa JavaScript.
 */
export function EventComments({
  event,
  page,
  signedIn,
  acceptsComments,
  canModerate,
  now,
}: {
  event: EventRef;
  page: EventCommentPage;
  signedIn: boolean;
  acceptsComments: boolean;
  canModerate: boolean;
  now: Date;
}) {
  const tabPath = `/events/${event.slug}?tab=komentar`;
  return (
    <div id="komentar" className="flex scroll-mt-28 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-bold tracking-[-0.025em]">
          Komentar{page.total > 0 && <span className="ml-2 align-middle text-[15px] font-semibold text-ink-muted tabular-nums">{page.total.toLocaleString('id-ID')}</span>}
        </h2>
        <p className="text-[14.5px] text-ink-muted">
          Ngobrol dengan calon peserta lain — nama tampil disingkat. Pertanyaan untuk panitia?{' '}
          <Link href={`/events/${event.slug}?tab=tanya`} className="font-medium text-ink underline underline-offset-[3px]">
            Pakai Tanya jawab
          </Link>{' '}
          supaya dijawab resmi.
        </p>
      </div>

      {!page.available ? (
        <p className="rounded-card bg-panel-nested px-4 py-3 text-[14px] text-ink-muted">Komentar aktif setelah pembaruan server terpasang.</p>
      ) : !acceptsComments ? (
        <p className="text-[14.5px] text-ink-muted">Kegiatan ini sudah ditutup, jadi tidak menerima komentar baru.</p>
      ) : signedIn ? (
        <div className="rounded-[14px] border border-line p-4">
          <CommentComposer event={event} id="komentar-baru" label="Tulis komentar" />
        </div>
      ) : (
        <Link href={loginHref(tabPath)} className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
          Masuk untuk berkomentar
        </Link>
      )}

      {page.threads.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line px-4 py-6 text-center text-[14px] text-ink-muted">
          Belum ada komentar. Jadi yang pertama — misalnya cari teman satu tim atau berbagi pengalaman tahun lalu.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {page.threads.map((thread) => {
            const badge = thread.role ? COMMENT_ROLE_LABEL[thread.role] : null;
            return (
              <li key={thread.id} id={`k-${thread.id}`} className="flex scroll-mt-28 flex-col gap-2 rounded-[14px] border border-line p-4">
                <AuthorLine author={thread.author} at={thread.createdAt} now={now} badge={badge} />
                <CommentBody comment={thread} />
                <div className="flex flex-wrap items-center gap-x-1">
                  {acceptsComments && signedIn && page.available && (
                    <details className="group w-full sm:w-auto">
                      <summary className={quietAction}>
                        <Reply aria-hidden className="size-3.5" />
                        Balas<span className="sr-only"> komentar {thread.author.name}</span>
                      </summary>
                      <div className="mt-2 w-full sm:min-w-[22rem]">
                        <CommentComposer event={event} parentId={thread.id} id={`balas-${thread.id}`} label={`Balas ${thread.author.name}`} />
                      </div>
                    </details>
                  )}
                  <CommentActions event={event} comment={thread} signedIn={signedIn} canModerate={canModerate} />
                </div>
                {thread.replies.length > 0 && (
                  <ol aria-label={`Balasan untuk ${thread.author.name}`} className="mt-1 flex flex-col gap-3 border-l-2 border-line pl-3 sm:pl-4">
                    {thread.replies.map((reply) => (
                      <li key={reply.id} id={`k-${reply.id}`} className="flex scroll-mt-28 flex-col gap-1.5">
                        <AuthorLine author={reply.author} at={reply.createdAt} now={now} badge={reply.role ? COMMENT_ROLE_LABEL[reply.role] : null} />
                        <CommentBody comment={reply} />
                        <CommentActions event={event} comment={reply} signedIn={signedIn} canModerate={canModerate} />
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {page.truncated && (
        <p className="text-[13px] text-ink-muted">Menampilkan {EVENT_COMMENT_LIMITS.threadsShown} komentar terbaru beserta balasannya.</p>
      )}
    </div>
  );
}
