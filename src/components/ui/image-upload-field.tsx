'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Berkas sekecil ini dikirim apa adanya (metadata tetap dibuang server). */
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

interface Preview {
  readonly url: string;
  readonly name: string;
  readonly size: number;
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
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  multiple?: boolean;
  maxFiles?: number;
  maxEdge?: number;
  required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<readonly Preview[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const statusId = useId();
  const hintId = `${id}-hint`;

  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  async function onChange() {
    const element = input.current;
    if (!element?.files) return;
    const chosen = [...element.files];
    const notes: string[] = [];
    const valid = chosen.filter((file) => (ACCEPTED as readonly string[]).includes(file.type));
    if (valid.length < chosen.length) notes.push('Berkas selain JPG, PNG, atau WebP dilewati.');
    if (valid.length > maxFiles) notes.push(`Maksimal ${maxFiles} foto sekali unggah — sisanya dilewati.`);
    const picked = valid.slice(0, maxFiles);

    setBusy(true);
    element.setCustomValidity('Tunggu, foto sedang diperkecil…');
    try {
      const prepared = await Promise.all(picked.map(async (file) => (await shrink(file, maxEdge).catch(() => null)) ?? file));
      const transfer = new DataTransfer();
      prepared.forEach((file) => transfer.items.add(file));
      element.files = transfer.files;
      setPreviews(prepared.map((file) => ({ url: URL.createObjectURL(file), name: file.name, size: file.size })));
    } finally {
      element.setCustomValidity('');
      setBusy(false);
      setMessage(notes.length > 0 ? notes.join(' ') : null);
    }
  }

  function clear() {
    if (input.current) input.current.value = '';
    setPreviews([]);
    setMessage(null);
  }

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
        <span className="text-sm font-semibold">{multiple ? 'Pilih foto' : 'Pilih gambar'}</span>
        <span className="text-[12.5px] text-ink-muted">JPG, PNG, atau WebP</span>
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
          className="sr-only"
        />
      </label>
      <p id={hintId} className="text-[12.5px] leading-snug text-ink-muted">
        {hint}
      </p>
      <p id={statusId} role="status" className={cn('text-[12.5px] text-caution', !busy && !message && 'sr-only')}>
        {busy ? 'Menyiapkan foto…' : message ?? (previews.length > 0 ? `${previews.length} gambar siap dikirim.` : '')}
      </p>
      {previews.length > 0 && (
        <div className="flex flex-col gap-2">
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((preview) => (
              <li key={preview.url} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL blob lokal, bukan aset yang bisa dioptimasi */}
                <img src={preview.url} alt="" className="aspect-square w-full rounded-sm border border-line object-cover" />
                <span className="truncate text-[11.5px] text-ink-muted">{formatSize(preview.size)}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={clear}
            className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm px-2 text-sm font-medium text-ink-muted hover:text-ink"
          >
            <X aria-hidden className="size-4" /> Batalkan pilihan
          </button>
        </div>
      )}
    </div>
  );
}
