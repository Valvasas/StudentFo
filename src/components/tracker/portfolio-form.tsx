import Link from 'next/link';
import { Eye, EyeOff, Info } from 'lucide-react';
import { updatePortfolioAction } from '@/app/tracker/actions';
import { SelectInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  ACHIEVEMENT_OPTIONS,
  PORTFOLIO_LIMITS,
  achievementLabel,
  defaultPortfolioVisible,
  isPortfolioStatus,
} from '@/lib/portfolio';
import type { TrackerItem } from '@/types/domain';

const fieldClass =
  'h-11 w-full rounded-card border border-line-strong/70 bg-panel px-3.5 text-base hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:text-sm';

/**
 * Isi portofolio untuk satu kegiatan (ADR-046).
 *
 * Entrinya sudah ada sejak status "Sudah daftar" — form ini hanya
 * melengkapi hasil dan memilih siapa yang melihatnya. Untuk status di luar
 * portofolio, yang tampil adalah penjelasan, bukan form yang pasti ditolak.
 */
export function PortfolioPanel({ item, returnTo }: { item: TrackerItem; returnTo: string }) {
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

  return (
    <form action={updatePortfolioAction} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={item.eventId} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="achievement" className="text-[13.5px] font-semibold">
          Hasil
        </label>
        <SelectInput id="achievement" name="achievement" defaultValue={item.achievement ?? ''}>
          <option value="">Belum ada hasil / masih berjalan</option>
          {ACHIEVEMENT_OPTIONS[eventType].map((achievement) => (
            <option key={achievement} value={achievement}>
              {achievementLabel(achievement, eventType)}
            </option>
          ))}
        </SelectInput>
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
          Harus diawali https://. Orang yang melihat profilmu bisa membukanya.
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
        <span className="max-w-[46ch] text-[12.5px] leading-snug text-ink-muted">
          Hasil dilaporkan sendiri dan ditandai begitu di profilmu. Menghapus kegiatan ini dari Pendaftaran juga menghapusnya
          dari portofolio.
        </span>
        <SubmitButton className="flex h-11 items-center rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
          Simpan portofolio
        </SubmitButton>
      </div>
    </form>
  );
}
