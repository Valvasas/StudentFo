import { describe, expect, it } from 'vitest';
import { parseUndoToken, undoTokenOf } from './undo';

const ID = 'e1000000-0000-4000-8000-000000000012';

describe('token urungkan', () => {
  it('bolak-balik untuk kedua jenis', () => {
    expect(parseUndoToken(undoTokenOf({ kind: 'tahap', eventId: ID, status: 'SAVED' }))).toEqual({ kind: 'tahap', eventId: ID, status: 'SAVED' });
    expect(parseUndoToken(undoTokenOf({ kind: 'simpan', eventId: ID }))).toEqual({ kind: 'simpan', eventId: ID });
  });

  it('daftar tertutup: tahap tak dikenal, jenis lain, id bukan UUID, atau sisa segmen = ditolak', () => {
    expect(parseUndoToken(`tahap.${ID}.HACKED`)).toBeNull();
    expect(parseUndoToken(`hapus.${ID}`)).toBeNull();
    expect(parseUndoToken('simpan.../../admin')).toBeNull();
    expect(parseUndoToken(`simpan.${ID}.SAVED`)).toBeNull();
    expect(parseUndoToken(`tahap.${ID}`)).toBeNull();
    expect(parseUndoToken(`tahap.${ID}.SAVED.lagi`)).toBeNull();
    expect(parseUndoToken(undefined)).toBeNull();
    expect(parseUndoToken('x'.repeat(200))).toBeNull();
  });

  it('nilai ganda di query string: hanya yang pertama dibaca', () => {
    expect(parseUndoToken([`simpan.${ID}`, 'tahap.x.SAVED'])).toEqual({ kind: 'simpan', eventId: ID });
  });
});
