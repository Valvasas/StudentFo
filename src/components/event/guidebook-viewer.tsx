import { BookOpen, ChevronDown, ExternalLink } from 'lucide-react';
import { guidebookPreview } from '@/lib/guidebook';

/**
 * Buku panduan resmi: tautan langsung selalu ada, pratinjau PDF opsional.
 *
 * Pratinjau sengaja di balik <details> yang TERTUTUP: iframe di dalamnya
 * baru dimuat saat dibuka (`loading="lazy"` + tidak dirender selama
 * tertutup). Tanpa itu setiap kunjungan halaman detail mengunduh PDF
 * berukuran megabita — mahal untuk kuota ponsel — dan membocorkan IP
 * pengunjung ke host pihak ketiga sebelum ia meminta apa pun.
 *
 * Disembunyikan di bawah `sm`: Chrome Android tidak merender PDF di dalam
 * iframe sama sekali, dan Safari iOS hanya halaman pertamanya. Di ponsel,
 * tombol "Buka panduan" (penampil PDF bawaan) adalah pengalaman yang benar.
 *
 * Tanpa atribut `sandbox`: penampil PDF Chromium menolak dirender di iframe
 * ber-sandbox. Isolasi datang dari origin yang berbeda + CSP `frame-src`
 * yang hanya dilonggarkan di rute detail (lihat security-headers.ts), dan
 * URL-nya sudah lolos moderasi manusia.
 */
export function GuidebookViewer({ url, eventTitle }: { url: string | null; eventTitle: string }) {
  const preview = guidebookPreview(url);
  if (!preview) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3.5 rounded-[12px] border border-line px-[18px] py-3.5">
        <BookOpen aria-hidden className="size-5 shrink-0 text-ink-muted" />
        <p className="min-w-[200px] flex-1 text-[14.5px]">
          Buku panduan resmi{preview.embeddable ? ' (PDF)' : ''} dari{' '}
          <strong className="font-medium text-ink-soft">{preview.host}</strong> — syarat, kurikulum, dan ketentuan lengkap.
        </p>
        <a
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="flex min-h-11 items-center gap-1 whitespace-nowrap text-sm font-semibold underline underline-offset-[3px]"
        >
          Buka panduan <ExternalLink aria-hidden className="size-3.5" />
          <span className="sr-only">(tab baru)</span>
        </a>
      </div>

      {preview.embeddable && (
        <details className="group hidden rounded-[12px] border border-line sm:block">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
            Pratinjau di halaman ini
            <ChevronDown aria-hidden className="size-4 transition-transform duration-150 ease-snap group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-2 border-t border-line p-3">
            <iframe
              src={preview.url}
              title={`Buku panduan ${eventTitle}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-[70vh] min-h-[420px] w-full rounded-[8px] bg-panel-nested"
            />
            <p className="text-[13px] text-ink-muted">
              Kosong atau terunduh otomatis? Sebagian situs melarang berkasnya disematkan — pakai “Buka panduan”.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
