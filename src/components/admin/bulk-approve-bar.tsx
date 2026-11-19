import { CheckCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

/** Batas satu aksi massal — sama dengan BULK_REVIEW_LIMIT di Server Action. */
export const BULK_REVIEW_LIMIT = 50;

/**
 * Bilah "Setujui yang dipilih" (ADR-093). Kotak centang ada di tiap kartu dan
 * dihubungkan ke form ini lewat atribut `form` — form bersarang dilarang HTML,
 * dan cara ini tetap jalan tanpa JavaScript. Hanya SETUJUI: penolakan tetap per
 * kartu karena alasannya dikirim ke pengirim masing-masing.
 */
export function BulkApproveBar({
  formId,
  kind,
  count,
  action,
  noun,
}: {
  formId: string;
  kind: 'events' | 'submissions';
  count: number;
  action: (formData: FormData) => Promise<void>;
  noun: string;
}) {
  if (count < 2) return null;
  return (
    <form
      id={formId}
      action={action}
      className="mb-4 flex flex-col gap-3 rounded-card border border-dashed border-line-strong bg-panel/70 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="decision" value="APPROVED" />
      <p className="min-w-0 text-[13px] leading-snug text-ink-muted">
        Sudah dicek ke sumbernya? Centang <span className="font-semibold text-ink">Pilih</span> di beberapa kartu, lalu setujui sekaligus
        (maks. {BULK_REVIEW_LIMIT}). Penolakan tetap per kartu.
      </p>
      <ConfirmSubmit
        className={buttonVariants({ variant: 'secondary', className: 'w-full shrink-0 sm:w-auto' })}
        confirm={{
          title: `Setujui semua ${noun} yang dipilih?`,
          description: 'Semuanya langsung tayang di katalog dan tercatat di Riwayat moderasi atas namamu. Yang tidak dicentang tetap di antrean.',
          confirmLabel: 'Ya, setujui',
          tone: 'neutral',
          icon: <CheckCheck />,
        }}
      >
        <CheckCheck aria-hidden />
        Setujui yang dipilih
      </ConfirmSubmit>
    </form>
  );
}

/** Kotak "Pilih" di kartu antrean — milik form massal lewat atribut `form`. */
export function BulkPick({ formId, id, title }: { formId: string; id: string; title: string }) {
  return (
    <label className="choice min-h-10 self-start py-1.5 text-[13px]">
      <input type="checkbox" name="ids" value={id} form={formId} className="check" aria-label={`Pilih ${title}`} />
      <span aria-hidden>Pilih</span>
    </label>
  );
}
