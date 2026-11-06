import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';

/**
 * Daftar Pengaturan (ADR-067): satu grup = satu konteks, satu baris = satu
 * halaman. Setiap baris menyebut KEADAAN SEKARANG ("Kata sandi aktif",
 * "Profil 80% lengkap"), bukan deskripsi umum — orang bisa memeriksa akunnya
 * sekilas tanpa membuka setiap halaman, dan baris yang perlu perhatian
 * ditandai dengan teks, bukan warna saja.
 */
export function SettingsGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
      <h2 id={`${id}-title`} className="px-1 text-[13px] font-semibold text-ink-muted">
        {title}
      </h2>
      <ul className="flex flex-col divide-y divide-line/80 overflow-hidden rounded-[18px] border border-line bg-panel">{children}</ul>
    </section>
  );
}

export function SettingsRow({
  href,
  icon: Icon,
  label,
  summary,
  attention,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  summary?: ReactNode;
  /** Teks pendek bila ada yang perlu dilengkapi — tampil sebagai label, bukan titik merah. */
  attention?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex min-h-[64px] items-center gap-3.5 px-4 py-3 transition-colors duration-150 ease-snap hover:bg-panel-nested sm:px-5"
      >
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-panel-nested text-ink transition-colors duration-150 group-hover:bg-panel">
          <Icon className="size-[18px]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold leading-snug">
            {label}
            {attention && (
              <span className="rounded-pill bg-highlight-soft px-2 py-px text-[11.5px] font-semibold text-ink">{attention}</span>
            )}
          </span>
          {summary && <span className="text-[13px] leading-snug text-ink-muted">{summary}</span>}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-snap group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/** Kepala halaman anak Pengaturan: judul + kalimat pendek tentang konteksnya. */
export function SettingsHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="enter flex flex-col gap-2.5 [animation-duration:800ms]">
      <h1 className="text-[clamp(28px,5vw,36px)] leading-[1.05] tracking-[-0.04em]">{title}</h1>
      <p className="max-w-[60ch] text-[15.5px] leading-relaxed text-ink-muted">{description}</p>
      {children}
    </div>
  );
}
