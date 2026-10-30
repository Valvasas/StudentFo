import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Flag, ShieldAlert } from 'lucide-react';
import { reportContentAction } from '@/app/laporkan/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { buttonVariants } from '@/components/ui/button';
import { TextArea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { REPORT_REASON_TEXT, REPORT_REASONS_FOR } from '@/lib/moderation-labels';
import type { RawSearchParams } from '@/lib/search-params';
import { REPORT_DETAILS_MAX } from '@/lib/trust-safety';
import type { ReportSubject } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Laporkan',
  robots: { index: false, follow: false },
};

interface Subject {
  readonly type: ReportSubject;
  readonly id: string;
  readonly label: string;
  readonly back: string;
}

/**
 * Formulir laporan (ADR-061). Form biasa tanpa JavaScript. Subjek hanya yang
 * memang terlihat oleh pelapor — kegiatan tayang, atau profil yang boleh ia
 * buka — dan selain itu 404 yang sama, supaya halaman ini tidak bisa dipakai
 * menebak keberadaan akun.
 */
export default async function ReportPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const slug = typeof params.kegiatan === 'string' ? params.kegiatan.slice(0, 200) : null;
  const personId = typeof params.orang === 'string' ? params.orang.slice(0, 64) : null;
  const self = slug ? `/laporkan?kegiatan=${encodeURIComponent(slug)}` : personId ? `/laporkan?orang=${encodeURIComponent(personId)}` : '/laporkan';
  const user = await requireUser(self);
  const repository = await getEventRepository();

  let subject: Subject | null = null;
  if (slug) {
    const event = await repository.getEventBySlug(slug);
    if (event && (event.status === 'APPROVED' || event.status === 'EXPIRED')) {
      subject = { type: 'event', id: event.id, label: event.title, back: `/events/${event.slug}` };
    }
  } else if (personId && personId !== user.id) {
    const profile = await repository.getPublicProfile(user.id, personId);
    if (profile) subject = { type: 'user', id: profile.person.userId, label: profile.person.fullName, back: `/orang/${profile.person.userId}` };
  }
  if (!subject) notFound();

  return (
    <div className="container-page flex max-w-2xl flex-col gap-6 pb-16 pt-10">
      <header className="flex flex-col gap-2">
        <span className="flex items-center gap-2 font-mono text-xs tracking-[.08em] text-ink-muted">
          <Flag aria-hidden className="size-3.5" /> LAPORAN
        </span>
        <h1 className="text-[clamp(28px,4.5vw,40px)] leading-[1.05]">{subject.type === 'event' ? 'Laporkan kegiatan' : 'Laporkan pengguna'}</h1>
        <p className="break-words text-[15.5px] font-semibold text-ink-soft">{subject.label}</p>
      </header>

      <ActionFeedback params={params} />

      <form action={reportContentAction} className="flex flex-col gap-6">
        <input type="hidden" name="subjectType" value={subject.type} />
        <input type="hidden" name="subjectId" value={subject.id} />
        <input type="hidden" name="self" value={self} />
        <input type="hidden" name="back" value={subject.back} />

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-[15px] font-semibold">Apa masalahnya?</legend>
          {REPORT_REASONS_FOR[subject.type].map((reason) => (
            <label
              key={reason}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-card border border-line bg-panel px-4 py-3 transition-colors duration-150 hover:border-line-strong has-[:checked]:border-brand has-[:checked]:bg-panel-nested has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
            >
              <input type="radio" name="reason" value={reason} required className="check mt-0.5 shrink-0" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold">{REPORT_REASON_TEXT[reason].label}</span>
                <span className="text-[13px] leading-snug text-ink-muted">{REPORT_REASON_TEXT[reason].hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label htmlFor="details" className="flex flex-col gap-1.5">
          <span className="text-[15px] font-semibold">
            Keterangan <span className="font-normal text-ink-muted">(opsional)</span>
          </span>
          <span id="details-hint" className="text-[13px] text-ink-muted">
            Apa yang kamu lihat, kapan, dan di mana — mis. nomor rekening yang diminta. Jangan tulis kata sandi atau OTP.
          </span>
          <TextArea id="details" name="details" rows={4} maxLength={REPORT_DETAILS_MAX} aria-describedby="details-hint" />
        </label>

        <p className="flex gap-3 rounded-card border border-line bg-panel-nested px-4 py-3.5 text-[13.5px] leading-relaxed text-ink-soft">
          <ShieldAlert aria-hidden className="mt-0.5 size-[18px] shrink-0" />
          <span>
            Identitasmu tidak diberitahukan ke pihak yang dilaporkan. Moderator meninjau setiap laporan; kalau kamu sudah mentransfer uang
            ke penipu atau merasa terancam, laporkan juga ke bank dan pihak berwajib.
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ size: 'lg' })}>
            Kirim laporan
          </SubmitButton>
          <Link href={subject.back} className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
