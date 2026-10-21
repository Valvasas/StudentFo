'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { inviteMatchAction } from '@/app/teams/cocok/actions';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { TextArea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';
import type { DeckSlide } from './deck-context';

/**
 * Lembar "Tinjau ajakan": satu-satunya tempat ajakan dikirim saat JS hidup.
 * Gestur geser/panah hanya membuka lembar ini; yang mengirim adalah tombol
 * "Kirim ajakan" (form POST ke Server Action yang sama dengan form di kartu).
 * Skor ditulis sebagai teks, bukan role="img", supaya hitungan "Kecocokan N
 * persen" per kartu tidak ganda.
 */
export function InviteSheet({
  target,
  returnTo,
  messageMax,
  onClose,
}: {
  target: DeckSlide | null;
  returnTo: string;
  messageMax: number;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pressStartedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (target && !dialog.open) {
      dialog.showModal();
      // Fokus awal ke judul: pembaca layar membaca konteks dulu, textarea cukup satu Tab.
      headingRef.current?.focus();
    } else if (!target && dialog.open) {
      dialog.close();
    }
  }, [target]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={target ? 'sheet-judul' : undefined}
      onClose={onClose}
      onPointerDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Menyeret pilihan teks dari textarea lalu melepas di luar juga memicu klik pada <dialog>; hanya tutup bila tekan dimulai di latar.
        if (event.target === event.currentTarget && pressStartedOnBackdrop.current) onClose();
        pressStartedOnBackdrop.current = false;
      }}
      className="sheet-up sm:sheet-pop m-0 mt-auto max-h-[86dvh] w-full max-w-none overflow-y-auto rounded-t-[24px] border border-line bg-panel p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-[440px] sm:rounded-[24px]"
    >
      {target && <SheetBody key={target.id} target={target} returnTo={returnTo} messageMax={messageMax} headingRef={headingRef} onClose={onClose} />}
    </dialog>
  );
}

function SheetBody({
  target,
  returnTo,
  messageMax,
  headingRef,
  onClose,
}: {
  target: DeckSlide;
  returnTo: string;
  messageMax: number;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  const [length, setLength] = useState(0);
  return (
    <div className="flex flex-col gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="flex items-center gap-3">
        <Avatar name={target.name} seed={target.id} size="md" />
        <h2 id="sheet-judul" ref={headingRef} tabIndex={-1} className="min-w-0 text-[19px] font-bold leading-tight tracking-[-0.02em] outline-none">
          Ajak {target.name} jadi partner?
        </h2>
      </div>
      <p className="text-[13.5px] text-ink-muted">
        {target.chemistry} · {target.score} persen cocok
      </p>
      {target.reason && (
        <p className="flex items-start gap-2 text-[14px]">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          {target.reason}
        </p>
      )}
      <form action={inviteMatchAction} className="flex flex-col gap-4">
        <input type="hidden" name="targetId" value={target.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sheet-pesan" className="text-[13.5px] font-semibold">
            Pesan pengantar (opsional)
          </label>
          <TextArea
            id="sheet-pesan"
            name="message"
            rows={3}
            maxLength={messageMax}
            onChange={(event) => setLength(event.currentTarget.value.length)}
            placeholder="Mis. “Halo, aku lihat kita sama-sama ikut lomba data. Mau satu tim?”"
          />
          <span className="flex justify-between gap-3 text-[11.5px] text-ink-muted">
            <span>Hanya terlihat oleh orang yang kamu ajak.</span>
            <span className="tabular-nums">
              {length}/{messageMax}
            </span>
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Ajakan baru terkirim setelah kamu menekan Kirim. Dia yang memutuskan menerima atau tidak. Email dan nomormu tidak ikut terkirim.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <SubmitButton pendingLabel="Mengirim…" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full sm:w-auto sm:flex-1')}>
            Kirim ajakan
          </SubmitButton>
          <button type="button" onClick={onClose} className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full sm:w-auto')}>
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}
