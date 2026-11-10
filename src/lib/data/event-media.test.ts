import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { UploadedImage } from '@/lib/image-file';
import { normalizeVideoUrl } from '@/lib/video';
import { MemoryEventRepository } from './memory-repository';
import type { EventActor } from './repository';
import { SEED_EVENTS } from './seed-data';

/**
 * Poster & video (ADR-079) di mode seed — cermin supabase/tests/115_event_media.test.sql:
 * satu poster per acara, tidak berhak = jawaban sama dengan tidak ada, video
 * hanya bentuk kanonis, dan poster ikut di setiap ringkasan kegiatan.
 */

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

const event = SEED_EVENTS.find((seed) => seed.slug === 'program-magang-analis-data-kuartal-ii');
if (!event) throw new Error('acara contoh hilang');
const EVENT_ID = event.id;

const person = (id: string, isAdmin = false): EventActor => ({ id, fullName: `Nama ${id}`, email: `${id}@uji.example`, isAdmin });
const admin = person('admin', true);
const ana = person('ana');
const image = (width = 800, height = 1000): UploadedImage => ({ type: 'image/png', width, height, bytes: new Uint8Array(512) });

describe('MemoryEventRepository — poster', () => {
  let repository: MemoryEventRepository;

  beforeEach(() => {
    repository = new MemoryEventRepository(new Date());
  });

  it('unggah sebagai poster: foto pertama jadi poster, tampil pertama, dan ikut di kartu', async () => {
    await repository.addEventPhotos(admin, EVENT_ID, [image(1200, 800)], 'Suasana');
    await repository.addEventPhotos(admin, EVENT_ID, [image(800, 1000), image(1200, 800)], 'Poster', { asPoster: true });

    const photos = await repository.listEventPhotos(EVENT_ID);
    expect(photos.filter((photo) => photo.isPoster)).toHaveLength(1);
    expect(photos[0]).toMatchObject({ isPoster: true, width: 800, height: 1000 });

    const detail = await repository.getEventBySlug(event!.slug);
    expect(detail?.poster).toEqual({ id: photos[0]!.id, width: 800, height: 1000 });
    const listed = (await repository.listEvents({ includeClosed: true, pageSize: 100 })).items.find((item) => item.id === EVENT_ID);
    expect(listed?.poster?.id).toBe(photos[0]!.id);
  });

  it('memilih poster lain melepas yang lama; melepas & menghapus poster mengosongkan kartu', async () => {
    await repository.addEventPhotos(admin, EVENT_ID, [image(), image()], null);
    const [first, second] = await repository.listEventPhotos(EVENT_ID);

    await repository.setEventPoster(admin, first!.id, true);
    await repository.setEventPoster(admin, second!.id, true);
    const after = await repository.listEventPhotos(EVENT_ID);
    expect(after.filter((photo) => photo.isPoster).map((photo) => photo.id)).toEqual([second!.id]);
    expect(after[0]!.id).toBe(second!.id);

    await repository.setEventPoster(admin, second!.id, false);
    expect((await repository.getEventBySlug(event!.slug))?.poster).toBeNull();

    await repository.setEventPoster(admin, first!.id, true);
    await repository.deleteEventPhoto(admin, first!.id);
    expect((await repository.getEventBySlug(event!.slug))?.poster).toBeNull();
  });

  it('bukan pengelola: foto yang ada terdengar sama dengan yang tidak ada', async () => {
    await repository.addEventPhotos(admin, EVENT_ID, [image()], null);
    const [photo] = await repository.listEventPhotos(EVENT_ID);
    expect(await reason(repository.setEventPoster(ana, photo!.id, true))).toBe('photo_not_found');
    expect(await reason(repository.setEventPoster(admin, 'tidak-ada', true))).toBe('photo_not_found');
  });
});

describe('MemoryEventRepository — video', () => {
  let repository: MemoryEventRepository;

  beforeEach(() => {
    repository = new MemoryEventRepository(new Date());
  });

  it('hanya bentuk kanonis; null melepas; bukan pengelola ditolak', async () => {
    const canonical = normalizeVideoUrl('https://youtu.be/dQw4w9WgXcQ');
    await repository.setEventVideo(admin, EVENT_ID, canonical);
    expect((await repository.getEventBySlug(event!.slug))?.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(await reason(repository.setEventVideo(admin, EVENT_ID, 'https://youtu.be/dQw4w9WgXcQ'))).toBe('invalid_video_url');
    expect(await reason(repository.setEventVideo(ana, EVENT_ID, canonical))).toBe('not_event_manager');

    await repository.setEventVideo(admin, EVENT_ID, null);
    expect((await repository.getEventBySlug(event!.slug))?.videoUrl).toBeNull();
  });

  it('batas 30 perubahan per hari per orang (cermin set_event_video)', async () => {
    const canonical = 'https://vimeo.com/76979871';
    for (let i = 0; i < 30; i += 1) await repository.setEventVideo(admin, EVENT_ID, canonical);
    expect(await reason(repository.setEventVideo(admin, EVENT_ID, canonical))).toBe('video_rate_limited');
  });
});
