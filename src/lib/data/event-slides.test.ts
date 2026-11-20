import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { UploadedImage } from '@/lib/image-file';
import { cleanCaption, readSlideCaptions } from '@/lib/slides';
import type { SubmissionPayload } from '@/types/domain';
import { movePhotoOrder, sortPhotosPosterFirst } from './listing';
import { MemoryEventRepository } from './memory-repository';
import type { EventActor } from './repository';
import { SEED_EVENTS } from './seed-data';

/**
 * Slide & gambar deskriptif (ADR-094) di mode seed — cermin
 * supabase/tests/122_event_slides.test.sql.
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
const stranger = person('asing');
const image = (width = 1200, height = 800): UploadedImage => ({ type: 'image/png', width, height, bytes: new Uint8Array(256) });

function payload(): SubmissionPayload {
  return {
    title: 'Lomba Bergambar Uji 2026',
    organizer: 'Himpunan Slide',
    description: null,
    eventType: 'LOMBA',
    registrationLink: 'https://contoh.org/daftar',
    sourceUrl: null,
    educationLevels: ['D4_S1'],
    categorySlugs: [],
    location: null,
    isOnline: true,
    deadlineAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    stages: [],
    isFree: null,
    priceAmount: null,
    guidebookUrl: null,
    organizerContact: null,
    proofLink: null,
  };
}

describe('urutan slide', () => {
  it('poster pertama, lalu urutan pilihan; foto tanpa urutan (basis data lama) di belakang, terbaru dulu', () => {
    const photos = [
      { id: 'lama-1', isPoster: false, createdAt: '2026-01-01', sortOrder: null },
      { id: 'b', isPoster: false, createdAt: '2026-01-05', sortOrder: 2 },
      { id: 'poster', isPoster: true, createdAt: '2026-01-02', sortOrder: 9 },
      { id: 'a', isPoster: false, createdAt: '2026-01-06', sortOrder: 1 },
      { id: 'lama-2', isPoster: false, createdAt: '2026-01-03' },
    ];
    expect(sortPhotosPosterFirst(photos).map((photo) => photo.id)).toEqual(['poster', 'a', 'b', 'lama-2', 'lama-1']);
  });

  it('geser satu langkah; di ujung atau id asing = null', () => {
    expect(movePhotoOrder(['a', 'b', 'c'], 'b', 'earlier')).toEqual(['b', 'a', 'c']);
    expect(movePhotoOrder(['a', 'b', 'c'], 'b', 'later')).toEqual(['a', 'c', 'b']);
    expect(movePhotoOrder(['a', 'b', 'c'], 'a', 'earlier')).toBeNull();
    expect(movePhotoOrder(['a', 'b', 'c'], 'c', 'later')).toBeNull();
    expect(movePhotoOrder(['a', 'b'], 'x', 'later')).toBeNull();
  });

  it('keterangan: markup & spasi dirapikan, maks. 140, kosong = null; jumlahnya sejajar berkas', () => {
    expect(cleanCaption('  <b>Alur</b>   lomba \n')).toBe('Alur lomba');
    expect(cleanCaption('   ')).toBeNull();
    expect(cleanCaption('x'.repeat(200))).toHaveLength(140);
    const form = new FormData();
    form.append('c', 'Alur');
    form.append('c', '');
    expect(readSlideCaptions(form, 'c', 3)).toEqual(['Alur', null, null]);
  });
});

describe('MemoryEventRepository — slide acara', () => {
  it('unggahan masuk di belakang dalam urutan pilihan, dengan keterangan per gambar', async () => {
    const repository = new MemoryEventRepository(new Date());
    await repository.addEventPhotos(admin, EVENT_ID, [image(800, 1000)], null, { asPoster: true });
    await repository.addEventPhotos(admin, EVENT_ID, [image(), image(), image()], 'Cadangan', { captions: ['Alur', null, 'Hadiah'] });

    const photos = await repository.listEventPhotos(EVENT_ID);
    expect(photos.map((photo) => photo.caption)).toEqual([null, 'Alur', 'Cadangan', 'Hadiah']);
    expect(photos[0]?.isPoster).toBe(true);
  });

  it('susun ulang: id asing & ganda diabaikan, yang tidak disebut tetap di belakang; orang asing ditolak', async () => {
    const repository = new MemoryEventRepository(new Date());
    await repository.addEventPhotos(admin, EVENT_ID, [image(), image(), image()], null, { captions: ['A', 'B', 'C'] });
    const [a, b, c] = await repository.listEventPhotos(EVENT_ID);

    expect(await reason(repository.reorderEventPhotos(stranger, EVENT_ID, [c!.id, a!.id]))).toBe('not_event_manager');
    await repository.reorderEventPhotos(admin, EVENT_ID, [c!.id, 'asing', c!.id, a!.id]);
    expect((await repository.listEventPhotos(EVENT_ID)).map((photo) => photo.caption)).toEqual(['C', 'A', 'B']);
    expect(b).toBeDefined();

    // Unggahan sesudahnya tetap di belakang.
    await repository.addEventPhotos(admin, EVENT_ID, [image()], 'D');
    expect((await repository.listEventPhotos(EVENT_ID)).map((photo) => photo.caption)).toEqual(['C', 'A', 'B', 'D']);
  });

  it('keterangan per gambar: dirapikan, kosong = null, > 140 ditolak, orang asing = tidak ada', async () => {
    const repository = new MemoryEventRepository(new Date());
    await repository.addEventPhotos(admin, EVENT_ID, [image()], null);
    const [photo] = await repository.listEventPhotos(EVENT_ID);

    await repository.setEventPhotoCaption(admin, photo!.id, '  Alur lomba  ');
    expect((await repository.listEventPhotos(EVENT_ID))[0]?.caption).toBe('Alur lomba');
    await repository.setEventPhotoCaption(admin, photo!.id, '   ');
    expect((await repository.listEventPhotos(EVENT_ID))[0]?.caption).toBeNull();
    expect(await reason(repository.setEventPhotoCaption(admin, photo!.id, 'x'.repeat(141)))).toBe('invalid_caption');
    expect(await reason(repository.setEventPhotoCaption(stranger, photo!.id, 'Susupan'))).toBe('photo_not_found');
  });
});

describe('MemoryEventRepository — gambar pendukung kiriman', () => {
  it('disetujui = poster lalu slide dalam urutan pengirim; hanya pengirim & moderator yang melihat sebelum tayang', async () => {
    const repository = new MemoryEventRepository(new Date());
    const result = await repository.createSubmission({
      submittedByEmail: 'panitia@uji.example',
      submittedBy: 'panitia',
      payload: payload(),
      poster: image(800, 1000),
      slides: [
        { image: image(), caption: 'Alur' },
        { image: image(), caption: 'Hadiah' },
      ],
    });
    expect(result).toEqual({ posterAttached: true, slidesAttached: 2 });

    const [submission] = await repository.listSubmissions('PENDING', 10);
    expect(submission?.photos?.map((photo) => photo.caption)).toEqual(['Alur', 'Hadiah']);
    const slideId = submission!.photos![0]!.id;
    expect(await repository.getSubmissionPhotoFile({ id: 'panitia', isAdmin: false }, submission!.id, slideId)).not.toBeNull();
    expect(await repository.getSubmissionPhotoFile({ id: 'orang-lain', isAdmin: false }, submission!.id, slideId)).toBeNull();
    expect(await repository.getSubmissionPhotoFile(null, submission!.id, slideId)).toBeNull();

    await repository.reviewSubmission({ submissionId: submission!.id, decision: 'APPROVED', reviewerId: 'admin', reviewerName: 'Admin' });
    const created = (await repository.listEvents({ search: 'Lomba Bergambar Uji', includeClosed: true })).items[0];
    const photos = await repository.listEventPhotos(created!.id);
    expect(photos.map((photo) => [photo.isPoster, photo.caption])).toEqual([
      [true, null],
      [false, 'Alur'],
      [false, 'Hadiah'],
    ]);
    expect(await repository.getSubmissionPhotoFile({ id: 'panitia', isAdmin: false }, submission!.id, slideId)).toBeNull();
  });

  it('tamu tidak menitipkan berkas; ditolak = gambar dilepas', async () => {
    const repository = new MemoryEventRepository(new Date());
    const guest = await repository.createSubmission({
      submittedByEmail: 'tamu@uji.example',
      submittedBy: null,
      payload: payload(),
      slides: [{ image: image(), caption: null }],
    });
    expect(guest.slidesAttached).toBe(0);

    await repository.createSubmission({
      submittedByEmail: 'panitia@uji.example',
      submittedBy: 'panitia',
      payload: { ...payload(), title: 'Lomba Ditolak Bergambar 2026' },
      slides: [{ image: image(), caption: 'Alur' }],
    });
    const pending = await repository.listSubmissions('PENDING', 10);
    const withSlides = pending.find((item) => item.photos?.length);
    const slideId = withSlides!.photos![0]!.id;
    await repository.reviewSubmission({ submissionId: withSlides!.id, decision: 'REJECTED', reviewerId: 'admin', reviewerName: 'Admin', reason: 'Uji' });
    expect(await repository.getSubmissionPhotoFile({ id: 'admin', isAdmin: true }, withSlides!.id, slideId)).toBeNull();
  });
});
