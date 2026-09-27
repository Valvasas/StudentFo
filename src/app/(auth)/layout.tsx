import { Bell, Info } from 'lucide-react';
import { dataMode } from '@/lib/env';

/**
 * Tata letak halaman akun (kanvas desain Login): form di kiri, panel
 * penjelas di kanan. Di layar sempit panel turun ke bawah form, seperti
 * kanvasnya — form tetap yang pertama terlihat.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap">
      <div className="flex min-w-0 flex-[1_1_520px] justify-center px-4 py-12 sm:px-10 sm:py-16">
        <div className="enter flex w-full max-w-[380px] flex-col gap-6">
          {/* Tanpa Supabase tidak ada tempat menyimpan akun sungguhan.
              Dinyatakan di depan supaya tidak ada yang mengira akun demo
              itu akun permanen. */}
          {dataMode === 'seed' && (
            <div role="note" className="flex items-start gap-2 rounded-card border border-caution-line bg-caution-soft p-3 text-sm text-caution">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p>
                <strong className="font-semibold">Mode data contoh.</strong> Server ini belum terhubung ke
                database. Akun sungguhan belum bisa dibuat, tapi semua fitur akun bisa dicoba lewat akun demo.
              </p>
            </div>
          )}
          {children}
        </div>
      </div>

      <aside
        aria-label="Tentang akun StudentFo"
        className="flex min-w-0 flex-[1_1_420px] flex-col justify-center gap-10 bg-panel-nested px-6 py-16 sm:px-16"
      >
        <DeadlineCalendar />
        <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4">
          <p className="text-xl font-semibold leading-snug tracking-[-0.02em]">
            Simpan kegiatan yang kamu incar, lalu kami ingatkan tiga hari dan sehari sebelum pendaftarannya ditutup.
          </p>
          <span className="flex items-center gap-2 text-sm text-ink-muted">
            <Bell aria-hidden className="size-4" />
            Pengingat H-3 dan H-1 untuk setiap kegiatan tersimpan
          </span>
        </div>
      </aside>
    </div>
  );
}

const MARKED: Readonly<Record<number, 'soon' | 'later'>> = { 9: 'later', 14: 'soon', 17: 'soon', 23: 'later', 28: 'later' };

/**
 * Kalender bertanda tenggat — pengganti slot ilustrasi kosong di kanvas
 * ("pelajar menandai kalender deadline"). Hiasan murni, tanpa data.
 */
function DeadlineCalendar() {
  return (
    <div aria-hidden className="mx-auto aspect-square w-full max-w-[440px] rounded-2xl bg-panel p-[7%] shadow-[0_18px_40px_rgba(0,0,0,.05)]">
      <div className="flex items-baseline justify-between">
        <span className="text-[clamp(16px,2.4vw,20px)] font-bold tracking-[-0.025em]">Oktober</span>
        <span className="font-mono text-xs text-ink-muted">3 tenggat minggu ini</span>
      </div>
      <div className="mt-[6%] grid grid-cols-7 gap-[3%] text-center font-mono text-[clamp(10px,1.4vw,12px)] text-ink-muted">
        {['S', 'S', 'R', 'K', 'J', 'S', 'M'].map((day, index) => (
          <span key={index}>{day}</span>
        ))}
        {Array.from({ length: 31 }, (_, index) => {
          const date = index + 1;
          const mark = MARKED[date];
          return (
            <span
              key={date}
              className={
                mark === 'soon'
                  ? 'flex aspect-square items-center justify-center rounded-[8px] bg-brand font-semibold text-on-brand'
                  : mark === 'later'
                    ? 'flex aspect-square items-center justify-center rounded-[8px] border border-brand text-ink'
                    : 'flex aspect-square items-center justify-center rounded-[8px]'
              }
            >
              {date}
            </span>
          );
        })}
      </div>
    </div>
  );
}
