import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Check, ChevronDown } from 'lucide-react';
import { TocSpy } from '@/components/legal/toc-spy';
import { cn } from '@/lib/utils';
import { formatDateId } from '@/lib/deadline';
import { env } from '@/lib/env';
import { DEFAULT_OPERATOR_NAME, LEGAL_REVISION, legalDocumentStatus, type LegalDocumentStatus } from '@/lib/legal';

/** Kebijakan privasi + lampirannya, Kebijakan cookie. */
export function privacyStatus(): LegalDocumentStatus {
  return legalDocumentStatus({
    operatorName: env.LEGAL_OPERATOR_NAME,
    contactEmail: env.PRIVACY_CONTACT_EMAIL,
    effectiveDate: env.PRIVACY_POLICY_EFFECTIVE_DATE,
  });
}

export function termsStatus(): LegalDocumentStatus {
  return legalDocumentStatus({
    operatorName: env.LEGAL_OPERATOR_NAME,
    contactEmail: env.PRIVACY_CONTACT_EMAIL,
    effectiveDate: env.TERMS_EFFECTIVE_DATE,
  });
}

const DOCUMENTS = [
  { key: 'privasi', href: '/privacy-policy', label: 'Kebijakan privasi', hint: 'Data apa yang disimpan dan hakmu atasnya' },
  { key: 'cookie', href: '/cookie-policy', label: 'Kebijakan cookie', hint: 'Cookie & penyimpanan peramban yang dipakai' },
  { key: 'syarat', href: '/terms', label: 'Syarat & Ketentuan', hint: 'Aturan main memakai StudentFo' },
] as const;

export type LegalDocumentKey = (typeof DOCUMENTS)[number]['key'];

export interface LegalSection {
  readonly title: string;
  readonly body: ReactNode;
}

const tocLinkClass =
  'flex min-h-11 items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[14px] leading-snug text-ink-muted transition-colors duration-150 hover:bg-panel-nested hover:text-ink aria-[current]:bg-panel-nested aria-[current]:font-semibold aria-[current]:text-ink';

function TocList({ sections, prefix, compact }: { sections: readonly LegalSection[]; prefix: string; compact?: boolean }) {
  return (
    <ol className="flex flex-col gap-0.5">
      {sections.map((section, index) => (
        <li key={section.title}>
          <a href={`#${prefix}${index + 1}`} className={cn(tocLinkClass, compact && 'lg:pointer-fine:min-h-9')}>
            <span className="w-5 shrink-0 font-mono text-xs">{index + 1}</span>
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Kerangka bersama tiga dokumen hukum (kanvas Kebijakan Privasi): kepala
 * dokumen dengan status, daftar isi, versi singkat, lalu bab bernomor.
 *
 * Daftar isi di ponsel dilipat dalam <details>: tiga belas tautan 44px
 * mendorong isi dokumen ±570px ke bawah. Di layar lebar ia menempel di samping
 * dan `TocSpy` menandai bab yang sedang dibaca. Keduanya tautan jangkar biasa,
 * jadi tanpa JavaScript tetap utuh.
 */
export function LegalDocument({
  current,
  title,
  status,
  readMinutes,
  summary,
  sections,
  prefix,
  asideLink,
}: {
  current: LegalDocumentKey;
  title: string;
  status: LegalDocumentStatus;
  readMinutes: number;
  summary: readonly ReactNode[];
  sections: readonly LegalSection[];
  /** Awalan id bab, mis. `kp-` → `#kp-1`. */
  prefix: string;
  asideLink?: { href: string; label: string };
}) {
  return (
    <div className="container-page pb-20 pt-12">
      <header className="enter flex max-w-[720px] flex-col gap-3 [animation-duration:900ms]">
        <span className="font-mono text-xs tracking-[.08em] text-ink-muted">{status.final ? 'DOKUMEN · BERLAKU' : 'DOKUMEN · DRAF'}</span>
        <h1 className="text-[clamp(34px,6vw,56px)] leading-[1.02]">{title}</h1>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-ink-muted">
          <span>
            {status.final
              ? `Berlaku sejak ${formatDateId(`${status.effectiveDate}T00:00:00+07:00`)}`
              : `Draf revisi ${formatDateId(`${LEGAL_REVISION}T00:00:00+07:00`)}`}
          </span>
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <span>Waktu baca sekitar {readMinutes} menit</span>
        </p>
      </header>

      <div className="mt-8 grid items-start gap-8 lg:mt-10 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10">
        <details className="group rounded-card border border-line lg:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
            Daftar isi · {sections.length} bagian
            <ChevronDown aria-hidden className="size-4 transition-transform duration-150 ease-snap group-open:rotate-180" />
          </summary>
          <nav aria-label="Daftar isi" className="border-t border-line p-2">
            <TocList sections={sections} prefix={prefix} />
          </nav>
        </details>

        <aside className="hidden lg:sticky lg:top-[92px] lg:block">
          <nav id="daftar-isi" aria-labelledby="daftar-isi-title" className="flex flex-col gap-1">
            <h2 id="daftar-isi-title" className="mb-2 font-mono text-[11.5px] font-normal tracking-[.08em] text-ink-muted">
              DAFTAR ISI
            </h2>
            <TocList sections={sections} prefix={prefix} compact />
            {asideLink && (
              <Link
                href={asideLink.href}
                className="mt-4 flex min-h-11 items-center gap-1.5 self-start px-2.5 text-[13.5px] font-semibold underline underline-offset-[3px]"
              >
                {asideLink.label} <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            )}
          </nav>
          <TocSpy navId="daftar-isi" prefix={prefix} count={sections.length} />
        </aside>

        <article className="flex max-w-[68ch] flex-col gap-12">
          <section aria-labelledby="ringkas-title" className="enter rounded-[18px] bg-inverse p-6 text-on-inverse [animation-delay:120ms] [animation-duration:900ms] sm:p-7">
            <h2 id="ringkas-title" className="mb-4 text-lg font-semibold text-on-inverse">
              Versi singkat
            </h2>
            <ul className="flex flex-col gap-3">
              {summary.map((item, index) => (
                <li key={index} className="flex gap-3 text-[15px] leading-snug">
                  <span aria-hidden className="mt-px flex size-5 shrink-0 items-center justify-center rounded-pill bg-on-inverse text-inverse">
                    <Check className="size-3" strokeWidth={2.6} />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[13px] leading-relaxed text-on-inverse-muted">
              Versi singkat ini membantu memahami, bukan pengganti. Yang mengikat adalah isi lengkap di bawah.
            </p>
          </section>

          {sections.map((section, index) => (
            <section
              key={section.title}
              id={`${prefix}${index + 1}`}
              aria-labelledby={`${prefix}${index + 1}-title`}
              className="flex scroll-mt-24 flex-col gap-4 text-[15.5px] leading-[1.7] text-ink-soft [&>ol]:flex [&>ol]:list-decimal [&>ol]:flex-col [&>ol]:gap-2 [&>ol]:pl-5 [&>ol>li]:pl-1 [&>ul]:flex [&>ul]:list-disc [&>ul]:flex-col [&>ul]:gap-2 [&>ul]:pl-5 [&>ul>li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink"
            >
              <h2 id={`${prefix}${index + 1}-title`} className="text-[22px] font-bold leading-tight tracking-[-0.025em] text-ink">
                {index + 1}. {section.title}
              </h2>
              {section.body}
            </section>
          ))}

          <nav aria-labelledby="dokumen-terkait-title" className="flex flex-col gap-3 border-t border-line pt-8">
            <h2 id="dokumen-terkait-title" className="font-mono text-[11.5px] font-normal tracking-[.08em] text-ink-muted">
              DOKUMEN TERKAIT
            </h2>
            <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
              {DOCUMENTS.map((doc) => (
                <li key={doc.key}>
                  <Link
                    href={doc.href}
                    aria-current={doc.key === current ? 'page' : undefined}
                    className="flex h-full min-h-11 flex-col gap-0.5 rounded-card border border-line px-4 py-3 transition-colors duration-150 hover:border-line-strong hover:bg-panel-nested aria-[current]:bg-panel-nested"
                  >
                    <span className="text-[14.5px] font-semibold text-ink">{doc.label}</span>
                    <span className="text-[13px] leading-snug text-ink-muted">{doc.key === current ? 'Sedang kamu baca' : doc.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </article>
      </div>
    </div>
  );
}

export function Callout({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-3 rounded-card border border-line bg-panel-nested px-4 py-3.5 text-[14.5px] leading-relaxed">
      <AlertTriangle aria-hidden className="mt-0.5 size-[18px] shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Subjek kalimat pembuka dokumen. Selama pemilik belum mengisi nama resmi,
 * "Pengelola StudentFo (“kami”), pengelola StudentFo," terbaca seperti salah
 * ketik — maka bentuk generiknya ditulis sekali saja.
 */
export function OperatorRef({ status }: { status: LegalDocumentStatus }) {
  if (status.operatorName === DEFAULT_OPERATOR_NAME) return <>pengelola StudentFo (&ldquo;kami&rdquo;)</>;
  return (
    <>
      <strong>{status.operatorName}</strong> (&ldquo;kami&rdquo;), pengelola StudentFo,
    </>
  );
}

/** Tautan di dalam kalimat dokumen (dikecualikan dari ambang 44px, WCAG 2.5.8). */
export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  const className = 'font-semibold text-ink underline underline-offset-[3px]';
  return href.startsWith('/') ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

/** Kontak resmi bila pemilik sudah mengisinya; selama belum, jujur bahwa dokumen masih draf. */
export function ContactNote({ status }: { status: LegalDocumentStatus }) {
  if (status.final) {
    return (
      <p>
        Pertanyaan, keluhan, atau permintaan terkait data pribadi dan ketentuan ini dikirim ke {status.operatorName} melalui{' '}
        <InlineLink href={`mailto:${status.contactEmail}`}>{status.contactEmail}</InlineLink>. Kirim dari alamat email yang terdaftar di
        akunmu supaya kami bisa memastikan permintaan itu benar darimu.
      </p>
    );
  }
  return (
    <Callout>
      Draf ini belum mencantumkan identitas resmi pengelola dan alamat kontaknya. Pengelola wajib melengkapinya dan meninjau isi dokumen ini
      bersama penasihat hukum sebelum berlaku.
    </Callout>
  );
}
