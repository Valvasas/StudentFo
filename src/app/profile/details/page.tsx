import type { Metadata } from 'next';
import Link from 'next/link';
import { Award, FileText, GraduationCap, IdCard, Pencil, Phone, Sparkles } from 'lucide-react';
import { updateProfileAction } from '@/app/profile/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { AccountShell } from '@/components/layout/account-shell';
import { DemoDetailCards } from '@/components/profile/demo-detail-cards';
import {
  DetailCard,
  DetailRows,
  detailButton,
  detailFields,
  detailGhostButton,
  detailInput,
  detailPrimaryButton,
} from '@/components/profile/detail-card';
import { MajorField } from '@/components/profile/major-field';
import { requireUser } from '@/lib/auth';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { EDUCATION_LEVELS, EDUCATION_LEVEL_LABEL } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Data diri',
  robots: { index: false, follow: false },
};

const EDITABLE = ['identitas', 'pendidikan'] as const;
type Editable = (typeof EDITABLE)[number];

/**
 * Data diri (kanvas Data Diri).
 *
 * Mode ubah bagian yang tersimpan di akun dipilih lewat `?ubah=` — tautan
 * biasa, jadi tetap jalan tanpa JavaScript dan hanya satu bagian terbuka
 * sekaligus, sama seperti kanvas. Kolom kanvas yang belum ada di skema
 * (NIK, tanggal lahir, NIM, IPK, fakultas) tidak ditampilkan sebagai
 * isian palsu (ADR-039); bagian demo di bawahnya hanya di mode data contoh.
 */
export default async function ProfileDetailsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const user = await requireUser('/profile/details');
  const requested = firstParam(params.ubah);
  const editing: Editable | null = EDITABLE.find((key) => key === requested) ?? null;

  const hidden = (omit: 'fullName' | 'education') => (
    <>
      <input type="hidden" name="returnTo" value="/profile/details" />
      {omit !== 'fullName' && <input type="hidden" name="fullName" value={user.fullName} />}
      {omit !== 'education' && (
        <>
          <input type="hidden" name="educationLevel" value={user.educationLevel ?? ''} />
          <input type="hidden" name="major" value={user.major ?? ''} />
        </>
      )}
      {user.interests.map((slug) => (
        <input key={slug} type="hidden" name="interests" value={slug} />
      ))}
    </>
  );

  const actions = (section: Editable) =>
    editing === section ? (
      <>
        <Link href="/profile/details" scroll={false} className={detailGhostButton}>
          Batal
        </Link>
        <button type="submit" form={`form-${section}`} className={detailPrimaryButton}>
          Simpan
        </button>
      </>
    ) : editing ? (
      <span aria-disabled="true" className={`${detailButton} pointer-events-none opacity-40`}>
        <Pencil aria-hidden className="size-3.5" />
        Ubah
      </span>
    ) : (
      <Link href={`/profile/details?ubah=${section}#${section}`} className={detailButton}>
        <Pencil aria-hidden className="size-3.5" />
        Ubah<span className="sr-only"> {section}</span>
      </Link>
    );

  const jumps = [
    { href: '#identitas', label: 'Identitas', icon: IdCard },
    { href: '#pendidikan', label: 'Pendidikan', icon: GraduationCap },
    ...(demoFeaturesEnabled
      ? [
          { href: '#profil-publik', label: 'Profil publik', icon: Sparkles },
          { href: '#kontak', label: 'Kontak', icon: Phone },
          { href: '#pencapaian', label: 'Pencapaian', icon: Award },
          { href: '#dokumen', label: 'Dokumen', icon: FileText },
        ]
      : []),
  ];

  return (
    <AccountShell user={user} active="data">
      <div className="flex max-w-[820px] flex-col gap-5">
        <div className="enter flex flex-col gap-2.5 [animation-duration:800ms]">
          <h1 className="text-[36px] leading-[1.05] tracking-[-0.04em]">Data diri</h1>
          <p className="max-w-[60ch] text-[15.5px] leading-relaxed text-ink-muted">
            Isi sekali, dipakai berulang. Jenjang dan program studimu menentukan lomba dan beasiswa yang kami tandai cocok.
          </p>
          <nav aria-label="Lompat ke bagian" className="mt-2 flex flex-wrap gap-1.5">
            {jumps.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                className="flex min-h-11 items-center gap-1.5 rounded-sm border border-line px-[11px] text-[13px] font-medium transition-colors duration-150 hover:bg-panel-nested sm:min-h-[30px]"
              >
                <Icon aria-hidden className="size-3.5 text-ink-muted" />
                {label}
              </a>
            ))}
          </nav>
        </div>

        <AuthFeedback params={params} />

        <DetailCard
          id="identitas"
          icon={<IdCard className="size-[18px]" />}
          title="Identitas"
          description="Nama yang tampil di profil, tim, dan pendaftaranmu."
          editing={editing === 'identitas'}
          actions={actions('identitas')}
          delay={60}
        >
          {editing === 'identitas' ? (
            <form id="form-identitas" action={updateProfileAction} className={detailFields}>
              {hidden('fullName')}
              <div className="flex flex-col gap-[7px]">
                <label htmlFor="fullName" className="text-[13.5px] font-semibold">
                  Nama lengkap
                </label>
                <input id="fullName" name="fullName" defaultValue={user.fullName} required minLength={2} maxLength={100} autoComplete="name" className={detailInput} />
              </div>
              <div className="flex flex-col gap-[7px]">
                <span className="text-[13.5px] font-semibold">Email</span>
                <span className="flex h-11 items-center truncate rounded-card bg-panel-nested px-3.5 text-base text-ink-muted">{user.email}</span>
                <span className="text-[12.5px] text-ink-muted">Email dipakai untuk masuk dan tidak bisa diubah dari sini.</span>
              </div>
            </form>
          ) : (
            <DetailRows
              rows={[
                { label: 'Nama lengkap', value: user.fullName },
                { label: 'Email', value: user.email, locked: true },
              ]}
            />
          )}
        </DetailCard>

        <DetailCard
          id="pendidikan"
          icon={<GraduationCap className="size-[18px]" />}
          title="Pendidikan"
          description="Menentukan lomba dan beasiswa yang cocok dengan jenjangmu."
          editing={editing === 'pendidikan'}
          actions={actions('pendidikan')}
          delay={120}
        >
          {editing === 'pendidikan' ? (
            <form id="form-pendidikan" action={updateProfileAction} className={detailFields}>
              {hidden('education')}
              <fieldset className="col-span-full flex flex-col gap-[7px]">
                <legend className="mb-[7px] text-[13.5px] font-semibold">Jenjang</legend>
                <div className="flex flex-wrap gap-0.5 self-start rounded-card bg-panel-nested p-[3px]">
                  {[...EDUCATION_LEVELS, null].map((level) => (
                    <label
                      key={level ?? 'kosong'}
                      className="flex min-h-11 cursor-pointer items-center rounded-sm px-3.5 text-sm font-medium text-ink-muted transition-colors duration-150 hover:text-ink has-[:checked]:bg-panel has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgba(0,0,0,.1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus sm:min-h-9"
                    >
                      <input type="radio" name="educationLevel" value={level ?? ''} defaultChecked={user.educationLevel === level} className="sr-only" />
                      {level ? EDUCATION_LEVEL_LABEL[level] : 'Belum diisi'}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-[7px]">
                <span id="prodi-label" className="text-[13.5px] font-semibold">
                  Program studi / jurusan
                </span>
                <MajorField defaultValue={user.major ?? ''} labelledBy="prodi-label" />
                <span className="text-[12.5px] text-ink-muted">Tidak ada di daftar? Ketik lalu pilih “Pakai”.</span>
              </div>
            </form>
          ) : (
            <DetailRows
              rows={[
                {
                  label: 'Jenjang',
                  value: user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : 'Belum diisi',
                  empty: !user.educationLevel,
                },
                { label: 'Program studi / jurusan', value: user.major ?? 'Belum diisi', empty: !user.major },
              ]}
            />
          )}
        </DetailCard>

        {demoFeaturesEnabled && <DemoDetailCards baseDelay={180} />}
      </div>
    </AccountShell>
  );
}
