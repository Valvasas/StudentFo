import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminNav } from '@/components/admin/admin-nav';
import { BadgeCheck, Check, ExternalLink, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { reviewClaimAction, reviewOrganizerAction, reviewRevisionAction } from '@/app/admin/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { RevisionChanges } from '@/components/organizer/revision-changes';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { TextArea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { checkAdminAccess } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import type { RawSearchParams } from '@/lib/search-params';
import { cn, sanitizeExternalUrl } from '@/lib/utils';
import type { EventDetail } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verifikasi penyelenggara',
  robots: { index: false, follow: false },
};

const QUEUE_LIMIT = 50;
const TABS = [
  { key: 'verifikasi', label: 'Verifikasi' },
  { key: 'klaim', label: 'Klaim acara' },
  { key: 'perubahan', label: 'Perubahan acara' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** Catatan untuk pemohon — ikut notifikasi & log. Wajib saat menolak/mencabut supaya keputusan bisa dipertanggungjawabkan. */
function NoteField({ id, required }: { id: string; required: boolean }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        Catatan untuk pemohon {required ? '(wajib)' : '(opsional)'}
      </span>
      <TextArea id={id} name="note" rows={2} maxLength={500} required={required} />
    </label>
  );
}

/**
 * Tolak/cabut lewat <details> berisi catatan wajib; setuju satu klik.
 * Dua <form> terpisah — Enter di kolom catatan tidak boleh memicu "setujui".
 */
function DecisionForms({
  action,
  idField,
  id,
  tab,
  approve,
  reject,
}: {
  action: (formData: FormData) => Promise<void>;
  idField: string;
  id: string;
  tab: TabKey;
  approve: { value: string; label: string } | null;
  reject: { value: string; label: string; danger?: boolean };
}) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {approve && (
        <form action={action}>
          <input type="hidden" name={idField} value={id} />
          <input type="hidden" name="decision" value={approve.value} />
          <input type="hidden" name="tab" value={tab} />
          <SubmitButton className={buttonVariants({ variant: 'success', size: 'sm' })}>
            <Check aria-hidden /> {approve.label}
          </SubmitButton>
        </form>
      )}
      <details className="group min-w-0 flex-1">
        <summary className={cn(buttonVariants({ variant: 'danger', size: 'sm' }), 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
          {reject.value === 'REVOKED' ? <ShieldOff aria-hidden /> : <X aria-hidden />} {reject.label}
        </summary>
        <form action={action} className="mt-3 flex max-w-lg flex-col gap-2">
          <input type="hidden" name={idField} value={id} />
          <input type="hidden" name="decision" value={reject.value} />
          <input type="hidden" name="tab" value={tab} />
          <NoteField id={`note-${reject.value}-${id}`} required />
          <SubmitButton className={buttonVariants({ variant: 'danger', size: 'sm', className: 'self-start' })}>
            Konfirmasi: {reject.label.toLowerCase()}
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}

function ExternalRef({ url, label }: { url: string | null; label: string }) {
  const safe = url ? sanitizeExternalUrl(url) : null;
  if (!safe) return null;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-1 text-sm text-brand-text hover:underline">
      {label} <ExternalLink aria-hidden className="size-3" />
      <span className="sr-only">(tab baru)</span>
    </a>
  );
}

/**
 * Antrean kepercayaan (ADR-042): verifikasi penyelenggara, klaim acara,
 * dan permintaan perubahan acara tayang. Semua keputusan lewat RPC
 * service_role SETELAH checkAdminAccess() di Server Action, dan tercatat di
 * /admin/riwayat oleh trigger.
 */
export default async function OrganizerQueuePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const gate = await checkAdminAccess();
  if (!gate.allowed) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <ShieldCheck aria-hidden className="size-10 text-ink-faint" />
        <h1 className="text-2xl">Akses terbatas</h1>
        <p className="max-w-md text-ink-muted">Verifikasi penyelenggara hanya untuk akun berperan admin.</p>
        {gate.reason === 'unauthenticated' && (
          <Button asChild>
            <Link href="/login?next=%2Fadmin%2Fpenyelenggara">Masuk</Link>
          </Button>
        )}
      </div>
    );
  }

  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab: TabKey = TABS.some((item) => item.key === rawTab) ? (rawTab as TabKey) : 'verifikasi';

  const repository = await getEventRepository();
  const [applications, verified, claims, revisions] = await Promise.all([
    repository.listOrganizerApplications('PENDING', QUEUE_LIMIT),
    tab === 'verifikasi' ? repository.listOrganizerApplications('VERIFIED', 100) : Promise.resolve([]),
    repository.listClaims('PENDING', QUEUE_LIMIT),
    repository.listRevisions('PENDING', QUEUE_LIMIT),
  ]);
  const counts: Record<TabKey, number> = { verifikasi: applications.length, klaim: claims.length, perubahan: revisions.length };

  // Nilai "sebelum" dibaca dari acara SAAT INI, bukan disalin saat diajukan —
  // acara bisa sudah berubah lewat moderator sejak permintaan dibuat.
  const currentEvents = new Map<string, EventDetail | null>();
  if (tab === 'perubahan') {
    const slugs = [...new Set(revisions.map((revision) => revision.event.slug).filter(Boolean))];
    const details = await Promise.all(slugs.map((slug) => repository.getEventBySlug(slug)));
    slugs.forEach((slug, index) => currentEvents.set(slug, details[index] ?? null));
  }

  return (
    <div className="container-page py-8">
      <AdminNav active="penyelenggara" />
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl">
          <BadgeCheck aria-hidden className="size-7 text-ink-muted" />
          Penyelenggara
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Verifikasi hanya setelah bukti peran dicek ke sumber resmi (situs lembaga, akun media sosial resmi). Lencana
          terverifikasi tampil di semua acara yang dikelola — satu keputusan keliru merusak kepercayaan pada semuanya.
        </p>
      </header>

      <ActionFeedback params={params} className="mb-6" />

      <nav aria-label="Jenis antrean" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <Link
              key={item.key}
              href={item.key === 'verifikasi' ? '/admin/penyelenggara' : `/admin/penyelenggara?tab=${item.key}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-12 shrink-0 items-center gap-2 px-3.5 text-sm transition-colors duration-150 ease-snap',
                active ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-text-primary)]' : 'text-ink-muted hover:text-ink',
              )}
            >
              {item.label}
              <Badge variant={counts[item.key] > 0 ? 'warning' : 'neutral'}>{counts[item.key]}</Badge>
            </Link>
          );
        })}
      </nav>

      {tab === 'verifikasi' && (
        <>
          <section aria-labelledby="menunggu-verifikasi" className="flex flex-col gap-4">
            <h2 id="menunggu-verifikasi" className="text-xl">Menunggu verifikasi</h2>
            {applications.length === 0 ? (
              <EmptyQueue text="Tidak ada pengajuan penyelenggara yang menunggu." />
            ) : (
              <ul className="flex flex-col gap-4">
                {applications.map((profile) => (
                  <li key={profile.userId} className="flex flex-col gap-3 rounded-card border border-line bg-panel p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                      <span>
                        Diajukan {formatDateTimeId(profile.createdAt)}
                        {profile.applicant ? ` oleh ${profile.applicant.fullName}${profile.applicant.email ? ` (${profile.applicant.email})` : ''}` : ''}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold">{profile.orgName}</h3>
                    <ExternalRef url={profile.website} label="Situs resmi lembaga" />
                    <div className="rounded-card bg-panel-nested p-3 text-sm">
                      <p className="mb-1 font-medium text-ink-muted">Bukti peran</p>
                      <p className="whitespace-pre-line break-words">{profile.evidence}</p>
                    </div>
                    <DecisionForms
                      action={reviewOrganizerAction}
                      idField="userId"
                      id={profile.userId}
                      tab={tab}
                      approve={{ value: 'VERIFIED', label: 'Verifikasi' }}
                      reject={{ value: 'REJECTED', label: 'Tolak' }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="terverifikasi" className="mt-12 flex flex-col gap-4">
            <h2 id="terverifikasi" className="text-xl">Terverifikasi ({verified.length})</h2>
            <p className="max-w-2xl text-sm text-ink-muted">
              Mencabut verifikasi langsung memutus akses analitik & pengajuan perubahan, dan lencana hilang dari semua acaranya.
              Pemilik tidak bisa mengajukan ulang sendiri.
            </p>
            {verified.length === 0 ? (
              <EmptyQueue text="Belum ada penyelenggara terverifikasi." />
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-panel">
                {verified.map((profile) => (
                  <li key={profile.userId} className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{profile.orgName}</span>
                      {profile.applicant && <span className="text-sm text-ink-muted">· {profile.applicant.fullName}</span>}
                      {profile.reviewedAt && (
                        <span className="text-xs text-ink-faint">sejak {formatDateTimeId(profile.reviewedAt)}</span>
                      )}
                    </div>
                    <DecisionForms
                      action={reviewOrganizerAction}
                      idField="userId"
                      id={profile.userId}
                      tab={tab}
                      approve={null}
                      reject={{ value: 'REVOKED', label: 'Cabut verifikasi' }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === 'klaim' && (
        <section aria-label="Klaim acara" className="flex flex-col gap-4">
          {claims.length === 0 ? (
            <EmptyQueue text="Tidak ada klaim acara yang menunggu." />
          ) : (
            <ul className="flex flex-col gap-4">
              {claims.map((claim) => (
                <li key={claim.id} className="flex flex-col gap-3 rounded-card border border-line bg-panel p-5 shadow-card">
                  <span className="text-xs text-ink-muted">Diajukan {formatDateTimeId(claim.createdAt)}</span>
                  <h3 className="text-base font-semibold">
                    {claim.orgName ?? 'Lembaga tidak dikenal'} → {claim.event.slug ? (
                      <Link href={`/events/${claim.event.slug}`} className="underline underline-offset-[3px]">
                        {claim.event.title}
                      </Link>
                    ) : (
                      claim.event.title
                    )}
                  </h3>
                  <p className="text-sm text-ink-muted">Penyelenggara tercantum di acara: {claim.event.organizer || '—'}</p>
                  <div className="rounded-card bg-panel-nested p-3 text-sm">
                    <p className="mb-1 font-medium text-ink-muted">Bukti</p>
                    <p className="whitespace-pre-line break-words">{claim.evidence}</p>
                  </div>
                  <DecisionForms
                    action={reviewClaimAction}
                    idField="claimId"
                    id={claim.id}
                    tab={tab}
                    approve={{ value: 'APPROVED', label: 'Setujui klaim' }}
                    reject={{ value: 'REJECTED', label: 'Tolak' }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'perubahan' && (
        <section aria-label="Perubahan acara" className="flex flex-col gap-4">
          {revisions.length === 0 ? (
            <EmptyQueue text="Tidak ada permintaan perubahan yang menunggu." />
          ) : (
            <ul className="flex flex-col gap-4">
              {revisions.map((revision) => (
                <li key={revision.id} className="flex flex-col gap-3 rounded-card border border-line bg-panel p-5 shadow-card">
                  <span className="text-xs text-ink-muted">
                    Diajukan {formatDateTimeId(revision.createdAt)} oleh {revision.orgName ?? 'penyelenggara'}
                  </span>
                  <h3 className="text-base font-semibold">
                    {revision.event.slug ? (
                      <Link href={`/events/${revision.event.slug}`} className="underline underline-offset-[3px]">
                        {revision.event.title}
                      </Link>
                    ) : (
                      revision.event.title
                    )}
                  </h3>
                  <RevisionChanges changes={revision.changes} current={currentEvents.get(revision.event.slug) ?? null} />
                  {revision.note && <p className="text-sm text-ink-soft">Catatan pengaju: {revision.note}</p>}
                  <DecisionForms
                    action={reviewRevisionAction}
                    idField="revisionId"
                    id={revision.id}
                    tab={tab}
                    approve={{ value: 'APPROVED', label: 'Terapkan perubahan' }}
                    reject={{ value: 'REJECTED', label: 'Tolak' }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function EmptyQueue({ text }: { text: string }) {
  return (
    <p className="flex items-center justify-center gap-2 rounded-card border border-dashed border-line bg-panel px-6 py-10 text-center text-sm text-ink-muted">
      <Check aria-hidden className="size-4 text-success" />
      {text}
    </p>
  );
}
