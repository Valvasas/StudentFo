import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, MessageSquareReply, ShieldCheck } from 'lucide-react';
import { replyCommunityPostAction } from '@/app/komunitas/actions';
import { withNext } from '@/components/auth/auth-field';
import { AuthorLine, DeleteControl, HelpfulControl, ReportControl, TopicChip } from '@/components/community/community-bits';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { buttonVariants } from '@/components/ui/button';
import { Field, TextArea } from '@/components/ui/field';
import { FieldMemory } from '@/components/ui/field-memory';
import { SubmitButton } from '@/components/ui/submit-button';
import { parseActionErrorCode } from '@/lib/action-feedback';
import { getSessionUser } from '@/lib/auth';
import { COMMUNITY_LIMITS, isCommunityId } from '@/lib/community';
import { getEventRepository } from '@/lib/data';
import { loginHref } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

// Judul utas tidak dimasukkan ke metadata: tab & riwayat peramban tamu tidak boleh membocorkan isi khusus anggota.
export const metadata: Metadata = {
  title: 'Percakapan · Komunitas',
  robots: { index: false, follow: false },
};

const REMEMBERED_REPLY = ['body'] as const;

/**
 * Satu utas Komunitas (ADR-087): postingan, balasan urut lama → baru, dan
 * form balas. Tidak ada/tersembunyi/diblokir = 404 yang sama. Tamu yang
 * membuka tautan bersama diminta masuk, tanpa melihat isinya.
 */
export default async function CommunityThreadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, getSessionUser()]);
  if (!isCommunityId(id)) notFound();
  const self = `/komunitas/${id}`;
  if (!user) return <ThreadGuest returnTo={self} />;

  const thread = await (await getEventRepository()).getCommunityThread(user.id, id);
  if (!thread) notFound();
  const { post, replies } = thread;
  const now = new Date();
  const restore = parseActionErrorCode(query.error) !== null;

  return (
    <div className="container-page max-w-3xl pb-20 pt-8 sm:pt-10">
      <Link href="/komunitas" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Komunitas
      </Link>

      <ActionFeedback params={query} className="mt-4" />

      <article id="postingan" aria-labelledby="judul-postingan" className="mt-4 flex scroll-mt-24 flex-col gap-4 rounded-[24px] border border-line bg-panel p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <TopicChip topic={post.topic} />
          {post.event && (
            <Link href={`/events/${post.event.slug}`} className="inline-flex min-h-11 items-center gap-1.5 text-[13px] text-ink-soft underline-offset-[3px] hover:underline">
              <CalendarDays aria-hidden className="size-3.5" />
              {post.event.title}
            </Link>
          )}
        </div>
        <h1 id="judul-postingan" className="text-[clamp(24px,3.6vw,32px)] leading-[1.15] [overflow-wrap:anywhere]">
          {post.title}
        </h1>
        <AuthorLine author={post.author} at={post.createdAt} now={now} />
        <p className="whitespace-pre-line text-[15.5px] leading-[1.7] text-ink-soft [overflow-wrap:anywhere]">{post.body}</p>
        <div className="flex flex-wrap items-start gap-1 border-t border-line/70 pt-3">
          <HelpfulControl kind="post" id={post.id} postId={post.id} count={post.helpfulCount} helped={post.helped} mine={post.isMine} />
          {post.isMine ? <DeleteControl kind="post" id={post.id} postId={post.id} /> : <ReportControl kind="post" id={post.id} postId={post.id} />}
        </div>
      </article>

      <section id="balasan" aria-labelledby="judul-balasan" className="mt-8 scroll-mt-24">
        <h2 id="judul-balasan" className="text-xl">
          {replies.length > 0 ? `${replies.length} balasan` : 'Belum ada balasan'}
        </h2>
        {replies.length > 0 && (
          <ol className="mt-3 flex flex-col gap-3">
            {replies.map((reply) => (
              <li key={reply.id} id={`balasan-${reply.id}`} className="flex scroll-mt-24 flex-col gap-2.5 rounded-card border border-line bg-panel p-4 sm:p-5">
                <AuthorLine author={reply.author} at={reply.createdAt} now={now} isOp={reply.isOp} />
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-soft [overflow-wrap:anywhere]">{reply.body}</p>
                <div className="flex flex-wrap items-start gap-1">
                  <HelpfulControl kind="reply" id={reply.id} postId={post.id} count={reply.helpfulCount} helped={reply.helped} mine={reply.isMine} />
                  {reply.isMine ? <DeleteControl kind="reply" id={reply.id} postId={post.id} /> : <ReportControl kind="reply" id={reply.id} postId={post.id} />}
                </div>
              </li>
            ))}
          </ol>
        )}
        <span id="balasan-terbaru" className="block scroll-mt-24" />
        {replies.length >= COMMUNITY_LIMITS.repliesShown && (
          <p className="mt-3 text-[13px] text-ink-muted">Menampilkan {COMMUNITY_LIMITS.repliesShown} balasan pertama.</p>
        )}
      </section>

      <form id="balas" action={replyCommunityPostAction} className="mt-8 flex scroll-mt-24 flex-col gap-3 rounded-[20px] border border-line bg-panel p-5 sm:p-6">
        <FieldMemory storageKey={`komunitas-balas-${post.id}`} fields={REMEMBERED_REPLY} restore={restore} />
        <input type="hidden" name="postId" value={post.id} />
        <Field id="body" label="Tulis balasan" hint={`Maks. ${COMMUNITY_LIMITS.replyMax.toLocaleString('id-ID')} karakter. Tanpa nomor HP, email, atau tautan WhatsApp/Telegram.`}>
          <TextArea id="body" name="body" rows={4} required minLength={COMMUNITY_LIMITS.replyMin} maxLength={COMMUNITY_LIMITS.replyMax} />
        </Field>
        <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ className: 'self-start' })}>
          <MessageSquareReply aria-hidden className="size-4" />
          Kirim balasan
        </SubmitButton>
      </form>

      <p className="mt-6 flex items-start gap-2 text-[13px] leading-relaxed text-ink-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        Tulisan yang dilaporkan beberapa orang disembunyikan sampai moderator memeriksanya. Kamu bisa menghapus tulisanmu sendiri kapan saja.
      </p>
    </div>
  );
}

function ThreadGuest({ returnTo }: { returnTo: string }) {
  return (
    <div className="container-page max-w-2xl pb-20 pt-12">
      <div className="flex flex-col items-start gap-4 rounded-[24px] border border-line bg-panel p-6 sm:p-8">
        <h1 className="text-[clamp(26px,4vw,34px)] leading-[1.1]">Percakapan ini khusus anggota</h1>
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink-muted">
          Komunitas StudentFo hanya terbuka untuk anggota yang masuk — supaya pelajar bisa bertanya dan berbagi tanpa dibaca orang asing atau mesin pencari.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={loginHref(returnTo)} className={buttonVariants({ size: 'lg' })}>
            Masuk
          </Link>
          <Link href={withNext('/register', returnTo)} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            Daftar gratis
          </Link>
        </div>
      </div>
    </div>
  );
}
