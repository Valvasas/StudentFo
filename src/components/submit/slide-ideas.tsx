import { Lightbulb } from 'lucide-react';

const IDEAS = ['Alur pendaftaran', 'Hadiah & benefit', 'Kriteria penilaian', 'Juri / pembicara', 'Linimasa', 'Contoh karya edisi lalu'] as const;

/**
 * Contekan isi slide penjelas (ADR-094). Kotak unggah kosong membuat orang
 * hanya mengunggah poster lagi; contoh konkret memberi tahu gambar apa yang
 * paling membantu peserta memutuskan ikut.
 */
export function SlideIdeas() {
  return (
    <div className="flex items-start gap-3 rounded-card bg-panel-nested px-4 py-3 text-[13px] leading-snug text-ink-soft">
      <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      <div className="flex min-w-0 flex-col gap-2">
        <p>Slide yang paling membantu peserta memutuskan ikut:</p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Contoh isi slide">
          {IDEAS.map((idea) => (
            <li key={idea} className="rounded-pill border border-line bg-panel px-2.5 py-1 text-[12.5px] font-medium text-ink">
              {idea}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
