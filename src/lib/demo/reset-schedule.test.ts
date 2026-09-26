import { describe, expect, it } from 'vitest';
import { demoResetInfo, formatDuration } from './reset-schedule';

const HOUR = 3_600_000;
const TTL = 6 * HOUR;

describe('demoResetInfo', () => {
  it('reset berikutnya = dibuat + TTL; sisa menit dibulatkan ke atas', () => {
    const created = new Date('2026-09-26T00:00:00Z');
    const info = demoResetInfo(created, new Date('2026-09-26T03:45:30Z'), TTL);
    expect(info.nextResetAt.toISOString()).toBe('2026-09-26T06:00:00.000Z');
    expect(info.minutesLeft).toBe(135);
    expect(info.imminent).toBe(false);
  });

  it('≤ 30 menit = segera (peringatan tegas)', () => {
    const created = new Date('2026-09-26T00:00:00Z');
    expect(demoResetInfo(created, new Date('2026-09-26T05:30:00Z'), TTL).imminent).toBe(true);
    expect(demoResetInfo(created, new Date('2026-09-26T05:29:00Z'), TTL).imminent).toBe(false);
  });

  it('lewat jadwal (reset terjadi di request berikutnya) → 0 menit, segera', () => {
    const info = demoResetInfo(new Date('2026-09-26T00:00:00Z'), new Date('2026-09-26T07:00:00Z'), TTL);
    expect(info).toMatchObject({ minutesLeft: 0, imminent: true });
  });
});

describe('formatDuration', () => {
  it.each([
    [0, 'kurang dari 1 menit'],
    [1, '1 menit'],
    [59, '59 menit'],
    [60, '1 jam'],
    [135, '2 jam 15 menit'],
    [360, '6 jam'],
  ])('%i menit → %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
