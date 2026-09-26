'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Check } from 'lucide-react';

const FIELDS = [
  ['Nama', 'Rania Aulia'],
  ['Kampus', 'Universitas Contoh'],
  ['Email', 'rania@contoh.ac.id'],
] as const;
const TEAM = ['RA', 'DP', 'SN', 'BA'] as const;
const STAGES = ['Disimpan', 'Sudah daftar', 'Wawancara', 'Diterima'] as const;

/**
 * Empat kartu fitur beranimasi (kanvas desain #fitur). Satu penghitung
 * fase dipakai bersama, sehingga keempat animasi bergerak seirama tanpa
 * empat timer terpisah. Berhenti saat tab tersembunyi; dengan
 * prefers-reduced-motion langsung menampilkan keadaan akhir.
 */
export function FeatureCards() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTick(4);
      return;
    }
    const id = window.setInterval(() => {
      if (!document.hidden) setTick((value) => value + 1);
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  const phase = Math.min(tick % 6, 4);
  const shown = (on: boolean) => ({
    opacity: on ? 1 : 0,
    transform: on ? 'none' : 'translateY(14px)',
    transition: 'opacity 500ms ease, transform 500ms cubic-bezier(.2,.65,.2,1)',
  });
  const stage = Math.min(phase, 3);

  return (
    <div className="mt-12 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
      <Card
        title="Pengingat yang tidak berisik"
        body="Dua notifikasi untuk setiap kegiatan tersimpan: tiga hari dan sehari sebelum pendaftaran ditutup."
        delay={0}
      >
        <div className="absolute left-1/2 top-10 flex w-[280px] -translate-x-1/2 flex-col gap-2.5">
          {[
            ['H-3 · Hackathon Layanan Publik', 'Pendaftaran tutup 30 September'],
            ['H-1 · Hackathon Layanan Publik', 'Tutup besok pukul 23.59 WIB'],
          ].map(([title, sub], index) => (
            <div key={title} style={shown(phase >= index + 1)} className="flex items-center gap-3 rounded-[12px] border border-line bg-panel px-3.5 py-3 shadow-[0_8px_20px_rgba(0,0,0,.06)]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-brand text-on-brand">
                <Bell className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 text-left">
                <span className="text-[13px] font-semibold">{title}</span>
                <span className="text-xs text-ink-muted">{sub}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Formulir sekali isi"
        body="Nama, kampus, dan kontak diambil dari profilmu. Kamu tinggal melengkapi berkas yang diminta."
        delay={150}
      >
        <div className="absolute left-1/2 top-[26px] flex w-[280px] -translate-x-1/2 flex-col gap-2">
          {FIELDS.map(([label, value], index) => {
            const filled = phase > index;
            return (
              <div key={label} className="flex h-[38px] items-center gap-2.5 rounded-sm border border-line bg-panel px-3">
                <span className="w-[52px] shrink-0 text-left text-[11.5px] text-ink-muted">{label}</span>
                <span className="grid min-w-0 flex-1">
                  <span className="h-2 w-[70%] self-center rounded bg-line [grid-area:1/1]" style={{ opacity: filled ? 0 : 1, transition: 'opacity 300ms ease' }} />
                  <span className="truncate text-left text-[13px] font-semibold [grid-area:1/1]" style={{ opacity: filled ? 1 : 0, transition: 'opacity 400ms ease' }}>
                    {value}
                  </span>
                </span>
                <Check className="size-[13px]" strokeWidth={2.4} style={{ opacity: filled ? 1 : 0, transition: 'opacity 300ms ease' }} />
              </div>
            );
          })}
          <span
            className="flex h-8 items-center self-end rounded-sm px-3.5 text-[12.5px] font-semibold text-on-brand"
            style={{ background: phase >= 3 ? 'var(--color-accent)' : 'var(--color-border-strong)', transition: 'background 300ms ease' }}
          >
            Tandai siap
          </span>
        </div>
      </Card>

      <Card
        title="Cari tim lintas kampus"
        body="Temukan rekan dengan peran yang kamu butuhkan, lalu ajak bergabung langsung dari halaman kegiatan."
        delay={0}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="flex gap-2.5">
            {TEAM.map((mono, index) => {
              const on = index <= Math.min(phase, 3);
              return (
                <span
                  key={mono}
                  className="flex size-[52px] items-center justify-center rounded-pill text-[13px] font-semibold text-on-brand"
                  style={{
                    border: `1.5px ${on ? 'solid' : 'dashed'} ${on ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
                    background: on ? 'var(--color-accent)' : 'var(--color-surface)',
                    transform: on ? 'scale(1)' : 'scale(.9)',
                    transition: 'background 350ms ease, transform 350ms cubic-bezier(.2,.65,.2,1)',
                  }}
                >
                  {on ? mono : ''}
                </span>
              );
            })}
          </div>
          <span className="text-[13px] font-semibold">{Math.min(phase + 1, 4)} dari 4 anggota</span>
          <span className="text-xs text-ink-muted">Desainer · Frontend · Riset · Copywriter</span>
        </div>
      </Card>

      <Card
        title="Tahapan pendaftaran yang jelas"
        body="Dari disimpan sampai diterima, setiap tahap kegiatanmu tercatat di satu papan."
        delay={150}
      >
        <div className="absolute left-1/2 top-[30px] flex w-60 -translate-x-1/2 flex-col gap-3">
          {STAGES.map((label, index) => (
            <div key={label} className="flex h-[26px] items-center gap-3">
              <span
                className="flex size-[18px] items-center justify-center rounded-pill text-on-brand"
                style={{
                  border: `1.5px solid ${index <= stage ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
                  background: index < stage ? 'var(--color-accent)' : 'var(--color-surface)',
                  transition: 'background 300ms ease, border-color 300ms ease',
                }}
              >
                {index < stage && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              <span className={`flex-1 text-left text-[13.5px] font-semibold ${index <= stage ? 'text-ink' : 'text-ink-muted'}`}>{label}</span>
              <span
                className="flex h-[22px] items-center rounded-[6px] bg-brand px-2 text-[11px] font-semibold text-on-brand"
                style={{ opacity: index === stage ? 1 : 0, transition: 'opacity 300ms ease' }}
              >
                Sekarang
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, body, delay, children }: { title: string; body: string; delay: number; children: ReactNode }) {
  return (
    <div data-reveal="" style={{ ['--reveal-delay' as string]: `${delay}ms` }} className="flex flex-col rounded-2xl border border-line bg-panel p-3">
      <div aria-hidden className="relative h-52 overflow-hidden rounded-[12px] bg-panel-nested">
        {children}
      </div>
      <div className="flex flex-col gap-1.5 px-3 pb-3 pt-5">
        <h3 className="text-[19px] font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="text-[15px] leading-relaxed text-ink-muted">{body}</p>
      </div>
    </div>
  );
}
