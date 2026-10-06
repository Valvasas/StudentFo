import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, CircleCheck, CircleDashed, GraduationCap, Palette, Sparkles } from 'lucide-react';
import { AccountShell } from '@/components/layout/account-shell';
import { CategoryIcon } from '@/components/listing/category-icon';
import { AppearanceSettings } from '@/components/profile/appearance-settings';
import { DetailCard, detailButton } from '@/components/profile/detail-card';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { isColdStart } from '@/lib/recommendation';
import { EDUCATION_LEVEL_LABEL } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Personalisasi',
  robots: { index: false, follow: false },
};

/**
 * Personalisasi (ADR-055): dua hal yang memang bisa disesuaikan, dipisah
 * jujur menurut tempat tinggalnya —
 *  - tampilan (tema, gerak) = per PERANGKAT, berlaku seketika;
 *  - rekomendasi = per AKUN, dibaca dari jenjang & minat yang sama dengan
 *    skor `recommendation.ts`. Diubah di halamannya masing-masing, bukan
 *    disalin ke sini, supaya tidak ada dua form untuk data yang sama.
 * Ukuran huruf sengaja tidak ditawarkan: banyak teks berukuran px tetap,
 * jadi penggeser ukuran hanya akan membesarkan sebagian layar — zoom
 * peramban melakukannya dengan benar.
 */
export default async function PersonalizationPage() {
  const user = await requireUser('/profile/personalization');
  const categories = await (await getEventRepository()).listCategories();
  const personal = !isColdStart({ educationLevel: user.educationLevel, interests: user.interests });
  const interests = user.interests.flatMap((slug) => {
    const category = categories.find((entry) => entry.slug === slug);
    return category ? [category] : [];
  });

  return (
    <AccountShell user={user} active="personalisasi">
      <div className="flex max-w-[820px] flex-col gap-5">
        <div className="enter flex flex-col gap-2.5 [animation-duration:800ms]">
          <h1 className="text-[36px] leading-[1.05] tracking-[-0.04em]">Personalisasi</h1>
          <p className="max-w-[60ch] text-[15.5px] leading-relaxed text-ink-muted">
            Atur tampilan StudentFo di perangkat ini, dan apa yang kami dahulukan untukmu.
          </p>
        </div>

        <DetailCard
          id="tampilan"
          icon={<Palette className="size-[18px]" />}
          title="Tampilan"
          description="Berlaku seketika dan diingat di perangkat ini saja."
          delay={60}
        >
          <AppearanceSettings />
        </DetailCard>

        <DetailCard
          id="rekomendasi"
          icon={<Sparkles className="size-[18px]" />}
          title="Rekomendasi"
          description="Dua hal ini yang menentukan urutan “Sesuai minatmu” di beranda dan daftar kegiatan."
          delay={120}
        >
          <p
            className={
              personal
                ? 'mx-5 mb-4 flex items-start gap-2 rounded-card bg-success-soft px-3.5 py-3 text-[13.5px] text-success sm:mx-6'
                : 'mx-5 mb-4 flex items-start gap-2 rounded-card bg-panel-nested px-3.5 py-3 text-[13.5px] text-ink-soft sm:mx-6'
            }
          >
            {personal ? <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" /> : <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0" />}
            {personal
              ? 'Rekomendasi personal aktif: bidang, jenjang, tenggat, dan kebaruan ikut menentukan urutan.'
              : 'Belum personal. Isi jenjang dan minimal satu bidang — sementara itu urutan memakai kegiatan terbaru, yang banyak disimpan, dan tenggat yang masih sempat.'}
          </p>
          <div className="flex flex-col divide-y divide-line/70 border-t border-line/70 sm:mx-6">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-0">
              <span className="flex min-w-0 items-center gap-3">
                <GraduationCap aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
                <span className="flex flex-col">
                  <span className="text-[12.5px] text-ink-muted">Jenjang</span>
                  <span className={user.educationLevel ? 'text-[15px]' : 'text-[15px] text-ink-faint'}>
                    {user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : 'Belum diisi'}
                  </span>
                </span>
              </span>
              <Link href="/profile/details#pendidikan" className={detailButton}>
                Ubah jenjang
              </Link>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:px-0">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-[12.5px] text-ink-muted">Bidang diminati</span>
                {interests.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {interests.map((category, index) => (
                      <li
                        key={category.slug}
                        className="rise flex h-8 items-center gap-1.5 rounded-pill bg-panel-nested px-3 text-[13px] font-medium"
                        style={{ '--i': index } as CSSProperties}
                      >
                        <CategoryIcon slug={category.slug} />
                        {category.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] text-ink-faint">Belum dipilih</p>
                )}
              </div>
              <Link href="/profile/interests" className={detailButton}>
                Ubah peminatan
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </div>
          </div>
        </DetailCard>
      </div>
    </AccountShell>
  );
}
