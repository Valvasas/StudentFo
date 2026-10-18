'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleDot } from 'lucide-react';
import { FORM_BUILDER_CHANGE_EVENT } from '@/components/organizer/form-builder';
import {
  REGISTRATION_SETTING_NAMES,
  registrationSettingsIssues,
  type RegistrationSettingName,
} from '@/components/organizer/registration-settings';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';

function snapshot(form: HTMLFormElement): string {
  const data = new FormData(form);
  return [...data.entries()].map(([key, value]) => `${key}=${typeof value === 'string' ? value : ''}`).join('&');
}

function settingControl(form: HTMLFormElement, name: RegistrationSettingName) {
  const element = form.elements.namedItem(name);
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : null;
}

function syncSettingsValidity(form: HTMLFormElement) {
  const value = (name: RegistrationSettingName) => settingControl(form, name)?.value ?? '';
  const issues = registrationSettingsIssues({
    capacity: value('capacity'),
    feeAmount: value('feeAmount'),
    paymentInstructions: value('paymentInstructions'),
  });
  for (const name of REGISTRATION_SETTING_NAMES) settingControl(form, name)?.setCustomValidity(issues[name]);
}

/**
 * Bilah simpan yang menempel di bawah formulir pengaturan pendaftaran.
 *
 * "Belum disimpan" dihitung dari isi FormData dibanding saat halaman dibuka,
 * bukan sekadar "pernah diketik" — mengembalikan isian ke semula
 * menghilangkan tandanya. Tanpa JavaScript bilah ini tetap tombol simpan biasa.
 *
 * Kuota & biaya yang pasti ditolak server ditahan peramban lebih dulu
 * (`registrationSettingsIssues`): pengalihan galat memasang ulang halaman
 * dan membuang pertanyaan yang belum disimpan.
 */
export function RegistrationSaveBar({ savedLabel }: { savedLabel: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const initial = snapshot(form);
    const check = () => {
      setDirty(snapshot(form) !== initial);
      syncSettingsValidity(form);
    };
    // Formulir baru mewarisi biaya acara dengan instruksi kosong — harus tertahan sebelum diketik apa pun.
    syncSettingsValidity(form);
    form.addEventListener('input', check);
    form.addEventListener('change', check);
    form.addEventListener(FORM_BUILDER_CHANGE_EVENT, check);
    return () => {
      form.removeEventListener('input', check);
      form.removeEventListener('change', check);
      form.removeEventListener(FORM_BUILDER_CHANGE_EVENT, check);
      for (const name of REGISTRATION_SETTING_NAMES) settingControl(form, name)?.setCustomValidity('');
    };
  }, []);

  return (
    <div
      ref={ref}
      className="sticky bottom-0 z-20 -mx-5 flex items-center justify-between gap-3 border-t border-line bg-canvas/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-canvas/85 sm:mx-0 sm:rounded-t-card sm:border-x sm:px-4"
    >
      <p aria-live="polite" className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-ink-muted">
        {dirty ? (
          <>
            <CircleDot aria-hidden className="size-4 shrink-0 text-caution" />
            <span className="font-medium text-ink">Belum disimpan</span>
          </>
        ) : savedLabel ? (
          <>
            <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
            <span className="truncate">{savedLabel}</span>
          </>
        ) : (
          <span>Belum pernah disimpan</span>
        )}
      </p>
      <SubmitButton pendingLabel="Menyimpan…" className={buttonVariants({ className: 'shrink-0' })}>
        Simpan formulir
      </SubmitButton>
    </div>
  );
}
