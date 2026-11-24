import type { Metadata } from 'next';
import Link from 'next/link';
import { AtSign, Award, FileText, Globe, GraduationCap, IdCard, Images, MapPin, Pencil, Phone } from 'lucide-react';
import { setPortfolioPublicAction, updateProfileAction, updateProfileIdentityAction, updateStudyPlaceAction } from '@/app/profile/actions';
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
import { ProfileLookCard } from '@/components/profile/profile-look-card';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { InstitutionPicker } from '@/components/ui/institution-picker';
import { RegionPicker } from '@/components/ui/region-picker';
import { BackLink } from '@/components/ui/back-link';
import { SubmitButton } from '@/components/ui/submit-button';
import { UnsavedChangesGuard } from '@/components/ui/unsaved-changes-guard';
import { PROFILE_EDIT_ORIGINS } from '@/lib/account-sidebar';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import { BIO_MAX, suggestUsername, USERNAME_LIMITS } from '@/lib/profile-identity';
import { presentStudyProfile, STUDY_PLACE_LIMITS } from '@/lib/study-profile';
import { districtName } from '@/lib/wilayah-districts';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { EDUCATION_LEVELS, EDUCATION_LEVEL_LABEL, PROFILE_VISIBILITIES, PROFILE_VISIBILITY_LABEL } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Data diri',
  robots: { index: false, follow: false },
};

const EDITABLE = ['identitas', 'publik', 'pendidikan', 'asal'] as const;
/** Kode milik kartu Profil publik & Tempat studi — kode bersama (`unknown`) sudah ditangani AuthFeedback. */
const STUDY_ERRORS = new Set([
  'portfolio_public_unavailable',
  'invalid_study_place',
  'study_profile_unavailable',
  'username_taken',
  'invalid_profile_identity',
  'profile_identity_unavailable',
  'image_missing',
  'image_invalid',
  'image_too_large',
  'profile_image_too_large',
  'profile_media_rate_limited',
  'profile_media_unavailable',
  'invalid_banner_preset',
]);
const STUDY_NOTICES = new Set([
  'study_place_saved',
  'profile_identity_saved',
  'avatar_saved',
  'avatar_removed',
  'banner_saved',
  'banner_removed',
  'banner_preset_saved',
  'portfolio_public_saved',
]);
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
  const repository = await getEventRepository();
  const [studyProfile, identity, portfolioPublic] = await Promise.all([
    repository.getStudyProfile(user.id),
    repository.getProfileIdentity(user.id),
    withFallback('portofolio publik', () => repository.getPortfolioPublic(user.id), { value: false, available: false }),
  ]);
  const suggestedUsername = suggestUsername(user.fullName);
  const studyView = presentStudyProfile({ ...studyProfile, regionCode: studyProfile.domicileCode });
  const district = studyProfile.domicileCode?.length === 8 ? districtName(studyProfile.domicileCode) : null;
  const studyError = firstParam(params.error);
  const studyFeedback = {
    error: STUDY_ERRORS.has(studyError ?? '') ? studyError : undefined,
    notice: STUDY_NOTICES.has(firstParam(params.notice) ?? '') ? firstParam(params.notice) : undefined,
  };

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
    { href: '#tampilan', label: 'Foto & banner', icon: Images },
    ...(identity.available ? [{ href: '#publik', label: 'Profil publik', icon: AtSign }] : []),
    { href: '#pendidikan', label: 'Pendidikan', icon: GraduationCap },
    ...(studyProfile.available ? [{ href: '#asal', label: 'Tempat studi', icon: MapPin }] : []),
    ...(demoFeaturesEnabled
      ? [
          { href: '#kontak', label: 'Kontak', icon: Phone },
          { href: '#pencapaian', label: 'Pencapaian', icon: Award },
          { href: '#dokumen', label: 'Dokumen', icon: FileText },
        ]
      : []),
  ];

  return (
    <AccountShell user={user} active="data">
      <div className="flex max-w-[820px] flex-col gap-5">
        <BackLink href="/profile" label="Profil" via={PROFILE_EDIT_ORIGINS} className="-mb-3" />
        <div className="enter flex flex-col gap-2.5">
          <h1 className="text-[36px] leading-[1.05] tracking-[-0.04em]">Data diri</h1>
          <p className="max-w-[60ch] text-[15.5px] leading-relaxed text-ink-muted">
            Isi sekali, dipakai berulang. Jenjang dan program studimu menentukan lomba dan beasiswa yang kami tandai cocok.
          </p>
          <nav aria-label="Lompat ke bagian" className="mt-2 flex flex-wrap gap-1.5">
            {jumps.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                className="flex min-h-11 items-center gap-1.5 rounded-sm border border-line px-[11px] text-[13px] font-medium transition-colors duration-150 hover:bg-panel-nested sm:pointer-fine:min-h-[30px]"
              >
                <Icon aria-hidden className="size-3.5 text-ink-muted" />
                {label}
              </a>
            ))}
          </nav>
        </div>

        <AuthFeedback params={params} />
        {/* Hanya kode kartu tempat studi — kode bersama (mis. `unknown`) sudah ditangani AuthFeedback, jangan tampil dua kali. */}
        <ActionFeedback params={studyFeedback} />

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
              <UnsavedChangesGuard />
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

        <ProfileLookCard
          media={user.profileMedia}
          fullName={user.fullName}
          subtitle={identity.username ? `@${identity.username}` : (user.major ?? 'Belum ada username')}
          delay={75}
        />

        {identity.available && (
          <DetailCard
            id="publik"
            icon={<AtSign className="size-[18px]" />}
            title="Profil publik"
            description="Username, bio, dan siapa yang boleh membuka profilmu. Tamu hanya melihat portofolio publik bila kamu menyalakannya; mesin pencari tidak pernah."
            editing={editing === 'publik'}
            actions={actions('publik')}
            delay={90}
          >
            {editing === 'publik' ? (
              <form id="form-publik" action={updateProfileIdentityAction} className={detailFields}>
                <UnsavedChangesGuard />
                <div className="flex flex-col gap-[7px]">
                  <label htmlFor="username" className="text-[13.5px] font-semibold">
                    Username
                  </label>
                  <div className="relative">
                    <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted">
                      @
                    </span>
                    <input
                      id="username"
                      name="username"
                      defaultValue={identity.username ?? suggestedUsername}
                      minLength={USERNAME_LIMITS.min}
                      maxLength={USERNAME_LIMITS.max}
                      pattern="[A-Za-z0-9@][A-Za-z0-9._]{1,29}"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-describedby="username-hint"
                      className={`${detailInput} pl-8`}
                    />
                  </div>
                  <span id="username-hint" className="text-[12.5px] text-ink-muted">
                    3–30 karakter: huruf kecil, angka, titik, garis bawah. Profilmu ada di studentfo/u/username.
                    {!identity.username && ' Kami isi saran dari namamu — boleh diganti.'}
                  </span>
                </div>
                <div className="col-span-full flex flex-col gap-[7px]">
                  <label htmlFor="bio" className="text-[13.5px] font-semibold">
                    Bio <span className="font-normal text-ink-muted">(opsional)</span>
                  </label>
                  <textarea
                    id="bio"
                    name="bio"
                    rows={3}
                    maxLength={BIO_MAX}
                    defaultValue={identity.bio ?? ''}
                    placeholder="Mis. Mahasiswa Informatika, suka UI/UX & lomba hackathon. Cari tim untuk Gemastik."
                    aria-describedby="bio-hint"
                    className={`${detailInput} h-auto py-2.5`}
                  />
                  <span id="bio-hint" className="text-[12.5px] text-ink-muted">
                    Maks. {BIO_MAX} karakter. Jangan tulis nomor HP atau alamat — siapa pun yang membuka profilmu bisa membacanya.
                  </span>
                </div>
                <fieldset className="col-span-full flex flex-col gap-2">
                  <legend className="mb-1 text-[13.5px] font-semibold">Siapa yang boleh membuka profilmu</legend>
                  {PROFILE_VISIBILITIES.map((visibility) => (
                    <label key={visibility} className="choice items-start">
                      <input type="radio" name="profileVisibility" value={visibility} defaultChecked={identity.visibility === visibility} className="check mt-0.5" />
                      <span className="flex flex-col">
                        <span>{PROFILE_VISIBILITY_LABEL[visibility]}</span>
                        <span className="text-[12.5px] font-normal text-ink-muted">
                          {visibility === 'MEMBERS'
                            ? 'Nama, username, bio, kampus/sekolah, kota, minat, dan portofolio publikmu. Mereka juga bisa mengajakmu terhubung.'
                            : 'Orang lain hanya bisa membuka profilmu bila sudah terhubung, satu lobi lomba, atau kamu memilih bisa ditemukan di Koneksi.'}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </form>
            ) : (
              <DetailRows
                rows={[
                  {
                    label: 'Username',
                    value: identity.username ? (
                      <Link href={`/u/${identity.username}`} className="font-medium underline underline-offset-[3px]">
                        @{identity.username}
                      </Link>
                    ) : (
                      'Belum dipasang'
                    ),
                    empty: !identity.username,
                  },
                  { label: 'Bio', value: identity.bio ?? 'Belum diisi', empty: !identity.bio, wide: true },
                  { label: 'Profil terlihat oleh', value: PROFILE_VISIBILITY_LABEL[identity.visibility], wide: true },
                ]}
              />
            )}
          </DetailCard>
        )}

        {identity.available && portfolioPublic.available && (
          <DetailCard
            id="portofolio-publik"
            icon={<Globe className="size-[18px]" />}
            title="Portofolio publik"
            description="Bagikan riwayat lomba & prestasimu lewat tautan — misalnya di CV atau pendaftaran beasiswa. Bawaan: mati."
            delay={105}
          >
            <form action={setPortfolioPublicAction} className="flex flex-col gap-3.5 px-5 pb-5 sm:px-6">
              <input type="hidden" name="value" value={portfolioPublic.value ? '0' : '1'} />
              <p className="text-[14px] leading-relaxed text-ink-soft">
                {portfolioPublic.value ? (
                  <>
                    <strong className="font-semibold text-ink">Menyala.</strong> Siapa pun dengan tautan{' '}
                    {identity.username && (
                      <Link href={`/u/${identity.username}`} className="font-medium text-ink underline underline-offset-[3px]">
                        studentfo/u/{identity.username}
                      </Link>
                    )}{' '}
                    bisa melihat nama, kampus/sekolah, jurusan, bio, keahlian, dan kegiatan yang kamu pilih tampil di portofolio. Namamu juga
                    muncul di peringkat pelajar bila punya prestasi terverifikasi.
                  </>
                ) : (
                  <>
                    <strong className="font-semibold text-ink">Mati.</strong> Hanya anggota yang masuk (sesuai pilihan di atas) yang bisa
                    membuka profilmu. Prestasi terverifikasimu tetap dihitung tanpa nama di skor kampus.
                  </>
                )}
              </p>
              <p className="text-[12.5px] leading-relaxed text-ink-muted">
                Email, domisili, dan koneksimu tidak pernah ikut tampil, dan halaman ini tidak diindeks mesin pencari. Di bawah 18 tahun?
                Minta izin orang tua/wali dulu sebelum menyalakannya.
              </p>
              {identity.username ? (
                <SubmitButton className={portfolioPublic.value ? detailGhostButton : detailPrimaryButton} pendingLabel="Menyimpan…">
                  {portfolioPublic.value ? 'Matikan portofolio publik' : 'Nyalakan portofolio publik'}
                </SubmitButton>
              ) : (
                <p className="text-[13px] font-medium text-ink-soft">Pasang username dulu di Profil publik — alamat portofoliomu memakai username.</p>
              )}
            </form>
          </DetailCard>
        )}

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
              <UnsavedChangesGuard />
              {hidden('education')}
              <fieldset className="col-span-full flex flex-col gap-[7px]">
                <legend className="mb-[7px] text-[13.5px] font-semibold">Jenjang</legend>
                <div className="flex flex-wrap gap-0.5 self-start rounded-card bg-panel-nested p-[3px]">
                  {[...EDUCATION_LEVELS, null].map((level) => (
                    <label
                      key={level ?? 'kosong'}
                      className="flex min-h-11 cursor-pointer items-center rounded-sm px-3.5 text-sm font-medium text-ink-muted transition-colors duration-150 hover:text-ink has-[:checked]:bg-panel has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgba(0,0,0,.1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus sm:pointer-fine:min-h-9"
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
                <span className="text-[12.5px] text-ink-muted">Tidak ada di daftar? Pilih “Lainnya — tulis sendiri”.</span>
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

        {studyProfile.available && (
          <DetailCard
            id="asal"
            icon={<MapPin className="size-[18px]" />}
            title="Tempat studi & domisili"
            description="Tampil di profil publik, lobi lomba, dan kartu koneksi — supaya orang tahu kamu dari mana. Kecamatan hanya untukmu."
            editing={editing === 'asal'}
            actions={actions('asal')}
            delay={150}
          >
            {editing === 'asal' ? (
              <form id="form-asal" action={updateStudyPlaceAction} className={detailFields}>
                <UnsavedChangesGuard />
                <div className="col-span-full flex flex-col gap-[7px]">
                  <label htmlFor="institution" className="text-[13.5px] font-semibold">
                    Sekolah / kampus
                  </label>
                  <InstitutionPicker
                    id="institution"
                    defaultId={studyProfile.institutionId}
                    defaultName={studyView.institution}
                    minLength={STUDY_PLACE_LIMITS.institutionMin}
                    maxLength={STUDY_PLACE_LIMITS.institutionMax}
                    describedBy="institution-hint"
                  />
                  <span id="institution-hint" className="text-[12.5px] text-ink-muted">
                    Ketik nama atau singkatannya (mis. UI, ITB, SMAN 3 Bandung). Data SMA/SMK/MA & perguruan tinggi dari Data
                    Referensi Kemendikdasmen. Kosongkan untuk menghapus.
                  </span>
                </div>
                <div className="col-span-full flex flex-col gap-[7px]">
                  <span id="domicile-label" className="text-[13.5px] font-semibold">
                    Domisili
                  </span>
                  <RegionPicker name="domicile" defaultValue={studyProfile.domicileCode} labelledBy="domicile-label" withDistrict allowAbroad districtLabelId="district-label" />
                </div>
              </form>
            ) : (
              <DetailRows
                rows={[
                  { label: 'Sekolah / kampus', value: studyView.institution ?? 'Belum diisi', empty: !studyView.institution, wide: true },
                  {
                    label: 'Domisili',
                    value: studyView.region ? (district ? `Kec. ${district}, ${studyView.region}` : studyView.region) : 'Belum diisi',
                    empty: !studyView.region,
                    wide: true,
                  },
                ]}
              />
            )}
          </DetailCard>
        )}

        {demoFeaturesEnabled && <DemoDetailCards baseDelay={180} />}
      </div>
    </AccountShell>
  );
}
