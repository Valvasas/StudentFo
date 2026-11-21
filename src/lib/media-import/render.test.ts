import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectImage } from '@/lib/image-file';
import type { EventDetail } from '@/types/domain';
import { MEDIA_IMAGE_SIZE, renderMediaImage } from './render';
import { buildSlideContent, MEDIA_TEMPLATES } from './spec';

const event: Pick<
  EventDetail,
  'title' | 'organizer' | 'eventType' | 'educationLevels' | 'categorySlugs' | 'location' | 'isOnline' | 'registrationLink' | 'deadlines' | 'primaryDeadlineAt' | 'primaryDeadlineLabel'
> = {
  title: 'Lomba Karya Tulis Ilmiah Nasional Pemuda Peduli Lingkungan dan Energi Terbarukan 2027',
  organizer: 'Himpunan Mahasiswa Teknik Lingkungan Universitas Contoh',
  eventType: 'LOMBA',
  educationLevels: ['SMA_SMK', 'D4_S1'],
  categorySlugs: ['karya-tulis', 'sosial'],
  location: null,
  isOnline: true,
  registrationLink: 'https://www.contoh.ac.id/lkti',
  deadlines: [
    { id: 'd1', label: 'registration', deadlineAt: '2027-01-10T16:59:00Z', isPrimary: true },
    { id: 'd2', label: 'submission', deadlineAt: '2027-01-31T16:59:00Z', isPrimary: false },
    { id: 'd3', label: 'announcement', deadlineAt: '2027-03-03T16:59:00Z', isPrimary: false },
  ],
  primaryDeadlineAt: '2027-01-10T16:59:00Z',
  primaryDeadlineLabel: 'registration',
};

describe('renderMediaImage', () => {
  // Satori menolak <div> beranak > 1 tanpa display:flex SAAT MENGGAMBAR — tes ini
  // menjaga keempat templat tetap bisa digambar, dengan judul terpanjang.
  it.each(MEDIA_TEMPLATES)('menggambar templat %s menjadi PNG 1080×1350', async (template) => {
    const content = buildSlideContent(event, { template, highlight: 'Total hadiah Rp15 juta' }, { 'karya-tulis': 'Karya Tulis & Esai', sosial: 'Sosial & Lingkungan' });
    const png = await renderMediaImage(content, event.eventType);
    expect(inspectImage(png)).toEqual({ type: 'image/png', ...MEDIA_IMAGE_SIZE });
    expect(png.byteLength).toBeLessThan(5 * 1024 * 1024);
    // MEDIA_RENDER_OUT=<folder> menyimpan hasilnya untuk diperiksa mata.
    const out = process.env.MEDIA_RENDER_OUT;
    if (out) await writeFile(join(out, `${template}.png`), png);
  }, 30_000);
});
