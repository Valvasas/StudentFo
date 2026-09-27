'use client';

import { useEffect, useState } from 'react';
import { Bell, Check, RotateCcw } from 'lucide-react';
import { useDemoStore } from '@/components/demo/use-demo-store';
import { DetailCard, detailPrimaryButton } from '@/components/profile/detail-card';
import { DEMO_STORE_EVENT } from '@/lib/demo/browser-store';
import {
  CHANNEL_LABEL,
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PREFS_KEY,
  NOTIFICATION_TOPICS,
  REMINDER_DAYS,
  REMINDER_HOURS,
  parseNotificationPrefs,
  type NotificationPrefs,
} from '@/lib/demo/notification-prefs';
import { cn } from '@/lib/utils';

function Toast({ message }: { message: string }) {
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {message && (
        <span className="pop flex items-center gap-2 rounded-card bg-inverse px-4 py-3 text-sm font-medium text-on-inverse shadow-overlay">
          <Check aria-hidden className="size-4" strokeWidth={2.4} />
          {message}
        </span>
      )}
    </div>
  );
}

function useToast() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 2400);
    return () => window.clearTimeout(timer);
  }, [message]);
  return [message, setMessage] as const;
}

const chip = (on: boolean) =>
  cn(
    'relative flex h-9 items-center gap-1.5 rounded-sm border px-3 text-[13.5px] font-medium transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]',
    on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong/70 bg-panel hover:border-line-strong',
  );

/**
 * Matriks notifikasi (kanvas Pengaturan): topik × kanal, plus pengingat
 * tenggat H-7/H-3/H-1. Tersimpan otomatis tiap ketukan, seperti kanvas.
 */
export function DemoNotificationCard({ delay }: { delay: number }) {
  const [prefs, save, loaded] = useDemoStore<NotificationPrefs>(NOTIFICATION_PREFS_KEY, DEFAULT_NOTIFICATION_PREFS, parseNotificationPrefs);
  const [toast, setToast] = useToast();

  const update = (next: NotificationPrefs) => {
    save(next);
    setToast('Preferensi notifikasi disimpan.');
  };
  const days = [...prefs.days].sort((left, right) => right - left);
  const summary = days.length
    ? `Kamu diingatkan ${days.map((day) => `H-${day}`).join(', ')} pukul ${prefs.hour} WIB.`
    : 'Pengingat tenggat mati. Pilih minimal satu hari supaya tidak ada tenggat yang terlewat.';

  return (
    <DetailCard id="notifikasi" icon={<Bell className="size-[18px]" />} title="Notifikasi" description="Pilih kabar apa yang dikirim, dan lewat mana." delay={delay}>
      <div className="min-w-0 max-w-full overflow-x-auto px-5 sm:px-6">
        <table className="w-full min-w-[440px] border-collapse text-left">
          <caption className="sr-only">Kanal untuk setiap jenis notifikasi</caption>
          <thead>
            <tr className="text-[12.5px] text-ink-muted">
              <th scope="col" className="pb-2 font-medium">
                Jenis
              </th>
              {NOTIFICATION_CHANNELS.map((channel) => (
                <th key={channel} scope="col" className="w-[84px] pb-2 text-center font-medium">
                  {CHANNEL_LABEL[channel]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_TOPICS.map((topic) => (
              <tr key={topic.key} className="border-t border-line/70">
                <th scope="row" className="py-3 pr-3 font-normal">
                  <span className="block text-[14.5px] font-semibold">{topic.label}</span>
                  <span className="block text-[12.5px] text-ink-muted">{topic.sub}</span>
                </th>
                {NOTIFICATION_CHANNELS.map((channel) => {
                  const on = prefs.matrix[topic.key].includes(channel);
                  return (
                    <td key={channel} className="text-center">
                      <label className="relative inline-flex size-11 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!loaded}
                          onChange={() =>
                            update({
                              ...prefs,
                              matrix: {
                                ...prefs.matrix,
                                [topic.key]: on ? prefs.matrix[topic.key].filter((item) => item !== channel) : [...prefs.matrix[topic.key], channel],
                              },
                            })
                          }
                          className="peer sr-only"
                        />
                        <span
                          aria-hidden
                          className="flex size-[22px] items-center justify-center rounded-[6px] border border-line-strong text-on-brand transition-colors duration-150 peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
                        >
                          {on && <Check className="size-3.5" strokeWidth={2.6} />}
                        </span>
                        <span className="sr-only">
                          {topic.label} lewat {CHANNEL_LABEL[channel]}
                        </span>
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-col gap-4 border-t border-line px-5 py-5 sm:px-6">
        <fieldset className="flex flex-col gap-2" disabled={!loaded}>
          <legend className="mb-2 text-[14.5px] font-semibold">Pengingat tenggat</legend>
          <div className="flex flex-wrap gap-1.5">
            {REMINDER_DAYS.map((day) => {
              const on = prefs.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ ...prefs, days: on ? prefs.days.filter((item) => item !== day) : [...prefs.days, day] })}
                  className={chip(on)}
                >
                  {on && <Check aria-hidden className="size-[13px]" strokeWidth={2.4} />}H-{day}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="reminder-hour" className="text-[13.5px] font-semibold">
            Dikirim pukul
          </label>
          <select
            id="reminder-hour"
            value={prefs.hour}
            disabled={!loaded}
            onChange={(event) => {
              const hour = REMINDER_HOURS.find((item) => item === event.target.value);
              if (hour) update({ ...prefs, hour });
            }}
            className="h-11 rounded-card border border-line-strong/70 bg-panel px-3 text-base hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {REMINDER_HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {hour} WIB
              </option>
            ))}
          </select>
        </div>
        <p className={cn('flex items-start gap-2 rounded-card px-3.5 py-3 text-[13.5px]', days.length ? 'bg-panel-nested' : 'border border-dashed border-line-strong')}>
          <Bell aria-hidden className="mt-0.5 size-4 shrink-0" />
          {summary}
        </p>
        <p className="text-[12.5px] text-ink-muted">Mode demo: pilihan ini tersimpan di perangkat ini dan belum mengirim email atau WhatsApp sungguhan.</p>
      </div>
      <Toast message={toast} />
    </DetailCard>
  );
}

/**
 * Pengganti "Hapus akun" di mode demo. Akun demo tidak bisa dihapus (dan
 * kanvas butuh backend penghapusan), jadi yang benar-benar bisa dihapus
 * pengguna adalah data demo di perangkatnya sendiri. Konfirmasi ketik
 * "HAPUS" dari kanvas tetap dipakai supaya tidak terhapus tidak sengaja.
 */
export function DemoResetCard({ delay }: { delay: number }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [toast, setToast] = useToast();

  const reset = () => {
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith('sf-demo-'))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Penyimpanan diblokir: tidak ada yang perlu dihapus.
    }
    window.dispatchEvent(new Event(DEMO_STORE_EVENT));
    setOpen(false);
    setTyped('');
    setToast('Data demo di perangkat ini sudah dihapus.');
  };

  return (
    <DetailCard
      id="reset"
      icon={<RotateCcw className="size-[18px]" />}
      title="Hapus data demo"
      description="Tidak bisa dibatalkan."
      delay={delay}
    >
      <div className="flex flex-col gap-4 px-5 pb-6 sm:px-6">
        <p className="max-w-[62ch] text-[14px] leading-relaxed text-ink-soft">
          Menghapus profil publik, kontak, pencapaian, dokumen, catatan persiapan, dan preferensi yang tersimpan di peramban ini. Akun demo dan data
          contoh di server tidak berubah.
        </p>
        {open ? (
          <div className="flex flex-col gap-3 rounded-card border border-danger-line bg-danger-soft/40 p-4">
            <label htmlFor="confirm-reset" className="text-[13.5px]">
              Ketik <strong className="font-mono">HAPUS</strong> untuk konfirmasi.
            </label>
            <input
              id="confirm-reset"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              className="h-11 max-w-[240px] rounded-card border border-line-strong/70 bg-panel px-3.5 font-mono text-base focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={typed.trim() !== 'HAPUS'} onClick={reset} className={cn(detailPrimaryButton, 'bg-danger hover:bg-danger disabled:cursor-not-allowed disabled:opacity-40')}>
                Hapus permanen
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setTyped('');
                }}
                className="flex h-11 items-center rounded-sm px-3 text-[13.5px] font-semibold hover:bg-panel-nested sm:h-[34px]"
              >
                Batal
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-11 items-center gap-2 self-start rounded-card border border-danger-line px-4 text-[14px] font-semibold text-danger transition-colors duration-150 hover:bg-danger-soft"
          >
            <RotateCcw aria-hidden className="size-4" />
            Hapus data demo saya
          </button>
        )}
      </div>
      <Toast message={toast} />
    </DetailCard>
  );
}
