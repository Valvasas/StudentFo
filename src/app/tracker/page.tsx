import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Lock, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Tracker lamaran',
  description:
    'Lacak status lamaran lomba, beasiswa, dan magangmu dalam satu papan: disimpan, sudah daftar, wawancara, diterima.',
};

/**
 * Halaman Tracker dalam keadaan TERKUNCI — keputusan produk Blueprint §8.
 *
 * Tab-nya sengaja ditampilkan sejak Phase 1 meski backend-nya baru siap di
 * Phase 2. Alasannya: menyembunyikan lalu memunculkan menu antar rilis
 * memaksa pengguna mempelajari ulang letak navigasi, dan fitur yang tidak
 * pernah terlihat tidak pernah diinginkan orang. Halaman ini memperlihatkan
 * nilainya lebih dulu, lalu meminta pendaftaran — bukan sebaliknya.
 *
 * Yang TIDAK dilakukan di sini: menampilkan papan kanban palsu berisi data
 * karangan. Antarmuka yang terlihat berfungsi tapi ternyata mati adalah
 * cara tercepat kehilangan kepercayaan pengguna.
 */
const STAGES = [
  { label: 'Disimpan', icon: CheckCircle2, hint: 'Peluang yang kamu incar' },
  { label: 'Sudah daftar', icon: Send, hint: 'Berkas sudah dikirim' },
  { label: 'Wawancara', icon: Users, hint: 'Masuk tahap seleksi' },
] as const;

export default function TrackerPage() {
  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-pill bg-panel-nested">
          <Lock aria-hidden className="size-5 text-ink-muted" />
        </span>
        <h1 className="mt-4 text-3xl">Lacak semua lamaranmu di satu papan</h1>
        <p className="mt-3 text-ink-soft">
          Berhenti mengandalkan ingatan dan tangkapan layar. Simpan peluang, tandai saat sudah
          mendaftar, dan lihat mana yang masuk tahap wawancara — lengkap dengan pengingat tenggat.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" disabled>
            Masuk untuk mulai melacak
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/events">
              Jelajahi kegiatan dulu <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Akun dan tracker dibuka pada tahap pengembangan berikutnya.
        </p>
      </div>

      <ul className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-3">
        {STAGES.map((stage) => (
          <li
            key={stage.label}
            className="rounded-card border border-dashed border-line bg-panel p-5 text-center"
          >
            <stage.icon aria-hidden className="mx-auto size-5 text-ink-faint" />
            <p className="mt-2 text-sm font-medium">{stage.label}</p>
            <p className="mt-1 text-xs text-ink-muted">{stage.hint}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
