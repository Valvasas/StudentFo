'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Berkas sekecil ini dikirim apa adanya (metadata tetap dibuang server). */
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

interface Preview {
  readonly url: string;
  readonly name: string;
  readonly size: number;
  readonly file: File;
  readonly caption: string;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Perkecil foto di peramban sebelum dikirim (ADR-056): sisi terpanjang
 * `maxEdge`, JPEG ±85%. Foto ponsel 4–8 MB jadi ±300–600 KB — unggahan di
 * jaringan seluler selesai dalam hitungan detik, bukan menit. Menggambar ulang
 * di kanvas juga membuang EXIF/GPS dan "membakar" orientasi ke piksel.
 * `null` = biarkan berkas aslinya (kecil, atau peramban tidak mampu).
 */
async function shrink(file: File, maxEdge: number): Promise<File | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (file.size <= KEEP_AS_IS_BYTES && longest <= maxEdge) return null;
    const scale = Math.min(1, maxEdge / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    // Latar putih: PNG transparan → JPEG tanpa ini jadi hitam.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return null;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

/**
 * Isian unggah gambar. Tanpa JavaScript tetap `<input type="file">` biasa —
 * server memeriksa jenis dari byte & membuang metadata sendiri
 * (`lib/image-file.ts`). Dengan JavaScript: pratinjau, batas jumlah, dan
 * kompresi. Selama mengompres, input diberi `setCustomValidity` supaya form
 * tidak terkirim dengan berkas setengah jadi.
 *
 * `captionName` (slide, ADR-094): tiap gambar terpilih mendapat kotak
 * keterangan bernama sama — urutannya sejajar berkas — dan bisa digeser atau
 * dilepas satu per satu sebelum dikirim; urutan berkas di input ikut berubah,
 * jadi yang tiba di server persis urutan yang dilihat pengirim.
 */
export function ImageUploadField({
  id,
  name,
  label,
  hint,
  multiple = false,
  maxFiles = 1,
  maxEdge = 1920,
  required = false,
  captionName,
  captionPlaceholder = 'Keterangan, mis. Alur lomba',
  captionMax = 140,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  multiple?: boolean;
  maxFiles?: number;
  maxEdge?: number;
  required?: boolean;
  captionName?: string;
  captionPlaceholder?: string;
  captionMax?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<readonly Preview[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const statusId = useId();
  const hintId = `${id}-hint`;
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    // Berkas yang dipilih sebelum hidrasi tidak memicu onChange React.
    if (input.current?.files?.length) void onChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Urutan & isi input berkas = urutan pratinjau (DataTransfer — satu-satunya cara menyusun FileList). */
  function commit(next: readonly Preview[]) {
    const element = input.current;
    if (element) {
      const transfer = new DataTransfer();
      next.forEach((preview) => transfer.items.add(preview.file));
      element.files = transfer.files;
    }
    for (const preview of previews) {
      if (!next.includes(preview)) {
        URL.revokeObjectURL(preview.url);
        urls.current.delete(preview.url);
      }
    }
    setPreviews(next);
  }

  async function onChange() {
    const element = input.current;
    if (!element?.files) return;
    const chosen = [...element.files];
    const notes: string[] = [];
    const valid = chosen.filter((file) => (ACCEPTED as readonly string[]).includes(file.type));
    if (valid.length < chosen.length) notes.push('Berkas selain JPG, PNG, atau WebP dilewati.');
    if (valid.length > maxFiles) notes.push(`Maksimal ${maxFiles} gambar sekali unggah — sisanya dilewati.`);
    const picked = valid.slice(0, maxFiles);

    setCleared(false);
    setBusy(true);
    element.setCustomValidity('Tunggu, foto sedang diperkecil…');
    try {
      const prepared = await Promise.all(picked.map(async (file) => (await shrink(file, maxEdge).catch(() => null)) ?? file));
      previews.forEach((preview) => {
        URL.revokeObjectURL(preview.url);
        urls.current.delete(preview.url);
      });
      const next = prepared.map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        return { url, name: file.name, size: file.size, file, caption: '' };
      });
      const transfer = new DataTransfer();
      next.forEach((preview) => transfer.items.add(preview.file));
      element.files = transfer.files;
      setPreviews(next);
    } finally {
      element.setCustomValidity('');
      setBusy(false);
      setMessage(notes.length > 0 ? notes.join(' ') : null);
    }
  }

  function clear() {
    if (input.current) {
      input.current.value = '';
      // Tombol ini hilang bersama pratinjau; tanpa ini fokus jatuh ke <body>.
      input.current.focus();
    }
    previews.forEach((preview) => {
      URL.revokeObjectURL(preview.url);
      urls.current.delete(preview.url);
    });
    setPreviews([]);
    setMessage(null);
    setCleared(true);
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= previews.length) return;
    const next = [...previews];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    commit(next);
    setAnnouncement(`Gambar dipindah ke urutan ${target + 1} dari ${next.length}.`);
    // Tombol yang ditekan bisa nonaktif di posisi baru — fokus pindah ke kotak keterangannya.
    requestAnimationFrame(() => document.getElementById(`${id}-caption-${target}`)?.focus());
  }

  function removeAt(index: number) {
    const next = previews.filter((_, position) => position !== index);
    if (next.length === 0) {
      clear();
      return;
    }
    commit(next);
    setAnnouncement(`Gambar ${index + 1} dilepas. ${next.length} gambar tersisa.`);
    requestAnimationFrame(() => document.getElementById(`${id}-caption-${Math.min(index, next.length - 1)}`)?.focus());
  }

  function setCaption(index: number, caption: string) {
    setPreviews((current) => current.map((preview, position) => (position === index ? { ...preview, caption } : preview)));
  }

  const withCaptions = Boolean(captionName) && previews.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-[13.5px] font-semibold text-ink">
        {label}
      </label>
      <label
        htmlFor={id}
        className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line-strong/70 bg-panel px-4 py-5 text-center transition-colors duration-150 ease-snap hover:border-brand hover:bg-panel-nested has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
      >
        <ImagePlus aria-hidden className="size-6 text-ink-muted" />
        <span className="text-sm font-semibold">{multiple ? (previews.length > 0 ? 'Ganti pilihan gambar' : 'Pilih gambar') : 'Pilih gambar'}</span>
        <span className="text-[12.5px] text-ink-muted">JPG, PNG, atau WebP{multiple ? ` · maks. ${maxFiles}` : ''}</span>
        <input
          ref={input}
          id={id}
          name={name}
          type="file"
          accept={ACCEPTED.join(',')}
          multiple={multiple}
          required={required}
          aria-describedby={`${hintId} ${statusId}`}
          onChange={onChange}
          // Tanpa JavaScript, input asli yang menunjukkan berkas terpilih; dengan JS
          // kotak & pratinjau yang mengambil alih — tanpa ganti tampilan saat hidrasi.
          className="sr-only noscript:not-sr-only noscript:mt-2 noscript:block noscript:max-w-full noscript:text-sm"
        />
      </label>
      <p id={hintId} className="text-[12.5px] leading-snug text-ink-muted">
        {hint}
      </p>
      <p id={statusId} role="status" className={cn('text-[12.5px] text-caution', !busy && !message && 'sr-only')}>
        {busy
          ? 'Menyiapkan foto…'
          : (message ?? (previews.length > 0 ? `${previews.length} gambar siap dikirim.` : cleared ? 'Pilihan dibatalkan.' : ''))}
      </p>
      {withCaptions ? (
        <ol className="flex flex-col gap-2" aria-label="Urutan gambar yang akan dikirim">
          {previews.map((preview, index) => (
            <li key={preview.url} className="flex items-center gap-2.5 rounded-card border border-line bg-panel p-2">
              <span aria-hidden className="w-5 shrink-0 text-center text-[12.5px] font-semibold tabular-nums text-ink-muted">
                {index + 1}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL blob lokal, bukan aset yang bisa dioptimasi */}
              <img src={preview.url} alt="" className="size-14 shrink-0 rounded-sm border border-line object-cover" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor={`${id}-caption-${index}`} className="sr-only">
                  Keterangan gambar {index + 1}
                </label>
                <input
                  id={`${id}-caption-${index}`}
                  name={captionName}
                  value={preview.caption}
                  maxLength={captionMax}
                  onChange={(event) => setCaption(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                  placeholder={captionPlaceholder}
                  autoComplete="off"
                  className="min-h-11 w-full min-w-0 rounded-card border border-line bg-canvas px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                />
                <span className="truncate text-[11.5px] text-ink-muted">{formatSize(preview.size)}</span>
              </span>
              <span className="flex shrink-0 flex-col sm:flex-row">
                <IconButton label={`Naikkan gambar ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp aria-hidden className="size-4" />
                </IconButton>
                <IconButton label={`Turunkan gambar ${index + 1}`} disabled={index === previews.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDown aria-hidden className="size-4" />
                </IconButton>
              </span>
              <IconButton label={`Lepas gambar ${index + 1}`} onClick={() => removeAt(index)}>
                <X aria-hidden className="size-4" />
              </IconButton>
            </li>
          ))}
        </ol>
      ) : (
        previews.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((preview) => (
              <li key={preview.url} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL blob lokal, bukan aset yang bisa dioptimasi */}
                <img src={preview.url} alt="" className="aspect-square w-full rounded-sm border border-line object-cover" />
                <span className="truncate text-[11.5px] text-ink-muted">{formatSize(preview.size)}</span>
              </li>
            ))}
          </ul>
        )
      )}
      {previews.length > 0 && (
        <button
          type="button"
          onClick={clear}
          className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm px-2 text-sm font-medium text-ink-muted hover:text-ink"
        >
          <X aria-hidden className="size-4" /> Batalkan {previews.length > 1 ? 'semua pilihan' : 'pilihan'}
        </button>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function IconButton({ label, disabled = false, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
