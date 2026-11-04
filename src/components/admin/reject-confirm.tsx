import { X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { TextArea } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/**
 * "Tolak" di balik `<details>`: satu langkah konfirmasi tanpa JavaScript
 * (pola yang sama dengan blokir koneksi & tolak penyelenggara).
 *
 * Yang tertolak hilang dari antrean dan hanya bisa dikembalikan dari
 * Riwayat moderasi — satu klik yang meleset dari "Setujui" tidak boleh
 * langsung menyingkirkan kiriman yang sah dari pandangan moderator.
 */
export function RejectConfirm({
  action,
  fields,
  subject,
  reasonFor,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Readonly<Record<string, string>>;
  subject: string;
  /** Bila diisi, tampil kolom alasan opsional yang dikirim ke pihak ini (ADR-061). */
  reasonFor?: string;
}) {
  const reasonId = `reason-${Object.values(fields).join('-')}`;
  return (
    <details className="group relative">
      <summary className={cn(buttonVariants({ variant: 'danger', size: 'sm' }), 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
        <X aria-hidden className="size-4" /> Tolak
      </summary>
      <form
        action={action}
        className={cn(
          'mt-2 flex flex-col gap-2 rounded-card border border-danger-line bg-panel p-3 text-sm shadow-overlay sm:absolute sm:right-0 sm:z-10',
          reasonFor ? 'sm:w-80' : 'sm:w-64',
        )}
      >
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <p className="text-ink-soft">Tolak {subject}? Bisa dikembalikan ke antrean dari Riwayat moderasi.</p>
        {reasonFor && (
          <label htmlFor={reasonId} className="flex flex-col gap-1">
            <span className="font-medium">Alasan untuk {reasonFor} (disarankan)</span>
            <TextArea id={reasonId} name="reason" rows={3} maxLength={500} placeholder="Mis. tautan pendaftaran tidak bisa dibuka" />
          </label>
        )}
        <Button type="submit" variant="danger" size="sm">
          Ya, tolak
        </Button>
      </form>
    </details>
  );
}
