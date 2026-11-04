'use client';

import { Bookmark } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Tombol simpan berikon yang langsung menampilkan HASIL ketukan (penanda
 * terisi + `save-pop`) selama Server Action berjalan, alih-alih pemutar.
 * Simpan/batal adalah aksi yang hampir tidak pernah gagal; menunggu 0,3–2
 * detik dengan pemutar membuat ketukan terasa tidak terdaftar, dan orang
 * mengetuk lagi (= batal tanpa sengaja). Bila aksinya gagal, halaman
 * dirender ulang dari data sungguhan dan ikonnya kembali ke keadaan benar.
 * Tanpa JavaScript tetap `<button type="submit">` biasa.
 */
export function BookmarkSubmit({
  isSaved,
  className,
  savedClassName,
}: {
  isSaved: boolean;
  className?: string;
  savedClassName?: string;
}) {
  const { pending } = useFormStatus();
  const showSaved = pending ? !isSaved : isSaved;
  const label = pending ? (isSaved ? 'Menghapus dari simpanan…' : 'Menyimpan…') : isSaved ? 'Hapus dari simpanan' : 'Simpan kegiatan';

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={label}
      title={label}
      className={cn(className, showSaved && savedClassName, pending && 'cursor-progress')}
    >
      <Bookmark aria-hidden className={cn('size-4', showSaved && 'fill-current', pending && showSaved && 'save-pop')} />
    </button>
  );
}
