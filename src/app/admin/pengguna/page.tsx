import type { Metadata } from 'next';
import { Ban, RotateCcw, Search, Trash2, UsersRound } from 'lucide-react';
import { deleteUserAction, setUserSuspensionAction } from '@/app/admin/actions';
import { AdminNav } from '@/components/admin/admin-nav';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { TextArea, TextInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { adminMetadata, requireAdmin } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateId, formatDateTimeId } from '@/lib/deadline';
import type { RawSearchParams } from '@/lib/search-params';
import { ACCOUNT_DELETE_PHRASE, MODERATION_NOTE_MAX, normalizeUserSearch, SUSPENSION_REASON_MIN } from '@/lib/trust-safety';
import { cn } from '@/lib/utils';
import type { AdminUserSummary } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const generateMetadata = (): Promise<Metadata> => adminMetadata('Pengguna');

const RESULT_LIMIT = 30;

function UserActions({ user, query }: { user: AdminUserSummary; query: string }) {
  const suspended = user.suspendedAt !== null;
  return (
    <div className="flex flex-wrap items-start gap-2 border-t border-line/70 pt-3">
      {suspended ? (
        <form action={setUserSuspensionAction}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="mode" value="restore" />
          <input type="hidden" name="q" value={query} />
          <SubmitButton className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <RotateCcw aria-hidden /> Cabut penangguhan
          </SubmitButton>
        </form>
      ) : (
        <details className="group min-w-0 open:basis-full">
          <summary className={cn(buttonVariants({ variant: 'danger', size: 'sm' }), 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
            <Ban aria-hidden /> Tangguhkan
          </summary>
          <form action={setUserSuspensionAction} className="mt-3 flex max-w-lg flex-col gap-2">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="mode" value="suspend" />
            <input type="hidden" name="q" value={query} />
            <label htmlFor={`suspend-${user.id}`} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Alasan (wajib, tercatat di riwayat)</span>
              <TextArea id={`suspend-${user.id}`} name="reason" rows={2} minLength={SUSPENSION_REASON_MIN} maxLength={MODERATION_NOTE_MAX} required />
            </label>
            <p className="text-[13px] text-ink-muted">
              Akun langsung keluar, tidak bisa masuk lagi, dan hilang dari direktori. Kabari pemiliknya
              {user.email ? ` di ${user.email}` : ''} beserta alasannya.
            </p>
            <SubmitButton className={buttonVariants({ variant: 'danger', size: 'sm', className: 'self-start' })}>Konfirmasi: tangguhkan</SubmitButton>
          </form>
        </details>
      )}
      <details className="group min-w-0 open:basis-full">
        <summary className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'cursor-pointer list-none text-danger [&::-webkit-details-marker]:hidden')}>
          <Trash2 aria-hidden /> Hapus akun…
        </summary>
        <form action={deleteUserAction} className="mt-3 flex max-w-lg flex-col gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="q" value={query} />
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Untuk permintaan hapus dari pemilik akun (tanggapi ≤ 3 × 24 jam) atau pelanggaran berat. Profil, aktivitas, pendaftaran, dan
            bukti bayarnya terhapus permanen; tim dan laporan yang dibuatnya tetap ada tanpa namanya.
          </p>
          <label htmlFor={`delete-reason-${user.id}`} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Alasan (wajib, tercatat di riwayat tanpa nama pemilik)</span>
            <TextArea id={`delete-reason-${user.id}`} name="reason" rows={2} minLength={5} maxLength={MODERATION_NOTE_MAX} required />
          </label>
          <label htmlFor={`delete-confirm-${user.id}`} className="flex flex-col gap-1 text-sm">
            <span>
              Ketik <strong className="font-mono">{ACCOUNT_DELETE_PHRASE}</strong> untuk konfirmasi
            </span>
            <TextInput id={`delete-confirm-${user.id}`} name="confirm" autoComplete="off" required />
          </label>
          <SubmitButton className={buttonVariants({ variant: 'danger', size: 'sm', className: 'self-start' })}>Hapus akun permanen</SubmitButton>
        </form>
      </details>
    </div>
  );
}

/**
 * Manajemen pengguna (ADR-061): cari, tangguhkan, hapus atas permintaan.
 * Peran ADMIN sengaja TIDAK bisa diubah dari sini — hanya lewat service_role
 * (SCHEMA.md), supaya satu sesi admin yang dibajak tidak bisa mengangkat admin
 * baru atau menyingkirkan admin lain.
 */
export default async function UsersPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const gate = await requireAdmin();
  const query = normalizeUserSearch(typeof params.q === 'string' ? params.q : '');
  const repository = await getEventRepository();
  const [users, reportsOpen] = await Promise.all([repository.searchUsers(query, RESULT_LIMIT), repository.countOpenReports()]);

  return (
    <div className="container-page py-8">
      <AdminNav active="pengguna" reportsOpen={reportsOpen} />
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl">
          <UsersRound aria-hidden className="size-7 text-ink-muted" />
          Pengguna
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Cari lewat nama, email, atau id akun. Setiap penangguhan dan penghapusan tercatat di Riwayat moderasi beserta namamu.
        </p>
      </header>

      <ActionFeedback params={params} className="mb-6" />

      <form method="get" role="search" className="mb-6 flex max-w-xl gap-2">
        <label htmlFor="cari-pengguna" className="sr-only">
          Cari pengguna
        </label>
        <TextInput id="cari-pengguna" name="q" type="search" defaultValue={query} placeholder="Nama, email, atau id akun" className="flex-1" />
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          <Search aria-hidden /> Cari
        </button>
      </form>

      <h2 className="mb-3 text-sm font-medium text-ink-muted">
        {query ? `${users.length}${users.length === RESULT_LIMIT ? '+' : ''} hasil untuk “${query}”` : `${users.length} akun terbaru`}
      </h2>

      {users.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-panel px-6 py-10 text-center text-sm text-ink-muted">Tidak ada akun yang cocok.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {users.map((user) => {
            const protectedUser = user.role === 'ADMIN' || user.id === gate.userId;
            return (
              <li key={user.id} className="flex flex-col gap-2 rounded-card border border-line bg-panel p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{user.fullName}</h3>
                  <span className="flex flex-wrap gap-2">
                    {user.role === 'ADMIN' && <Badge variant="brand">Admin</Badge>}
                    {user.suspendedAt ? <Badge variant="danger">Ditangguhkan</Badge> : <Badge variant="success">Aktif</Badge>}
                  </span>
                </div>
                <p className="flex flex-wrap gap-x-3 gap-y-1 break-all text-[13px] text-ink-muted">
                  <span>{user.email ?? 'Tanpa email (data contoh)'}</span>
                  {user.createdAt && <span>bergabung {formatDateId(user.createdAt)}</span>}
                  <span className="font-mono text-[12px]">{user.id}</span>
                </p>
                {user.suspendedAt && (
                  <p className="rounded-sm bg-danger-soft/50 px-3 py-2 text-[13px] text-ink-soft">
                    Ditangguhkan {formatDateTimeId(user.suspendedAt)}
                    {user.suspensionReason ? ` — ${user.suspensionReason}` : ''}
                  </p>
                )}
                {protectedUser ? (
                  <p className="border-t border-line/70 pt-3 text-[13px] text-ink-muted">
                    {user.id === gate.userId ? 'Ini akunmu.' : 'Akun admin hanya bisa diubah lewat service_role, bukan dari aplikasi.'}
                  </p>
                ) : (
                  <UserActions user={user} query={query} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
