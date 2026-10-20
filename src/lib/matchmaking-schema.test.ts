import { describe, expect, it } from 'vitest';
import { parseSeekerFields, parseSeekerForm } from './matchmaking-schema';

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

const valid = { open: 'on', city: 'Bandung', skills: ['web-aplikasi', 'ui-ux'], seeking: ['data-ai'], remoteOk: 'on', pitch: 'Suka backend dan presentasi.' };

describe('parseSeekerForm', () => {
  it('menerima kartu lengkap dan membentuk data bersih', () => {
    const result = parseSeekerForm(form(valid));
    expect(result).toEqual({
      success: true,
      data: { open: true, city: 'Bandung', skills: ['web-aplikasi', 'ui-ux'], seeking: ['data-ai'], remoteOk: true, pitch: 'Suka backend dan presentasi.' },
    });
  });

  it('kartu tertutup boleh kosong (menyimpan draf)', () => {
    const result = parseSeekerForm(form({}));
    expect(result).toEqual({ success: true, data: { open: false, city: null, skills: [], seeking: [], remoteOk: false, pitch: null } });
  });

  it('kotak centang yang tidak dikirim = false; hanya on/1/true yang dianggap centang', () => {
    const result = parseSeekerForm(form({ ...valid, open: 'yes', remoteOk: 'off' }));
    expect(result.success && result.data.open).toBe(false);
    expect(result.success && result.data.remoteOk).toBe(false);
  });

  it('membuka kartu tanpa keahlian ditolak, menyebut kolomnya', () => {
    expect(parseSeekerForm(form({ ...valid, skills: [] }))).toEqual({ success: false, fields: ['skills'] });
  });

  it('membuka kartu tanpa kota DAN tanpa kesediaan daring ditolak (tak terjangkau)', () => {
    expect(parseSeekerForm(form({ ...valid, city: '', remoteOk: '' }))).toEqual({ success: false, fields: ['city'] });
    expect(parseSeekerForm(form({ ...valid, city: '' })).success).toBe(true);
  });

  it('keahlian di luar katalog, atau lebih dari 6, ditolak (bukan dibuang diam-diam)', () => {
    expect(parseSeekerForm(form({ ...valid, skills: ['web-aplikasi', 'hack'] }))).toEqual({ success: false, fields: ['skills'] });
    const seven = ['web-aplikasi', 'data-ai', 'iot-elektronika', 'ui-ux', 'grafis', 'video', 'manajemen-proyek'];
    expect(parseSeekerForm(form({ ...valid, seeking: seven }))).toEqual({ success: false, fields: ['seeking'] });
  });

  it('keahlian ganda dilipat jadi satu', () => {
    const result = parseSeekerForm(form({ ...valid, skills: ['ui-ux', 'ui-ux', 'ui-ux'] }));
    expect(result.success && result.data.skills).toEqual(['ui-ux']);
  });

  it('kota di luar daftar ditolak', () => {
    expect(parseSeekerForm(form({ ...valid, city: 'Atlantis' }))).toEqual({ success: false, fields: ['city'] });
  });

  it('pitch: markup dibuang, spasi dirapikan, kosong jadi null, terlalu panjang ditolak', () => {
    const cleaned = parseSeekerForm(form({ ...valid, pitch: '  <b>Halo</b>   dunia\n\n tim ' }));
    expect(cleaned.success && cleaned.data.pitch).toBe('Halo dunia tim');
    const blank = parseSeekerForm(form({ ...valid, pitch: '   ' }));
    expect(blank.success && blank.data.pitch).toBeNull();
    expect(parseSeekerForm(form({ ...valid, pitch: 'x'.repeat(141) }))).toEqual({ success: false, fields: ['pitch'] });
    expect(parseSeekerForm(form({ ...valid, pitch: 'x'.repeat(140) })).success).toBe(true);
  });

  it('berkas yang dikirim sebagai isian teks dianggap kosong, bukan "[object File]"', () => {
    const data = form(valid);
    data.set('pitch', new File(['x'], 'x.txt'));
    const result = parseSeekerForm(data);
    expect(result.success && result.data.pitch).toBeNull();
  });
});

describe('parseSeekerFields', () => {
  it('hanya nama kolom yang dikenal', () => {
    expect(parseSeekerFields('skills,city,<script>,pitch')).toEqual(['skills', 'city', 'pitch']);
    expect(parseSeekerFields(undefined)).toEqual([]);
    expect(parseSeekerFields(['city', 'skills'])).toEqual(['city']);
  });
});
