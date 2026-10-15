import Link from 'next/link';

/**
 * Halaman akun: satu kartu terpusat, tanpa panel hiasan. Di ponsel kartunya
 * melebur ke halaman (tanpa bingkai) supaya lebar isian tidak terbuang.
 * Gutter 10px di bawah 360px: widget Turnstile lebarnya tetap 300px.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center px-2.5 py-8 min-[360px]:px-4 sm:py-14">
      <div className="enter w-full max-w-[440px] sm:rounded-2xl sm:border sm:border-line sm:bg-panel sm:shadow-[0_1px_2px_rgba(0,0,0,.04),0_12px_32px_rgba(0,0,0,.05)]">
        <div className="flex flex-col gap-5 sm:px-9 sm:pb-6 sm:pt-9">{children}</div>
        <footer className="mt-6 border-t border-line py-1 text-center text-[12.5px] text-ink-muted sm:mt-0 sm:px-9">
          <Link href="/privacy-policy" className="inline-flex min-h-11 items-center underline-offset-[3px] hover:text-ink hover:underline">
            Kebijakan privasi
          </Link>
        </footer>
      </div>
    </div>
  );
}
