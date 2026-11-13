import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Send, ShieldCheck, X } from 'lucide-react';
import { createCommunityPostAction } from '@/app/komunitas/actions';
import { TopicChip } from '@/components/community/community-bits';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { buttonVariants } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { FieldMemory } from '@/components/ui/field-memory';
import { SubmitButton } from '@/components/ui/submit-button';
import { UnsavedChangesGuard } from '@/components/ui/unsaved-changes-guard';
import { parseActionErrorCode } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { COMMUNITY_LIMITS, COMMUNITY_TOPIC_HINT, COMMUNITY_TOPICS, toCommunityTopic } from '@/lib/community';
import { getEventRepository } from '@/lib/data';
import { firstParam, type RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tulis postingan · Komunitas',
  robots: { index: false, follow: false },
};

const REMEMBERED_FIELDS = ['title', 'body'] as const;
const REMEMBERED_CHOICES = ['topic'] as const;

/**
 * Tulis postingan Komunitas (ADR-087). Satu form Server Action — jalan tanpa
 * JavaScript; isian dipulihkan bila server menolak (`FieldMemory`). Dari
 * halaman kegiatan, `?kegiatan=` menautkan postingannya ke kegiatan itu.
 */
export default async function NewCommunityPostPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const slug = firstParam(params.kegiatan);
  const self = slug && /^[a-z0-9-]{1,255}$/.test(slug) ? `/komunitas/baru?kegiatan=${slug}` : '/komunitas/baru';
  await requireUser(self);
  const event = slug && /^[a-z0-9-]{1,255}$/.test(slug) ? await (await getEventRepository()).getEventBySlug(slug) : null;
  const defaultTopic = toCommunityTopic(firstParam(params.topik)) ?? (event?.eventType === 'LOMBA' ? 'cari-tim' : 'tanya');
  const restore = parseActionErrorCode(params.error) !== null;

  return (
    <div className="container-page max-w-2xl pb-20 pt-8 sm:pt-10">
      <Link href={event ? `/komunitas?kegiatan=${event.slug}` : '/komunitas'} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Komunitas
      </Link>
      <h1 className="mt-2 text-[clamp(28px,4vw,36px)] leading-[1.1]">Tulis postingan</h1>
      <p className="mt-2 text-[15px] text-ink-muted">Tulisanmu terlihat oleh semua anggota StudentFo dengan nama tersingkat.</p>

      <ActionFeedback params={params} className="mt-6" />

      <form action={createCommunityPostAction} className="mt-6 flex flex-col gap-6 rounded-[24px] border border-line bg-panel p-5 sm:p-7">
        <UnsavedChangesGuard />
        <FieldMemory storageKey="komunitas-baru" fields={REMEMBERED_FIELDS} choices={REMEMBERED_CHOICES} restore={restore} />
        {event && (
          <>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="kegiatan" value={event.slug} />
            <p className="flex flex-wrap items-center gap-2 rounded-card bg-panel-nested px-3.5 py-2 text-sm">
              <span className="text-ink-muted">Tentang</span>
              <span className="min-w-0 font-semibold">{event.title}</span>
              <Link href="/komunitas/baru" className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-ink-muted hover:text-ink">
                <X aria-hidden className="size-3.5" /> Lepas
              </Link>
            </p>
          </>
        )}

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[13.5px] font-semibold">Topik</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {COMMUNITY_TOPICS.map((topic) => (
              <label
                key={topic}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-card border border-line p-3 transition-colors duration-150 ease-snap hover:border-line-strong has-[:checked]:border-brand has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
              >
                <input type="radio" name="topic" value={topic} defaultChecked={topic === defaultTopic} required className="check mt-1 shrink-0" />
                <span className="flex flex-col gap-1">
                  <TopicChip topic={topic} className="self-start" />
                  <span className="text-[12.5px] leading-snug text-ink-muted">{COMMUNITY_TOPIC_HINT[topic]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field id="title" label="Judul" hint={`Satu kalimat yang langsung menjelaskan. ${COMMUNITY_LIMITS.titleMin}–${COMMUNITY_LIMITS.titleMax} karakter.`}>
          <TextInput id="title" name="title" required minLength={COMMUNITY_LIMITS.titleMin} maxLength={COMMUNITY_LIMITS.titleMax} autoComplete="off" />
        </Field>

        <Field id="body" label="Isi" hint={`Ceritakan konteksnya supaya orang bisa membantu. Maks. ${COMMUNITY_LIMITS.bodyMax.toLocaleString('id-ID')} karakter.`}>
          <TextArea id="body" name="body" rows={8} required minLength={COMMUNITY_LIMITS.bodyMin} maxLength={COMMUNITY_LIMITS.bodyMax} />
        </Field>

        <p className="flex items-start gap-2 rounded-card bg-panel-nested px-3.5 py-3 text-[13px] leading-relaxed text-ink-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Demi keamanan, nomor HP, email, dan tautan WhatsApp/Telegram/LINE tidak bisa ditulis — ajak orangnya terhubung lewat Koneksi atau gabung tim.
            Bersikap baik; moderator bisa menyembunyikan tulisan yang melanggar.
          </span>
        </p>

        <SubmitButton pendingLabel="Menerbitkan…" className={buttonVariants({ size: 'lg', className: 'self-start' })}>
          <Send aria-hidden className="size-4" />
          Terbitkan
        </SubmitButton>
      </form>
    </div>
  );
}
