import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFS, parseNotificationPrefs } from './notification-prefs';

describe('parseNotificationPrefs', () => {
  it('isian rusak → bawaan', () => {
    expect(parseNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(parseNotificationPrefs('x')).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('membuang kanal, hari, dan jam yang tidak dikenal', () => {
    const parsed = parseNotificationPrefs({
      matrix: { deadline: ['email', 'sms', 'email'], team: 'app' },
      days: [1, 14, 7],
      hour: '03:00',
    });
    expect(parsed.matrix.deadline).toEqual(['email']);
    expect(parsed.matrix.team).toEqual(DEFAULT_NOTIFICATION_PREFS.matrix.team);
    expect(parsed.days).toEqual([7, 1]);
    expect(parsed.hour).toBe(DEFAULT_NOTIFICATION_PREFS.hour);
  });
});
