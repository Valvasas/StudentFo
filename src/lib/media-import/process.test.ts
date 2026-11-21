import { describe, expect, it, vi } from 'vitest';
import { actionError } from '@/lib/action-feedback';
import { MemoryEventRepository } from '@/lib/data/memory-repository';
import type { MediaImportJob } from '@/lib/data/repository';
import { SEED_EVENTS } from '@/lib/data/seed-data';
import type { UploadedImage } from '@/lib/image-file';
import type { EventDetail } from '@/types/domain';
import { MAX_ATTEMPTS, processMediaImports, type MediaImportDeps } from './process';
import type { RemoteImageResult } from './remote-image';

/**
 * Pemroses impor media (ADR-095). Cermin perilaku SQL ada di
 * supabase/tests/123_event_media_imports.test.sql.
 */

/** PNG minimal dengan ukuran tertentu (cukup untuk `inspectImage`). */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes;
}
const image = (width = 1080, height = 1350): UploadedImage => ({ type: 'image/png', width, height, bytes: png(width, height) });

const job = (overrides: Partial<MediaImportJob>): MediaImportJob => ({
  id: 'j1',
  eventId: 'e1',
  position: 0,
  kind: 'URL',
  sourceUrl: 'https://sumber.example/',
  spec: null,
  caption: null,
  isPoster: false,
  attempts: 1,
  ...overrides,
});

const pendingEvent = {
  id: 'e1',
  slug: 'lomba-uji',
  title: 'Lomba Uji 2027',
  organizer: 'Himpunan Uji',
  eventType: 'LOMBA',
  educationLevels: ['SMA_SMK'],
  categorySlugs: [],
  location: null,
  isOnline: true,
  status: 'PENDING',
  registrationLink: 'https://uji.example/daftar',
  sourceUrl: 'https://uji.example/',
  deadlines: [{ id: 'd1', label: 'registration', deadlineAt: '2027-01-10T16:59:00Z', isPrimary: true }],
  primaryDeadlineAt: '2027-01-10T16:59:00Z',
  primaryDeadlineLabel: 'registration',
} as unknown as EventDetail;

function fakeDeps(jobs: MediaImportJob[], options: { event?: EventDetail | null; fetchResult?: RemoteImageResult; completeError?: unknown } = {}) {
  const repository = {
    claimMediaImports: vi.fn(async () => jobs),
    completeMediaImport: vi.fn(async (_job: MediaImportJob, _image: UploadedImage, _caption: string | null) => {
      if (options.completeError) throw options.completeError;
    }),
    failMediaImport: vi.fn(async () => undefined),
    getEventForAdmin: vi.fn(async () => (options.event === undefined ? pendingEvent : options.event)),
    listCategories: vi.fn(async () => []),
  };
  const deps: MediaImportDeps = {
    repository,
    fetchImage: vi.fn(async () => options.fetchResult ?? { ok: true as const, image: image(), from: 'https://cdn.example/p.png' }),
    render: vi.fn(async () => png(1080, 1350)),
  };
  return { deps, repository };
}

describe('processMediaImports', () => {
  it('URL sukses → disimpan dengan keterangan kurator', async () => {
    const { deps, repository } = fakeDeps([job({ caption: 'Poster resmi', isPoster: true })]);
    expect(await processMediaImports(deps)).toEqual({ done: 1, failed: 0, retrying: 0, claimed: 1 });
    expect(repository.completeMediaImport).toHaveBeenCalledWith(expect.objectContaining({ id: 'j1' }), expect.objectContaining({ width: 1080 }), 'Poster resmi');
  });

  it('gagal pasti (404) langsung FAILED; gagal sementara dicoba lagi sampai batas percobaan', async () => {
    const notFound = fakeDeps([job({})], { fetchResult: { ok: false, error: 'not_found' } });
    await processMediaImports(notFound.deps);
    expect(notFound.repository.failMediaImport).toHaveBeenCalledWith('j1', 'not_found', true);

    const flaky = fakeDeps([job({ attempts: 1 })], { fetchResult: { ok: false, error: 'fetch_failed' } });
    expect(await processMediaImports(flaky.deps)).toMatchObject({ retrying: 1, failed: 0 });
    expect(flaky.repository.failMediaImport).toHaveBeenCalledWith('j1', 'fetch_failed', false);

    const exhausted = fakeDeps([job({ attempts: MAX_ATTEMPTS })], { fetchResult: { ok: false, error: 'fetch_failed' } });
    expect(await processMediaImports(exhausted.deps)).toMatchObject({ retrying: 0, failed: 1 });
  });

  it('gambar laman yang terlalu kecil (logo situs) ditolak', async () => {
    const { deps, repository } = fakeDeps([job({})], { fetchResult: { ok: true, image: image(120, 120), from: 'https://x.example/logo.png' } });
    await processMediaImports(deps);
    expect(repository.failMediaImport).toHaveBeenCalledWith('j1', 'too_small', true);
    expect(repository.completeMediaImport).not.toHaveBeenCalled();
  });

  it('slide buatan: spec divalidasi, digambar, keterangan bawaan diisi', async () => {
    const valid = fakeDeps([job({ kind: 'GENERATED', sourceUrl: null, spec: { template: 'jadwal' } })]);
    await processMediaImports(valid.deps);
    expect(valid.deps.render).toHaveBeenCalledTimes(1);
    const caption = valid.repository.completeMediaImport.mock.calls[0]?.[2];
    expect(caption).toMatch(/^Tanggal penting: /);

    const invalid = fakeDeps([job({ kind: 'GENERATED', sourceUrl: null, spec: { template: 'galeri' } })]);
    await processMediaImports(invalid.deps);
    expect(invalid.repository.failMediaImport).toHaveBeenCalledWith('j1', 'spec_invalid', true);
    expect(invalid.deps.render).not.toHaveBeenCalled();
  });

  it('kegiatan ditolak/hilang tidak disiapkan gambarnya', async () => {
    const rejected = fakeDeps([job({})], { event: { ...pendingEvent, status: 'REJECTED' } });
    await processMediaImports(rejected.deps);
    expect(rejected.repository.failMediaImport).toHaveBeenCalledWith('j1', 'event_closed', true);
    expect(rejected.deps.fetchImage).not.toHaveBeenCalled();

    const gone = fakeDeps([job({})], { event: null });
    await processMediaImports(gone.deps);
    expect(gone.repository.failMediaImport).toHaveBeenCalledWith('j1', 'event_not_found', true);
  });

  it('galeri penuh = FAILED; galat penyimpanan lain dicoba lagi', async () => {
    const full = fakeDeps([job({})], { completeError: actionError('gallery_full') });
    await processMediaImports(full.deps);
    expect(full.repository.failMediaImport).toHaveBeenCalledWith('j1', 'gallery_full', true);

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const storage = fakeDeps([job({})], { completeError: new Error('storage 500') });
    expect(await processMediaImports(storage.deps)).toMatchObject({ retrying: 1 });
  });

  it('per kegiatan diproses urut posisi: gambar resmi lebih dulu dari poster buatan', async () => {
    const order: number[] = [];
    const { deps } = fakeDeps([job({ id: 'b', position: 1, kind: 'GENERATED', sourceUrl: null, spec: { template: 'poster' } }), job({ id: 'a', position: 0 })]);
    deps.repository.completeMediaImport = vi.fn(async (claimed: MediaImportJob) => {
      order.push(claimed.position);
    });
    await processMediaImports(deps);
    expect(order).toEqual([0, 1]);
  });
});

describe('MemoryEventRepository — impor media', () => {
  const event = SEED_EVENTS.find((seed) => seed.status === 'PENDING') ?? SEED_EVENTS[0];
  if (!event) throw new Error('acara contoh hilang');

  it('daftar bawaan → klaim bersewa → poster resmi tidak ditimpa poster buatan', async () => {
    const repository = new MemoryEventRepository(new Date());
    expect(await repository.queueMediaImports(event.id, null)).toBe(5);
    const claimed = await repository.claimMediaImports(50);
    expect(claimed.map((item) => item.position)).toEqual([0, 1, 2, 3, 4]);
    expect(await repository.claimMediaImports(50)).toEqual([]);

    const [official, generatedPoster] = claimed;
    if (!official || !generatedPoster) throw new Error('klaim kurang');
    await repository.completeMediaImport(official, image(), 'Gambar resmi');
    await repository.completeMediaImport(generatedPoster, image(), 'Ringkasan');
    await repository.failMediaImport(claimed[2]!.id, 'render_failed', true);

    const media = (await repository.listModerationMedia([event.id])).get(event.id);
    expect(media?.photos.map((photo) => [photo.caption, photo.isPoster])).toEqual([
      ['Gambar resmi', true],
      ['Ringkasan', false],
    ]);
    expect(media?.imports).toEqual({ pending: 2, done: 2, failed: 1, lastError: 'render_failed' });
  });

  it('maks. 8 per kegiatan; foto belum tayang hanya terbaca admin/pengelola', async () => {
    const repository = new MemoryEventRepository(new Date());
    await repository.queueMediaImports(event.id, null);
    expect(await repository.queueMediaImports(event.id, null)).toBe(3);
    expect(await repository.queueMediaImports(event.id, null)).toBe(0);

    const [first] = await repository.claimMediaImports(1);
    if (!first) throw new Error('klaim kosong');
    await repository.completeMediaImport(first, image(), null);
    const photo = (await repository.listEventPhotos(event.id))[0];
    if (!photo) throw new Error('foto tidak tersimpan');
    expect(await repository.getStaffEventPhotoFile({ id: 'admin', isAdmin: true }, photo.id)).not.toBeNull();
    expect(await repository.getStaffEventPhotoFile({ id: 'orang-asing', isAdmin: false }, photo.id)).toBeNull();
    expect(await repository.getStaffEventPhotoFile(null, photo.id)).toBeNull();
  });
});
