import { Info } from 'lucide-react';
import { dataMode } from '@/lib/env';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page flex justify-center py-10 sm:py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        {/* Tanpa Supabase tidak ada tempat menyimpan akun sungguhan.
            Dinyatakan di depan supaya tidak ada yang mengira akun demo
            itu akun permanen. */}
        {dataMode === 'seed' && (
          <div
            role="note"
            className="flex items-start gap-2 rounded-card border border-caution-line bg-caution-soft p-3 text-sm text-caution"
          >
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong className="font-semibold">Mode data contoh.</strong> Server ini belum terhubung
              ke database. Akun sungguhan belum bisa dibuat, tapi semua fitur akun bisa dicoba lewat
              akun demo di halaman Masuk.
            </p>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
