'use client';

import { useState } from 'react';
import { Download, Eye, Globe, Lock, MessageCircle, Users } from 'lucide-react';
import { useDemoStore } from '@/components/demo/use-demo-store';
import { DetailCard, detailButton } from '@/components/profile/detail-card';
import { DEFAULT_PROFILE_EXTRAS, DOCUMENTS_KEY, PROFILE_EXTRAS_KEY, parseProfileExtras, type ProfileExtras } from '@/lib/demo/profile-extras';
import {
  AUDIENCES,
  AUDIENCE_LABEL,
  DEFAULT_PRIVACY_PREFS,
  MESSAGE_POLICIES,
  PRIVACY_PREFS_KEY,
  VISIBILITY_FIELDS,
  canSee,
  parsePrivacyPrefs,
  type Audience,
  type PrivacyPrefs,
} from '@/lib/demo/privacy-prefs';
import { cn } from '@/lib/utils';

const AUDIENCE_ICON = { publik: Globe, tim: Users, aku: Lock } as const;

function Switch({ checked, onChange, label, sub, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; sub: string; disabled: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-t border-line/70 py-3.5">
      <span className="flex flex-col gap-0.5">
        <span className="text-[14.5px] font-semibold">{label}</span>
        <span className="text-[12.5px] text-ink-muted">{sub}</span>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-[22px] w-[38px] shrink-0 rounded-[11px] bg-line-strong transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:size-[18px] after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,.2)] after:transition-transform after:duration-200 after:content-[''] peer-checked:bg-brand peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
      />
    </label>
  );
}

/**
 * Kendali visibilitas + pratinjau "profilmu di mata orang lain" (kanvas
 * Privasi). Mode data contoh saja — kolom yang diatur di sini belum ada di
 * database (ADR-039).
 */
export function DemoPrivacyControls({ name, major }: { name: string; major: string | null }) {
  const [prefs, save, loaded] = useDemoStore<PrivacyPrefs>(PRIVACY_PREFS_KEY, DEFAULT_PRIVACY_PREFS, parsePrivacyPrefs);
  const [extras] = useDemoStore<ProfileExtras>(PROFILE_EXTRAS_KEY, DEFAULT_PROFILE_EXTRAS, parseProfileExtras);
  const [viewer, setViewer] = useState<'publik' | 'tim'>('publik');
  const see = (key: keyof PrivacyPrefs['visibility']) => canSee(prefs.visibility[key], viewer);
  const hidden = VISIBILITY_FIELDS.filter(({ key }) => !see(key)).length;

  return (
    <>
      <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        <DetailCard id="visibilitas" icon={<Eye className="size-[18px]" />} title="Siapa yang bisa melihat" description="Nama dan program studi selalu terlihat oleh anggota timmu." delay={120}>
          <div className="flex flex-col px-5 pb-4 sm:px-6">
            {VISIBILITY_FIELDS.map((field) => (
              <fieldset key={field.key} disabled={!loaded} className="flex flex-col gap-2 border-t border-line/70 py-3.5">
                <legend className="float-left mb-2 w-full text-[14.5px] font-semibold">{field.label}</legend>
                <div className="flex flex-wrap gap-0.5 self-start rounded-card bg-panel-nested p-[3px]">
                  {AUDIENCES.map((audience) => {
                    const Icon = AUDIENCE_ICON[audience];
                    return (
                      <label
                        key={audience}
                        className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-[13px] font-medium text-ink-muted transition-colors duration-150 hover:text-ink has-[:checked]:bg-panel has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgba(0,0,0,.1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus sm:min-h-8"
                      >
                        <input
                          type="radio"
                          name={`vis-${field.key}`}
                          value={audience}
                          checked={prefs.visibility[field.key] === audience}
                          onChange={() => save({ ...prefs, visibility: { ...prefs.visibility, [field.key]: audience as Audience } })}
                          className="sr-only"
                        />
                        <Icon aria-hidden className="size-3.5" />
                        {AUDIENCE_LABEL[audience]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </DetailCard>

        <section aria-labelledby="pratinjau-title" className="enter flex flex-col gap-4 rounded-[18px] bg-inverse p-5 text-on-inverse [animation-delay:180ms] [animation-duration:800ms] sm:p-6 lg:sticky lg:top-[92px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="pratinjau-title" className="font-mono text-[11.5px] font-normal tracking-[.08em] text-on-inverse-muted">
              PRATINJAU PROFILMU
            </h2>
            <div role="group" aria-label="Dilihat sebagai" className="flex gap-0.5 rounded-sm bg-inverse-nested p-[3px]">
              {(['publik', 'tim'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={viewer === item}
                  onClick={() => setViewer(item)}
                  className={cn('flex min-h-11 items-center rounded-[6px] px-3 text-[12.5px] font-medium transition-colors sm:min-h-8', viewer === item ? 'bg-on-inverse text-inverse' : 'text-on-inverse-muted hover:text-on-inverse')}
                >
                  {item === 'publik' ? 'Pengguna lain' : 'Anggota tim'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-[14px] bg-inverse-nested p-4">
            <span className="text-lg font-semibold tracking-[-0.015em]">{name}</span>
            <span className="text-[13px] text-on-inverse-muted">{major ?? 'Program studi belum diisi'}</span>
            {see('headline') && extras.headline && <p className="text-[14px] leading-snug">{extras.headline}</p>}
            <dl className="flex flex-col gap-2 text-[13px]">
              {see('city') && extras.city && (
                <div className="flex justify-between gap-3">
                  <dt className="text-on-inverse-muted">Kota</dt>
                  <dd>{extras.city}</dd>
                </div>
              )}
              {see('contact') && (
                <div className="flex justify-between gap-3">
                  <dt className="text-on-inverse-muted">Kontak</dt>
                  <dd className="truncate">{extras.phone || extras.linkedin || '—'}</dd>
                </div>
              )}
              {see('achievements') && (
                <div className="flex justify-between gap-3">
                  <dt className="text-on-inverse-muted">Pencapaian</dt>
                  <dd>{extras.achievements.length}</dd>
                </div>
              )}
            </dl>
          </div>
          <p aria-live="polite" className="flex items-center gap-2 text-[13px] text-on-inverse-muted">
            <Lock aria-hidden className="size-3.5" />
            {hidden} data disembunyikan dari {viewer === 'publik' ? 'pengguna lain' : 'anggota tim'}
          </p>
        </section>
      </div>

      <DetailCard id="interaksi" icon={<MessageCircle className="size-[18px]" />} title="Interaksi" description="Siapa yang boleh menemukan dan menghubungimu." delay={200}>
        <div className="flex flex-col px-5 pb-5 sm:px-6">
          <Switch
            label="Tampil di Cari Tim"
            sub="Profilmu muncul saat tim mencari anggota."
            checked={prefs.listedInTeams}
            disabled={!loaded}
            onChange={(listedInTeams) => save({ ...prefs, listedInTeams })}
          />
          <Switch
            label="Terima ajakan tim"
            sub="Tim bisa mengajakmu lebih dulu."
            checked={prefs.acceptInvites}
            disabled={!loaded}
            onChange={(acceptInvites) => save({ ...prefs, acceptInvites })}
          />
          <fieldset disabled={!loaded} className="flex flex-col gap-2 border-t border-line/70 pt-3.5">
            <legend className="float-left mb-2 w-full text-[14.5px] font-semibold">Siapa yang boleh mengirim pesan</legend>
            <div className="flex flex-wrap gap-0.5 self-start rounded-card bg-panel-nested p-[3px]">
              {MESSAGE_POLICIES.map((policy) => (
                <label
                  key={policy.value}
                  className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-[13px] font-medium text-ink-muted transition-colors duration-150 hover:text-ink has-[:checked]:bg-panel has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgba(0,0,0,.1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus sm:min-h-8"
                >
                  <input type="radio" name="messages" value={policy.value} checked={prefs.messages === policy.value} onChange={() => save({ ...prefs, messages: policy.value })} className="sr-only" />
                  {policy.label}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-4 text-[12.5px] text-ink-muted">Mode demo: pilihan ini tersimpan di perangkat ini dan belum membatasi siapa pun di server.</p>
        </div>
      </DetailCard>
    </>
  );
}

/**
 * Unduh salinan data (hak akses UU PDP). Datanya dikirim server saat
 * halaman dirender — hanya milik pengguna yang sedang masuk — lalu
 * dirakit jadi berkas JSON di peramban. Di mode demo, isian yang tersimpan
 * di peramban ikut dimasukkan supaya salinannya lengkap.
 */
export function DownloadDataButton({ snapshot, includeLocal }: { snapshot: Record<string, unknown>; includeLocal: boolean }) {
  const download = () => {
    const local: Record<string, unknown> = {};
    if (includeLocal) {
      for (const key of [PROFILE_EXTRAS_KEY, DOCUMENTS_KEY, PRIVACY_PREFS_KEY]) {
        try {
          const raw = window.localStorage.getItem(key);
          if (raw) local[key] = JSON.parse(raw);
        } catch {
          // Isi rusak atau penyimpanan diblokir: lewati kunci ini saja.
        }
      }
    }
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), ...snapshot, ...(includeLocal ? { browserDemoData: local } : {}) }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'studentfo-data-saya.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button type="button" onClick={download} className={detailButton}>
      <Download aria-hidden className="size-3.5" />
      Unduh salinan dataku
    </button>
  );
}
