import { Info } from 'lucide-react';
import { dataMode } from '@/lib/env';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page flex justify-center py-10 sm:py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        {/* Tanpa Supabase tidak ada tempat menyimpan akun. Dinyatakan di
            depan, sebelum orang mengetik kata sandi ke form yang pasti
            gagal. */}
        {dataMode === 'seed' && (
          <div
            role="note"
            className="flex items-start gap-2 rounded-card border border-caution-line bg-caution-soft p-3 text-sm text-caution"
          >
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong className="font-semibold">Mode data contoh.</strong> Server ini belum terhubung
              ke database, jadi pendaftaran dan login belum berfungsi. Formulirnya ditampilkan apa
              adanya untuk pratinjau tampilan.
            </p>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
