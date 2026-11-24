import Link from 'next/link';
import { Clock, ShieldCheck, Trophy, XCircle } from 'lucide-react';
import { cancelVerificationAction, requestVerificationAction } from '@/app/tracker/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatDateId } from '@/lib/deadline';
import { LEADERBOARD_RESULT_LABEL } from '@/lib/leaderboard';
import { isPortfolioStatus } from '@/lib/portfolio';
import { isLeaderboardResult, type AchievementVerification, type TrackerItem } from '@/types/domain';

const buttonClass = 'flex h-11 items-center gap-2 rounded-card px-4 text-sm font-semibold';

/**
 * Pemeriksaan prestasi oleh moderator (ADR-098), di bawah form portofolio.
 * Hanya Finalis/Juara lomba yang bisa diajukan; isi yang diperiksa = hasil +
 * tautan bukti + kampus SAAT mengajukan. Tanpa JavaScript: dua form biasa.
 */
export function VerificationPanel({
  item,
  verification,
  closed,
  returnTo,
}: {
  item: TrackerItem;
  verification: AchievementVerification | null;
  /** Pendaftaran lomba sudah ditutup — hasil baru mungkin ada setelahnya. */
  closed: boolean;
  returnTo: string;
}) {
  if (item.event.eventType !== 'LOMBA' || !isPortfolioStatus(item.status)) return null;

  const hidden = (
    <>
      <input type="hidden" name="eventId" value={item.eventId} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );

  if (verification) {
    const result = LEADERBOARD_RESULT_LABEL[verification.result];
    if (verification.status === 'VERIFIED') {
      return (
        <p className="flex items-start gap-2.5 rounded-card bg-success-soft px-3.5 py-3 text-sm leading-normal text-success">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">{result} terverifikasi moderator</strong>
            {verification.reviewedAt && ` pada ${formatDateId(verification.reviewedAt)}`}. Dihitung di{' '}
            <Link href="/leaderboard" className="font-semibold underline underline-offset-[3px]">
              Peringkat
            </Link>
            . Mengubah hasil atau bukti di atas membatalkan verifikasi ini.
          </span>
        </p>
      );
    }
    if (verification.status === 'REJECTED') {
      return (
        <div className="flex flex-col gap-2 rounded-card bg-danger-soft/60 px-3.5 py-3 text-sm leading-normal text-ink-soft">
          <p className="flex items-start gap-2.5">
            <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
            <span>
              <strong className="font-semibold text-ink">Belum bisa diverifikasi.</strong> {verification.reviewNote}
            </span>
          </p>
          <p className="text-[12.5px] text-ink-muted">Perbaiki hasil atau tautan bukti di atas lalu simpan — setelah itu kamu bisa mengajukan lagi.</p>
        </div>
      );
    }
    return (
      <form action={cancelVerificationAction} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-panel-nested px-3.5 py-3">
        {hidden}
        <p className="flex min-w-[220px] flex-1 items-start gap-2.5 text-sm leading-normal text-ink-soft">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold text-ink">{result} sedang diperiksa moderator</strong> sejak {formatDateId(verification.requestedAt)}.
            Kabarnya masuk ke lonceng notifikasi.
          </span>
        </p>
        <SubmitButton className={`${buttonClass} border border-line-strong/70 hover:bg-panel`} pendingLabel="Membatalkan…">
          Batalkan pengajuan
        </SubmitButton>
      </form>
    );
  }

  const competitive = isLeaderboardResult(item.achievement);
  const blocker = !competitive
    ? 'Pilih hasil Finalis atau Juara di portofolio untuk mengajukan verifikasi.'
    : !item.proofUrl
      ? 'Tambahkan tautan bukti — sertifikat, pengumuman pemenang resmi, atau unggahan panitia.'
      : !closed
        ? 'Bisa diajukan setelah pendaftaran lomba ini ditutup.'
        : null;

  return (
    <form action={requestVerificationAction} className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong/70 px-3.5 py-3.5">
      {hidden}
      <p className="flex items-start gap-2.5 text-sm leading-normal text-ink-soft">
        <Trophy aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong className="font-semibold text-ink">Verifikasi prestasi.</strong> Moderator mencocokkan hasilmu dengan buktinya. Yang
          terverifikasi berlabel di profilmu dan dihitung — tanpa namamu — di skor kampus pada{' '}
          <Link href="/leaderboard" className="font-medium underline underline-offset-[3px]">
            Peringkat
          </Link>
          . Namamu hanya tampil kalau kamu menyalakan portofolio publik.
        </span>
      </p>
      {blocker ? (
        <p className="text-[12.5px] text-ink-muted">{blocker}</p>
      ) : (
        <SubmitButton className={`${buttonClass} self-start bg-brand text-on-brand hover:bg-brand-hover`} pendingLabel="Mengirim…">
          <ShieldCheck aria-hidden className="size-4" /> Ajukan verifikasi {LEADERBOARD_RESULT_LABEL[item.achievement as keyof typeof LEADERBOARD_RESULT_LABEL]}
        </SubmitButton>
      )}
    </form>
  );
}
