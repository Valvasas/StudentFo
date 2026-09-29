import { X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * "Tolak" di balik `<details>`: satu langkah konfirmasi tanpa JavaScript
 * (pola yang sama dengan blokir koneksi & tolak penyelenggara).
 *
 * Penolakan tidak punya jalan balik dari antrean — kegiatan yang tertolak
 * tidak muncul lagi di sini — jadi satu klik yang meleset dari "Setujui"
 * tidak boleh langsung membuang kiriman yang sah.
 */
export function RejectConfirm({ action, fields, subject }: { action: (formData: FormData) => void | Promise<void>; fields: Readonly<Record<string, string>>; subject: string }) {
  return (
    <details className="group relative">
      <summary className={cn(buttonVariants({ variant: 'danger', size: 'sm' }), 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
        <X aria-hidden className="size-4" /> Tolak
      </summary>
      <form action={action} className="mt-2 flex flex-col gap-2 rounded-card border border-danger-line bg-panel p-3 text-sm shadow-overlay sm:absolute sm:right-0 sm:z-10 sm:w-64">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <p className="text-ink-soft">Tolak {subject}? Kiriman yang ditolak tidak kembali ke antrean.</p>
        <Button type="submit" variant="danger" size="sm">
          Ya, tolak
        </Button>
      </form>
    </details>
  );
}
