import Link from 'next/link';
import { ClipboardList, FileStack, ImagePlus, Megaphone, ShieldCheck } from 'lucide-react';
import { TakedownForm } from '@/components/admin/event-removal-forms';
import { workspacePath } from '@/components/organizer/event-workspace';
import { buttonVariants } from '@/components/ui/button';

/**
 * Alat moderator di halaman kegiatan (ADR-092) — hanya dirender untuk admin
 * yang lolos `checkAdminAccess()` (MFA). Menemukan salah posting paling
 * sering terjadi SAAT membuka halamannya, jadi hapus & perbaikan ada di sini,
 * bukan hanya di panel admin. Setiap aksi tetap memeriksa haknya sendiri.
 */
export function AdminEventTools({ event }: { event: { readonly id: string; readonly slug: string; readonly title: string } }) {
  return (
    <section aria-labelledby="alat-moderator" className="flex flex-col gap-3 rounded-[14px] border border-dashed border-line-strong p-4">
      <h2 id="alat-moderator" className="flex items-center gap-2 text-[15px] font-semibold">
        <ShieldCheck aria-hidden className="size-4" /> Alat moderator
      </h2>
      <div className="flex flex-wrap items-start gap-2">
        <Link href={workspacePath(event.id, 'formulir')} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          <ClipboardList aria-hidden /> Formulir & pendaftar
        </Link>
        <Link href={`/admin/media/${event.slug}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          <ImagePlus aria-hidden /> Poster & video
        </Link>
        <Link href={`/admin/promosi?q=${encodeURIComponent(event.title.slice(0, 80))}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <Megaphone aria-hidden /> Lencana & promosi
        </Link>
        <Link href={`/admin/acara?q=${encodeURIComponent(event.slug.slice(0, 80))}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <FileStack aria-hidden /> Kelola postingan
        </Link>
        <TakedownForm eventId={event.id} title={event.title} context={{ q: event.slug.slice(0, 80) }} />
      </div>
    </section>
  );
}
