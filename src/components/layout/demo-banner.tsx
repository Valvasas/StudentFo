import { AlertTriangle, Info } from 'lucide-react';
import { DEMO_DATA_TTL_MS, demoDataCreatedAt } from '@/lib/data';
import { formatTimeId } from '@/lib/deadline';
import { demoResetInfo, formatDuration } from '@/lib/demo/reset-schedule';
import { dataMode } from '@/lib/env';

/**
 * Penanda mode data contoh.
 *
 * Ini bukan hiasan: tanpa penanda, seseorang bisa membuka tautan pratinjau
 * dan mengira "Beasiswa Unggulan Bakti Pendidikan" itu program sungguhan
 * dengan tenggat sungguhan. Menampilkan data buatan sebagai informasi asli
 * adalah kerugian nyata bagi orang yang mengandalkannya.
 *
 * Otomatis hilang begitu kredensial Supabase terpasang.
 *
 * Ini SATU-SATUNYA penanda demo di situs (ADR-057): kalimat "contoh/demo/fiktif"
 * yang tersebar di tiap kartu membuat situs terbaca belum jadi. Siklus reset
 * ditulis sebagai interval tetap ("tiap 6 jam"), bukan hitung mundur yang basi
 * saat tab dibiarkan terbuka tanpa JavaScript. Hanya menjelang reset nadanya
 * berubah jadi peringatan dengan JAM ABSOLUT, supaya pengunjung tidak kaget
 * simpanannya hilang di tengah sesi.
 */
export function DemoBanner() {
  if (dataMode !== 'seed') return null;

  const createdAt = demoDataCreatedAt();
  const reset = createdAt ? demoResetInfo(createdAt, new Date(), DEMO_DATA_TTL_MS) : null;
  const Icon = reset?.imminent ? AlertTriangle : Info;

  return (
    <div role="note" className="border-b border-caution-line bg-caution-soft">
      <div className="container-page flex items-center gap-2 py-1.5 text-xs text-caution">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <p>
          {/* Ponsel: satu baris ringkas. Dua baris peringatan di atas navbar
              dua tingkat memakan seperlima layar sebelum isi apa pun tampil. */}
          <strong className="font-semibold">Mode demo</strong>
          <span className="sm:hidden"> · data fiktif.</span>
          <span className="hidden sm:inline"> — semua kegiatan &amp; tenggat di sini fiktif.</span>{' '}
          {reset && (
            <span data-testid="demo-reset">
              {reset.imminent ? (
                <strong className="font-semibold">
                  Data diatur ulang dalam {formatDuration(reset.minutesLeft)} (pukul{' '}
                  <time dateTime={reset.nextResetAt.toISOString()}>{formatTimeId(reset.nextResetAt.toISOString())}</time>)
                  — simpanan & tim demo-mu akan hilang.
                </strong>
              ) : (
                <>Data diatur ulang tiap {DEMO_DATA_TTL_MS / 3_600_000} jam.</>
              )}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
