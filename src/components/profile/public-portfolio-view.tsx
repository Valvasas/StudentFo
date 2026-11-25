import Link from 'next/link';
import { GraduationCap, Globe, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { PortfolioList } from '@/components/profile/portfolio-list';
import { institutionDisplayName } from '@/lib/institution-kinds';
import { institutionById } from '@/lib/institutions';
import { loginHref } from '@/lib/safe-redirect';
import { studyFieldLabels } from '@/lib/study-fields';
import { EDUCATION_LEVEL_LABEL, skillLabel, type PublicPortfolioPage } from '@/types/domain';

/**
 * Portofolio publik (ADR-098) — yang dilihat SIAPA SAJA, termasuk tamu,
 * hanya bila pemiliknya menyalakannya. Isinya sengaja sempit: nama, tempat
 * studi, jurusan, bio, bidang & keahlian, dan portofolio yang ia pilih
 * tampil. Tanpa email, domisili, koneksi, atau tombol yang butuh akun.
 */
export function PublicPortfolioView({ page, signedIn, now = new Date() }: { page: PublicPortfolioPage; signedIn: boolean; now?: Date }) {
  const hit = page.institutionId ? institutionById(page.institutionId) : null;
  const institution = hit ? institutionDisplayName(hit.name, hit.short) : page.institutionName;
  // Bidang yang sama namanya dengan keahlian kartu pemain tidak diulang ("Desain UI/UX" dua kali).
  const skillNames = new Set(page.skills.map((skill) => skillLabel(skill).toLowerCase()));
  const fields = studyFieldLabels(page.studyFields).filter((field) => !skillNames.has(field.toLowerCase()));
  const verified = page.entries.filter((entry) => entry.verification === 'VERIFIED').length;
  const study = [page.educationLevel ? EDUCATION_LEVEL_LABEL[page.educationLevel] : null, page.major].filter(Boolean).join(' · ');

  return (
    <div className="container-page flex max-w-3xl flex-col gap-8 pb-20 pt-10">
      <header className="flex flex-col gap-3">
        <span className="inline-flex items-center gap-1.5 self-start rounded-pill bg-panel-nested px-3 py-1 text-[12.5px] font-medium text-ink-soft">
          <Globe aria-hidden className="size-3.5" /> Portofolio publik
        </span>
        <h1 className="text-[clamp(28px,4.4vw,40px)] leading-[1.06] tracking-[-0.04em] [overflow-wrap:anywhere]">{page.fullName}</h1>
        <p className="text-[14.5px] text-ink-muted">@{page.username}</p>
        {(institution || study) && (
          <p className="flex items-start gap-2 text-[15px] text-ink-soft">
            <GraduationCap aria-hidden className="mt-0.5 size-[18px] shrink-0 text-ink-muted" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {institution}
              {hit?.region && <span className="text-ink-muted"> · {hit.region}</span>}
              {study && <span className="block text-[13.5px] text-ink-muted">{study}</span>}
            </span>
          </p>
        )}
        {page.bio && <p className="max-w-[60ch] whitespace-pre-line text-[15px] leading-relaxed text-ink-soft [overflow-wrap:anywhere]">{page.bio}</p>}
      </header>

      {(page.skills.length > 0 || fields.length > 0) && (
        <section aria-labelledby="keahlian-title" className="flex flex-col gap-3">
          <h2 id="keahlian-title" className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles aria-hidden className="size-[18px] text-ink-muted" /> Keahlian & bidang
          </h2>
          <ul className="flex flex-wrap gap-2">
            {page.skills.map((skill) => (
              <li key={skill} className="inline-flex h-8 items-center rounded-pill bg-highlight-soft px-3 text-[13px] font-semibold text-ink">
                {skillLabel(skill)}
              </li>
            ))}
            {fields.map((field) => (
              <li key={field} className="inline-flex h-8 items-center rounded-pill border border-line px-3 text-[13px] text-ink-soft">
                {field}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="riwayat-title" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="riwayat-title" className="flex items-center gap-2 text-lg font-semibold">
            <Trophy aria-hidden className="size-[18px] text-ink-muted" /> Riwayat lomba & kegiatan
          </h2>
          <span className="text-[12.5px] text-ink-muted">
            {page.entries.length} kegiatan · {verified} terverifikasi
          </span>
        </div>
        <PortfolioList rows={page.entries.map((entry) => ({ entry }))} now={now} emptyText="Belum ada kegiatan yang ditampilkan." />
        <p className="flex items-start gap-2 pt-2 text-[12.5px] leading-relaxed text-ink-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Hasil berlabel &ldquo;Terverifikasi moderator&rdquo; sudah dicocokkan dengan buktinya. Hasil lain dilaporkan sendiri oleh
          pemilik portofolio.
        </p>
      </section>

      {!signedIn && (
        <p className="rounded-card bg-panel-nested px-4 py-3.5 text-sm leading-relaxed text-ink-soft">
          Mau mengajak {page.fullName.split(' ')[0]} satu tim?{' '}
          <Link href={loginHref(`/u/${page.username}`)} className="font-semibold text-ink underline underline-offset-[3px]">
            Masuk atau buat akun gratis
          </Link>{' '}
          untuk terhubung, atau lihat{' '}
          <Link href="/leaderboard?tab=mahasiswa" className="font-semibold text-ink underline underline-offset-[3px]">
            peringkat pelajar
          </Link>
          .
        </p>
      )}
    </div>
  );
}
