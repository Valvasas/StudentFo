'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Link2, MapPin, Phone, Plus } from 'lucide-react';
import { useDemoStore } from '@/components/demo/use-demo-store';
import {
  DEFAULT_PROFILE_EXTRAS,
  PROFILE_EXTRAS_KEY,
  PROFILE_STATUSES,
  parseProfileExtras,
  toExternalUrl,
  type ProfileExtras,
} from '@/lib/demo/profile-extras';
import { cn } from '@/lib/utils';

/**
 * Bagian profil yang isinya belum punya kolom database (ADR-039). Hanya
 * dirender di mode data contoh; halaman produksi tidak memanggil
 * komponen-komponen ini.
 */
function useExtras() {
  return useDemoStore<ProfileExtras>(PROFILE_EXTRAS_KEY, DEFAULT_PROFILE_EXTRAS, parseProfileExtras);
}

export function DemoHeadline() {
  const [extras] = useExtras();
  if (!extras.headline) return null;
  return <p className="max-w-[52ch] text-[16.5px] leading-normal text-ink-soft">{extras.headline}</p>;
}

export function DemoCity() {
  const [extras] = useExtras();
  if (!extras.city) return null;
  return (
    <li className="flex items-center gap-1.5">
      <MapPin aria-hidden className="size-[15px]" />
      <span>{extras.city}</span>
    </li>
  );
}

/** Pemilih status (kanvas: "Mencari tim"). Esc/klik di luar menutup; fokus kembali ke tombol. */
export function DemoStatusPicker({ editable }: { editable: boolean }) {
  const [extras, save] = useExtras();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hint = PROFILE_STATUSES.find((item) => item.value === extras.status)?.hint ?? '';

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    }
  };

  const pill = (
    <>
      <span aria-hidden className="size-2 rounded-pill bg-brand" />
      {extras.status}
    </>
  );

  return (
    <div ref={rootRef} className="relative flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
      <span id="status-label" className="text-[13px] text-ink-muted">
        Status
      </span>
      {editable ? (
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-describedby="status-hint"
          onClick={() => setOpen((value) => !value)}
          className="relative flex h-[34px] items-center gap-2 rounded-[17px] border border-brand px-3 text-[13.5px] font-semibold transition-colors duration-150 after:absolute after:-inset-y-[5px] after:inset-x-0 after:content-[''] hover:bg-panel-nested"
        >
          <span className="sr-only">Status: </span>
          {pill}
          <ChevronDown aria-hidden className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      ) : (
        <span className="flex h-[34px] items-center gap-2 rounded-[17px] border border-brand px-3 text-[13.5px] font-semibold">{pill}</span>
      )}
      <span id="status-hint" className="text-[13px] text-ink-muted">
        {hint}
      </span>
      {open && editable && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Ubah status"
          onKeyDown={onMenuKey}
          className="pop absolute left-0 top-[58px] z-20 flex w-[280px] max-w-[calc(100vw-48px)] flex-col gap-0.5 rounded-[12px] border border-line bg-panel p-1.5 shadow-overlay sm:left-[52px]"
        >
          {PROFILE_STATUSES.map((item) => {
            const on = item.value === extras.status;
            return (
              <button
                key={item.value}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  save({ ...extras, status: item.value });
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className={cn('flex min-h-11 flex-col gap-0.5 rounded-sm px-3 py-2.5 text-left hover:bg-panel-nested', on && 'bg-panel-nested')}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                  {item.value}
                  {on && <Check aria-hidden className="size-3.5" strokeWidth={2.2} />}
                </span>
                <span className="text-[12.5px] leading-snug text-ink-muted">{item.hint}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DemoAboutCard({ isPublic }: { isPublic: boolean }) {
  const [extras] = useExtras();
  const links = [
    { key: 'linkedin', value: extras.linkedin, add: 'Tambah LinkedIn' },
    { key: 'portfolio', value: extras.portfolio, add: 'Tambah portofolio' },
  ];
  return (
    <section aria-labelledby="tentang-title" className="flex flex-col gap-3.5 rounded-[18px] border border-line p-6">
      <h2 id="tentang-title" className="text-base font-semibold">
        Tentang
      </h2>
      {extras.bio ? (
        <p className="text-[15px] leading-[1.65] text-ink-soft">{extras.bio}</p>
      ) : (
        <p className="text-sm text-ink-muted">{isPublic ? 'Belum ada bio.' : 'Tulis bio singkat supaya tim tahu kamu seperti apa.'}</p>
      )}
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => {
          const href = toExternalUrl(link.value);
          if (href) {
            return (
              <li key={link.key}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex min-h-11 items-center gap-[7px] rounded-sm border border-line px-3 text-[13px] font-medium hover:bg-panel-nested"
                >
                  <Link2 aria-hidden className="size-3.5" />
                  {link.value.replace(/^https?:\/\//i, '')}
                  <span className="sr-only"> (tab baru)</span>
                </a>
              </li>
            );
          }
          if (isPublic) return null;
          return (
            <li key={link.key}>
              <Link
                href="/profile/details"
                className="flex min-h-11 items-center gap-[7px] rounded-sm border border-dashed border-line-strong px-3 text-[13px] font-medium text-ink-muted hover:text-ink"
              >
                <Plus aria-hidden className="size-3.5" />
                {link.add}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function DemoTeamCard() {
  const [extras] = useExtras();
  return (
    <section aria-labelledby="tim-title" className="flex flex-col gap-4 rounded-[18px] border border-line p-6">
      <h2 id="tim-title" className="text-base font-semibold">
        Di dalam tim
      </h2>
      <div className="flex flex-col gap-2">
        <span id="peran-label" className="text-[12.5px] text-ink-muted">
          Peran
        </span>
        <ul aria-labelledby="peran-label" className="flex flex-wrap gap-1.5">
          {extras.roles.map((role) => (
            <li key={role} className="flex h-7 items-center rounded-[7px] bg-brand px-2.5 text-[12.5px] font-semibold text-on-brand">
              {role}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <span id="keahlian-label" className="text-[12.5px] text-ink-muted">
          Keahlian
        </span>
        <ul aria-labelledby="keahlian-label" className="flex flex-wrap gap-1.5">
          {extras.skills.map((skill) => (
            <li key={skill} className="flex h-7 items-center rounded-[7px] border border-line px-2.5 text-[12.5px]">
              {skill}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function DemoPhone() {
  const [extras] = useExtras();
  if (!extras.phone) return null;
  return (
    <a href={`tel:${extras.phone.replace(/[^\d+]/g, '')}`} className="flex min-h-11 items-center gap-2.5 text-[13.5px] hover:underline">
      <Phone aria-hidden className="size-4" />
      {extras.phone}
    </a>
  );
}

export function DemoAchievements({ isPublic }: { isPublic: boolean }) {
  const [extras] = useExtras();
  return (
    <section aria-labelledby="pencapaian-title" className="flex flex-col gap-1.5 rounded-[18px] border border-line p-6">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="pencapaian-title" className="text-base font-semibold">
          Pencapaian di luar StudentFo
        </h2>
        <span className="text-[12.5px] text-ink-muted">Contoh — tersimpan di peramban ini, belum tampil ke orang lain</span>
      </div>
      {extras.achievements.length > 0 ? (
        <ol className="flex flex-col">
          {extras.achievements.map((item) => (
            <li key={`${item.title}-${item.year}`} className="grid grid-cols-[64px_minmax(0,1fr)] gap-4 border-t border-line py-3.5">
              <span className="pt-px font-mono text-sm font-medium text-ink-muted">{item.year}</span>
              <span className="flex flex-col gap-[3px]">
                <span className="text-[15px] font-semibold">{item.title}</span>
                <span className="text-[13.5px] text-ink-muted">{item.event}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="border-t border-line py-3.5 text-sm text-ink-muted">Belum ada pencapaian yang ditambahkan.</p>
      )}
      {!isPublic && (
        <Link
          href="/profile/details#pencapaian"
          className="mt-2.5 flex h-11 items-center gap-1.5 self-start rounded-card border border-dashed border-line-strong px-3.5 text-[13.5px] font-semibold hover:border-brand"
        >
          <Plus aria-hidden className="size-3.5" />
          Tambah pencapaian
        </Link>
      )}
    </section>
  );
}
