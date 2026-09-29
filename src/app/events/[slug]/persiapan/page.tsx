import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock, X } from 'lucide-react';
import { updateTrackerStatusAction } from '@/app/tracker/actions';
import { DemoContactRows, DemoDocumentsSummary } from '@/components/profile/demo-detail-cards';
import { DetailRows } from '@/components/profile/detail-card';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil, formatDateId, getDeadlineState } from '@/lib/deadline';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { cn, sanitizeExternalUrl } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, TRACKER_STATUS_LABEL } from '@/types/domain';

export const dynamic = 'force-dynamic';

const loadEvent = cache(async (slug: string) => (await getEventRepository()).getEventBySlug(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadEvent(slug);
  return {
    title: event ? `Persiapan: ${event.title}` : 'Persiapan pendaftaran',
    robots: { index: false, follow: false },
  };
}

/**
 * Persiapan pendaftaran (kanvas Pendaftaran, disesuaikan — ADR-039).
 *
 * Kanvas mengirim formulir ke penyelenggara dari dalam StudentHub. StudentFo
 * agregator: formulir resminya ada di situs penyelenggara. Jadi alurnya
 * dibalik jadi persiapan — periksa data, tim, dan berkas, buka formulir
 * resmi, lalu tandai "Sudah daftar" (aksi tracker sungguhan). Langkah
 * dipilih lewat `?langkah=`, tautan biasa tanpa state klien. Mode data
 * contoh saja, karena bagian kontak & berkas masih tersimpan di peramban.
 */
export default async function PreparePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> }) {
  if (!demoFeaturesEnabled) notFound();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const self = `/events/${slug}/persiapan`;
  const user = await requireUser(self);
  const [repository, event] = await Promise.all([getEventRepository(), loadEvent(slug)]);
  if (!event) notFound();

  const isTeamEvent = event.eventType === 'LOMBA';
  const [items, teams] = await Promise.all([repository.listTrackerItems(user.id), isTeamEvent ? repository.listTeams(event.id) : Promise.resolve([])]);
  const tracked = items.find((item) => item.eventId === event.id);
  const myTeam = teams.find((team) => team.members.some((member) => member.userId === user.id));

  const now = new Date();
  const isClosed = getDeadlineState(event.primaryDeadlineAt, now).urgency === 'closed' || event.status === 'EXPIRED';
  const registrationUrl = sanitizeExternalUrl(event.registrationLink);

  const steps = [
    { key: 'data', label: 'Data diri', sub: 'Nama, kontak, pendidikan' },
    ...(isTeamEvent ? [{ key: 'tim', label: 'Tim', sub: myTeam ? myTeam.title : 'Belum ada tim' }] : []),
    { key: 'berkas', label: 'Berkas', sub: 'Dokumen siap pakai' },
    { key: 'daftar', label: 'Daftar', sub: 'Di situs resmi' },
  ];
  const requested = Number(firstParam(query.langkah));
  const index = Number.isInteger(requested) && requested >= 1 && requested <= steps.length ? requested - 1 : 0;
  const step = steps[index]!;
  const stepHref = (at: number) => `${self}?langkah=${at + 1}`;

  const profileMissing = [!user.major && 'program studi', !user.educationLevel && 'jenjang'].filter(Boolean) as string[];
  const eligible = !user.educationLevel || event.educationLevels.length === 0 || event.educationLevels.includes(user.educationLevel) || event.educationLevels.includes('UMUM');

  return (
    <div className="min-h-[70vh] bg-panel-nested/50 pb-16">
      <div className="border-b border-line bg-canvas">
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="font-mono text-xs tracking-[.08em] text-ink-muted">PERSIAPAN PENDAFTARAN</span>
          <Link href={`/events/${event.slug}`} className="flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
            {/* Bukan "Keluar": kata itu sudah berarti keluar akun di menu akun. */}
            <X aria-hidden className="size-4" /> Tutup
          </Link>
        </div>
      </div>

      <div className="container-page grid items-start gap-8 pt-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-[92px]">
          <div className="flex flex-col gap-2 rounded-[18px] bg-inverse p-5 text-on-inverse">
            <span className="text-[12.5px] text-on-inverse-muted">{EVENT_TYPE_LABEL[event.eventType]}</span>
            <h1 className="text-[19px] font-semibold leading-snug tracking-[-0.02em] text-on-inverse">{event.title}</h1>
            <span className="text-[13px] text-on-inverse-muted">{event.organizer}</span>
            {event.primaryDeadlineAt && (
              <span className="mt-1 flex items-center gap-1.5 text-[13px]">
                <Clock aria-hidden className="size-3.5" />
                Tutup {formatDateId(event.primaryDeadlineAt)} · {daysLeftLabel(daysUntil(event.primaryDeadlineAt, now)).toLowerCase()}
              </span>
            )}
          </div>
          <nav aria-label="Langkah persiapan">
            <ol className="flex gap-1 overflow-x-auto lg:flex-col">
              {steps.map((item, at) => {
                const active = at === index;
                const done = at < index;
                return (
                  <li key={item.key} className="shrink-0">
                    <Link
                      href={stepHref(at)}
                      aria-current={active ? 'step' : undefined}
                      className={cn('flex min-h-11 items-center gap-3 rounded-card px-3 py-2 transition-colors duration-150', active ? 'bg-panel shadow-[0_1px_3px_rgba(0,0,0,.08)]' : 'hover:bg-panel')}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium',
                          done || active ? 'bg-brand text-on-brand' : 'border border-line-strong text-ink-muted',
                        )}
                      >
                        {done ? <Check className="size-3.5" strokeWidth={2.6} /> : at + 1}
                      </span>
                      <span className="flex flex-col">
                        <span className={cn('text-sm', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
                        <span className="hidden text-[12px] text-ink-muted lg:block">{item.sub}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>

        <section aria-labelledby="langkah-title" className="enter flex min-w-0 flex-col gap-5 rounded-[18px] border border-line bg-panel p-5 [animation-duration:450ms] sm:p-7">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs text-ink-muted">
              Langkah {index + 1} dari {steps.length}
            </span>
            <h2 id="langkah-title" className="text-[26px] font-bold tracking-[-0.03em]">
              {step.key === 'data' ? 'Periksa data dirimu' : step.key === 'tim' ? 'Tim' : step.key === 'berkas' ? 'Berkas' : 'Daftar di situs resmi'}
            </h2>
            <p className="max-w-[60ch] text-[14.5px] leading-relaxed text-ink-muted">
              {step.key === 'data'
                ? 'Data ini yang akan kamu salin ke formulir penyelenggara. Pastikan sudah benar sebelum lanjut.'
                : step.key === 'tim'
                  ? 'Lomba ini dikerjakan beregu. Pastikan timmu lengkap sebelum pendaftaran ditutup.'
                  : step.key === 'berkas'
                    ? 'Siapkan berkas yang umum diminta. Syarat pasti tercantum di pengumuman resmi penyelenggara.'
                    : `Formulir pendaftaran ada di situs ${event.organizer}. Setelah mengirimnya, kembali ke sini dan tandai sudah daftar.`}
            </p>
          </div>

          {step.key === 'data' && (
            <>
              <div className="-mx-5 sm:-mx-6">
                <DetailRows
                  rows={[
                    { label: 'Nama lengkap', value: user.fullName },
                    { label: 'Email', value: user.email, locked: true },
                    { label: 'Jenjang', value: user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : 'Belum diisi', empty: !user.educationLevel },
                    { label: 'Program studi', value: user.major ?? 'Belum diisi', empty: !user.major },
                  ]}
                />
                <DemoContactRows />
              </div>
              {!eligible && (
                <p className="rounded-card border border-dashed border-ink-muted px-4 py-3 text-sm">
                  Kegiatan ini untuk jenjang {event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(', ')}. Cek lagi syaratnya sebelum mendaftar.
                </p>
              )}
              {profileMissing.length > 0 && <p className="text-sm text-ink-muted">Belum diisi: {profileMissing.join(' dan ')}.</p>}
              <Link href="/profile/details" className="flex min-h-11 items-center self-start text-[13.5px] font-semibold underline underline-offset-[3px]">
                Ubah data diri
              </Link>
            </>
          )}

          {step.key === 'tim' &&
            (myTeam ? (
              <div className="flex flex-col gap-2 rounded-card bg-panel-nested p-4">
                <span className="text-[15px] font-semibold">{myTeam.title}</span>
                <span className="text-[13.5px] text-ink-muted">
                  {myTeam.memberCount} dari {myTeam.slotsNeeded} anggota · {myTeam.members.map((member) => member.fullName).join(', ')}
                </span>
                <Link href={`/teams/${myTeam.id}`} className="flex min-h-11 items-center self-start text-[13.5px] font-semibold underline underline-offset-[3px]">
                  Buka halaman tim
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong p-4">
                <span className="text-[15px] font-semibold">Kamu belum punya tim untuk lomba ini</span>
                <span className="text-[13.5px] text-ink-muted">
                  {teams.length > 0 ? `${teams.length} tim sudah dibuka untuk lomba ini.` : 'Belum ada tim yang dibuka. Kamu bisa membuka tim sendiri.'}
                </span>
                <Link href={`/teams?kegiatan=${event.slug}`} className="flex h-11 items-center gap-1.5 self-start rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
                  Cari tim <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
            ))}

          {step.key === 'berkas' && (
            <>
              <DemoDocumentsSummary />
              <Link href="/profile/details#dokumen" className="flex min-h-11 items-center self-start text-[13.5px] font-semibold underline underline-offset-[3px]">
                Kelola dokumen
              </Link>
            </>
          )}

          {step.key === 'daftar' && (
            <div className="flex flex-col gap-4">
              {tracked && (
                <p className="text-sm">
                  Di Pendaftaran kamu: <strong className="font-semibold">{TRACKER_STATUS_LABEL[tracked.status]}</strong>
                </p>
              )}
              {isClosed ? (
                <p className="rounded-card bg-panel-nested px-4 py-3 text-sm font-semibold text-ink-muted">Pendaftaran sudah ditutup.</p>
              ) : registrationUrl ? (
                <a
                  href={`/events/${event.slug}/daftar`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex h-12 items-center justify-center gap-2 self-start rounded-card bg-brand px-5 text-[15px] font-semibold text-on-brand hover:bg-brand-hover"
                >
                  Buka formulir resmi <ArrowUpRight aria-hidden className="size-4" />
                  <span className="sr-only">(membuka situs penyelenggara di tab baru)</span>
                </a>
              ) : (
                <p className="rounded-card bg-caution-soft p-3 text-sm text-caution">Tautan pendaftaran belum tersedia. Cek langsung ke situs penyelenggara.</p>
              )}
              {tracked?.status !== 'APPLIED' && tracked?.status !== 'INTERVIEW' && tracked?.status !== 'ACCEPTED' && (
                <form action={updateTrackerStatusAction} className="flex flex-col gap-2 border-t border-line pt-4">
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="status" value="APPLIED" />
                  <input type="hidden" name="returnTo" value={`/tracker/${event.slug}`} />
                  <span className="text-sm text-ink-muted">Sudah mengirim formulir di situs penyelenggara?</span>
                  <button type="submit" className="flex h-11 items-center gap-1.5 self-start rounded-card border border-line-strong/70 px-4 text-sm font-semibold hover:bg-panel-nested">
                    <Check aria-hidden className="size-4" /> Tandai sudah daftar
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-5">
            {index > 0 ? (
              <Link href={stepHref(index - 1)} className="flex h-11 items-center gap-1.5 rounded-card px-3 text-sm font-semibold hover:bg-panel-nested">
                <ArrowLeft aria-hidden className="size-4" /> Kembali
              </Link>
            ) : (
              <span />
            )}
            {index < steps.length - 1 && (
              <Link href={stepHref(index + 1)} className="flex h-11 items-center gap-1.5 rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
                Lanjut: {steps[index + 1]!.label} <ArrowRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
