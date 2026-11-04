'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Bell, Bookmark, Check, Clock, Pause, Play, Search, ShieldCheck, ExternalLink, UserPlus } from 'lucide-react';
import { isMotionReduced } from '@/lib/motion-pref';
import { cn } from '@/lib/utils';

/**
 * Tur beranda (ADR-065, menggantikan penghapusan tur di ADR-056 atas
 * permintaan pemilik — sebagai bagian identitas merek).
 *
 * Yang berbeda dari tur lama, dan alasannya:
 * - Panggungnya kertas berlabel "Contoh tampilan", BUKAN mockup peramban
 *   palsu: tur adalah penjelasan, bukan tangkapan layar yang mengaku asli.
 * - Hanya fitur yang ada di produksi (cari & saring, sumber & moderasi,
 *   simpan + pengingat H-3/H-1, papan lamaran, pencocokan tim). Pesan,
 *   ruang diskusi, dan persiapan berkas hanya ada di mode demo → tidak
 *   dijanjikan di sini.
 * - Dibangun dari token & kosakata komponen produk (label tenggat bergradien,
 *   chip bercentang, bilah tahap), jadi ikut tema gelap dan tidak basi
 *   sendirian ketika gaya produk berubah.
 *
 * Aksesibilitas: daftar langkah = pola tab (panah/Home/End), panggung
 * `aria-hidden` dengan keterangan langkah yang dibacakan. Berjalan sendiri
 * hanya saat terlihat, tab peramban aktif, dan gerak tidak dikurangi; ada
 * tombol jeda (WCAG 2.2.2). Memilih langkah sendiri = jeda (pengguna yang
 * memegang kendali). Tanpa JavaScript: langkah pertama tampil utuh dan
 * deskripsi semua langkah tetap terbaca.
 */

interface Step {
  readonly title: string;
  readonly detail: string;
  readonly caption: string;
}

const STEPS: readonly Step[] = [
  {
    title: 'Cari & saring',
    detail: 'Ketik kata kunci, persempit dengan jenjang dan biaya.',
    caption: 'Mencari "lomba desain", lalu menyaring jenjang SMA/SMK dan yang gratis. Hasil urut dengan sisa waktunya.',
  },
  {
    title: 'Cek sumbernya',
    detail: 'Setiap kegiatan ditinjau moderator dan menautkan pengumuman resmi.',
    caption: 'Halaman kegiatan menampilkan tanda ditinjau moderator, tautan ke pengumuman resmi, dan sisa hari pendaftaran.',
  },
  {
    title: 'Simpan & diingatkan',
    detail: 'Simpan sekali ketuk; pengingat datang H-3 dan H-1.',
    caption: 'Kegiatan disimpan, lalu notifikasi pengingat muncul tiga hari dan satu hari sebelum tutup.',
  },
  {
    title: 'Pantau lamaranmu',
    detail: 'Satu papan dari Disimpan sampai Diterima.',
    caption: 'Bilah tahap maju dari Disimpan, Sudah daftar, Seleksi, sampai Diterima.',
  },
  {
    title: 'Temukan tim',
    detail: 'Isi kartu pemain; pencocokan mencarikan rekan yang melengkapi.',
    caption: 'Radar pencocokan menemukan rekan dengan keahlian yang kamu cari, lengkap dengan persentase kecocokan.',
  },
];

const STEP_MS = 5600;
const t = (ms: number, extra?: Record<string, string | number>) => ({ '--t': `${ms}ms`, ...extra }) as CSSProperties;

export function LandingTour() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
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

  const select = (index: number, focus = false) => {
    setStep(index);
    setPlaying(false);
    if (focus) tabRefs.current[index]?.focus();
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = STEPS.length - 1;
    const next =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? (index + 1) % STEPS.length
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? (index - 1 + STEPS.length) % STEPS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  };

  const togglePlay = () => {
    if (!playing && isMotionReduced()) {
      // Gerak dikurangi: tur tidak berjalan sendiri, tombolnya maju satu langkah.
      setStep((current) => (current + 1) % STEPS.length);
      return;
    }
    setPlaying((value) => !value);
  };

  const current = STEPS[step]!;

  return (
    <section ref={rootRef} id="cara-kerja" aria-labelledby="tur-title" className="container-page max-w-[1120px] scroll-mt-20 pt-[clamp(72px,9vw,112px)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="tur-title" className="text-[clamp(28px,4.4vw,40px)] font-bold leading-[1.1] tracking-[-0.03em]">
            Cara kerja StudentFo
          </h2>
          <p className="max-w-[48ch] text-[16px] leading-relaxed text-ink-muted">Lima langkah, dari mencari sampai punya tim.</p>
        </div>
        <button
          type="button"
          onClick={togglePlay}
          className="press inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong/70 bg-panel px-4 text-sm font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested"
        >
          {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
          {playing ? 'Jeda tur' : 'Putar tur'}
        </button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10">
        <div
          role="tablist"
          aria-label="Langkah tur"
          className="relative -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-col lg:overflow-visible"
        >
          {STEPS.map((item, index) => {
            const active = index === step;
            return (
              <button
                key={item.title}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`tur-tab-${index}`}
                aria-selected={active}
                aria-controls="tur-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={(event) => onTabKey(event, index)}
                className={cn(
                  'relative flex min-h-11 shrink-0 flex-col items-start gap-1 overflow-hidden rounded-card border px-4 py-3 text-left transition-colors duration-150 ease-snap lg:shrink',
                  active ? 'border-brand bg-panel shadow-card' : 'border-line bg-panel/60 hover:border-line-strong hover:bg-panel',
                )}
              >
                <span className="flex items-center gap-2.5 text-[15px] font-semibold">
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-pill text-xs font-bold tabular-nums transition-colors duration-150',
                      active ? 'bg-brand text-on-brand' : 'bg-panel-nested text-ink-muted',
                    )}
                  >
                    {index + 1}
                  </span>
                  {item.title}
                </span>
                <span className="hidden pl-[34px] text-[13.5px] leading-snug text-ink-muted lg:block">{item.detail}</span>
                {active && (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-line">
                    <span
                      key={`${step}-${playing}`}
                      className={cn('block h-full bg-brand', playing ? 'tour-progress' : 'w-full')}
                      style={{ '--dur': `${STEP_MS}ms`, animationPlayState: running ? 'running' : 'paused' } as CSSProperties}
                      onAnimationEnd={() => {
                        if (running) setStep((value) => (value + 1) % STEPS.length);
                      }}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id="tur-panel" aria-labelledby={`tur-tab-${step}`} className="min-w-0">
          <p className="sr-only" aria-live="polite">
            Langkah {step + 1} dari {STEPS.length}: {current.title}. {current.caption}
          </p>
          <div aria-hidden className="dot-grid relative overflow-hidden rounded-[24px] border border-line bg-panel-nested p-4 sm:p-6">
            <span className="absolute right-4 top-3 text-[11.5px] font-medium text-ink-muted">Contoh tampilan</span>
            <div key={step} className="flex min-h-[318px] flex-col justify-center pt-4 sm:min-h-[340px]">
              {step === 0 && <SearchStage />}
              {step === 1 && <SourceStage />}
              {step === 2 && <RemindStage />}
              {step === 3 && <TrackStage />}
              {step === 4 && <TeamStage />}
            </div>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-muted lg:hidden">{current.detail}</p>
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
