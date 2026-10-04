import { describe, expect, it } from 'vitest';
import { parsePresentationForm } from './event-presentation';

// 3 Okt 2026, 10:00 WIB.
const NOW = new Date('2026-10-03T03:00:00Z');

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

describe('parsePresentationForm', () => {
  it('lencana + promosi sampai 23.59 WIB hari yang dipilih', () => {
    const result = parsePresentationForm(form({ eventId: 'e1', verificationBadge: 'OFFICIAL_GOV', featuredUntil: '2026-10-10' }), NOW);
    expect(result.success && result.data).toEqual({
      eventId: 'e1',
      verificationBadge: 'OFFICIAL_GOV',
      featuredUntil: '2026-10-10T16:59:00.000Z',
    });
  });

  it('kosong = cabut lencana & hentikan promosi', () => {
    const result = parsePresentationForm(form({ eventId: 'e1', verificationBadge: '', featuredUntil: '' }), NOW);
    expect(result.success && result.data).toEqual({ eventId: 'e1', verificationBadge: null, featuredUntil: null });
  });

  it('hari ini boleh; kemarin, > 1 tahun, tanggal rusak, dan lencana karangan ditolak', () => {
    expect(parsePresentationForm(form({ eventId: 'e1', verificationBadge: '', featuredUntil: '2026-10-03' }), NOW).success).toBe(true);
    for (const featuredUntil of ['2026-10-02', '2028-01-01', '2026-02-31', '10/10/2026']) {
      expect(parsePresentationForm(form({ eventId: 'e1', verificationBadge: '', featuredUntil }), NOW).success, featuredUntil).toBe(false);
    }
    expect(parsePresentationForm(form({ eventId: 'e1', verificationBadge: 'RESMI_BANGET', featuredUntil: '' }), NOW).success).toBe(false);
    expect(parsePresentationForm(form({ verificationBadge: '', featuredUntil: '' }), NOW).success).toBe(false);
  });
});
