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
 * Jadwal reset ditulis sebagai JAM ABSOLUT, bukan hanya hitung mundur: tanpa
 * JavaScript, "2 jam lagi" basi kalau tab dibiarkan terbuka, sedangkan
 * "pukul 14.30 WIB" tetap benar. Menjelang reset, nadanya berubah jadi
 * peringatan supaya pengunjung tidak kaget simpanannya hilang di tengah sesi.
 */
export function DemoBanner() {
  if (dataMode !== 'seed') return null;

  const createdAt = demoDataCreatedAt();
  const reset = createdAt ? demoResetInfo(createdAt, new Date(), DEMO_DATA_TTL_MS) : null;
  const Icon = reset?.imminent ? AlertTriangle : Info;

  return (
    <div role="note" className="border-b border-caution-line bg-caution-soft">
      <div className="container-page flex items-start gap-2 py-2 text-xs text-caution sm:items-center">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <p>
          <strong className="font-semibold">Mode data contoh.</strong> Seluruh kegiatan, penyelenggara,
          dan tenggat di halaman ini fiktif — dipakai untuk pengembangan antarmuka. Fitur akun bisa
          dicoba lewat akun demo di halaman Masuk.{' '}
          {reset && (
            <span data-testid="demo-reset">
              {reset.imminent ? (
                <strong className="font-semibold">
                  Data demo diatur ulang dalam {formatDuration(reset.minutesLeft)} (pukul{' '}
                  <time dateTime={reset.nextResetAt.toISOString()}>{formatTimeId(reset.nextResetAt.toISOString())}</time>)
                  — simpanan & tim demo-mu akan hilang.
                </strong>
              ) : (
                <>
                  Reset data berikutnya pukul{' '}
                  <time dateTime={reset.nextResetAt.toISOString()}>{formatTimeId(reset.nextResetAt.toISOString())}</time>{' '}
                  (±{formatDuration(reset.minutesLeft)} lagi).
                </>
              )}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
