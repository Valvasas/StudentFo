import Link from 'next/link';
import { ArrowRight, BadgeCheck, ClipboardList, Link2, Plus, ReceiptText, ShieldCheck } from 'lucide-react';
import { OrganizerTour } from '@/components/landing/organizer-tour';
import { RevealObserver } from '@/components/landing/reveal-observer';
import { ORGANIZER_LOGIN_PATH, ORGANIZER_REGISTER_PATH } from '@/lib/safe-redirect';

/**
 * /penyelenggara untuk tamu (ADR-063). Satu tujuan: membawa penyelenggara ke
 * pintu daftarnya sendiri. Setiap klaim di sini menunjuk ke perilaku studio —
 * verifikasi ADR-042, kiriman lewat moderator ADR-062 #5, formulir & bukti
 * bayar ADR-056, klaim acara yang sudah tayang.
 */
const FEATURES = [
  {
    icon: ClipboardList,
    title: 'Formulir pendaftaran sendiri',
    body: 'Susun pertanyaan, unggahan berkas, dan biaya. Peserta mendaftar tanpa keluar dari StudentFo.',
  },
  {
    icon: ReceiptText,
    title: 'Bukti bayar terperiksa',
    body: 'Peserta membayar ke rekening yang kamu cantumkan lalu mengunggah buktinya. Kamu konfirmasi atau tolak, peserta dikabari.',
  },
  {
    icon: Link2,
    title: 'Klaim acara yang sudah tayang',
    body: 'Acaramu sudah dikirim orang lain ke katalog? Klaim, lalu kelola dari studio setelah moderator menyetujui.',
  },
] as const;

const TRUST = [
  { icon: BadgeCheck, title: 'Lencana terverifikasi', body: 'Muncul di setiap acaramu, jadi peserta tahu yang memasang benar-benar panitianya.' },
  { icon: ShieldCheck, title: 'Moderator di setiap acara', body: 'Lomba palsu berbayar dicegah sebelum tayang, bukan dihapus setelah ada korban.' },
] as const;

const FAQS = [
  {
    q: 'Siapa yang bisa jadi penyelenggara terverifikasi?',
    a: 'Panitia, lembaga kampus, sekolah, komunitas, yayasan, atau perusahaan yang benar-benar menyelenggarakan kegiatan. Sertakan bukti peranmu, misalnya tautan pengumuman resmi atau surat tugas.',
  },
  {
    q: 'Perlu akun terpisah dari akun peserta?',
    a: 'Tidak. Akun yang sama bisa dipakai ikut kegiatan dan mengelola acara. Kalau sudah punya akun, masuk saja lalu ajukan verifikasi di studio.',
  },
  {
    q: 'Kenapa acara tetap ditinjau moderator setelah lembagaku terverifikasi?',
    a: 'Akun penyelenggara yang dibajak bisa dipakai memasang lomba palsu berbayar. Peninjauan setiap acara menutup celah itu, dan acaramu tetap tampil dengan lencana terverifikasi.',
  },
  {
    q: 'Apakah biaya pendaftaran peserta lewat StudentFo?',
    a: 'Tidak. Peserta membayar langsung ke rekening yang kamu cantumkan di formulir. StudentFo hanya menyimpan bukti bayarnya supaya kamu bisa memeriksanya.',
  },
] as const;

const sectionClass = 'container-page max-w-[1120px] pt-[clamp(72px,9vw,112px)]';
const h2Class = 'text-[clamp(28px,4.4vw,40px)] font-bold leading-[1.1] tracking-[-0.03em]';

export function OrganizerLanding({ host }: { host: string }) {
  return (
    <div className="overflow-x-clip pb-4">
      <RevealObserver />
      <section className="container-page flex flex-col items-center pt-[clamp(48px,9vw,96px)] text-center">
        <div className="enter flex flex-col items-center [animation-duration:700ms]">
          <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            <BadgeCheck aria-hidden className="size-4" />
            Studio Penyelenggara
          </p>
          <h1 className="mt-5 max-w-[18ch] text-[clamp(36px,6vw,58px)] leading-[1.05] tracking-[-0.04em]">
            Pendaftar lombamu, <span className="marker">tanpa spreadsheet</span>.
          </h1>
          <p className="mt-6 max-w-[54ch] text-[clamp(16.5px,2vw,19px)] leading-relaxed text-ink-muted">
            Verifikasi lembagamu sekali, lalu pasang lomba, beasiswa, workshop, atau pelatihan. Formulir, bukti bayar, dan
            analitik acaranya ada di satu studio.
          </p>
          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
            <Link
              href={ORGANIZER_REGISTER_PATH}
              className="flex h-12 items-center justify-center gap-2 rounded-sm bg-brand px-[22px] text-[15px] font-semibold text-on-brand transition-colors duration-200 ease-snap hover:bg-brand-hover"
            >
              Daftarkan lembagamu
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link
              href={ORGANIZER_LOGIN_PATH}
              className="press flex h-12 items-center justify-center rounded-sm border border-line-strong/70 px-5 text-[15px] font-semibold transition-colors duration-200 ease-snap hover:bg-panel-nested"
            >
              Sudah punya akun? Masuk
            </Link>
          </div>
        </div>
      </section>

      <section id="cara-kerja" aria-labelledby="cara-kerja-title" className={`${sectionClass} scroll-mt-20 pt-[clamp(56px,7vw,88px)]`}>
        <div data-reveal="" className="flex max-w-[640px] flex-col gap-3.5">
          <h2 id="cara-kerja-title" className={h2Class}>
            Dari verifikasi sampai pendaftar terkonfirmasi.
          </h2>
          <p className="text-[16.5px] leading-relaxed text-ink-muted">
            Begini studio bekerja. Nama lembaga dan peserta di tur ini hanya ilustrasi.
          </p>
        </div>
        <div className="mt-10">
          <OrganizerTour host={host} />
        </div>
      </section>

      <section aria-labelledby="fitur-title" className={sectionClass}>
        <h2 id="fitur-title" data-reveal="" className={`${h2Class} max-w-[22ch]`}>
          Yang biasanya tercecer di grup chat, kini di satu tempat.
        </h2>
        <ul data-reveal="" className="mt-10 grid gap-x-10 gap-y-8 border-t border-line pt-8 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="flex flex-col gap-3">
              <span className="flex size-10 items-center justify-center rounded-sm bg-panel-nested">
                <feature.icon aria-hidden className="size-[18px]" />
              </span>
              <span className="text-[17px] font-semibold tracking-[-0.015em]">{feature.title}</span>
              <span className="text-[15px] leading-relaxed text-ink-muted">{feature.body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="kepercayaan-title" className={sectionClass}>
        <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div data-reveal="" className="flex flex-col gap-3.5">
            <h2 id="kepercayaan-title" className={h2Class}>
              Kenapa harus verifikasi dulu?
            </h2>
            <p className="max-w-[42ch] text-[16.5px] leading-relaxed text-ink-muted">
              Pelajar sering jadi sasaran lomba palsu berbayar. Verifikasi membuat acara yang asli mudah dibedakan.
            </p>
          </div>
          <ul data-reveal="" className="flex flex-col border-t border-line">
            {TRUST.map((item) => (
              <li key={item.title} className="flex gap-4 border-b border-line py-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-panel-nested">
                  <item.icon aria-hidden className="size-[18px]" />
                </span>
                <span className="flex flex-1 flex-col gap-1">
                  <span className="text-base font-semibold tracking-[-0.01em]">{item.title}</span>
                  <span className="text-[14.5px] leading-normal text-ink-muted">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-title" className={`${sectionClass} scroll-mt-20`}>
        <div className="grid items-start gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <h2 id="faq-title" data-reveal="" className={h2Class}>
            Pertanyaan penyelenggara
          </h2>
          <div data-reveal="" className="flex flex-col border-t border-line">
            {FAQS.map((faq, index) => (
              <details key={faq.q} name="faq-penyelenggara" open={index === 0} className="group border-b border-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-5 text-[16.5px] font-semibold tracking-[-0.015em] [&::-webkit-details-marker]:hidden">
                  <span>{faq.q}</span>
                  <Plus aria-hidden className="size-[18px] shrink-0 text-ink-muted transition-transform duration-200 ease-snap group-open:rotate-45" />
                </summary>
                <p className="enter pb-6 pr-10 text-[15px] leading-relaxed text-ink-muted [animation-duration:450ms]">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="cta-penyelenggara-title" className={sectionClass}>
        <div data-reveal="" className="flex flex-col items-start gap-4 rounded-[20px] bg-inverse px-[clamp(24px,5vw,48px)] py-[clamp(32px,5vw,48px)] text-on-inverse">
          <h2 id="cta-penyelenggara-title" className="max-w-[22ch] text-[clamp(26px,3.6vw,36px)] font-bold leading-[1.1] tracking-[-0.03em] text-on-inverse">
            Acara berikutnya, pendaftarnya langsung rapi.
          </h2>
          <p className="max-w-[48ch] text-[16px] leading-relaxed text-on-inverse-muted">
            Daftar sebagai penyelenggara, ajukan verifikasi, lalu kirim acara pertamamu untuk ditinjau.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href={ORGANIZER_REGISTER_PATH}
              className="flex h-12 items-center rounded-sm bg-on-inverse px-[22px] text-[15px] font-semibold text-inverse transition-opacity duration-200 ease-snap hover:opacity-90"
            >
              Daftarkan lembagamu
            </Link>
            <Link
              href={ORGANIZER_LOGIN_PATH}
              className="flex h-12 items-center rounded-sm border border-on-inverse-muted/50 px-5 text-[15px] font-semibold text-on-inverse transition-colors duration-200 ease-snap hover:bg-on-inverse/10"
            >
              Masuk ke studio
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
