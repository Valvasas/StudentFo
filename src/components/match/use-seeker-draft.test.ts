import { describe, expect, it } from 'vitest';
import { parseSeekerDraft, serializeSeekerDraft, type SeekerDraft } from './use-seeker-draft';

const DRAFT: SeekerDraft = {
  skills: ['web-aplikasi', 'ui-ux'],
  seeking: ['video'],
  city: 'Bandung',
  remoteOk: true,
  pitch: 'Suka backend dan presentasi.',
  open: true,
};

describe('parseSeekerDraft', () => {
  it('memulihkan draf yang baru ditulis', () => {
    expect(parseSeekerDraft(serializeSeekerDraft(DRAFT))).toEqual(DRAFT);
  });

  it('menolak null, JSON rusak, dan bentuk yang salah tanpa melempar', () => {
    expect(parseSeekerDraft(null)).toBeNull();
    expect(parseSeekerDraft('')).toBeNull();
    expect(parseSeekerDraft('{rusak')).toBeNull();
    expect(parseSeekerDraft('null')).toBeNull();
    expect(parseSeekerDraft('"teks"')).toBeNull();
  });

  it('membuang slug dan kota di luar daftar tertutup', () => {
    const raw = JSON.stringify({ ...DRAFT, skills: ['web-aplikasi', 'hacker', 7], seeking: 'bukan-larik', city: 'Atlantis' });
    expect(parseSeekerDraft(raw)).toMatchObject({ skills: ['web-aplikasi'], seeking: [], city: '' });
  });

  it('menegakkan batas enam, tanpa duplikat, dan panjang pengantar', () => {
    const many = ['web-aplikasi', 'data-ai', 'iot-elektronika', 'ui-ux', 'grafis', 'video', 'manajemen-proyek', 'ui-ux'];
    const parsed = parseSeekerDraft(JSON.stringify({ ...DRAFT, skills: many, pitch: 'x'.repeat(500) }));
    expect(parsed?.skills).toHaveLength(6);
    expect(new Set(parsed?.skills).size).toBe(6);
    expect(parsed?.pitch).toHaveLength(140);
  });

  it('kolom boolean yang hilang dianggap salah, bukan benar', () => {
    expect(parseSeekerDraft('{}')).toMatchObject({ remoteOk: false, open: false, skills: [], seeking: [], city: '', pitch: '' });
  });
});
