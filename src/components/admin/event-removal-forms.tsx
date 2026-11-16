import { RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { deleteEventPermanentlyAction, restoreEventAction, takeDownEventAction } from '@/app/admin/actions';
import { buttonVariants } from '@/components/ui/button';
import { TextArea, TextInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { EVENT_DELETE_PHRASE, TAKEDOWN_REASONS } from '@/lib/event-removal';
import { cn } from '@/lib/utils';

/** Konteks pencarian "Kelola postingan" yang ikut dibawa pulang (nilai, bukan path). */
export interface AdminEventsContext {
  readonly q?: string;
  readonly status?: string;
}

function ContextFields({ eventId, context }: { eventId: string; context: AdminEventsContext }) {
  return (
    <>
      <input type="hidden" name="eventId" value={eventId} />
      {context.q && <input type="hidden" name="q" value={context.q} />}
      {context.status && <input type="hidden" name="status" value={context.status} />}
    </>
  );
}

function ReasonFields({ id }: { id: string }) {
  return (
    <>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[13.5px] font-semibold">Alasan (tercatat di Riwayat moderasi)</legend>
        {TAKEDOWN_REASONS.map((reason, index) => (
          <label key={reason.key} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm text-[13.5px]">
            <input type="radio" name="preset" value={reason.key} required defaultChecked={index === 0} className="check shrink-0" />
            {reason.label}
          </label>
        ))}
      </fieldset>
      <label htmlFor={`${id}-details`} className="flex flex-col gap-1 text-[13.5px]">
        <span className="font-medium">Keterangan (wajib untuk “Lainnya”)</span>
        <TextArea id={`${id}-details`} name="details" rows={2} maxLength={300} />
      </label>
    </>
  );
}

/**
 * Hapus postingan = turunkan (ADR-092 #1): berlaku KAPAN SAJA, juga sebelum
 * tenggat. Hilang seketika dari katalog & halaman, bisa diurungkan.
 */
export function TakedownForm({ eventId, title, context = {}, compact = false }: { eventId: string; title: string; context?: AdminEventsContext; compact?: boolean }) {
  const id = `takedown-${eventId}`;
  return (
    <details className="group min-w-0 open:basis-full">
      <summary className={cn(buttonVariants({ variant: 'danger', size: 'sm' }), 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
        <Trash2 aria-hidden /> Hapus postingan
        <span className="sr-only"> {title}</span>
      </summary>
      <form action={takeDownEventAction} className={cn('mt-3 flex max-w-lg flex-col gap-3', !compact && 'rounded-card border border-line bg-panel-nested p-4')}>
        <ContextFields eventId={eventId} context={context} />
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Postingan langsung hilang dari katalog, pencarian, dan halamannya — walau tenggatnya belum lewat. Pendaftar & data tetap aman, dan kamu
          bisa <strong className="font-semibold text-ink">mengurungkannya</strong> kapan saja dari Kelola postingan.
        </p>
        <ReasonFields id={id} />
        <SubmitButton pendingLabel="Menghapus…" className={buttonVariants({ variant: 'danger', size: 'sm', className: 'self-start' })}>
          Ya, hapus dari katalog
        </SubmitButton>
      </form>
    </details>
  );
}

export function RestoreEventForm({ eventId, title, context = {}, label = 'Tayangkan lagi', undo = false }: { eventId: string; title: string; context?: AdminEventsContext; label?: string; undo?: boolean }) {
  const Icon = undo ? Undo2 : RotateCcw;
  return (
    <form action={restoreEventAction}>
      <ContextFields eventId={eventId} context={context} />
      <SubmitButton pendingLabel="Memulihkan…" className={buttonVariants({ variant: undo ? 'primary' : 'secondary', size: 'sm' })}>
        <Icon aria-hidden /> {label}
        <span className="sr-only"> {title}</span>
      </SubmitButton>
    </form>
  );
}

/** Hanya untuk postingan yang sudah diturunkan — tidak bisa diurungkan. */
export function PermanentDeleteForm({ eventId, title, context = {} }: { eventId: string; title: string; context?: AdminEventsContext }) {
  const id = `purge-${eventId}`;
  return (
    <details className="group min-w-0 open:basis-full">
      <summary className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'cursor-pointer list-none text-danger [&::-webkit-details-marker]:hidden')}>
        <Trash2 aria-hidden /> Hapus permanen…
        <span className="sr-only"> {title}</span>
      </summary>
      <form action={deleteEventPermanentlyAction} className="mt-3 flex max-w-lg flex-col gap-3 rounded-card border border-danger-line bg-danger-soft/40 p-4">
        <ContextFields eventId={eventId} context={context} />
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Postingan beserta foto, video, komentar, suka, simpanan, dan pendaftaran yang sudah batal/ditolak dihapus <strong className="font-semibold text-ink">permanen</strong>.
          Riwayat moderasi tetap mencatat judul & alasannya. Kalau postingan ini hasil penelusuran otomatis, sumbernya bisa memunculkannya lagi di antrean —
          biarkan saja di status diturunkan bila tidak ingin muncul lagi.
        </p>
        <ReasonFields id={id} />
        <label htmlFor={`${id}-confirm`} className="flex flex-col gap-1 text-[13.5px]">
          <span>
            Ketik <strong className="font-mono">{EVENT_DELETE_PHRASE}</strong> untuk konfirmasi
          </span>
          <TextInput id={`${id}-confirm`} name="confirm" autoComplete="off" required pattern="[Hh][Aa][Pp][Uu][Ss]" />
        </label>
        <SubmitButton pendingLabel="Menghapus…" className={buttonVariants({ variant: 'danger', size: 'sm', className: 'self-start' })}>
          Hapus permanen
        </SubmitButton>
      </form>
    </details>
  );
}
