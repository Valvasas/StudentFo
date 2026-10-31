'use client';

import type { CSSProperties, ReactNode } from 'react';
import { BadgeCheck, Bookmark, Check, Eye, FileImage, MousePointerClick, ShieldCheck, Users } from 'lucide-react';
import { ORGANIZER_REGISTER_PATH } from '@/lib/safe-redirect';
import { C, ProductTour, STAGE_W, at, chip, type TourChapter } from './product-tour';

/**
 * Tur halaman penyelenggara untuk tamu (ADR-063). Urutannya mengikuti alur
 * kepercayaan ADR-042: ajukan verifikasi → kirim acara (tetap lewat
 * moderator, ADR-062 #5) → periksa bukti bayar pendaftar → baca analitik.
 * Label isian & tombol sama dengan yang ada di studio.
 */

const field = (left: number, top: number, width: number, height: number, label: string, value: ReactNode, focus: boolean) => (
  <>
    <span style={at(left, top, { fontSize: 12.5, fontWeight: 600 })}>{label}</span>
    <span
      style={at(left, top + 22, {
        width,
        height,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: height > 50 ? 'flex-start' : 'center',
        padding: height > 50 ? '10px 12px' : '0 12px',
        borderRadius: 9,
        border: `1.5px solid ${focus ? C.ink : C.line}`,
        background: C.panel,
        fontSize: 13,
        lineHeight: 1.5,
        transition: 'border-color 200ms ease',
      })}
    >
      {value}
    </span>
  </>
);
const button = (left: number, top: number, width: number, label: ReactNode, extra: CSSProperties = {}) => (
  <span
    style={at(left, top, {
      width,
      height: 44,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderRadius: 10,
      background: C.brand,
      color: C.onBrand,
      fontSize: 13.5,
      fontWeight: 600,
      ...extra,
    })}
  >
    {label}
  </span>
);
const pill = (tone: 'warning' | 'success' | 'neutral'): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  height: 26,
  padding: '0 10px',
  borderRadius: 13,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  background: tone === 'warning' ? C.warningSoft : tone === 'success' ? C.successSoft : C.nested,
  color: tone === 'warning' ? C.warning : tone === 'success' ? C.success : C.soft,
});
const typed = (text: string, show: boolean) => <span style={{ color: show ? C.ink : C.faint }}>{show ? text : ''}</span>;

const REGISTRANTS = [
  ['Rania Putri', 'Universitas Contoh', 'PAYMENT_REVIEW'],
  ['Bima Aditya', 'SMA Contoh 1', 'CONFIRMED'],
  ['Salsa Nabila', 'Politeknik Contoh', 'CONFIRMED'],
  ['Dimas Pratama', 'Universitas Contoh', 'AWAITING_PAYMENT'],
] as const;
const STATUS_TEXT = { PAYMENT_REVIEW: 'Pembayaran diperiksa', CONFIRMED: 'Terkonfirmasi', AWAITING_PAYMENT: 'Menunggu pembayaran' } as const;
const BARS = [22, 34, 30, 48, 56, 72, 64] as const;

const CHAPTERS: readonly TourChapter[] = [
  {
    title: 'Ajukan verifikasi',
    detail: 'Moderator memastikan kamu benar mewakili lembagamu.',
    path: 'penyelenggara',
    beats: [
      { x: 300, y: 203, click: true, cap: 'Tulis nama resmi lembaga, panitia, atau komunitasmu.', set: { f1: 1 }, zoom: 1.7, dur: 1500 },
      { x: 300, y: 203, cap: 'Tulis nama resmi lembaga, panitia, atau komunitasmu.', set: { org: 1 }, zoom: 1.7, dur: 1300 },
      { x: 300, y: 290, click: true, cap: 'Jelaskan peranmu dan sertakan tautan resmi sebagai bukti.', set: { f1: 0, f2: 1, ev: 1 }, focus: [440, 290, 1.5], dur: 2400 },
      { x: 602, y: 444, click: true, cap: 'Kirim. Kabar dari moderator masuk ke lonceng notifikasimu.', set: { f2: 0, sent: 1 }, zoom: 1.6, dur: 2400 },
      { x: 300, y: 384, cap: 'Terverifikasi: acaramu mendapat lencana dan studio penuh terbuka.', set: { verified: 1 }, focus: [330, 384, 1.6], dur: 2800 },
    ],
    render: (state) => (
      <>
        <div style={at(0, 52, { width: STAGE_W, height: 508, background: C.canvas })} />
        <div style={at(190, 76, { width: 500, height: 424, boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 16, background: C.panel })} />
        <span style={at(218, 102, { fontSize: 21, fontWeight: 700, letterSpacing: '-0.025em' })}>Verifikasi penyelenggara</span>
        <span style={at(218, 134, { width: 440, fontSize: 13, color: C.muted })}>Sekali saja. Setelah itu kamu bisa mengelola acara dan pendaftarnya.</span>
        {field(218, 160, 444, 42, 'Nama lembaga / organisasi', typed('Himpunan Mahasiswa Desain', Boolean(state.org)), Boolean(state.f1))}
        {field(
          218,
          232,
          444,
          84,
          'Bukti peranmu',
          typed('Ketua panitia lomba poster 2026. Pengumuman resmi: instagram.com/contoh', Boolean(state.ev)),
          Boolean(state.f2),
        )}
        <span
          style={at(218, 372, {
            ...pill(state.verified ? 'success' : 'warning'),
            opacity: state.sent ? 1 : 0,
            transition: 'opacity 300ms ease,background 300ms ease,color 300ms ease',
          })}
        >
          {state.verified ? <BadgeCheck size={14} strokeWidth={1.8} /> : <ShieldCheck size={14} strokeWidth={1.8} />}
          {state.verified ? 'Terverifikasi' : 'Menunggu moderator'}
        </span>
        {button(542, 422, 120, state.sent ? 'Terkirim' : 'Ajukan', { background: state.sent ? C.nested : C.brand, color: state.sent ? C.muted : C.onBrand })}
      </>
    ),
  },
  {
    title: 'Kirim acara',
    detail: 'Isi detail acara; moderator mencocokkannya sebelum tayang.',
    path: 'submit',
    beats: [
      { x: 260, y: 138, click: true, cap: 'Nama lembagamu yang terverifikasi sudah terisi.', set: { focus: 1 }, zoom: 1.7, dur: 1800 },
      { x: 260, y: 210, click: true, cap: 'Tulis judul acara. Pratinjau kartunya ikut berubah.', set: { focus: 2, title: 1 }, focus: [440, 210, 1.3], dur: 2400 },
      { x: 72, y: 276, click: true, cap: 'Pilih jenis kegiatan, tenggat, dan biaya pendaftaran.', set: { focus: 0, type: 1 }, zoom: 1.6, dur: 2000 },
      { x: 152, y: 470, click: true, cap: 'Kirim untuk ditinjau. Setelah disetujui, acara otomatis masuk studiomu.', set: { sent: 1 }, hitWide: true, dur: 3000 },
    ],
    render: (state) => (
      <>
        <span style={at(32, 70, { fontSize: 21, fontWeight: 700, letterSpacing: '-0.025em' })}>Kirim acara baru</span>
        {field(32, 96, 500, 40, 'Penyelenggara', <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Himpunan Mahasiswa Desain <BadgeCheck size={14} strokeWidth={1.8} /></span>, state.focus === 1)}
        {field(32, 168, 500, 40, 'Judul acara', typed('Lomba Desain Poster Hari Pangan', Boolean(state.title)), state.focus === 2)}
        <span style={at(32, 240, { fontSize: 12.5, fontWeight: 600 })}>Jenis</span>
        {(
          [
            ['Lomba', 32, 80],
            ['Beasiswa', 120, 92],
            ['Workshop', 220, 96],
            ['Pelatihan', 324, 96],
          ] as const
        ).map(([label, left, width], index) => (
          <span
            key={label}
            style={at(left, 260, {
              width,
              height: 32,
              boxSizing: 'border-box',
              border: '1px solid',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 600,
              ...chip(index === 0 && Boolean(state.type)),
            })}
          >
            {label}
          </span>
        ))}
        {field(32, 312, 240, 40, 'Tenggat pendaftaran', '30 Nov 2026, 23.59 WIB', false)}
        {field(292, 312, 240, 40, 'Biaya', 'Gratis', false)}
        <span style={at(32, 404, { width: 500, fontSize: 12, color: C.muted })}>Tahapan (opsional): pengumpulan karya, pengumuman, final.</span>
        {button(32, 448, 240, state.sent ? 'Terkirim' : 'Kirim untuk ditinjau', { background: state.sent ? C.nested : C.brand, color: state.sent ? C.muted : C.onBrand })}
        <span style={at(290, 459, { ...pill('warning'), opacity: state.sent ? 1 : 0, transition: 'opacity 300ms ease' })}>
          <ShieldCheck size={14} strokeWidth={1.8} />
          Menunggu tinjauan moderator
        </span>

        <span style={at(572, 72, { fontSize: 12.5, fontWeight: 600, color: C.muted })}>Pratinjau kartu</span>
        <div style={at(572, 96, { width: 276, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 14, border: `1px solid ${C.line}`, background: C.panel })}>
          <span style={{ height: 120, borderRadius: 10, background: C.nested, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint }}>
            <FileImage size={26} strokeWidth={1.4} />
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            <span style={pill('neutral')}>{state.type ? 'Lomba' : 'Jenis'}</span>
            <span style={pill('neutral')}>Gratis</span>
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, minHeight: 40, color: state.title ? C.ink : C.faint }}>
            {state.title ? 'Lomba Desain Poster Hari Pangan' : 'Judul acaramu'}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.muted }}>
            Himpunan Mahasiswa Desain <BadgeCheck size={13} strokeWidth={1.7} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Ditutup 30 Nov</span>
        </div>
      </>
    ),
  },
  {
    title: 'Kelola pendaftar',
    detail: 'Formulir sendiri, bukti bayar diperiksa, peserta dikabari otomatis.',
    path: 'penyelenggara/acara/lomba-poster/pendaftar',
    beats: [
      { x: 440, y: 160, cap: 'Semua pendaftar dan status pembayarannya di satu tabel.', focus: [440, 260, 1.15], dur: 2200 },
      { x: 760, y: 166, click: true, cap: 'Buka bukti transfer yang diunggah peserta.', set: { open: 1 }, zoom: 1.7, dur: 2000 },
      { x: 636, y: 452, click: true, cap: 'Konfirmasi pembayaran. Peserta langsung dapat kabar di notifikasinya.', set: { ok: 1 }, focus: [640, 330, 1.25], dur: 2800 },
    ],
    render: (state) => (
      <>
        <span style={at(32, 70, { fontSize: 21, fontWeight: 700, letterSpacing: '-0.025em' })}>Pendaftar</span>
        <span style={at(32, 102, { fontSize: 12.5, color: C.muted })}>Lomba Desain Poster Hari Pangan · 4 pendaftar</span>
        <div style={at(32, 132, { width: 816, display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.line}` })}>
          {REGISTRANTS.map(([name, school, status], index) => {
            const current = index === 0 && state.ok ? 'CONFIRMED' : status;
            return (
              <div
                key={name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '220px minmax(0,1fr) 190px 110px',
                  alignItems: 'center',
                  height: 64,
                  padding: '0 12px',
                  borderBottom: `1px solid ${C.line}`,
                  background: index === 0 && state.open ? C.nested : 'transparent',
                  transition: 'background 220ms ease',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                <span style={{ fontSize: 13, color: C.muted }}>{school}</span>
                <span>
                  <span style={pill(current === 'CONFIRMED' ? 'success' : current === 'PAYMENT_REVIEW' ? 'warning' : 'neutral')}>{STATUS_TEXT[current]}</span>
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, color: index === 0 ? C.ink : C.faint }}>
                  {index === 0 ? 'Lihat bukti' : 'Jawaban'}
                </span>
              </div>
            );
          })}
        </div>
        <div
          style={at(520, 196, {
            width: 328,
            height: 316,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 18,
            borderRadius: 14,
            border: `1px solid ${C.line}`,
            background: C.panel,
            boxShadow: '0 18px 40px rgba(0,0,0,.14)',
            opacity: state.open ? 1 : 0,
            transform: state.open ? 'none' : 'translateY(12px)',
            transition: 'opacity 320ms ease,transform 320ms ease',
          })}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>Bukti pembayaran · Rania Putri</span>
          <span style={{ flex: 1, borderRadius: 10, background: C.nested, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: C.muted, fontSize: 12 }}>
            <FileImage size={28} strokeWidth={1.4} />
            transfer-rania.jpg
          </span>
          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
            <span style={{ color: C.muted }}>Nominal tagihan</span>
            <span style={{ fontWeight: 600 }}>Rp50.000</span>
          </span>
          <span style={{ height: 44 }} />
        </div>
        {button(536, 430, 200, state.ok ? <><Check size={15} strokeWidth={2.4} /> Terkonfirmasi</> : 'Konfirmasi pembayaran', {
          opacity: state.open ? 1 : 0,
          background: state.ok ? C.success : C.brand,
          color: state.ok ? C.successSoft : C.onBrand,
          transition: 'opacity 320ms ease,background 260ms ease',
        })}
        <span style={at(748, 442, { fontSize: 12.5, fontWeight: 600, color: C.muted, opacity: state.open ? 1 : 0, transition: 'opacity 320ms ease' })}>Tolak bukti</span>
      </>
    ),
  },
  {
    title: 'Baca analitik',
    detail: 'Lihat berapa yang melihat, menyimpan, dan menekan Daftar.',
    path: 'penyelenggara/acara/lomba-poster',
    beats: [
      { x: 440, y: 300, cap: 'Kunjungan harian ke halaman acaramu, terbaru di kanan.', set: { grow: 1 }, wide: true, dur: 2600 },
      { x: 742, y: 120, cap: 'Berapa yang benar-benar menekan Daftar menuju formulirmu.', zoom: 1.8, dur: 2400 },
      { x: 440, y: 470, cap: 'Siap? Ajukan verifikasi dan pasang acara pertamamu.', wide: true, dur: 2800 },
    ],
    render: (state) => (
      <>
        <div style={at(0, 52, { width: STAGE_W, height: 508, background: C.canvas })} />
        <span style={at(32, 70, { fontSize: 21, fontWeight: 700, letterSpacing: '-0.025em' })}>Analitik · 7 hari terakhir</span>
        <div style={at(32, 104, { width: 816, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 })}>
          {(
            [
              [Users, 'Pengunjung unik', '326'],
              [Eye, 'Total kunjungan', '412'],
              [Bookmark, 'Disimpan', '58'],
              [MousePointerClick, 'Klik "Daftar"', '41'],
            ] as const
          ).map(([Icon, label, value]) => (
            <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: 8, height: 92, padding: 14, boxSizing: 'border-box', borderRadius: 12, border: `1px solid ${C.line}`, background: C.panel }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
                <Icon size={14} strokeWidth={1.7} />
                {label}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.03em' }}>{value}</span>
            </span>
          ))}
        </div>
        <div style={at(32, 214, { width: 816, height: 220, boxSizing: 'border-box', padding: '18px 20px', borderRadius: 14, border: `1px solid ${C.line}`, background: C.panel })}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Kunjungan per hari</span>
          <div style={{ position: 'absolute', left: 20, right: 20, bottom: 36, height: 130, display: 'flex', alignItems: 'flex-end', gap: 18 }}>
            {BARS.map((value, index) => (
              <span
                key={index}
                style={{
                  flex: 1,
                  height: state.grow ? `${value + 28}%` : '6%',
                  borderRadius: '6px 6px 2px 2px',
                  background: index === BARS.length - 2 ? C.brand : C.lineStrong,
                  transition: `height 900ms cubic-bezier(.2,.65,.2,1) ${index * 70}ms`,
                }}
              />
            ))}
          </div>
          <div style={{ position: 'absolute', left: 20, right: 20, bottom: 12, display: 'flex', gap: 18, fontSize: 11, color: C.muted }}>
            {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((day) => (
              <span key={day} style={{ flex: 1, textAlign: 'center' }}>
                {day}
              </span>
            ))}
          </div>
        </div>
        <div style={at(32, 450, { width: 816, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: C.muted })}>
          {(['412 kunjungan', '58 disimpan', '41 klik Daftar'] as const).map((step, index) => (
            <span key={step} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {index > 0 && <span style={{ width: 28, height: 1, background: C.lineStrong }} />}
              <span style={{ ...pill('neutral'), color: C.ink }}>{step}</span>
            </span>
          ))}
        </div>
      </>
    ),
  },
];

export function OrganizerTour({ host }: { host: string }) {
  return (
    <ProductTour
      chapters={CHAPTERS}
      host={host}
      appName="StudentFo Studio"
      nav={['Studio', 'Acara', 'Pendaftar']}
      avatar="HM"
      cta={{ href: ORGANIZER_REGISTER_PATH, label: 'Daftarkan lembagamu' }}
    />
  );
}
