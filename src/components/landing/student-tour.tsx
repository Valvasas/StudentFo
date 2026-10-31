'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, Bell, Bookmark, Check, ExternalLink, Link2, Search } from 'lucide-react';
import { C, ProductTour, STAGE_W, at, chip, type TourChapter } from './product-tour';

/**
 * Tur beranda tamu (ADR-063). Setiap langkah = perilaku yang ada di aplikasi:
 * cari & saring di /events, lencana "Ditinjau" + tautan sumber + tab Syarat &
 * Simpan di detail, persiapan → formulir resmi → "Sudah, tandai terdaftar",
 * lalu papan lamaran. Nama kegiatan & penyelenggara diberi awalan "Contoh"
 * supaya ilustrasi tidak terbaca sebagai katalog sungguhan.
 */

const ROWS = [
  { mono: 'LP', title: 'Lomba Desain Poster Hari Pangan', org: 'Contoh: Himpunan Mahasiswa Desain', type: 'Lomba', days: 3, q: true, lomba: true },
  { mono: 'OS', title: 'Olimpiade Sains Pelajar', org: 'Contoh: Komunitas Sains', type: 'Lomba', days: 6, q: false, lomba: true },
  { mono: 'UX', title: 'Kompetisi UI/UX Nasional', org: 'Contoh: Komunitas Teknologi', type: 'Lomba', days: 9, q: true, lomba: true },
  { mono: 'BD', title: 'Beasiswa Prestasi Desain', org: 'Contoh: Yayasan Pendidikan', type: 'Beasiswa', days: 14, q: true, lomba: false },
] as const;
const TYPES = [
  ['Semua', 32, 72],
  ['Lomba', 112, 72],
  ['Beasiswa', 192, 92],
  ['Magang', 292, 82],
  ['Workshop', 382, 92],
] as const;
const REQS = ['Pelajar SMA/SMK atau mahasiswa aktif', 'Poster final PNG, maksimal 10 MB', 'Surat pernyataan orisinalitas', 'Satu peserta satu karya'];
const BENEFITS = ['Hadiah & sertifikat', 'Karya dipamerkan', 'Jalur magang'];
const FILES = ['Kartu pelajar / KTM', 'Poster final (PNG)', 'Surat orisinalitas karya'];
const PROFILE = [
  ['Nama lengkap', 'Rania Putri'],
  ['Sekolah / kampus', 'Universitas Contoh'],
  ['Email', 'rania@contoh.ac.id'],
] as const;
const COLUMNS = ['Disimpan', 'Sudah Daftar', 'Wawancara', 'Diterima'] as const;
const COL_X = [32, 238, 444, 650] as const;

const h1 = (left: number, top: number, text: string) => (
  <span style={at(left, top, { fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' })}>{text}</span>
);
const sub = (left: number, top: number, text: string) => <span style={at(left, top, { fontSize: 12.5, color: C.muted })}>{text}</span>;
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
      fontSize: 14,
      fontWeight: 600,
      ...extra,
    })}
  >
    {label}
  </span>
);

const CHAPTERS: readonly TourChapter[] = [
  {
    title: 'Cari & saring',
    detail: 'Lomba, beasiswa, dan magang di satu katalog, urut dari tenggat terdekat.',
    path: 'events?q=desain&type=LOMBA',
    beats: [
      { x: 210, y: 131, click: true, cap: 'Cari pakai kata kunci: judul, bidang, atau penyelenggara.', set: { focus: 1 }, zoom: 1.8, dur: 1600 },
      { x: 210, y: 131, cap: 'Hasilnya langsung tersaring.', set: { q: 1 }, focus: [330, 250, 1.25], dur: 2000 },
      { x: 148, y: 184, click: true, cap: 'Persempit per jenis kegiatan, jenjang, biaya, atau lokasi.', set: { type: 1 }, focus: [240, 200, 1.6], dur: 2200 },
      { x: 600, y: 182, cap: 'Yang tenggatnya paling mepet selalu ada di atas.', wide: true, dur: 2200 },
      { x: 330, y: 250, click: true, cap: 'Buka detailnya untuk cek syarat dan sumber resminya.', set: { open: 1 }, zoom: 1.5, dur: 1800 },
    ],
    render: (state) => {
      const visible = ROWS.filter((row) => (!state.q || row.q) && (!state.type || row.lomba));
      return (
        <>
          <div style={at(0, 52, { width: STAGE_W, height: 508, background: C.canvas })} />
          {h1(32, 72, 'Jelajahi kegiatan')}
          <div
            style={at(32, 110, {
              width: 560,
              height: 42,
              boxSizing: 'border-box',
              borderRadius: 10,
              border: `1.5px solid ${state.focus ? C.ink : C.line}`,
              background: C.panel,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '0 14px',
              fontSize: 13.5,
              color: state.q ? C.ink : C.faint,
              transition: 'border-color 200ms ease',
            })}
          >
            <Search size={16} strokeWidth={1.7} />
            <span>{state.q ? 'desain' : 'Cari lomba, beasiswa, magang…'}</span>
            <span style={{ width: 1.5, height: 16, marginLeft: -6, background: C.ink, opacity: state.focus ? 1 : 0 }} />
          </div>
          {TYPES.map(([label, left, width]) => {
            const on = label === (state.type ? 'Lomba' : 'Semua');
            return (
              <span
                key={label}
                style={at(left, 168, {
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
                  ...chip(on),
                })}
              >
                {label}
              </span>
            );
          })}
          <span style={at(560, 176, { width: 288, textAlign: 'right', fontSize: 12.5, color: C.muted })}>
            {visible.length} kegiatan · Tenggat terdekat
          </span>
          <div style={at(32, 216, { width: 816, display: 'flex', flexDirection: 'column', gap: 8 })}>
            {ROWS.map((row, index) => {
              const shown = visible.includes(row);
              return (
                <div
                  key={row.mono}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 100px 110px',
                    alignItems: 'center',
                    gap: 16,
                    height: 62,
                    padding: '0 16px',
                    boxSizing: 'border-box',
                    borderRadius: 12,
                    border: `1px solid ${state.open && index === 0 ? C.ink : C.line}`,
                    background: C.panel,
                    opacity: shown ? 1 : 0.22,
                    transition: 'opacity 420ms ease,border-color 240ms ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                        borderRadius: 9,
                        background: C.nested,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                      }}
                    >
                      {row.mono}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.muted }}>
                        {row.org}
                        <BadgeCheck size={13} strokeWidth={1.7} />
                      </span>
                    </span>
                  </div>
                  <span style={{ fontSize: 13, color: C.muted }}>{row.type}</span>
                  <span
                    style={{
                      justifySelf: 'start',
                      display: 'flex',
                      alignItems: 'center',
                      height: 26,
                      padding: '0 10px',
                      borderRadius: 7,
                      fontSize: 12,
                      fontWeight: 600,
                      background: row.days <= 7 ? C.brand : C.nested,
                      color: row.days <= 7 ? C.onBrand : C.muted,
                    }}
                  >
                    {row.days} hari lagi
                  </span>
                </div>
              );
            })}
          </div>
        </>
      );
    },
  },
  {
    title: 'Cek & simpan',
    detail: 'Lihat lencana tinjauan, sumber resmi, dan syaratnya, lalu simpan.',
    path: 'events/lomba-desain-poster-hari-pangan',
    beats: [
      { x: 402, y: 150, cap: 'Lencana ini berarti moderator sudah mencocokkan info dengan sumber aslinya.', set: { badge: 1 }, zoom: 1.8, dur: 2600 },
      { x: 722, y: 256, click: true, cap: 'Pengumuman resminya selalu ditautkan, jadi kamu bisa cek langsung.', set: { source: 1 }, zoom: 1.7, dur: 2400 },
      { x: 186, y: 202, click: true, cap: 'Syarat dan berkasnya dirangkum jadi daftar periksa.', set: { tab: 1 }, focus: [300, 320, 1.3], dur: 2400 },
      { x: 722, y: 374, click: true, cap: 'Simpan, lalu kami ingatkan H-3 dan H-1 sebelum pendaftaran ditutup.', set: { saved: 1 }, zoom: 1.6, hitWide: true, dur: 2800 },
      { x: 722, y: 322, click: true, cap: 'Sudah siap? Tekan Daftar.', zoom: 1.45, dur: 1500 },
    ],
    render: (state) => (
      <>
        <span style={at(32, 70, { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.muted })}>
          <ArrowLeft size={13} strokeWidth={1.7} />
          Jelajahi
        </span>
        <span style={at(32, 92, { width: 540, fontSize: 26, fontWeight: 700, letterSpacing: '-0.035em' })}>Lomba Desain Poster Hari Pangan</span>
        <span
          style={at(32, 137, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 7,
            background: C.nested,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
          })}
        >
          LP
        </span>
        <span style={at(66, 142, { fontSize: 13.5, fontWeight: 600 })}>Contoh: Himpunan Mahasiswa Desain</span>
        <span
          style={at(326, 136, {
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 28,
            padding: '0 11px',
            boxSizing: 'border-box',
            borderRadius: 14,
            border: `1px solid ${C.ink}`,
            background: C.panel,
            fontSize: 12,
            fontWeight: 600,
            boxShadow: state.badge ? `0 0 0 5px ${C.brandSoft}` : 'none',
            transition: 'box-shadow 300ms ease',
          })}
        >
          <BadgeCheck size={14} strokeWidth={1.7} />
          Ditinjau moderator
        </span>
        {(
          [
            ['Ringkasan', 32, 84],
            ['Syarat & berkas', 128, 116],
            ['Tahapan', 256, 66],
            ['Tanya jawab', 334, 92],
          ] as const
        ).map(([label, left, width], index) => (
          <span
            key={label}
            style={at(left, 192, {
              width,
              fontSize: 13.5,
              fontWeight: 600,
              textAlign: 'center',
              color: (state.tab ? index === 1 : index === 0) ? C.ink : C.faint,
              transition: 'color 200ms ease',
            })}
          >
            {label}
          </span>
        ))}
        <span style={at(32, 218, { width: 528, height: 1, background: C.line })} />
        <span style={at(state.tab ? 128 : 32, 217, { width: state.tab ? 116 : 84, height: 2, background: C.ink, transition: 'left 320ms ease,width 320ms ease' })} />
        <div style={at(32, 238, { width: 528, display: 'flex', flexDirection: 'column', gap: 12, opacity: state.tab ? 0 : 1, transition: 'opacity 300ms ease' })}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Yang kamu dapat</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {BENEFITS.map((benefit) => (
              <span
                key={benefit}
                style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 92, padding: 14, boxSizing: 'border-box', borderRadius: 10, background: C.nested, fontSize: 13, fontWeight: 600 }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: C.brand, color: C.onBrand }}>
                  <Check size={13} strokeWidth={2.4} />
                </span>
                {benefit}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 13, lineHeight: 1.6, color: C.muted }}>
            Rancang poster bertema pangan lokal. Terbuka untuk pelajar SMA/SMK dan mahasiswa dari seluruh Indonesia.
          </span>
        </div>
        <div style={at(32, 238, { width: 528, display: 'flex', flexDirection: 'column', opacity: state.tab ? 1 : 0, transition: 'opacity 300ms ease' })}>
          {REQS.map((req) => (
            <span key={req} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 48, borderBottom: `1px solid ${C.line}`, fontSize: 13.5 }}>
              <span style={{ width: 18, height: 18, boxSizing: 'border-box', borderRadius: 5, border: `1.5px solid ${C.lineStrong}` }} />
              {req}
            </span>
          ))}
        </div>

        <div style={at(596, 72, { width: 252, height: 344, boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 14, background: C.panel })} />
        <span style={at(616, 92, { fontSize: 12.5, color: C.muted })}>Pendaftaran ditutup dalam</span>
        <span style={at(616, 112, { fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.03em' })}>03 hari 14 jam</span>
        <div style={at(616, 160, { width: 212, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 13 })}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Biaya</span>
            <span style={{ fontWeight: 600 }}>Gratis</span>
          </span>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Jenjang</span>
            <span style={{ fontWeight: 600 }}>SMA/SMK · Mahasiswa</span>
          </span>
        </div>
        <span
          style={at(612, 236, {
            width: 220,
            height: 40,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 12px',
            borderRadius: 10,
            border: `1px solid ${state.source ? C.ink : C.line}`,
            background: state.source ? C.nested : C.panel,
            fontSize: 12.5,
            transition: 'background 220ms ease,border-color 220ms ease',
          })}
        >
          <Link2 size={14} strokeWidth={1.7} />
          <span style={{ flex: 1, fontWeight: 600, whiteSpace: 'nowrap' }}>Cek sumber resmi</span>
          <ExternalLink size={13} strokeWidth={1.7} />
        </span>
        {button(612, 300, 220, 'Daftar sekarang')}
        <span
          style={at(612, 354, {
            width: 220,
            height: 40,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            borderRadius: 10,
            border: `1px solid ${C.lineStrong}`,
            background: state.saved ? C.nested : C.panel,
            fontSize: 13.5,
            fontWeight: 600,
            transition: 'background 220ms ease',
          })}
        >
          <Bookmark size={15} strokeWidth={1.7} fill={state.saved ? 'currentColor' : 'none'} />
          {state.saved ? 'Tersimpan' : 'Simpan'}
        </span>
        <span
          style={at(290, 484, {
            width: 300,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 10,
            background: C.brand,
            color: C.onBrand,
            fontSize: 13,
            fontWeight: 500,
            opacity: state.saved ? 1 : 0,
            transform: state.saved ? 'none' : 'translateY(12px)',
            transition: 'opacity 350ms ease,transform 350ms cubic-bezier(.2,.65,.2,1)',
          })}
        >
          <Bell size={16} strokeWidth={1.7} />
          Pengingat H-3 &amp; H-1 aktif
        </span>
      </>
    ),
  },
  {
    title: 'Siapkan & daftar',
    detail: 'Cek berkas, salin datamu, lalu daftar di formulir resmi penyelenggara.',
    path: 'events/lomba-desain-poster-hari-pangan/persiapan',
    beats: [
      { x: 55, y: 258, click: true, cap: 'Centang berkas yang sudah siap. Daftarnya diambil dari syarat resmi.', set: { c2: 1 }, focus: [290, 260, 1.5], dur: 1700 },
      { x: 55, y: 310, click: true, cap: 'Centang berkas yang sudah siap. Daftarnya diambil dari syarat resmi.', set: { c3: 1 }, focus: [290, 280, 1.5], dur: 1500 },
      { x: 722, y: 236, cap: 'Data dari profilmu siap disalin ke formulir penyelenggara.', focus: [722, 250, 1.6], dur: 2400 },
      { x: 152, y: 396, click: true, cap: 'Formulir resmi terbuka di tab baru, StudentFo tetap terbuka di sini.', set: { opened: 1 }, zoom: 1.45, dur: 2400 },
      { x: 460, y: 474, click: true, cap: 'Tandai sudah daftar, dan kegiatannya pindah ke papan lamaranmu.', set: { done: 1 }, hitWide: true, dur: 2800 },
    ],
    render: (state) => {
      const ready = 1 + (state.c2 ? 1 : 0) + (state.c3 ? 1 : 0);
      return (
        <>
          {h1(32, 70, 'Persiapan pendaftaran')}
          {sub(32, 104, 'Lomba Desain Poster Hari Pangan')}
          <span style={at(390, 104, { width: 170, textAlign: 'right', fontSize: 12.5, fontWeight: 600 })}>{ready} dari 3 berkas siap</span>
          <span style={at(32, 132, { width: 528, height: 4, borderRadius: 2, background: C.line })} />
          <span style={at(32, 132, { width: (528 * ready) / 3, height: 4, borderRadius: 2, background: C.ink, transition: 'width 400ms ease' })} />
          <div style={at(32, 180, { width: 528, display: 'flex', flexDirection: 'column' })}>
            {FILES.map((file, index) => {
              const on = index === 0 || (index === 1 && Boolean(state.c2)) || (index === 2 && Boolean(state.c3));
              return (
                <span key={file} style={{ display: 'flex', alignItems: 'center', gap: 14, height: 52, padding: '0 14px', borderBottom: `1px solid ${C.line}`, fontSize: 14 }}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      boxSizing: 'border-box',
                      borderRadius: 6,
                      border: `1.5px solid ${on ? C.brand : C.lineStrong}`,
                      background: on ? C.brand : 'transparent',
                      color: C.onBrand,
                      transition: 'background 200ms ease,border-color 200ms ease',
                    }}
                  >
                    {on && <Check size={13} strokeWidth={2.6} />}
                  </span>
                  <span style={{ color: on ? C.ink : C.soft, textDecoration: on ? 'line-through' : 'none', textDecorationColor: C.faint }}>{file}</span>
                </span>
              );
            })}
          </div>
          {button(
            32,
            374,
            240,
            <>
              Buka formulir resmi
              <ExternalLink size={14} strokeWidth={1.8} />
            </>,
          )}
          <div
            style={at(32, 438, {
              width: 528,
              height: 72,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 16px',
              borderRadius: 12,
              border: `1px solid ${C.line}`,
              background: C.nested,
              opacity: state.opened ? 1 : 0,
              transform: state.opened ? 'none' : 'translateY(10px)',
              transition: 'opacity 350ms ease,transform 350ms ease',
            })}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Formulir resmi dibuka di tab baru</span>
              <span style={{ fontSize: 12, color: C.muted }}>Sudah selesai mengisi?</span>
            </span>
          </div>
          {state.opened ? button(372, 452, 176, 'Sudah, tandai terdaftar', { height: 44, fontSize: 13 }) : null}

          <div style={at(596, 136, { width: 252, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 14, background: C.nested })}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Datamu, siap disalin</span>
            {PROFILE.map(([label, value]) => (
              <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, color: C.muted }}>{label}</span>
                <span style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 10px', borderRadius: 8, background: C.panel, fontSize: 13, fontWeight: 500 }}>{value}</span>
              </span>
            ))}
            <span style={{ fontSize: 11.5, lineHeight: 1.5, color: C.muted }}>Diambil dari profilmu. Ubah kapan saja di Profil.</span>
          </div>

          <div
            style={at(0, 52, {
              width: STAGE_W,
              height: 508,
              background: C.panel,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              opacity: state.done ? 1 : 0,
              transition: 'opacity 400ms ease',
            })}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, height: 60, borderRadius: '50%', background: C.brand, color: C.onBrand }}>
              <Check size={26} strokeWidth={2.4} />
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>Tercatat: Sudah Daftar</span>
            <span style={{ fontSize: 13.5, color: C.muted }}>Pantau tahapannya di papan lamaranmu.</span>
          </div>
        </>
      );
    },
  },
  {
    title: 'Pantau sampai hasil',
    detail: 'Semua lamaranmu di satu papan, dari disimpan sampai diterima.',
    path: 'tracker',
    beats: [
      { x: 336, y: 200, cap: 'Kegiatan yang sudah kamu daftar ada di kolom Sudah Daftar.', set: { glow: 1 }, focus: [336, 220, 1.6], dur: 2400 },
      { x: 378, y: 229, click: true, cap: 'Perbarui tahapnya setiap ada kabar dari penyelenggara.', set: { menu: 1 }, zoom: 1.8, dur: 1800 },
      { x: 360, y: 307, click: true, cap: 'Diterima? Selamat! Riwayat lamaranmu tersimpan rapi di sini.', set: { menu: 0, won: 1 }, hitWide: true, dur: 3000 },
      { x: 600, y: 470, cap: 'Itu saja. Sekarang giliranmu mencoba.', wide: true, dur: 2600 },
    ],
    render: (state) => (
      <>
        <div style={at(0, 52, { width: STAGE_W, height: 508, background: C.canvas })} />
        {h1(32, 70, 'Papan lamaran')}
        {sub(32, 102, '4 kegiatan · 1 tenggat minggu ini')}
        {COLUMNS.map((column, index) => (
          <div key={column} style={at(COL_X[index]!, 128, { width: 196, height: 400, boxSizing: 'border-box', borderRadius: 14, background: C.nested, padding: 12 })}>
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
              {column}
              <span style={{ color: C.muted, fontWeight: 500 }}>
                {index === 0 ? 2 : index === 1 ? (state.won ? 0 : 1) : index === 2 ? 1 : state.won ? 1 : 0}
              </span>
            </span>
          </div>
        ))}
        {(
          [
            [0, 0, 'Kompetisi UI/UX Nasional', '9 hari lagi'],
            [0, 1, 'Beasiswa Prestasi Desain', '14 hari lagi'],
            [2, 0, 'Magang Desainer Produk', 'Jadwal: 12 Nov'],
          ] as const
        ).map(([column, row, title, meta]) => (
          <TrackerCard key={title} left={COL_X[column]! + 10} top={164 + row * 94} title={title} meta={meta} />
        ))}
        <div
          style={at(state.won ? COL_X[3]! + 10 : COL_X[1]! + 10, 164, {
            transition: 'left 700ms cubic-bezier(.65,0,.25,1)',
            borderRadius: 12,
            boxShadow: state.glow && !state.won ? `0 0 0 4px ${C.brandSoft}` : 'none',
          })}
        >
          <TrackerCard left={0} top={0} title="Lomba Desain Poster Hari Pangan" meta={state.won ? 'Selamat!' : 'Hasil 20 Nov'} strong />
          <span
            style={at(92, 54, {
              display: 'flex',
              alignItems: 'center',
              height: 22,
              padding: '0 8px',
              borderRadius: 6,
              background: state.won ? C.successSoft : C.panel,
              border: `1px solid ${state.won ? C.success : C.line}`,
              color: state.won ? C.success : C.soft,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            })}
          >
            {state.won ? 'Diterima' : 'Ubah tahap'}
          </span>
        </div>
        <div
          style={at(300, 250, {
            width: 150,
            boxSizing: 'border-box',
            padding: 6,
            borderRadius: 10,
            border: `1px solid ${C.line}`,
            background: C.panel,
            boxShadow: '0 12px 28px rgba(0,0,0,.12)',
            display: 'flex',
            flexDirection: 'column',
            opacity: state.menu ? 1 : 0,
            transform: state.menu ? 'none' : 'translateY(-6px)',
            transition: 'opacity 200ms ease,transform 200ms ease',
          })}
        >
          {['Wawancara', 'Diterima', 'Ditolak'].map((option, index) => (
            <span key={option} style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 10px', borderRadius: 7, fontSize: 13, background: index === 1 ? C.nested : 'transparent' }}>
              {option}
            </span>
          ))}
        </div>
      </>
    ),
  },
];

function TrackerCard({ left, top, title, meta, strong }: { left: number; top: number; title: string; meta: string; strong?: boolean }) {
  return (
    <div
      style={at(left, top, {
        width: 176,
        height: 84,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${strong ? C.lineStrong : C.line}`,
        background: C.panel,
      })}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title}</span>
      <span style={{ marginTop: 'auto', fontSize: 11.5, color: C.muted }}>{meta}</span>
    </div>
  );
}

export function StudentTour({ host }: { host: string }) {
  return <ProductTour chapters={CHAPTERS} host={host} appName="StudentFo" nav={['Jelajah', 'Tersimpan', 'Papan']} avatar="RP" cta={{ href: '/register', label: 'Coba sendiri' }} />;
}
