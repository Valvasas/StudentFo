import { describe, expect, it } from 'vitest';
import { parseCreateTeamForm } from './team-schema';

const VALID_EVENT_ID = 'e1000000-0000-4000-8000-000000000006';

function formOf(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function validForm(overrides: Record<string, string> = {}): FormData {
  return formOf({
    eventId: VALID_EVENT_ID,
    title: 'Cari 2 anggota tim hackathon',
    description: 'Butuh frontend dan analis data.',
    slotsNeeded: '4',
    ...overrides,
  });
}

describe('parseCreateTeamForm', () => {
  it('menerima masukan yang sah', () => {
    const result = parseCreateTeamForm(validForm());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slotsNeeded).toBe(4);
      expect(result.data.eventId).toBe(VALID_EVENT_ID);
    }
  });

  it('merapikan spasi ganda di judul', () => {
    const result = parseCreateTeamForm(validForm({ title: 'Tim   riset    energi' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe('Tim riset energi');
  });

  it('menyimpan deskripsi kosong sebagai null, bukan string kosong', () => {
    const result = parseCreateTeamForm(validForm({ description: '   ' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeNull();
  });

  /**
   * Regresi: Number('') === 0, jadi field kosong akan lolos sebagai "0
   * anggota" dan ditolak dengan pesan minimum yang membingungkan alih-alih
   * "wajib diisi".
   */
  it('menolak jumlah anggota yang kosong', () => {
    const result = parseCreateTeamForm(validForm({ slotsNeeded: '' }));
    expect(result.success).toBe(false);
  });

  it('menolak jumlah anggota di luar rentang CHECK constraint (1..50)', () => {
    expect(parseCreateTeamForm(validForm({ slotsNeeded: '0' })).success).toBe(false);
    expect(parseCreateTeamForm(validForm({ slotsNeeded: '51' })).success).toBe(false);
    expect(parseCreateTeamForm(validForm({ slotsNeeded: '1' })).success).toBe(true);
    expect(parseCreateTeamForm(validForm({ slotsNeeded: '50' })).success).toBe(true);
  });

  it('menolak jumlah anggota pecahan', () => {
    expect(parseCreateTeamForm(validForm({ slotsNeeded: '2.5' })).success).toBe(false);
  });

  it('menolak judul yang terlalu pendek atau melebihi VARCHAR(255)', () => {
    expect(parseCreateTeamForm(validForm({ title: 'ab' })).success).toBe(false);
    expect(parseCreateTeamForm(validForm({ title: 'x'.repeat(256) })).success).toBe(false);
  });

  it('menolak eventId yang bukan UUID', () => {
    expect(parseCreateTeamForm(validForm({ eventId: 'bukan-uuid' })).success).toBe(false);
  });

  it('menolak deskripsi melebihi 1000 karakter', () => {
    expect(parseCreateTeamForm(validForm({ description: 'x'.repeat(1001) })).success).toBe(false);
  });
});
