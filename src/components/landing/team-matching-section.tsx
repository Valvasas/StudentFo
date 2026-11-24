import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, Handshake, Trophy } from 'lucide-react';

/**
 * "Satu tim, lintas kampus" (ADR-098): pencocokan tim & koneksi ditonjolkan
 * tepat di bawah hero, bukan disembunyikan di menu. Split-layout bernomor:
 * kolom kiri lengket (CSS `sticky`, tanpa JavaScript, tanpa gerak yang
 * digerakkan gulir), kolom kanan empat langkah yang benar-benar ada di
 * produk — tidak ada janji fitur yang belum dibangun (ADR-039 #4).
 */
const STEPS = [
  {
    title: 'Buka kartu pemainmu',
    body: 'Tulis keahlian yang kamu bawa dan yang kamu cari dari rekan. Kartu tertutup sampai kamu sendiri membukanya.',
  },
  {
    title: 'Dicocokkan, bukan diacak',
    body: 'Keahlian yang saling melengkapi, jarak atau kesediaan daring, minat, dan portofolio — alasannya selalu ditampilkan.',
  },
  {
    title: 'Ajak dari halaman lomba',
    body: 'Di setiap lomba tim ada "Cari rekan tim": saring kampus lain, lalu ajak setim lewat notifikasi atau bagikan ke WhatsApp.',
  },
  {
    title: 'Juara bareng, tercatat',
    body: 'Prestasi yang buktinya diperiksa moderator dihitung di peringkat kampus — dan tampil di portofolio publikmu kalau kamu mau.',
  },
] as const;

const total = String(STEPS.length).padStart(2, '0');

export function TeamMatchingSection({ className }: { className?: string }) {
  return (
    <section aria-labelledby="tim-lintas-title" className={className}>
      <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col items-start gap-3.5 self-start lg:sticky lg:top-24">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-highlight-soft px-3 py-1 text-[12.5px] font-semibold text-ink">
            <Handshake aria-hidden className="size-3.5" /> Cari tim & koneksi
          </span>
          <h2 id="tim-lintas-title" className="max-w-[16ch] text-[clamp(28px,4.4vw,40px)] font-bold leading-[1.1] tracking-[-0.03em]">
            Satu tim, <span className="marker">lintas kampus</span>.
          </h2>
          <p className="max-w-[44ch] text-[16px] leading-relaxed text-ink-muted">
            Lomba tim butuh keahlian yang belum tentu ada di kampusmu. StudentFo mempertemukan pelajar dan mahasiswa yang saling
            melengkapi — lalu mencatat prestasinya dengan jujur.
          </p>
          <div className="mt-1 flex flex-wrap gap-2.5">
            <Link
              href="/teams/cocok"
              className="flex h-12 items-center gap-2 rounded-sm bg-brand px-5 text-[15px] font-semibold text-on-brand transition-colors duration-200 ease-snap hover:bg-brand-hover"
            >
              Mulai pencocokan tim
            </Link>
            <Link
              href="/leaderboard"
              className="press group flex h-12 items-center gap-2 rounded-sm border border-line-strong/70 px-5 text-[15px] font-semibold transition-colors duration-200 ease-snap hover:bg-panel-nested"
            >
              <Trophy aria-hidden className="size-4" /> Peringkat kampus
              <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <ol className="flex flex-col border-t border-line">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              data-reveal=""
              style={{ '--reveal-i': index } as CSSProperties}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 border-b border-line py-6"
            >
              <span className="font-mono text-[13px] font-medium tabular-nums text-ink-muted">
                <span className="text-ink">{String(index + 1).padStart(2, '0')}</span>/{total}
              </span>
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[17px] font-semibold tracking-[-0.015em]">{step.title}</span>
                <span className="text-[15px] leading-relaxed text-ink-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
