'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  Bookmark,
  Check,
  FileText,
  Pause,
  Play,
  Search,
  Upload,
} from 'lucide-react';

/**
 * Tur singkat berpemandu (kanvas desain Landing v2, #cara-kerja).
 *
 * Panggungnya digambar di bingkai tetap 880×560 lalu diskalakan ke lebar
 * kolom, supaya koordinat kursor di timeline di bawah tetap berlaku di
 * semua ukuran layar. Seluruh panggung `aria-hidden`: isinya gambaran
 * antarmuka, bukan kontrol. Keterangan tiap langkah dibacakan lewat
 * region `aria-live` terpisah, dan daftar langkah di kiri adalah tombol
 * sungguhan yang bisa dipakai lewat keyboard.
 *
 * Tur hanya berjalan saat terlihat di layar dan tab aktif; dengan
 * prefers-reduced-motion ia berhenti di tampilan penuh tanpa kamera.
 */

interface Beat {
  readonly x: number;
  readonly y: number;
  readonly click?: boolean;
  readonly cap: string;
  readonly set: Readonly<Record<string, string | number>>;
  readonly dur?: number;
  /** [x, y, zoom] titik fokus kamera, kalau berbeda dari posisi kursor. */
  readonly focus?: readonly [number, number, number];
  /** Kamera mundur ke tampilan penuh setelah klik (hasil besar perlu terlihat). */
  readonly hitWide?: boolean;
  readonly wide?: boolean;
}

interface Chapter {
  readonly title: string;
  readonly detail: string;
  readonly url: string;
  readonly beats: readonly Beat[];
}

const CHAPTERS: readonly Chapter[] = [
  {
    title: 'Pilih minat',
    detail: 'Sekali atur, rekomendasi langsung menyesuaikan.',
    url: 'mulai',
    beats: [
      { x: 288, y: 212, click: true, cap: 'Pilih bidang yang kamu minati. Boleh lebih dari satu.', set: { desain: 1 } },
      { x: 440, y: 212, click: true, cap: 'Pilih bidang yang kamu minati. Boleh lebih dari satu.', set: { tek: 1 }, dur: 1500 },
      { x: 554, y: 362, click: true, cap: 'Tentukan jenjangmu supaya daftarnya relevan.', set: { mhs: 1 } },
      { x: 602, y: 442, click: true, cap: 'Selesai. Daftar kegiatanmu kini menyesuaikan.', set: {}, hitWide: true, dur: 2600 },
    ],
  },
  {
    title: 'Cari dan filter',
    detail: 'Semua kategori di satu tempat, urut dari tenggat terdekat.',
    url: 'events?type=LOMBA',
    beats: [
      { x: 360, y: 27, click: true, cap: 'Cari dengan kata kunci, atau biarkan filter minatmu bekerja.', set: { focus: 1 }, dur: 1700 },
      { x: 360, y: 27, cap: 'Cari dengan kata kunci, atau biarkan filter minatmu bekerja.', set: { q: 'UI/' }, dur: 700 },
      { x: 360, y: 27, cap: 'Hasil langsung tersaring, urut dari tenggat terdekat.', set: { q: 'UI/UX', filtered: 1 }, focus: [440, 270, 1.15], dur: 2600 },
      { x: 320, y: 244, click: true, cap: 'Buka detail untuk melihat syarat dan jadwal.', set: { open: 1 }, dur: 2000 },
    ],
  },
  {
    title: 'Cek dan simpan',
    detail: 'Lihat penyelenggara dan syarat, lalu simpan.',
    url: 'events/hackathon-layanan-publik',
    beats: [
      { x: 291, y: 151, cap: 'Tanda ini berarti kegiatannya sudah ditinjau manual sebelum tayang.', set: { badge: 1 }, dur: 2600 },
      { x: 167, y: 201, click: true, cap: 'Syarat, berkas, dan jadwal ada di bagiannya masing-masing.', set: { tab: 1 } },
      { x: 722, y: 372, click: true, cap: 'Simpan, lalu kami ingatkan H-3 dan H-1 sebelum tutup.', set: { saved: 1 }, dur: 2600 },
      { x: 722, y: 322, click: true, cap: 'Sudah siap? Tekan Daftar.', set: {}, dur: 1600 },
    ],
  },
  {
    title: 'Daftar',
    detail: 'Formulir terisi dari profilmu. Tinggal unggah berkas.',
    url: 'events/hackathon-layanan-publik/persiapan',
    beats: [
      { x: 300, y: 180, cap: 'Data dari profilmu terisi otomatis.', set: { fill: 1 }, focus: [296, 230, 1.2], dur: 2800 },
      { x: 500, y: 400, click: true, cap: 'Siapkan berkas yang diminta penyelenggara.', set: { up: 1 }, dur: 2200 },
      { x: 480, y: 474, click: true, cap: 'Selesai. Tahapannya bisa kamu pantau kapan saja.', set: { sent: 1 }, hitWide: true, dur: 3000 },
    ],
  },
  {
    title: 'Cari tim',
    detail: 'Temukan rekan yang keahliannya melengkapi kamu.',
    url: 'teams',
    beats: [
      { x: 432, y: 200, cap: 'Lihat peran dan keahlian calon rekan.', set: { hover: 1 }, focus: [432, 240, 1.3], dur: 2200 },
      { x: 432, y: 344, click: true, cap: 'Kirim ajakan. Kalau diterima, ia masuk ke timmu.', set: { inv: 1 }, dur: 2400 },
      { x: 300, y: 450, cap: 'Itu saja. Sekarang giliranmu mencoba.', set: {}, wide: true, dur: 3200 },
    ],
  },
];

const CHIPS = ['Desain', 'Teknologi', 'Sains', 'Bisnis', 'Seni', 'Sosial'] as const;
const ROWS = [
  ['HL', 'Hackathon Layanan Publik 2026', 'Contoh penyelenggara', 'Desain', '3 hari lagi'],
  ['LP', 'Lomba Desain Poster Pangan', 'Contoh penyelenggara', 'Desain', '9 hari lagi'],
  ['AM', 'Kompetisi Aplikasi Mobile', 'Contoh penyelenggara', 'Teknologi', '14 hari lagi'],
  ['SC', 'Hackathon Kota Cerdas', 'Contoh penyelenggara', 'Teknologi', '21 hari lagi'],
] as const;
const REQS = ['Mahasiswa aktif D3 atau S1', 'Tim berisi 2 sampai 4 orang', 'Proposal karya dalam PDF', 'Surat keterangan aktif kuliah'];
const BENEFITS = ['Hadiah dan sertifikat', 'Mentoring dari juri', 'Jalur magang'];
const FIELDS = [
  ['Nama lengkap', 'Rania Aulia'],
  ['Kampus', 'Universitas Contoh · Desain Produk'],
  ['Email', 'rania@contoh.ac.id'],
] as const;
const PEOPLE = [
  ['DP', 'Dimas Pratama', 'Frontend developer', ['React', 'Figma']],
  ['SN', 'Salsa Nabila', 'UX researcher', ['Riset pengguna', 'Figma']],
  ['BA', 'Bima Aditya', 'Copywriter', ['Pitching', 'Riset']],
] as const;

const INK = '#191919';
const MUTED = '#5F5E5B';
const LINE = '#E3E3E0';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function LandingTour() {
  const [chapter, setChapter] = useState(0);
  const [beat, setBeat] = useState(0);
  const [hit, setHit] = useState(false);
  const [press, setPress] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [scale, setScale] = useState(0.8);
  const [wide, setWide] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(reduce);
    if (reduce) {
      setPlaying(false);
      setHit(true);
    }
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const resize = new ResizeObserver(() => {
      if (el.clientWidth) setScale(el.clientWidth / 880);
    });
    resize.observe(el);
    const visible = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? false), {
      threshold: 0.3,
    });
    visible.observe(el);
    const onVisibility = () => {
      if (document.hidden) setInView(false);
      else setInView(el.getBoundingClientRect().top < window.innerHeight);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      resize.disconnect();
      visible.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Satu efek menggerakkan seluruh timeline: setiap perubahan bab/beat/
  // status putar menjadwal ulang klik & perpindahan berikutnya.
  const enteringChapter = useRef(true);
  useEffect(() => {
    clearTimers();
    if (!playing || !inView) return;
    const current = CHAPTERS[chapter]?.beats[beat];
    if (!current) return;
    let extra = 0;
    if (enteringChapter.current) {
      // Setiap bab dibuka dengan tampilan penuh sebelum kamera mendekat.
      extra = 700;
      enteringChapter.current = false;
      setWide(true);
      later(() => setWide(false), extra);
    }
    later(() => {
      setHit(true);
      setPress(Boolean(current.click));
      later(() => setPress(false), 70);
    }, (current.click ? 1000 : 400) + extra);
    later(() => {
      const nextBeat = beat + 1;
      setHit(false);
      setPress(false);
      if (nextBeat >= (CHAPTERS[chapter]?.beats.length ?? 0)) {
        enteringChapter.current = true;
        setBeat(0);
        setChapter((chapter + 1) % CHAPTERS.length);
      } else {
        setBeat(nextBeat);
      }
    }, (current.dur ?? 2400) + extra);
    return clearTimers;
  }, [chapter, beat, playing, inView, clearTimers, later]);

  const jump = (index: number) => {
    enteringChapter.current = true;
    setChapter(index);
    setBeat(0);
    setHit(false);
    setPress(false);
    setPlaying(true);
  };

  const current = CHAPTERS[chapter]!;
  const bt = current.beats[beat]!;
  const state: Record<string, string | number> = {};
  current.beats.slice(0, beat).forEach((b) => Object.assign(state, b.set));
  if (hit) Object.assign(state, bt.set);

  const captionBelow = scale < 0.66;
  let zoom = bt.focus ? bt.focus[2] : 1.5;
  let fx = bt.focus ? bt.focus[0] : bt.x;
  let fy = bt.focus ? bt.focus[1] : bt.y;
  if (captionBelow) zoom *= 1.25;
  if (bt.wide || (hit && bt.hitWide) || wide || reducedMotion) {
    zoom = 1;
    fx = 440;
    fy = 280;
  }
  const ox = clamp(fx - 440 / zoom, 0, 880 - 880 / zoom);
  const oy = clamp(fy - 280 / zoom, 0, 560 - 560 / zoom);
  const camDur = zoom === 1 ? 1100 : 1000;
  const camTransition = `transform ${camDur}ms cubic-bezier(.65,0,.25,1)`;
  const move = '850ms cubic-bezier(.65,0,.25,1)';
  const screenX = (bt.x - ox) * zoom;
  const screenY = (bt.y - oy) * zoom;

  const live = playing && inView;
  const progressDur = (bt.dur ?? 2400) + (beat === 0 ? 700 : 0);
  const progressPct = `${Math.round(((live ? beat + 1 : beat + (hit ? 1 : 0)) / current.beats.length) * 100)}%`;
  const progressTransition = live ? `width ${progressDur}ms linear` : 'width 300ms ease';

  const selected = (on: boolean) => ({
    background: on ? INK : '#fff',
    color: on ? '#fff' : INK,
    borderColor: on ? INK : LINE,
  });
  const screen = (index: number): CSSProperties => ({
    position: 'absolute',
    inset: 0,
    width: 880,
    height: 560,
    opacity: chapter === index ? 1 : 0,
    transition: 'opacity 450ms ease',
  });
  const abs = (left: number, top: number, extra: CSSProperties = {}): CSSProperties => ({
    position: 'absolute',
    left,
    top,
    ...extra,
  });

  const playButton = (
    <button
      type="button"
      onClick={() => setPlaying((value) => !value)}
      className="flex min-h-11 items-center gap-2 rounded-sm border border-line-strong/70 px-3.5 text-sm font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested"
    >
      {playing ? <Pause aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-3.5 fill-current" />}
      {playing ? 'Jeda tur' : 'Putar tur'}
    </button>
  );
  const tryButton = (
    <Link
      href="/register"
      className="flex min-h-11 items-center rounded-sm bg-brand px-3.5 text-sm font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover"
    >
      Coba sendiri
    </Link>
  );

  return (
    <div className="mt-14 flex flex-wrap items-start gap-8">
      {/* Daftar langkah: kolom di layar lebar, bilah segmen di layar sempit. */}
      <div className="flex min-w-0 basis-full flex-col gap-4 min-[920px]:hidden">
        <div className="grid grid-cols-5 gap-1.5">
          {CHAPTERS.map((c, index) => {
            const on = index === chapter;
            const done = index < chapter;
            return (
              <button
                key={c.title}
                type="button"
                onClick={() => jump(index)}
                aria-current={on ? 'step' : undefined}
                aria-label={`Langkah ${index + 1}: ${c.title}`}
                className="flex min-h-11 flex-col justify-end gap-2 py-1 text-left"
              >
                <span className={`font-mono text-xs ${on ? 'text-ink' : 'text-ink-soft'}`}>0{index + 1}</span>
                <span className="block h-[3px] overflow-hidden rounded-[2px] bg-line">
                  <span
                    className="block h-full bg-brand"
                    style={{ width: on ? progressPct : done ? '100%' : '0%', transition: on ? progressTransition : 'width 300ms ease' }}
                  />
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[17px] font-semibold tracking-[-0.01em]">{current.title}</span>
          <span className="text-[14.5px] leading-normal text-ink-muted">{current.detail}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {playButton}
          {tryButton}
        </div>
      </div>

      <div data-reveal="" style={{ ['--reveal-delay' as string]: '100ms' }} className="hidden max-w-[300px] flex-[1_1_240px] flex-col gap-1 min-[920px]:flex">
        {CHAPTERS.map((c, index) => {
          const on = index === chapter;
          const done = index < chapter;
          return (
            <button
              key={c.title}
              type="button"
              onClick={() => jump(index)}
              aria-current={on ? 'step' : undefined}
              className={`flex gap-3.5 rounded-[12px] p-3.5 text-left transition-colors duration-200 ease-snap hover:bg-panel-nested ${on ? 'bg-panel-nested' : ''}`}
            >
              <span
                className={`flex size-[30px] shrink-0 items-center justify-center rounded-pill border border-brand font-mono text-xs transition-colors duration-200 ${on || done ? 'bg-brand text-on-brand' : 'bg-panel text-ink'}`}
              >
                0{index + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className={`text-[15px] font-semibold ${on ? 'text-ink' : 'text-ink-soft'}`}>{c.title}</span>
                <span className="text-[13.5px] leading-snug text-ink-muted">{c.detail}</span>
                <span className={`mt-2 block h-0.5 overflow-hidden rounded-[1px] ${on ? 'bg-line' : 'bg-transparent'}`}>
                  <span className="block h-full bg-brand" style={{ width: on ? progressPct : '0%', transition: on ? progressTransition : 'none' }} />
                </span>
              </span>
            </button>
          );
        })}
        <div className="mt-4 flex flex-wrap items-center gap-2 px-3.5">
          {playButton}
          {tryButton}
        </div>
      </div>

      <div
        data-reveal="scale"
        style={{ ['--reveal-delay' as string]: '200ms' }}
        className="min-w-0 flex-[3_1_520px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,.04),0_16px_40px_rgba(0,0,0,.06)]"
      >
        <div aria-hidden className="flex h-10 items-center gap-2 border-b border-[#EDEDEB] bg-[#FBFBFA] px-4">
          <span className="size-2.5 rounded-pill bg-[#E3E3E0]" />
          <span className="size-2.5 rounded-pill bg-[#E3E3E0]" />
          <span className="size-2.5 rounded-pill bg-[#E3E3E0]" />
          <span className="ml-2.5 truncate text-[12.5px] text-[#5F5E5B]">studentfo.id/{current.url}</span>
          <span className="ml-auto flex items-center gap-2 whitespace-nowrap text-xs text-[#5F5E5B]">
            <span className="relative size-[7px]">
              <span className="absolute inset-0 rounded-pill bg-[#191919]" />
              {live && <span className="absolute inset-0 rounded-pill bg-[#191919]" style={{ animation: 'sf-pulse-ring 2.4s ease-out infinite' }} />}
            </span>
            {playing ? 'Tur berjalan' : 'Tur dijeda'}
          </span>
        </div>

        <p aria-live="polite" className="sr-only">
          Langkah {chapter + 1} dari {CHAPTERS.length}: {bt.cap}
        </p>

        <div
          ref={stageRef}
          aria-hidden
          className="relative w-full overflow-hidden bg-white"
          style={{ height: Math.round(560 * scale) }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 880,
              height: 560,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              color: INK,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: 880,
                height: 560,
                transform: `translate(${(-ox * zoom).toFixed(1)}px,${(-oy * zoom).toFixed(1)}px) scale(${zoom.toFixed(3)})`,
                transformOrigin: '0 0',
                transition: camTransition,
                willChange: 'transform',
              }}
            >
              {/* Bilah atas aplikasi */}
              <div style={abs(0, 0, { width: 880, height: 52, borderBottom: '1px solid #EDEDEB', display: 'flex', alignItems: 'center', padding: '0 20px', background: '#fff', boxSizing: 'border-box' })}>
                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.03em' }}>StudentFo</span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18, fontSize: 13, color: MUTED }}>
                  <span>Jelajah</span>
                  <span>Tersimpan</span>
                  <Bell size={16} strokeWidth={1.6} />
                </span>
              </div>
              <div
                style={abs(200, 10, {
                  width: 320,
                  height: 32,
                  boxSizing: 'border-box',
                  borderRadius: 8,
                  border: `1px solid ${chapter === 1 && state.focus ? INK : LINE}`,
                  background: '#FBFBFA',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 12px',
                  fontSize: 13,
                  color: chapter === 1 && state.q ? INK : '#8F8E89',
                  transition: 'border-color 200ms ease',
                })}
              >
                <Search size={15} strokeWidth={1.6} />
                <span>{chapter === 1 && state.q ? String(state.q) : 'Cari lomba, beasiswa, magang…'}</span>
                <span style={{ width: 1, height: 14, marginLeft: -6, background: INK, opacity: chapter === 1 && state.focus ? 1 : 0 }} />
              </div>
              <span style={abs(616, 10, { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: INK, color: '#fff', fontSize: 11.5, fontWeight: 600 })}>RA</span>

              {/* 1 — Pilih minat */}
              <div style={screen(0)}>
                <div style={abs(0, 52, { width: 880, height: 508, background: '#FBFBFA' })} />
                <div style={abs(190, 76, { width: 500, height: 424, boxSizing: 'border-box', border: `1px solid ${LINE}`, borderRadius: 16, background: '#fff', boxShadow: '0 12px 32px rgba(0,0,0,.05)' })} />
                <span style={abs(218, 104, { fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' })}>Apa yang kamu minati?</span>
                <span style={abs(218, 140, { fontSize: 13.5, color: MUTED })}>Pilih minimal satu. Bisa diubah kapan saja.</span>
                <div style={abs(218, 190, { width: 444, display: 'grid', gridTemplateColumns: 'repeat(3,140px)', gridAutoRows: 44, gap: 12 })}>
                  {CHIPS.map((chip) => {
                    const on = (chip === 'Desain' && Boolean(state.desain)) || (chip === 'Teknologi' && Boolean(state.tek));
                    return (
                      <span key={chip} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box', borderRadius: 10, border: '1px solid', ...selected(on), fontSize: 14, fontWeight: 600, transition: 'background 220ms ease,color 220ms ease' }}>
                        {on && <Check size={13} strokeWidth={2.4} />}
                        {chip}
                      </span>
                    );
                  })}
                </div>
                <span style={abs(218, 316, { fontSize: 13, color: MUTED })}>Jenjang</span>
                <div style={abs(218, 340, { width: 444, height: 44, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 })}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 14, fontWeight: 600, color: MUTED }}>SMA/SMK</span>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid', ...selected(Boolean(state.mhs)), fontSize: 14, fontWeight: 600, transition: 'background 220ms ease,color 220ms ease' }}>Mahasiswa</span>
                </div>
                <span style={abs(218, 434, { fontSize: 12.5, color: '#77766F' })}>Langkah 1 dari 2</span>
                <span style={abs(542, 420, { width: 120, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: state.desain && state.mhs ? INK : '#BDBDB8', color: '#fff', fontSize: 14, fontWeight: 600, transition: 'background 220ms ease' })}>Lanjut</span>
              </div>

              {/* 2 — Cari dan filter */}
              <div style={screen(1)}>
                <span style={abs(32, 72, { fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' })}>Info lomba</span>
                <div style={abs(32, 112, { display: 'flex', gap: 22, fontSize: 13.5, fontWeight: 500, color: '#77766F' })}>
                  <span style={{ color: INK, fontWeight: 600, paddingBottom: 10, boxShadow: `inset 0 -2px 0 ${INK}` }}>Lomba</span>
                  <span>Beasiswa</span>
                  <span>Magang</span>
                  <span>Workshop</span>
                  <span>Seminar</span>
                </div>
                <span style={abs(32, 143, { width: 816, height: 1, background: '#EDEDEB' })} />
                <div style={abs(32, 160, { width: 816, display: 'flex', alignItems: 'center', gap: 8 })}>
                  {['Desain', 'Teknologi', 'Mahasiswa'].map((tag) => (
                    <span key={tag} style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 10px', borderRadius: 7, background: INK, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>{tag}</span>
                  ))}
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: MUTED }}>
                    {state.filtered ? '1 hasil untuk "UI/UX"' : '4 lomba cocok dengan minatmu'} · Tenggat terdekat
                  </span>
                </div>
                <div style={abs(32, 208, { width: 816, display: 'flex', flexDirection: 'column' })}>
                  {ROWS.map((row, index) => (
                    <div key={row[0]} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px 110px', alignItems: 'center', gap: 16, height: 72, padding: '0 14px', boxSizing: 'border-box', borderBottom: '1px solid #F1F1EF', borderRadius: 10, background: state.open && index === 0 ? '#F4F4F2' : '#fff', opacity: state.filtered && index > 0 ? 0.25 : 1, transition: 'opacity 400ms ease,background 240ms ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${LINE}`, fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0 }}>{row[0]}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                          <span style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row[1]}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: MUTED }}>{row[2]}<BadgeCheck size={13} strokeWidth={1.6} /></span>
                        </span>
                      </div>
                      <span style={{ fontSize: 13, color: MUTED }}>{row[3]}</span>
                      <span style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', height: 24, padding: '0 9px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: index === 0 ? INK : '#F1F1EF', color: index === 0 ? '#fff' : MUTED }}>{row[4]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3 — Cek dan simpan */}
              <div style={screen(2)}>
                <span style={abs(32, 70, { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: MUTED })}><ArrowLeft size={13} strokeWidth={1.6} />Info lomba</span>
                <span style={abs(32, 92, { width: 540, fontSize: 26, fontWeight: 700, letterSpacing: '-0.035em' })}>Hackathon Layanan Publik 2026</span>
                <span style={abs(32, 138, { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, boxSizing: 'border-box', borderRadius: 6, border: `1px solid ${INK}`, fontFamily: 'var(--font-mono)', fontSize: 10 })}>HL</span>
                <span style={abs(66, 142, { fontSize: 13.5, fontWeight: 600 })}>Contoh penyelenggara</span>
                <span style={abs(232, 138, { display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 13, border: `1px solid ${INK}`, fontSize: 12, fontWeight: 600, background: '#fff', boxShadow: state.badge ? '0 0 0 5px rgba(25,25,25,.12)' : '0 0 0 0 rgba(25,25,25,0)', transition: 'box-shadow 300ms ease' })}><BadgeCheck size={14} strokeWidth={1.6} />Terverifikasi</span>
                <span style={abs(32, 188, { width: 90, fontSize: 13.5, fontWeight: 600, color: state.tab ? '#77766F' : INK, transition: 'color 200ms ease' })}>Ringkasan</span>
                <span style={abs(132, 188, { width: 70, fontSize: 13.5, fontWeight: 600, textAlign: 'center', color: state.tab ? INK : '#77766F', transition: 'color 200ms ease' })}>Syarat</span>
                <span style={abs(212, 188, { width: 80, fontSize: 13.5, fontWeight: 600, textAlign: 'center', color: '#77766F' })}>Tahapan</span>
                <span style={abs(32, 216, { width: 528, height: 1, background: '#EDEDEB' })} />
                <span style={abs(state.tab ? 132 : 32, 215, { width: state.tab ? 70 : 90, height: 2, background: INK, transition: 'left 320ms ease,width 320ms ease' })} />
                <div style={abs(32, 236, { width: 528, display: 'flex', flexDirection: 'column', gap: 12, opacity: state.tab ? 0 : 1, transition: 'opacity 300ms ease' })}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Yang kamu dapat</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {BENEFITS.map((benefit) => (
                      <span key={benefit} style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 96, padding: 14, boxSizing: 'border-box', borderRadius: 10, background: '#F7F7F5', fontSize: 13, fontWeight: 600 }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: INK, color: '#fff' }}><Check size={13} strokeWidth={2.4} /></span>
                        {benefit}
                      </span>
                    ))}
                  </div>
                  <span style={{ fontSize: 13, lineHeight: 1.6, color: MUTED }}>Rancang solusi digital untuk layanan publik dalam 48 jam. Terbuka untuk tim mahasiswa dari seluruh Indonesia.</span>
                </div>
                <div style={abs(32, 236, { width: 528, display: 'flex', flexDirection: 'column', opacity: state.tab ? 1 : 0, transition: 'opacity 300ms ease' })}>
                  {REQS.map((req) => (
                    <span key={req} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 48, borderBottom: '1px solid #EDEDEB', fontSize: 13.5 }}>
                      <span style={{ width: 18, height: 18, boxSizing: 'border-box', borderRadius: 5, border: '1.5px solid #BDBDB8' }} />
                      {req}
                    </span>
                  ))}
                </div>
                <div style={abs(596, 72, { width: 252, height: 340, boxSizing: 'border-box', border: `1px solid ${LINE}`, borderRadius: 14, boxShadow: '0 12px 28px rgba(0,0,0,.05)' })} />
                <span style={abs(616, 92, { fontSize: 12.5, color: MUTED })}>Pendaftaran tutup dalam</span>
                <span style={abs(616, 114, { fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, letterSpacing: '-0.03em' })}>03 hari 14 jam</span>
                <div style={abs(616, 170, { width: 212, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: '1px solid #EDEDEB', fontSize: 13 })}>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Biaya</span><span style={{ fontWeight: 600 }}>Gratis</span></span>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Ukuran tim</span><span style={{ fontWeight: 600 }}>2–4 orang</span></span>
                </div>
                <span style={abs(612, 300, { width: 220, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: INK, color: '#fff', fontSize: 14, fontWeight: 600 })}>Daftar sekarang</span>
                <span style={abs(612, 352, { width: 220, height: 40, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10, border: '1px solid #DADAD7', background: state.saved ? '#F4F4F2' : '#fff', fontSize: 13.5, fontWeight: 600, transition: 'background 220ms ease' })}>
                  <Bookmark size={15} strokeWidth={1.6} fill={state.saved ? 'currentColor' : 'none'} />
                  {state.saved ? 'Tersimpan' : 'Simpan'}
                </span>
                <span style={abs(290, 480, { width: 300, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, background: INK, color: '#fff', fontSize: 13, fontWeight: 500, opacity: state.saved ? 1 : 0, transform: state.saved ? 'none' : 'translateY(12px)', transition: 'opacity 350ms ease,transform 350ms cubic-bezier(.2,.65,.2,1)' })}>
                  <Bell size={16} strokeWidth={1.6} />
                  Pengingat H-3 dan H-1 aktif
                </span>
              </div>

              {/* 4 — Daftar */}
              <div style={screen(3)}>
                <span style={abs(32, 70, { fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' })}>Persiapan pendaftaran</span>
                <span style={abs(32, 104, { fontSize: 12.5, color: MUTED })}>Hackathon Layanan Publik 2026 · Langkah 2 dari 3</span>
                <div style={abs(32, 136, { width: 528, display: 'flex', flexDirection: 'column', gap: 12 })}>
                  {FIELDS.map((field, index) => (
                    <div key={field[0]} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ height: 18, fontSize: 12.5, color: MUTED }}>{field[0]}</span>
                      <span style={{ display: 'grid', alignItems: 'center', height: 40, padding: '0 12px', boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${LINE}` }}>
                        <span style={{ gridArea: '1/1', height: 8, width: '40%', borderRadius: 4, background: '#EDEDEB', opacity: state.fill ? 0 : 1, transition: `opacity 300ms ease ${index * 320}ms` }} />
                        <span style={{ gridArea: '1/1', fontSize: 13.5, fontWeight: 500, opacity: state.fill ? 1 : 0, transition: `opacity 400ms ease ${index * 320}ms` }}>{field[1]}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div style={abs(32, 372, { width: 528, height: 56, boxSizing: 'border-box', borderRadius: 10, border: '1px dashed #BDBDB8', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', overflow: 'hidden' })}>
                  <FileText size={18} strokeWidth={1.6} color={MUTED} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>Proposal karya (PDF)</span>
                    <span style={{ fontSize: 12, color: '#77766F' }}>{state.up ? 'proposal-tim.pdf · 2,4 MB' : 'Belum disiapkan'}</span>
                  </span>
                  <span style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: state.up ? '100%' : '0%', background: INK, transition: 'width 1100ms ease' }} />
                </div>
                <span style={abs(452, 382, { width: 96, height: 36, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, border: '1px solid #DADAD7', background: '#fff', fontSize: 13, fontWeight: 600 })}>
                  <Upload size={14} strokeWidth={1.6} />
                  {state.up ? 'Ganti' : 'Unggah'}
                </span>
                <span style={abs(400, 452, { width: 160, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: INK, color: '#fff', fontSize: 14, fontWeight: 600 })}>Tandai siap</span>
                <div style={abs(596, 136, { width: 252, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8, padding: 18, borderRadius: 12, background: '#F7F7F5' })}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>Terisi dari profilmu</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.55, color: MUTED }}>Ubah datanya kapan saja di halaman Profil. Kamu tidak perlu mengetik ulang untuk kegiatan berikutnya.</span>
                </div>
                <div style={abs(0, 52, { width: 880, height: 508, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: state.sent ? 1 : 0, transition: 'opacity 400ms ease' })}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, height: 60, borderRadius: '50%', background: INK, color: '#fff' }}><Check size={26} strokeWidth={2.2} /></span>
                  <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>Berkas siap dikirim</span>
                  <span style={{ fontSize: 13.5, color: MUTED }}>Pantau tahapannya di halaman Pendaftaran saya.</span>
                </div>
              </div>

              {/* 5 — Cari tim */}
              <div style={screen(4)}>
                <span style={abs(32, 70, { fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' })}>Cari tim untuk Hackathon Layanan Publik</span>
                <span style={abs(32, 104, { fontSize: 12.5, color: MUTED })}>Rekan yang keahliannya melengkapi kamu</span>
                <div style={abs(32, 136, { width: 800, display: 'grid', gridTemplateColumns: 'repeat(3,256px)', gap: 16 })}>
                  {PEOPLE.map((person, index) => {
                    const invited = index === 1 && Boolean(state.inv);
                    return (
                      <div key={person[0]} style={{ display: 'flex', flexDirection: 'column', gap: 10, height: 244, padding: 16, boxSizing: 'border-box', borderRadius: 14, border: `1px solid ${index === 1 && state.hover ? INK : LINE}`, background: '#fff', transition: 'border-color 240ms ease' }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: '#F4F4F2', fontSize: 13, fontWeight: 600 }}>{person[0]}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{person[1]}</span>
                          <span style={{ fontSize: 12.5, color: MUTED }}>{person[2]}</span>
                        </span>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {person[3].map((skill) => (
                            <span key={skill} style={{ display: 'flex', alignItems: 'center', height: 24, padding: '0 8px', borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 11.5 }}>{skill}</span>
                          ))}
                        </span>
                        <span style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40, boxSizing: 'border-box', borderRadius: 9, border: `1px solid ${INK}`, background: invited ? '#fff' : INK, color: invited ? INK : '#fff', fontSize: 13, fontWeight: 600, transition: 'background 220ms ease,color 220ms ease' }}>
                          {invited ? 'Ajakan terkirim' : 'Ajak ke tim'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={abs(32, 404, { width: 816, height: 92, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 24, padding: '0 20px', borderRadius: 14, background: '#F7F7F5' })}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>Timmu</span>
                    <span style={{ fontSize: 12, color: MUTED }}>Hackathon Layanan Publik 2026</span>
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(
                      [
                        ['RA', 1],
                        [state.inv ? 'SN' : '', state.inv ? 2 : 0],
                        ['', 0],
                        ['', 0],
                      ] as const
                    ).map(([mono, kind], index) => (
                      <span key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, boxSizing: 'border-box', borderRadius: '50%', border: `1.5px ${kind === 0 ? 'dashed' : 'solid'} ${kind === 0 ? '#BDBDB8' : INK}`, background: kind === 1 ? INK : '#fff', color: kind === 1 ? '#fff' : INK, fontSize: 12, fontWeight: 600, transition: 'all 300ms ease' }}>
                        {mono}
                      </span>
                    ))}
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: MUTED }}>{state.inv ? '1 ajakan menunggu · ' : ''}1 dari 4 anggota</span>
                </div>
              </div>

              {/* Kursor */}
              <div style={abs(bt.x, bt.y, { width: 0, height: 0, transition: `left ${move},top ${move}` })}>
                <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${(1 / Math.sqrt(zoom)).toFixed(3)})`, transition: camTransition }}>
                  <span style={{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: '50%', background: INK, opacity: press ? 0.28 : 0, transform: press ? 'scale(.35)' : 'scale(1.5)', transition: press ? 'none' : 'opacity 520ms ease, transform 520ms ease' }} />
                  <span style={{ position: 'absolute', left: -18, top: -18, width: 36, height: 36, boxSizing: 'border-box', borderRadius: '50%', border: `1.5px solid ${INK}`, opacity: press ? 0.55 : 0, transform: press ? 'scale(.4)' : 'scale(1.9)', transition: press ? 'none' : 'opacity 700ms ease, transform 700ms cubic-bezier(.2,.65,.2,1)' }} />
                  <svg width="22" height="26" viewBox="0 0 22 26" style={{ position: 'absolute', left: -2, top: -2, transform: press ? 'scale(.86)' : 'scale(1)', transformOrigin: '2px 2px', transition: 'transform 140ms ease', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' }}>
                    <path d="M2 2v19l5-4.5 3.5 7.5 3-1.4-3.4-7.3 6.9-.3Z" fill={INK} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>

            {!captionBelow && (
              <div
                style={abs(Math.round(clamp(screenX > 560 ? screenX - 288 : screenX + 30, 12, 610)), Math.round(clamp(screenY > 400 ? screenY - 112 : screenY + 34, 60, 470)), {
                  width: 258,
                  display: 'flex',
                  gap: 10,
                  padding: '12px 14px',
                  boxSizing: 'border-box',
                  borderRadius: 12,
                  background: INK,
                  color: '#fff',
                  boxShadow: '0 14px 30px rgba(0,0,0,.18)',
                  transition: `left ${camDur}ms cubic-bezier(.65,0,.25,1),top ${camDur}ms cubic-bezier(.65,0,.25,1)`,
                })}
              >
                <GuideBadge />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 11, color: '#A9A9A4' }}>Langkah {chapter + 1} dari {CHAPTERS.length}</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.4, fontWeight: 500 }}>{bt.cap}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {captionBelow && (
          <div aria-hidden className="flex min-h-[76px] items-start gap-3 bg-[#191919] px-4 py-3.5 text-white">
            <GuideBadge />
            <span className="flex flex-col gap-[3px]">
              <span className="text-xs text-[#A9A9A4]">Langkah {chapter + 1} dari {CHAPTERS.length}</span>
              <span className="text-[14.5px] font-medium leading-snug">{bt.cap}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function GuideBadge() {
  return (
    <span
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: '#fff', color: INK, fontSize: 10, fontWeight: 700, flexShrink: 0 }}
    >
      SF
    </span>
  );
}
