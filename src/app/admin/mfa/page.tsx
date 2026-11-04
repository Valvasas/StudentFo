import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight, KeyRound, QrCode, ShieldCheck, Smartphone } from 'lucide-react';
import { confirmAdminMfaEnrollmentAction, verifyAdminMfaAction } from '@/app/admin/mfa/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { buttonVariants } from '@/components/ui/button';
import { Field, FormAlert, TextInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { groupSecret, isPendingTotpFactor, startTotpEnrollment, type TotpEnrollment } from '@/lib/admin-mfa';
import { adminMfaStep, getSessionUser } from '@/lib/auth';
import { isUuid } from '@/lib/data/supabase-mappers';
import { dataMode } from '@/lib/env';
import { NOT_FOUND_TITLE } from '@/lib/page-title';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const user = await getSessionUser();
  return {
    title: user?.role === 'ADMIN' ? 'Verifikasi dua langkah' : NOT_FOUND_TITLE,
    robots: { index: false, follow: false },
  };
}

function CodeForm({ action, factorId, submitLabel }: { action: (formData: FormData) => Promise<void>; factorId?: string; submitLabel: string }) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {factorId && <input type="hidden" name="factorId" value={factorId} />}
      <Field id="mfa-code" label="Kode 6 digit" hint="Dari aplikasi autentikator; berganti setiap 30 detik.">
        <TextInput
          id="mfa-code"
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={9}
          className="max-w-48 font-mono text-lg tracking-[0.3em]"
        />
      </Field>
      <SubmitButton className={buttonVariants({ className: 'self-start' })}>
        <ShieldCheck aria-hidden className="size-4" /> {submitLabel}
      </SubmitButton>
    </form>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-5 rounded-panel border border-line bg-panel p-5 shadow-card sm:p-7">{children}</section>;
}

function EnrollIntro() {
  return (
    <Card>
      <ol className="flex flex-col gap-3 text-sm text-ink-soft">
        <li className="flex gap-3">
          <Smartphone aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <span>
            Pasang aplikasi autentikator di ponselmu — mis. Google Authenticator, Microsoft Authenticator, 2FAS, atau pengelola sandi yang
            mendukung TOTP.
          </span>
        </li>
        <li className="flex gap-3">
          <QrCode aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <span>Pindai kode QR yang muncul (atau ketik kunci rahasianya), lalu masukkan kode 6 digit dari aplikasi.</span>
        </li>
      </ol>
      {/* GET biasa, bukan tautan: tautan bisa di-prefetch, dan setiap pemuatan membuat rahasia baru yang membatalkan QR yang sedang dipindai. */}
      <form method="get" action="/admin/mfa">
        <input type="hidden" name="pasang" value="1" />
        <button type="submit" className={buttonVariants()}>
          <QrCode aria-hidden className="size-4" /> Tampilkan kode QR
        </button>
      </form>
    </Card>
  );
}

function EnrollScan({ enrollment }: { enrollment: TotpEnrollment }) {
  return (
    <Card>
      <div className="flex flex-col items-start gap-5 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI dari GoTrue; next/image tidak memprosesnya */}
        <img
          src={enrollment.qrCode}
          alt="Kode QR untuk aplikasi autentikator. Tidak bisa memindai? Pakai kunci rahasia di sebelahnya."
          width={176}
          height={176}
          className="size-44 shrink-0 rounded-card border border-line bg-white p-2"
        />
        <div className="flex min-w-0 flex-col gap-2 text-sm">
          <p className="font-medium">Tidak bisa memindai?</p>
          <p className="text-ink-soft">Pilih &ldquo;masukkan kunci&rdquo; di aplikasimu, jenis berbasis waktu, lalu ketik:</p>
          <code className="select-all break-all rounded-card bg-panel-nested px-3 py-2 font-mono text-[15px] tracking-wide">
            {groupSecret(enrollment.secret)}
          </code>
          <p className="text-[12.5px] text-ink-muted">Jangan bagikan kunci ini. Siapa pun yang memilikinya bisa membuat kode masukmu.</p>
        </div>
      </div>
      <CodeForm action={confirmAdminMfaEnrollmentAction} factorId={enrollment.factorId} submitLabel="Aktifkan" />
    </Card>
  );
}

/**
 * Verifikasi dua langkah admin (ADR-062 #4). Hanya admin sungguhan yang
 * melihat halaman ini; selainnya 404 seperti /admin (ADR-057). Mode seed
 * tidak punya GoTrue, jadi langsung ke panel.
 */
export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  if (dataMode === 'seed') redirect('/admin');
  const user = await getSessionUser();
  if (!user || user.role !== 'ADMIN') notFound();

  const params = await searchParams;
  const step = await adminMfaStep();
  const supabase = await createSupabaseServerClient();

  let body: React.ReactNode;
  if (step === null) {
    body = (
      <Card>
        <p className="flex items-start gap-2 text-sm text-ink-soft">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          Sesi ini sudah terverifikasi dua langkah.
        </p>
        <p className="text-sm text-ink-soft">
          Kehilangan ponsel? Minta pemilik proyek menghapus faktor MFA akunmu di Supabase Dashboard (Authentication → Users), lalu pasang
          ulang dari halaman ini. Jangan matikan kewajiban MFA untuk admin.
        </p>
        <Link href="/admin" className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
          Ke antrean moderasi <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Card>
    );
  } else if (step === 'verify') {
    body = (
      <Card>
        <p className="text-sm text-ink-soft">Masukkan kode dari aplikasi autentikator yang kamu pasang untuk akun ini.</p>
        <CodeForm action={verifyAdminMfaAction} submitLabel="Verifikasi" />
      </Card>
    );
  } else {
    const pending = firstParam(params.faktor) ?? '';
    if (isUuid(pending) && (await isPendingTotpFactor(supabase, pending))) {
      body = (
        <Card>
          <p className="text-sm text-ink-soft">
            Kode QR yang sudah kamu pindai tetap berlaku — cukup masukkan kode terbaru dari aplikasi.
          </p>
          <CodeForm action={confirmAdminMfaEnrollmentAction} factorId={pending} submitLabel="Aktifkan" />
          <a href="/admin/mfa?pasang=1" className="inline-flex min-h-11 items-center text-sm font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
            Mulai ulang dengan kode QR baru
          </a>
        </Card>
      );
    } else if (firstParam(params.pasang) === '1') {
      const enrollment = await startTotpEnrollment(supabase);
      body = enrollment ? (
        <EnrollScan enrollment={enrollment} />
      ) : (
        <Card>
          <FormAlert tone="error">Kode QR gagal disiapkan. Muat ulang halaman ini sebentar lagi.</FormAlert>
        </Card>
      );
    } else {
      body = <EnrollIntro />;
    }
  }

  return (
    <div className="container-page max-w-2xl py-8 sm:py-12">
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-3xl">
          <KeyRound aria-hidden className="size-7 text-ink-muted" />
          Verifikasi dua langkah
        </h1>
        <p className="text-ink-soft">
          Panel admin membuka data pengguna dan keputusan moderasi, jadi sandi saja tidak cukup: setiap sesi admin perlu kode dari
          aplikasi autentikator di ponselmu.
        </p>
      </header>
      <ActionFeedback params={params} className="mb-6" />
      {body}
    </div>
  );
}
