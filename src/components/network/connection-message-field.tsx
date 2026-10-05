import { NETWORK_LIMITS } from '@/lib/network';

/**
 * Pesan pengantar opsional di dalam form "Hubungkan". Tertutup secara
 * bawaan: satu klik "Hubungkan" sudah cukup, pesan hanya untuk yang mau.
 * `<details>` supaya tetap bisa dibuka tanpa JavaScript.
 */
export function ConnectionMessageField({ idPrefix }: { idPrefix: string }) {
  const id = `${idPrefix}-pesan`;
  return (
    <details className="group">
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center text-[12.5px] font-medium text-ink-muted underline decoration-dashed decoration-line-strong underline-offset-4 hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">+ Tambah pesan pengantar</span>
        <span className="hidden group-open:inline">Pesan pengantar (opsional)</span>
      </summary>
      <label htmlFor={id} className="sr-only">
        Pesan pengantar
      </label>
      <textarea
        id={id}
        name="message"
        rows={3}
        maxLength={NETWORK_LIMITS.messageMax}
        placeholder="Mis. “Halo, aku lihat kita sama-sama ikut lomba data. Mau satu tim?”"
        className="pop mt-1 w-full resize-y rounded-[14px] border border-line-strong/70 bg-panel px-3.5 py-2.5 text-base leading-relaxed focus-visible:border-brand sm:text-sm"
      />
      <span className="text-[11.5px] text-ink-muted">Maks. {NETWORK_LIMITS.messageMax} karakter. Hanya terlihat oleh orang yang kamu ajak.</span>
    </details>
  );
}
