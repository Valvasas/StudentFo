import Link from 'next/link';
import { Clock, Eye, EyeOff, Info, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cancelVerificationAction, requestVerificationAction, updatePortfolioAction } from '@/app/tracker/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatDateId } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import {
  ACHIEVEMENT_OPTIONS,
  PORTFOLIO_LIMITS,
  achievementLabel,
  defaultPortfolioVisible,
  isPortfolioStatus,
} from '@/lib/portfolio';
import type { ResultVerification, TrackerItem } from '@/types/domain';

const fieldClass =
  'h-11 w-full rounded-card border border-line-strong/70 bg-panel px-3.5 text-base hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:text-sm';

const secondaryButton =
  'flex h-11 items-center gap-1.5 rounded-card border border-line-strong/70 px-4 text-sm font-semibold transition-colors duration-150 hover:bg-panel-nested';

/**
 * Isi portofolio untuk satu kegiatan (ADR-046) + konfirmasi penyelenggara
 * (ADR-047).
 *
 * Susunannya sengaja "status dulu, baru ubah": kotak di atas menjawab satu
 * pertanyaan — apakah hasil ini sudah dipercaya orang lain, dan apa satu
 * langkah berikutnya — lalu form di bawahnya. Tiap keadaan punya paling
 * banyak SATU tombol; tidak ada keadaan yang menampilkan tombol yang pasti
 * ditolak server.
 */
export function PortfolioPanel({
  item,
  returnTo,
  verification,
  verifierName,
}: {
  item: TrackerItem;
  returnTo: string;
  verification: ResultVerification | null;
  /** Lembaga terverifikasi yang mengelola acara ini; null = belum ada yang bisa mengonfirmasi. */
  verifierName: string | null;
}) {
  const eventType = item.event.eventType;

  if (item.status === 'SAVED') {
    return (
      <p className="flex items-start gap-2.5 rounded-card bg-panel-nested px-3.5 py-3 text-sm leading-normal text-ink-soft">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        Tandai &ldquo;Sudah daftar&rdquo; — kegiatan ini otomatis masuk portofoliomu, dan kamu bisa mencatat hasilnya di sini.
      </p>
    );
  }
  if (item.status === 'REJECTED') {
    return (
      <p className="flex items-start gap-2.5 rounded-card bg-panel-nested px-3.5 py-3 text-sm leading-normal text-ink-soft">
        <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0" />
        Pendaftaran yang belum berhasil tetap tercatat di riwayatmu, tapi tidak pernah tampil di profil publik.
      </p>
    );
  }
  if (!isPortfolioStatus(item.status)) return null;

  const visible = item.portfolioVisible ?? defaultPortfolioVisible(eventType);
  const privateByDefault = !defaultPortfolioVisible(eventType);
  // Isi yang berubah menggugurkan keputusan/permintaan (trigger SQL) —
  // diberitahukan SEBELUM menyimpan, bukan ditemukan sesudahnya.
  const saveHint =
    verification?.status === 'VERIFIED'
      ? 'Mengubah hasil, catatan, atau tautan bukti menghapus tanda terverifikasi. Mengubah visibilitas saja tidak.'
      : verification?.status === 'PENDING'
        ? 'Mengubah hasil, catatan, atau tautan bukti membatalkan permintaan konfirmasi yang sedang menunggu.'
        : 'Menghapus kegiatan ini dari Pendaftaran juga menghapusnya dari portofolio.';
  const cautionHint = verification?.status === 'VERIFIED' || verification?.status === 'PENDING';

  return (
    <div className="flex flex-col gap-5">
      {item.achievement && (
        <VerificationStatus item={item} returnTo={returnTo} verification={verification} verifierName={verifierName} />
      )}

      <form action={updatePortfolioAction} className="flex flex-col gap-4">
        <input type="hidden" name="eventId" value={item.eventId} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="achievement" className="text-[13.5px] font-semibold">
            Hasil
          </label>
          <select
            id="achievement"
            name="achievement"
            defaultValue={item.achievement ?? ''}
            aria-describedby={!item.achievement && verifierName ? 'achievement-hint' : undefined}
            className={fieldClass}
          >
            <option value="">Belum ada hasil / masih berjalan</option>
            {ACHIEVEMENT_OPTIONS[eventType].map((achievement) => (
              <option key={achievement} value={achievement}>
                {achievementLabel(achievement, eventType)}
              </option>
            ))}
          </select>
          {!item.achievement && verifierName && (
            <span id="achievement-hint" className="text-[12.5px] text-ink-muted">
              Setelah disimpan, kamu bisa meminta {verifierName} mengonfirmasinya.
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="achievementNote" className="text-[13.5px] font-semibold">
            Catatan hasil <span className="font-normal text-ink-muted">(opsional)</span>
          </label>
          <input
            id="achievementNote"
            name="achievementNote"
            defaultValue={item.achievementNote ?? ''}
            maxLength={PORTFOLIO_LIMITS.noteMax}
            placeholder="Mis. Kategori UI/UX, tim 3 orang"
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="proofUrl" className="text-[13.5px] font-semibold">
            Tautan bukti <span className="font-normal text-ink-muted">(opsional)</span>
          </label>
          <input
            id="proofUrl"
            name="proofUrl"
            type="url"
            inputMode="url"
            defaultValue={item.proofUrl ?? ''}
            maxLength={PORTFOLIO_LIMITS.proofMax}
            pattern="https://.*"
            placeholder="https://… (sertifikat, pengumuman pemenang, karya)"
            aria-describedby="proofUrl-hint"
            className={fieldClass}
          />
          <span id="proofUrl-hint" className="text-[12.5px] text-ink-muted">
            Harus diawali https://. Orang yang melihat profilmu — dan penyelenggara saat mengonfirmasi — bisa membukanya.
          </span>
        </div>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-card bg-panel-nested px-3.5 py-3">
          <input type="checkbox" name="visible" defaultChecked={visible} className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]" />
          <span className="flex flex-col gap-0.5 text-sm">
            <span className="flex items-center gap-1.5 font-semibold">
              <Eye aria-hidden className="size-4" /> Tampilkan di profil publik
            </span>
            <span className="text-[12.5px] leading-snug text-ink-muted">
              {privateByDefault
                ? 'Beasiswa & magang privat secara bawaan — menyangkut kondisi ekonomi dan lamaran kerja. Nyalakan hanya kalau kamu nyaman.'
                : 'Terlihat oleh koneksimu dan, kalau kamu bisa ditemukan, oleh pengguna Cari Koneksi.'}{' '}
              <Link href="/connections#pengaturan-jaringan" className="underline underline-offset-[3px]">
                Atur siapa yang bisa menemukanmu
              </Link>
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={cn('max-w-[46ch] text-[12.5px] leading-snug', cautionHint ? 'text-caution' : 'text-ink-muted')}>{saveHint}</span>
          <SubmitButton className="flex h-11 items-center rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
            Simpan portofolio
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

/**
 * Satu kotak, satu keadaan. Warna mengikuti makna, bukan hiasan: hijau =
 * sudah dipercaya, kuning = perlu perbaikan (bisa diperbaiki, bukan
 * kesalahan fatal — merah akan terbaca "ditolak selamanya"), netral =
 * menunggu / belum tersedia.
 */
function VerificationStatus({
  item,
  returnTo,
  verification,
  verifierName,
}: {
  item: TrackerItem;
  returnTo: string;
  verification: ResultVerification | null;
  verifierName: string | null;
}) {
  const hidden = (
    <>
      <input type="hidden" name="eventId" value={item.eventId} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );

  if (verification?.status === 'VERIFIED') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-card border border-success-line bg-success-soft px-4 py-3.5 text-success">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
        <p className="flex flex-col gap-0.5 text-sm">
          <span className="font-semibold">Dikonfirmasi {verification.orgName}</span>
          <span className="text-[13px] text-ink-soft">
            {verification.reviewedAt ? `Sejak ${formatDateId(verification.reviewedAt)}. ` : ''}
            Di profilmu hasil ini bertanda terverifikasi.
          </span>
        </p>
      </div>
    );
  }

  if (verification?.status === 'DECLINED') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-card border border-caution-line bg-caution-soft px-4 py-3.5">
        <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-caution" />
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="font-semibold text-caution">{verification.orgName} belum bisa mengonfirmasi hasil ini</p>
          {verification.reviewNote && (
            <blockquote className="border-l-2 border-caution-line pl-3 text-[13.5px] text-ink">
              &ldquo;{verification.reviewNote}&rdquo;
            </blockquote>
          )}
          <p className="text-[13px] text-ink-soft">
            Perbaiki hasil, catatan, atau tautan bukti di bawah lalu simpan. Setelah itu kamu bisa meminta konfirmasi lagi.
          </p>
        </div>
      </div>
    );
  }

  if (verification?.status === 'PENDING') {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-panel-nested px-4 py-3.5">
        <p className="flex min-w-0 flex-[1_1_260px] items-start gap-3 text-sm">
          <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">Menunggu konfirmasi{verifierName ? ` ${verifierName}` : ''}</span>
            <span className="text-[13px] text-ink-muted">
              Dikirim {formatDateId(verification.requestedAt)}. Kamu dikabari lewat lonceng begitu diputuskan.
            </span>
          </span>
        </p>
        <form action={cancelVerificationAction}>
          {hidden}
          <SubmitButton className="flex min-h-11 items-center px-2 text-[13.5px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
            Batalkan permintaan
          </SubmitButton>
        </form>
      </div>
    );
  }

  if (!verifierName) {
    return (
      <p className="flex items-start gap-3 rounded-card bg-panel-nested px-4 py-3.5 text-[13.5px] leading-normal text-ink-soft">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong className="font-semibold text-ink">Tampil sebagai &ldquo;dilaporkan sendiri&rdquo;.</strong>{' '}
          {item.event.organizer} belum bergabung di StudentFo, jadi belum ada yang bisa mengonfirmasi. Tautan bukti membantu
          orang mempercayainya.
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line px-4 py-3.5">
      <p className="flex items-start gap-3 text-sm">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">Minta {verifierName} mengonfirmasi hasil ini</span>
          <span className="text-[13px] leading-snug text-ink-muted">
            Yang mereka lihat hanya namamu, jenjang &amp; jurusan, hasil, catatan, dan tautan bukti di bawah. Setelah
            dikonfirmasi, profilmu menampilkan tanda terverifikasi.
          </span>
        </span>
      </p>
      <form action={requestVerificationAction} className="self-start sm:ml-8">
        {hidden}
        <SubmitButton className={secondaryButton}>
          <ShieldCheck aria-hidden className="size-4" /> Minta konfirmasi
        </SubmitButton>
      </form>
    </div>
  );
}
