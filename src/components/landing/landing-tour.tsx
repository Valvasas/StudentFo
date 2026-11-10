'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bell, Bookmark, Check, Clock, Pause, Play, Search, ShieldCheck, ExternalLink, UserPlus } from 'lucide-react';
import { isMotionReduced } from '@/lib/motion-pref';
import { cn } from '@/lib/utils';

/**
 * Cuplikan beranda (ADR-065, dirampingkan ADR-081): SATU panggung yang
 * berputar sendiri seperti video. Versi sebelumnya membawa judul "Cara kerja
 * StudentFo", daftar lima langkah bernomor, dan keterangan di tiap langkah —
 * pemilik menilainya terbaca seperti panduan buatan AI. Sekarang yang
 * terlihat hanya cuplikannya dan bilah kendali ala pemutar video.
 *
 * Yang TIDAK berubah dari ADR-065:
 * - Hanya fitur yang ada di produksi (cari & saring, sumber & moderasi,
 *   simpan + pengingat H-3/H-1, papan lamaran, pencocokan tim). Pesan dan
 *   ruang diskusi hanya ada di mode demo → tidak diperagakan.
 * - Dibangun dari token & kosakata komponen produk, jadi ikut tema gelap.
 * - Bukan mockup peramban palsu; nama di dalamnya tertulis "Contoh …".
 *
 * Aksesibilitas: panggung `aria-hidden` dengan SATU deskripsi statis untuk
 * pembaca layar (bukan `aria-live` — pengumuman tiap 5 detik lebih
 * mengganggu daripada membantu). Berjalan sendiri hanya saat terlihat, tab
 * peramban aktif, dan gerak tidak dikurangi; tombol jeda memenuhi WCAG
 * 2.2.2, ruas bilah = lompat ke adegan (memilih sendiri = jeda). Kendali
 * baru dirender setelah hidrasi — tanpa JavaScript adegan pertama tampil
 * utuh tanpa tombol mati.
 */

const SCENES = [
  'mencari lomba lalu menyaring jenjang dan biaya',
  'halaman kegiatan dengan tanda ditinjau moderator dan tautan pengumuman resmi',
  'menyimpan kegiatan lalu menerima pengingat tiga hari dan sehari sebelum tutup',
  'papan lamaran yang maju dari Disimpan sampai Diterima',
  'pencocokan tim menemukan rekan dengan keahlian yang dicari',
] as const;

const SCENE_MS = 5600;
const t = (ms: number, extra?: Record<string, string | number>) => ({ '--t': `${ms}ms`, ...extra }) as CSSProperties;

export function LandingTour() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setHydrated(true);
    if (isMotionReduced()) setPlaying(false);
    const node = rootRef.current;
    if (!node || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0.35 });
    observer.observe(node);
    const onVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const running = playing && inView && visible;

  const select = (index: number) => {
    setScene(index);
    setPlaying(false);
  };

  const togglePlay = () => {
    if (!playing && isMotionReduced()) {
      // Gerak dikurangi: cuplikan tidak berjalan sendiri, tombolnya maju satu adegan.
      setScene((current) => (current + 1) % SCENES.length);
      return;
    }
    setPlaying((value) => !value);
  };

  return (
    <section
      ref={rootRef}
      id="cara-kerja"
      aria-label="Cuplikan cara kerja StudentFo"
      className="container-page max-w-[1120px] scroll-mt-20 pt-[clamp(56px,7vw,88px)]"
    >
      <div data-reveal="" className="dot-grid mx-auto max-w-[760px] overflow-hidden rounded-[24px] border border-line bg-panel-nested shadow-card">
        <p className="sr-only">Cuplikan beranimasi tanpa suara, lima adegan: {SCENES.join('; ')}.</p>
        <div aria-hidden key={scene} className="flex min-h-[348px] flex-col justify-center px-4 py-6 sm:min-h-[372px] sm:px-10 sm:py-8">
          {scene === 0 && <SearchStage />}
          {scene === 1 && <SourceStage />}
          {scene === 2 && <RemindStage />}
          {scene === 3 && <TrackStage />}
          {scene === 4 && <TeamStage />}
        </div>

        {/* Tinggi dipesan sebelum hidrasi supaya bilah kendali tidak menggeser halaman saat muncul. */}
        <div className="flex h-11 items-center border-t border-line bg-panel/80">
          {hydrated && (
            <>
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? 'Jeda cuplikan' : 'Putar cuplikan'}
                className="flex size-11 shrink-0 items-center justify-center rounded-bl-[23px] text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
              >
                {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
              </button>
              <div role="group" aria-label="Adegan cuplikan" className="flex min-w-0 flex-1 items-center">
                {SCENES.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => select(index)}
                    aria-label={`Adegan ${index + 1} dari ${SCENES.length}: ${label}`}
                    aria-current={index === scene ? 'true' : undefined}
                    // Tanpa celah antartombol (jarak visual dari padding): di 320px tiap ruas tetap ≥ 44px.
                    className="group flex h-11 min-w-0 flex-1 items-center px-[3px] last:pr-3.5"
                  >
                    <span className="block h-1.5 w-full overflow-hidden rounded-pill bg-line transition-colors duration-150 ease-snap group-hover:bg-line-strong">
                      {index < scene && <span className="block h-full bg-brand" />}
                      {index === scene && (
                        <span
                          key={`${scene}-${playing}`}
                          className={cn('block h-full bg-brand', playing && 'tour-progress')}
                          style={{ '--dur': `${SCENE_MS}ms`, animationPlayState: running ? 'running' : 'paused' } as CSSProperties}
                          onAnimationEnd={() => {
                            if (running) setScene((value) => (value + 1) % SCENES.length);
                          }}
                        />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function MiniTag({ days, delay }: { days: number; delay: number }) {
  const ramp = days > 7 ? 0 : (7 - days) / 7;
  const tier = days > 7 ? 'safe' : days > 2 ? 'warning' : 'urgent';
  return (
    <span
      className={cn(
        'tour-in inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[6px] px-2 text-xs font-semibold tabular-nums',
        tier === 'safe' && 'px-0 font-medium text-ink-muted',
        tier === 'warning' && 'due-ramp',
        tier === 'urgent' && 'bg-brand text-on-brand',
      )}
      style={t(delay, { '--ramp': ramp })}
    >
      {tier !== 'safe' && <Clock className="size-3" />}
      {days} hari lagi
    </span>
  );
}

function SearchStage() {
  const rows = [
    { title: 'Lomba Desain Poster Pangan', org: 'Contoh penyelenggara · Daring', days: 2 },
    { title: 'Kompetisi Ilustrasi Pelajar', org: 'Contoh penyelenggara · Bandung', days: 5 },
    { title: 'Lomba Desain Maskot Kota', org: 'Contoh penyelenggara · Surabaya', days: 12 },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="tour-in flex h-12 items-center gap-2.5 rounded-card border border-line-strong/70 bg-panel px-4 text-[15px] shadow-card">
        <Search className="size-4 text-ink-muted" />
        <span className="tour-type" style={t(250, { '--w': '13ch', '--steps': 12 })}>
          lomba desain
        </span>
        <span className="tour-caret -ml-1.5 h-5 w-px bg-ink" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="tour-in inline-flex h-8 items-center gap-1.5 rounded-pill border border-brand bg-brand px-3 text-[13px] font-medium text-on-brand" style={t(1500)}>
          <Check className="chip-tick size-3.5" strokeWidth={2.6} style={{ animationDelay: '1650ms' }} /> SMA/SMK
        </span>
        <span className="tour-in inline-flex h-8 items-center rounded-pill border border-line bg-panel px-3 text-[13px] text-ink-soft" style={t(1580)}>
          D3
        </span>
        <span className="tour-in inline-flex h-8 items-center rounded-pill border border-line bg-panel px-3 text-[13px] text-ink-soft" style={t(1660)}>
          D4/S1
        </span>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <span className="tour-in inline-flex h-8 items-center gap-1.5 rounded-pill border border-brand bg-brand px-3 text-[13px] font-medium text-on-brand" style={t(1900)}>
          <Check className="chip-tick size-3.5" strokeWidth={2.6} style={{ animationDelay: '2050ms' }} /> Gratis
        </span>
      </div>
      <ul className="mt-1 flex flex-col gap-2">
        {rows.map((row, index) => (
          <li
            key={row.title}
            className="tour-in flex items-center justify-between gap-3 rounded-card border border-line bg-panel px-4 py-3"
            style={t(2400 + index * 180)}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14.5px] font-semibold">{row.title}</span>
              <span className="truncate text-[12.5px] text-ink-muted">{row.org}</span>
            </span>
            <MiniTag days={row.days} delay={2600 + index * 180} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceStage() {
  return (
    <div className="tour-in flex flex-col gap-4 rounded-[18px] border border-line bg-panel p-5 shadow-card sm:p-6">
      <span className="flex items-center gap-2">
        <span className="flex h-[24px] items-center rounded-[6px] bg-brand px-2 text-[12px] font-semibold text-on-brand">Lomba</span>
        <span className="text-[12.5px] text-ink-muted">Desain</span>
      </span>
      <span className="font-display text-[22px] font-bold leading-tight tracking-[-0.03em]">Lomba Desain Poster Pangan 2026</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[14px] font-semibold">Contoh penyelenggara</span>
        <span className="stamp inline-flex h-7 items-center gap-1.5 rounded-pill border border-success-line bg-success-soft px-2.5 text-[12.5px] font-semibold text-success" style={{ '--d': '700ms' } as CSSProperties}>
          <ShieldCheck className="size-3.5" /> Ditinjau moderator
        </span>
      </span>
      <span className="tour-in relative inline-flex items-center gap-1.5 self-start text-[13.5px] font-medium text-ink-soft" style={t(1500)}>
        Pengumuman resmi di situs penyelenggara <ExternalLink className="size-3.5" />
        <span className="grow-x absolute -bottom-1 left-0 h-[3px] w-full rounded-pill bg-highlight" style={{ animationDelay: '1800ms' }} />
      </span>
      <span className="tour-in flex items-end justify-between gap-4 border-t border-line pt-4" style={t(2300)}>
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[40px] font-bold leading-none tracking-[-0.045em] tabular-nums">5</span>
          <span className="text-[15px] font-medium text-ink-soft">hari lagi</span>
        </span>
        <span className="text-[12.5px] text-ink-muted">Tutup pukul 23.59 WIB</span>
      </span>
    </div>
  );
}

function RemindStage() {
  return (
    <div className="flex flex-col gap-3">
      <div className="tour-in flex items-center justify-between gap-3 rounded-card border border-line bg-panel px-4 py-3.5 shadow-card">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold">Lomba Desain Poster Pangan 2026</span>
          <span className="text-[12.5px] text-ink-muted">Contoh penyelenggara</span>
        </span>
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-pill border border-line bg-panel">
          <Bookmark className="tour-out size-4 text-ink-muted" style={t(900)} />
          <span className="tour-in absolute inset-0 flex items-center justify-center" style={t(900)}>
            <Bookmark className="save-pop size-4 fill-current text-brand" style={{ animationDelay: '900ms' }} />
          </span>
        </span>
      </div>
      <div className="tour-in flex items-center gap-2 self-end text-[13px] font-semibold text-ink-soft" style={t(1500)}>
        <Bell className="sweep size-4" /> Pengingat aktif
      </div>
      {[
        { when: 'H-3', text: 'Tutup 3 hari lagi — siapkan berkasnya.', delay: 2100, tone: 'due-ramp' },
        { when: 'H-1', text: 'Tutup besok pukul 23.59 WIB.', delay: 3200, tone: 'bg-brand text-on-brand' },
      ].map((note) => (
        <div key={note.when} className="tour-in flex items-center gap-3 rounded-card border border-line bg-panel px-4 py-3 shadow-raised" style={t(note.delay)}>
          <span className={cn('flex h-7 shrink-0 items-center rounded-[6px] px-2 text-xs font-bold tabular-nums', note.tone)} style={{ '--ramp': 0.571 } as CSSProperties}>
            {note.when}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-semibold">Lomba Desain Poster Pangan 2026</span>
            <span className="truncate text-[12.5px] text-ink-muted">{note.text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function TrackStage() {
  const labels = ['Disimpan', 'Sudah daftar', 'Seleksi', 'Diterima'];
  return (
    <div className="tour-in flex flex-col gap-5 rounded-[18px] border border-line bg-panel p-5 shadow-card sm:p-6">
      <span className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-[15.5px] font-semibold">Lomba Desain Poster Pangan 2026</span>
          <span className="text-[12.5px] text-ink-muted">Papan lamaran</span>
        </span>
        <span className="relative h-8">
          <span className="tour-out inline-flex h-8 items-center rounded-pill bg-panel-nested px-3 text-[12.5px] font-semibold" style={t(2700)}>
            Sudah daftar
          </span>
          <span
            className="stamp absolute right-0 top-0 inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-pill bg-brand px-3 text-[12.5px] font-semibold text-on-brand"
            style={{ '--d': '2800ms' } as CSSProperties}
          >
            <Check className="size-3.5" strokeWidth={2.6} /> Diterima
          </span>
        </span>
      </span>
      <ol className="grid grid-cols-4 gap-1.5">
        {labels.map((label, index) => (
          <li key={label} className="flex flex-col gap-2">
            <span className="h-1.5 overflow-hidden rounded-pill bg-line">
              <span className="grow-x block h-full bg-brand" style={{ animationDelay: `${300 + index * 700}ms` }} />
            </span>
            <span className="tour-in text-[11.5px] font-medium text-ink-muted sm:text-[12.5px]" style={t(300 + index * 700)}>
              {label}
            </span>
          </li>
        ))}
      </ol>
      <span className="tour-in rounded-card bg-panel-nested px-4 py-3 text-[13px] text-ink-soft" style={t(3300)}>
        Langkah berikutnya: isi hasilnya di portofolio kalau ingin tampil di profilmu.
      </span>
    </div>
  );
}

function TeamStage() {
  const blips = [
    { x: '24%', y: '30%' },
    { x: '70%', y: '24%' },
    { x: '62%', y: '68%' },
    { x: '30%', y: '72%' },
  ];
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <span className="absolute inset-0 rounded-pill border border-line-strong/70 bg-panel" />
        <span className="absolute inset-[18%] rounded-pill border border-dashed border-line-strong/70" />
        <span className="radar-ping absolute inset-0 rounded-pill border-2 border-ink/30" />
        <span className="radar-ping absolute inset-0 rounded-pill border-2 border-ink/30" style={{ '--d': '1200ms' } as CSSProperties} />
        <span className="radar-sweep absolute inset-0 rounded-pill [background:conic-gradient(from_0deg,transparent_0deg,color-mix(in_oklab,var(--color-highlight)_55%,transparent)_40deg,transparent_70deg)]" />
        <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-pill bg-brand text-[11px] font-bold text-on-brand">
          Kamu
        </span>
        {blips.map((blip, index) => (
          <span
            key={blip.x + blip.y}
            className="blip absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-panel bg-ink"
            style={{ left: blip.x, top: blip.y, '--i': index } as CSSProperties}
          />
        ))}
      </div>
      <div className="tour-in flex flex-col gap-3 rounded-[18px] border border-line bg-panel p-5 shadow-card" style={t(2200)}>
        <span className="flex items-center gap-3">
          <svg viewBox="0 0 44 44" className="size-12 shrink-0 -rotate-90">
            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-border)" strokeWidth="4" />
            <circle
              className="ring-fill"
              cx="22"
              cy="22"
              r="18"
              fill="none"
              stroke="var(--color-text-primary)"
              strokeWidth="4"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="86 100"
              style={{ '--d': '2400ms' } as CSSProperties}
            />
          </svg>
          <span className="flex flex-col">
            <span className="font-display text-[22px] font-bold leading-none tabular-nums">86% cocok</span>
            <span className="text-[12.5px] text-ink-muted">Contoh rekan · D4/S1</span>
          </span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {['Desain UI/UX', 'Riset pengguna'].map((skill, index) => (
            <span key={skill} className="tour-in inline-flex h-7 items-center rounded-pill bg-highlight-soft px-2.5 text-[12.5px] font-semibold text-ink" style={t(2700 + index * 150)}>
              {skill}
            </span>
          ))}
        </span>
        <span className="tour-in inline-flex h-10 items-center justify-center gap-2 self-start rounded-pill bg-brand px-4 text-[13.5px] font-semibold text-on-brand" style={t(3200)}>
          <UserPlus className="size-4" /> Ajak satu tim
        </span>
      </div>
    </div>
  );
}
