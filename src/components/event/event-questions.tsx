import Link from 'next/link';
import { Flag, MessageCircleQuestion, Trash2 } from 'lucide-react';
import { answerQuestionAction, askQuestionAction, deleteQuestionAction } from '@/app/events/[slug]/actions';
import { buttonVariants } from '@/components/ui/button';
import { Field, TextArea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatDateId } from '@/lib/deadline';
import { loginHref } from '@/lib/safe-redirect';
import { ANSWER_MAX, QUESTION_BODY_MAX, QUESTION_BODY_MIN } from '@/lib/trust-safety';
import type { EventQuestion } from '@/types/domain';

const quietLink =
  'inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-ink-muted underline-offset-[3px] hover:text-ink hover:underline';

/**
 * Tab "Tanya jawab" (ADR-062 #7): pengganti aman "ruang diskusi" — publik,
 * satu topik, dijawab penyelenggara terverifikasi/moderator. Form biasa,
 * jalan tanpa JavaScript.
 */
export function EventQuestions({
  event,
  questions,
  signedIn,
  canAnswer,
  acceptsQuestions,
}: {
  event: { readonly id: string; readonly slug: string };
  questions: readonly EventQuestion[];
  signedIn: boolean;
  canAnswer: boolean;
  acceptsQuestions: boolean;
}) {
  const slugField = <input type="hidden" name="slug" value={event.slug} />;

  return (
    <div id="tanya" className="flex scroll-mt-28 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-bold tracking-[-0.025em]">Tanya jawab</h2>
        <p className="text-[14.5px] text-ink-muted">
          Pertanyaan tampil publik dengan nama depanmu. Yang menjawab hanya penyelenggara terverifikasi atau moderator StudentFo.
        </p>
      </div>

      {!acceptsQuestions ? (
        <p className="text-[14.5px] text-ink-muted">Kegiatan ini sudah ditutup, jadi tidak menerima pertanyaan baru.</p>
      ) : signedIn ? (
        <form action={askQuestionAction} className="flex flex-col gap-3 rounded-[14px] border border-line p-4">
          {slugField}
          <input type="hidden" name="eventId" value={event.id} />
          <Field
            id="question-body"
            label="Pertanyaanmu"
            hint={`${QUESTION_BODY_MIN}–${QUESTION_BODY_MAX} karakter. Jangan tulis nomor HP, alamat, atau data pribadi lain — semua orang bisa membacanya. Cek buku panduan dulu; jawabannya sering sudah ada.`}
          >
            <TextArea id="question-body" name="body" rows={3} required minLength={QUESTION_BODY_MIN} maxLength={QUESTION_BODY_MAX} />
          </Field>
          <SubmitButton className={buttonVariants({ className: 'self-start' })}>
            <MessageCircleQuestion aria-hidden className="size-4" /> Kirim pertanyaan
          </SubmitButton>
        </form>
      ) : (
        <Link href={loginHref(`/events/${event.slug}?tab=tanya`)} className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
          Masuk untuk bertanya
        </Link>
      )}

      {questions.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line px-4 py-6 text-center text-[14px] text-ink-muted">
          Belum ada pertanyaan. Pertanyaan yang dijawab di sini membantu semua calon peserta.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {questions.map((question) => (
            <li key={question.id} id={`q-${question.id}`} className="flex scroll-mt-28 flex-col gap-2 rounded-[14px] border border-line p-4">
              <p className="text-[13px] text-ink-muted">
                <span className="font-semibold text-ink-soft">{question.authorFirstName}</span>
                {question.isMine && ' (kamu)'} · {formatDateId(question.createdAt)}
              </p>
              <p className="whitespace-pre-line break-words text-[15px]">{question.body}</p>
              {question.answer ? (
                <div className="flex flex-col gap-1 rounded-card bg-panel-nested p-3">
                  <p className="text-[12.5px] font-semibold text-ink-soft">
                    {question.answeredAs === 'organizer' ? 'Jawaban penyelenggara' : 'Jawaban moderator StudentFo'}
                    {question.answeredAt && <span className="font-normal text-ink-muted"> · {formatDateId(question.answeredAt)}</span>}
                  </p>
                  <p className="whitespace-pre-line break-words text-[14.5px]">{question.answer}</p>
                </div>
              ) : (
                <p className="text-[13px] text-ink-muted">Belum dijawab.</p>
              )}

              <div className="flex flex-wrap items-center gap-x-4">
                {canAnswer && (
                  <details className="w-full">
                    <summary className={`${quietLink} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                      {question.answer ? 'Ubah jawaban' : 'Jawab pertanyaan ini'}
                    </summary>
                    <form action={answerQuestionAction} className="mt-2 flex flex-col gap-3">
                      {slugField}
                      <input type="hidden" name="questionId" value={question.id} />
                      <Field id={`answer-${question.id}`} label="Jawaban (tampil publik)">
                        <TextArea
                          id={`answer-${question.id}`}
                          name="answer"
                          rows={3}
                          required
                          minLength={2}
                          maxLength={ANSWER_MAX}
                          defaultValue={question.answer ?? ''}
                        />
                      </Field>
                      <SubmitButton className={buttonVariants({ size: 'sm', className: 'min-h-11 self-start' })}>Simpan jawaban</SubmitButton>
                    </form>
                  </details>
                )}
                {question.isMine ? (
                  <form action={deleteQuestionAction}>
                    {slugField}
                    <input type="hidden" name="questionId" value={question.id} />
                    <button type="submit" className={quietLink}>
                      <Trash2 aria-hidden className="size-3.5" /> Hapus pertanyaanku
                    </button>
                  </form>
                ) : (
                  signedIn && (
                    <Link href={`/laporkan?pertanyaan=${question.id}`} className={quietLink}>
                      <Flag aria-hidden className="size-3.5" /> Laporkan
                    </Link>
                  )
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
