import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, MessageSquare, PenLine, ShieldCheck, ThumbsUp, X } from 'lucide-react';
import { withNext } from '@/components/auth/auth-field';
import { AuthorLine, TopicChip } from '@/components/community/community-bits';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { buttonVariants } from '@/components/ui/button';
import { withQuery } from '@/lib/action-feedback';
import { getSessionUser } from '@/lib/auth';
import {
  COMMUNITY_TOPIC_HINT,
  COMMUNITY_TOPIC_LABEL,
  COMMUNITY_TOPICS,
  encodeCommunityCursor,
  parseCommunityCursor,
  toCommunityTopic,
  type CommunityTopic,
} from '@/lib/community';
import { getEventRepository } from '@/lib/data';
import { loginHref } from '@/lib/safe-redirect';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Komunitas',
  description: 'Tanya, cari tim, dan berbagi pengalaman lomba, beasiswa, dan magang dengan sesama pelajar di StudentFo.',
};

/**
 * Komunitas (ADR-087): lini masa "aktif terbaru". Saringan & halaman lewat
 * URL (`?topik=`, `?kegiatan=`, `?sebelum=`) — tautan biasa, jalan tanpa
 * JavaScript, tombol kembali bekerja. Isinya khusus anggota: tamu (dan
 * mesin pencari) hanya melihat penjelasan dan pintu masuk — tulisan pelajar
 * 13+ tidak diindeks.
 */
export default async function CommunityPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, user] = await Promise.all([searchParams, getSessionUser()]);
  if (!user) return <CommunityGuest />;

  const repository = await getEventRepository();
  const topic = toCommunityTopic(firstParam(params.topik));
  const eventSlug = firstParam(params.kegiatan);
  const event = eventSlug && /^[a-z0-9-]{1,255}$/.test(eventSlug) ? await repository.getEventBySlug(eventSlug) : null;
  const before = parseCommunityCursor(firstParam(params.sebelum));
  const page = await repository.listCommunityPosts(user.id, { topic, eventId: event?.id ?? null, before });
  const now = new Date();

  const base = { topik: topic ?? undefined, kegiatan: event?.slug };
  const href = (overrides: Record<string, string | undefined>) => withQuery('/komunitas', { ...base, ...overrides });
  const composeHref = withQuery('/komunitas/baru', { kegiatan: event?.slug });

  return (
    <div className="container-page max-w-4xl pb-20 pt-8 sm:pt-12">
      <header className="enter flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          <h1 className="text-[clamp(30px,4.6vw,42px)] leading-[1.05]">Komunitas</h1>
          <p className="text-[15.5px] leading-relaxed text-ink-muted">
            Tanya, cari tim, dan berbagi pengalaman dengan sesama pelajar. Terbuka untuk semua anggota — tidak ada pesan pribadi.
          </p>
        </div>
        <Link href={composeHref} className={buttonVariants({ size: 'lg', className: 'shrink-0 self-start sm:self-auto' })}>
          <PenLine aria-hidden className="size-4" />
          Tulis postingan
        </Link>
      </header>

      <ActionFeedback params={params} className="mt-6" />

      <nav aria-label="Topik" className="mt-8 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {[null, ...COMMUNITY_TOPICS].map((value) => {
          const active = value === topic;
          return (
            <Link
              key={value ?? 'semua'}
              href={href({ topik: value ?? undefined, sebelum: undefined })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 shrink-0 items-center rounded-pill border px-4 text-sm font-medium transition-colors duration-150 ease-snap',
                active ? 'border-brand bg-brand text-on-brand' : 'border-line bg-panel hover:border-line-strong hover:bg-panel-nested',
              )}
            >
              {value ? COMMUNITY_TOPIC_LABEL[value] : 'Semua'}
            </Link>
          );
        })}
      </nav>

      {event && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          Tentang <Link href={`/events/${event.slug}`} className="font-semibold text-ink underline underline-offset-[3px]">{event.title}</Link>
          <Link href={href({ kegiatan: undefined, sebelum: undefined })} className="inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-ink-muted hover:text-ink">
            <X aria-hidden className="size-3.5" /> Lihat semua kegiatan
          </Link>
        </p>
      )}

      {!page.available ? (
        <p role="status" className="mt-8 rounded-card bg-panel-nested px-5 py-6 text-[14.5px] text-ink-muted">
          Komunitas aktif setelah pembaruan server terpasang. Sementara itu, tanya jawab per kegiatan tetap bisa dipakai di halaman kegiatannya.
        </p>
      ) : page.items.length === 0 ? (
        <EmptyFeed topic={topic} composeHref={composeHref} filtered={Boolean(topic || event || before)} />
      ) : (
        <ol className="mt-6 flex flex-col gap-3">
          {page.items.map((post) => (
            <li key={post.id}>
              <article className="relative flex flex-col gap-2.5 rounded-card border border-line bg-panel p-4 transition-colors duration-150 ease-snap hover:border-line-strong sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <TopicChip topic={post.topic} />
                  {post.event && <span className="min-w-0 truncate text-[12.5px] text-ink-muted">· {post.event.title}</span>}
                </div>
                <h2 className="text-[17px] font-semibold leading-snug">
                  {/* Seluruh kartu bisa diklik; tautan judul yang memanjang menjaga satu target untuk pembaca layar. */}
                  <Link href={`/komunitas/${post.id}`} className="after:absolute after:inset-0 after:rounded-card after:content-[''] hover:underline">
                    {post.title}
                  </Link>
                </h2>
                <p className="line-clamp-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-soft [overflow-wrap:anywhere]">{post.excerpt}</p>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <AuthorLine author={post.author} at={post.lastActivityAt} now={now} link={false} />
                  <span className="flex items-center gap-3 text-[13px] text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare aria-hidden className="size-4" />
                      {post.replyCount}
                      <span className="sr-only"> balasan</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp aria-hidden className="size-4" />
                      {post.helpfulCount}
                      <span className="sr-only"> bermanfaat</span>
                    </span>
                  </span>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}

      {(before || page.nextCursor) && (
        <nav aria-label="Halaman lini masa" className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {before ? (
            <Link href={href({ sebelum: undefined })} className={buttonVariants({ variant: 'ghost' })}>
              <ArrowLeft aria-hidden className="size-4" /> Kembali ke terbaru
            </Link>
          ) : (
            <span />
          )}
          {page.nextCursor && (
            <Link href={href({ sebelum: encodeCommunityCursor(page.nextCursor) })} rel="next" className={buttonVariants({ variant: 'secondary' })}>
              Postingan sebelumnya <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </nav>
      )}

      <p className="mt-10 flex items-start gap-2 rounded-card bg-panel-nested px-4 py-3.5 text-[13px] leading-relaxed text-ink-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Semua tulisan terlihat oleh anggota StudentFo dengan nama tersingkat. Jangan menulis nomor HP, alamat, atau data pribadi. Lihat yang janggal?
          Tekan Laporkan — tulisan yang dilaporkan beberapa orang disembunyikan sampai moderator memeriksanya.
        </span>
      </p>
    </div>
  );
}

function EmptyFeed({ topic, composeHref, filtered }: { topic: CommunityTopic | null; composeHref: string; filtered: boolean }) {
  return (
    <div className="mt-6 flex flex-col items-start gap-3 rounded-card border border-dashed border-line-strong/70 px-5 py-8">
      <p className="text-[15px] font-semibold">{filtered ? 'Belum ada postingan di sini.' : 'Komunitas masih sepi.'}</p>
      <p className="max-w-[56ch] text-sm text-ink-muted">{topic ? COMMUNITY_TOPIC_HINT[topic] : 'Jadilah yang pertama bertanya atau berbagi — orang lain biasanya punya pertanyaan yang sama.'}</p>
      <Link href={composeHref} className={buttonVariants({ variant: 'secondary' })}>
        <PenLine aria-hidden className="size-4" /> Tulis postingan pertama
      </Link>
    </div>
  );
}

/** Tamu: penjelasan + pintu masuk; isi percakapan tidak pernah dirender (ADR-087). */
function CommunityGuest() {
  return (
    <div className="container-page max-w-3xl pb-20 pt-12">
      <div className="enter flex flex-col items-start gap-4">
        <h1 className="text-[clamp(32px,5vw,46px)] leading-[1.05]">Komunitas pelajar pemburu peluang</h1>
        <p className="max-w-[56ch] text-[16px] leading-relaxed text-ink-muted">
          Tanya syarat lomba, cari anggota tim lintas kampus, dan dengar langsung pengalaman yang sudah lolos. Khusus anggota StudentFo, dimoderasi, dan
          tanpa pesan pribadi dari orang asing.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={loginHref('/komunitas')} className={buttonVariants({ size: 'lg' })}>
            Masuk
          </Link>
          <Link href={withNext('/register', '/komunitas')} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            Daftar gratis
          </Link>
        </div>
      </div>
      <ul className="mt-12 grid gap-3 sm:grid-cols-2">
        {COMMUNITY_TOPICS.map((topic) => (
          <li key={topic} className="flex flex-col gap-2 rounded-card border border-line bg-panel p-4">
            <TopicChip topic={topic} className="self-start" />
            <p className="text-[14px] leading-relaxed text-ink-soft">{COMMUNITY_TOPIC_HINT[topic]}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
