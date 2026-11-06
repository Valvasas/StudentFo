import { Undo2 } from 'lucide-react';
import { toggleSaveEventAction, updateTrackerStatusAction } from '@/app/tracker/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import type { RawSearchParams } from '@/lib/search-params';
import { parseUndoToken, UNDO_PARAM } from '@/lib/undo';
import { cn } from '@/lib/utils';
import { TRACKER_STATUS_LABEL } from '@/types/domain';

/**
 * Bilah "Urungkan" setelah aksi yang bisa dibalik (ADR-067, `lib/undo.ts`).
 * Server Component + `<form>` biasa: bekerja tanpa JavaScript, dan tombolnya
 * memanggil Server Action yang sama dengan aksi aslinya (`undo=restore`),
 * jadi sesi & validasi tetap diperiksa di sana — token hanya petunjuk.
 *
 * `titles` = judul kegiatan yang masih terbaca di halaman; token untuk
 * kegiatan lain tetap ditampilkan, hanya tanpa nama.
 */
export function UndoBar({
  params,
  returnTo,
  titles,
  className,
}: {
  params: RawSearchParams;
  returnTo: string;
  titles?: ReadonlyMap<string, string>;
  className?: string;
}) {
  const token = parseUndoToken(params[UNDO_PARAM]);
  if (!token) return null;
  const title = titles?.get(token.eventId);
  const named = title ? `“${title}”` : 'kegiatan ini';

  const text =
    token.kind === 'tahap'
      ? `Tahap ${named} disimpan. Urungkan untuk kembali ke “${TRACKER_STATUS_LABEL[token.status]}”.`
      : `${title ? `“${title}”` : 'Kegiatan'} dihapus dari Tersimpan.`;

  return (
    <div
      role="status"
      className={cn('pop flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-line bg-panel px-4 py-2.5 text-[14px] shadow-card', className)}
    >
      <span className="min-w-0 flex-1 leading-snug">{text}</span>
      <form action={token.kind === 'tahap' ? updateTrackerStatusAction : toggleSaveEventAction}>
        <input type="hidden" name="eventId" value={token.eventId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="undo" value="restore" />
        {token.kind === 'tahap' && <input type="hidden" name="status" value={token.status} />}
        <SubmitButton
          className="press flex min-h-11 items-center gap-1.5 rounded-sm border border-line-strong/70 bg-panel px-3 text-[13.5px] font-semibold transition-colors duration-150 hover:bg-panel-nested sm:pointer-fine:min-h-9"
        >
          <Undo2 aria-hidden className="size-4" />
          Urungkan
        </SubmitButton>
      </form>
    </div>
  );
}
