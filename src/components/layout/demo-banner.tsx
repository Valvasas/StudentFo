import { Info } from 'lucide-react';
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
 */
export function DemoBanner() {
  if (dataMode !== 'seed') return null;

  return (
    <div role="note" className="border-b border-caution-line bg-caution-soft">
      <div className="container-page flex items-start gap-2 py-2 text-xs text-caution sm:items-center">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <p>
          <strong className="font-semibold">Mode data contoh.</strong> Seluruh kegiatan, penyelenggara,
          dan tenggat di halaman ini fiktif — dipakai untuk pengembangan antarmuka. Fitur akun bisa
          dicoba lewat akun demo di halaman Masuk.
        </p>
      </div>
    </div>
  );
}
