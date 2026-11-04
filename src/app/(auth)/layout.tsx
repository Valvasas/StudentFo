import { AuthCard } from '@/components/auth/auth-card';

/** Gutter 10px di bawah 360px: widget Turnstile lebarnya tetap 300px. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center px-2.5 py-8 min-[360px]:px-4 sm:py-14">
      <AuthCard>{children}</AuthCard>
    </div>
  );
}
