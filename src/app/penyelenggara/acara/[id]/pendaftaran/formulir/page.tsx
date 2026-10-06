import type { Metadata } from 'next';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { NotManaging } from '@/components/organizer/not-managing';
import { RegistrationFormBuilder } from '@/components/organizer/registration-form-builder';
import { StudioEventHeader } from '@/components/organizer/studio-event-header';
import { toActionErrorCode } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import type { EventType } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Formulir pendaftaran',
  robots: { index: false, follow: false },
};

/** Jenis kegiatan yang biasanya menyeleksi pendaftar — default "ditinjau dulu", bisa diubah. */
const SELECTIVE: readonly EventType[] = ['MAGANG', 'BEASISWA', 'LOMBA'];

/**
 * Penyusun formulir pendaftaran langsung (ADR-055). Formulir baru diisi
 * nilai awal yang masuk akal untuk jenis acaranya — magang/beasiswa/lomba
 * ditinjau dulu, sisanya langsung diterima — supaya penyelenggara mulai dari
 * pilihan yang benar, bukan dari formulir kosong.
 */
export default async function RegistrationFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const selfPath = `/penyelenggara/acara/${encodeURIComponent(id)}/pendaftaran/formulir`;
  const user = await requireUser(selfPath);

  const repository = await getEventRepository();
  const managed = (await repository.listManagedEvents(user.id)).find((entry) => entry.event.id === id);
  if (!managed) return <NotManaging />;

  const loaded = await repository.getManagedRegistrationForm(user.id, id).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, code: toActionErrorCode(error) }),
  );
  if (!loaded.ok && loaded.code === 'not_event_manager') return <NotManaging />;

  const invalidFields = (firstParam(query.fields) ?? '')
    .split(',')
    .filter((field) => /^[A-Za-z0-9_]{1,32}$/.test(field))
    .slice(0, 12);

  return (
    <div className="container-page flex flex-col gap-8 py-8 pb-16">
      <StudioEventHeader event={managed.event} active="formulir" />
      <ActionFeedback params={query} className="max-w-2xl" />
      {loaded.ok ? (
        <RegistrationFormBuilder
          eventId={managed.event.id}
          form={loaded.value}
          defaults={{ reviewMode: SELECTIVE.includes(managed.event.eventType) ? 'MANUAL' : 'AUTO', teamMode: false }}
          invalidFields={invalidFields}
        />
      ) : (
        <p role="alert" className="rounded-panel border border-danger-line bg-danger-soft p-5 text-sm text-danger">
          Formulir belum bisa dimuat. Muat ulang halaman sebentar lagi.
        </p>
      )}
    </div>
  );
}
