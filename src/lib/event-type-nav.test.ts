import { describe, expect, it } from 'vitest';
import { EVENT_TYPE_NAV, eventTypeHref, eventTypeNavFor } from './event-type-nav';

describe('eventTypeNavFor', () => {
  it('tab Workshop mencakup pelatihan, urutan filter tidak berpengaruh', () => {
    expect(eventTypeNavFor(['PELATIHAN', 'WORKSHOP'])?.label).toBe('Workshop');
  });

  it('WORKSHOP saja bukan tab Workshop (itu filter yang lebih sempit)', () => {
    expect(eventTypeNavFor(['WORKSHOP'])).toBeNull();
  });

  it('campuran atau kosong → tata letak umum', () => {
    expect(eventTypeNavFor(['LOMBA', 'BEASISWA'])).toBeNull();
    expect(eventTypeNavFor([])).toBeNull();
    expect(eventTypeNavFor(undefined)).toBeNull();
  });

  it('href setiap tab kembali dikenali sebagai tab yang sama', () => {
    for (const item of EVENT_TYPE_NAV) {
      const types = new URLSearchParams(eventTypeHref(item).split('?')[1]).getAll('type');
      expect(eventTypeNavFor(types as never)?.key).toBe(item.key);
    }
  });
});
