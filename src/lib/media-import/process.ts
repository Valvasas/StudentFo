import { toActionErrorCode } from '@/lib/action-feedback';
import type { EventRepository, MediaImportJob } from '@/lib/data/repository';
import { inspectImage, type UploadedImage } from '@/lib/image-file';
import type { EventDetail, EventType } from '@/types/domain';
import { PERMANENT_REMOTE_ERRORS, type RemoteImageResult } from './remote-image';
import { buildSlideContent, defaultCaption, mediaSpecSchema, type SlideContent } from './spec';

/**
 * Pengerja antrean impor media (ADR-095): klaim → siapkan gambar → simpan ke
 * galeri kegiatan. Dipanggil cron (`/api/cron/import-event-media`) dan tombol
 * "Siapkan gambar sekarang" di antrean admin; keduanya aman berjalan
 * bersamaan karena klaim bersewa (SKIP LOCKED).
 *
 * Gagal sementara (situs sumber mati, penyimpanan galat) dicoba lagi setelah
 * sewa 10 menit habis, maksimal `MAX_ATTEMPTS`; gagal pasti (404, bukan
 * gambar, isi slide tidak sah) langsung FAILED supaya admin melihat alasannya.
 */
export const MAX_ATTEMPTS = 3;
/** Gambar pratinjau yang lebih kecil dari ini hampir selalu logo situs, bukan poster kegiatan. */
export const MIN_IMPORTED_SIDE = 300;

export interface MediaImportDeps {
  readonly repository: Pick<EventRepository, 'claimMediaImports' | 'completeMediaImport' | 'failMediaImport' | 'getEventForAdmin' | 'listCategories'>;
  readonly fetchImage: (url: string) => Promise<RemoteImageResult>;
  readonly render: (content: SlideContent, eventType: EventType) => Promise<Uint8Array>;
}

export interface MediaImportRun {
  readonly done: number;
  readonly failed: number;
  readonly retrying: number;
  /** Banyaknya baris yang diklaim — sama dengan batas = mungkin masih ada sisa. */
  readonly claimed: number;
}

type Outcome = { readonly ok: true; readonly image: UploadedImage; readonly caption: string | null } | { readonly ok: false; readonly code: string; readonly permanent: boolean };

async function prepareImage(job: MediaImportJob, event: EventDetail, categoryNames: Readonly<Record<string, string>>, deps: MediaImportDeps): Promise<Outcome> {
  if (job.kind === 'URL') {
    if (!job.sourceUrl) return { ok: false, code: 'url_blocked', permanent: true };
    const result = await deps.fetchImage(job.sourceUrl);
    if (!result.ok) return { ok: false, code: result.error, permanent: PERMANENT_REMOTE_ERRORS.has(result.error) };
    if (Math.min(result.image.width, result.image.height) < MIN_IMPORTED_SIDE) return { ok: false, code: 'too_small', permanent: true };
    return { ok: true, image: result.image, caption: job.caption };
  }

  const spec = mediaSpecSchema.safeParse(job.spec);
  if (!spec.success) return { ok: false, code: 'spec_invalid', permanent: true };
  const content = buildSlideContent(event, spec.data, categoryNames);
  let png: Uint8Array;
  try {
    png = await deps.render(content, event.eventType);
  } catch (error) {
    console.error('[impor media] slide gagal digambar:', error);
    return { ok: false, code: 'render_failed', permanent: false };
  }
  const info = inspectImage(png);
  if (!info) return { ok: false, code: 'render_failed', permanent: true };
  return { ok: true, image: { ...info, bytes: png }, caption: job.caption ?? defaultCaption(content) };
}

export async function processMediaImports(deps: MediaImportDeps, limit = 10): Promise<MediaImportRun> {
  const jobs = [...(await deps.repository.claimMediaImports(limit))].sort(
    (a, b) => a.eventId.localeCompare(b.eventId) || a.position - b.position,
  );
  if (jobs.length === 0) return { done: 0, failed: 0, retrying: 0, claimed: 0 };

  const categoryNames = Object.fromEntries((await deps.repository.listCategories()).map((category) => [category.slug, category.name]));
  const events = new Map<string, EventDetail | null>();
  let done = 0;
  let failed = 0;
  let retrying = 0;

  const fail = async (job: MediaImportJob, code: string, permanent: boolean) => {
    const final = permanent || job.attempts >= MAX_ATTEMPTS;
    await deps.repository.failMediaImport(job.id, code, final);
    if (final) failed += 1;
    else retrying += 1;
  };

  for (const job of jobs) {
    if (!events.has(job.eventId)) events.set(job.eventId, await deps.repository.getEventForAdmin(job.eventId));
    const event = events.get(job.eventId);
    if (!event) {
      await fail(job, 'event_not_found', true);
      continue;
    }
    if (event.status === 'REJECTED') {
      await fail(job, 'event_closed', true);
      continue;
    }

    const outcome = await prepareImage(job, event, categoryNames, deps);
    if (!outcome.ok) {
      await fail(job, outcome.code, outcome.permanent);
      continue;
    }
    try {
      await deps.repository.completeMediaImport(job, outcome.image, outcome.caption);
      done += 1;
    } catch (error) {
      const code = toActionErrorCode(error);
      if (code === 'gallery_full') await fail(job, 'gallery_full', true);
      else {
        console.error('[impor media] gambar gagal disimpan:', error);
        await fail(job, 'storage_failed', false);
      }
    }
  }

  return { done, failed, retrying, claimed: jobs.length };
}
