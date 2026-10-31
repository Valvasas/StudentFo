import { describe, expect, it } from 'vitest';
import { buildAccountExport, type AccountExportInput } from './account-export';

const base: AccountExportInput = {
  user: {
    id: 'u1',
    email: 'siti@kampus.ac.id',
    fullName: 'Siti Aminah',
    role: 'USER',
    educationLevel: 'D4_S1',
    major: 'Informatika',
    interests: ['teknologi'],
    providers: ['email'],
  },
  saved: [],
  tracker: [],
  registrations: [],
  teams: [],
  network: { discoverable: false, headline: null },
  connections: [],
  connectionsTruncated: false,
  blocked: [],
  seeker: null,
  submissions: [],
  organizer: null,
  notifications: [],
  deadlineEmailOptIn: '2026-10-30T01:00:00.000Z',
  eventQuestions: [{ eventTitle: 'Lomba X', eventSlug: 'lomba-x', body: 'Boleh lintas kampus?', createdAt: '2026-10-30T02:00:00.000Z', answer: null, hidden: true }],
};

describe('buildAccountExport', () => {
  it('memuat akun, berformat tetap, dan stempel waktu ekspor', () => {
    const result = buildAccountExport(base, new Date('2026-10-30T00:00:00Z'));
    expect(result.format).toBe('studentfo-account-export/1');
    expect(result.emailReminders).toEqual({ deadlineReminders: true, consentedAt: '2026-10-30T01:00:00.000Z' });
    expect(result.eventQuestions).toEqual([
      { event: 'Lomba X', url: '/events/lomba-x?tab=tanya', question: 'Boleh lintas kampus?', askedAt: '2026-10-30T02:00:00.000Z', answer: null, hiddenByModerator: true },
    ]);
    expect(result.exportedAt).toBe('2026-10-30T00:00:00.000Z');
    expect(result.account).toEqual({
      fullName: 'Siti Aminah',
      email: 'siti@kampus.ac.id',
      educationLevel: 'D4_S1',
      major: 'Informatika',
      interests: ['teknologi'],
      signInMethods: ['email'],
    });
  });

  it('tidak membocorkan id akun orang lain: koneksi & blokir hanya nama yang memang terlihat', () => {
    const person = { userId: 'u2', fullName: 'Bima', headline: 'Desainer', educationLevel: null, major: null, interests: [] };
    const result = buildAccountExport({
      ...base,
      connections: [{ id: 'c1', person, status: 'ACCEPTED', direction: 'outgoing', message: 'Halo', createdAt: '2026-10-01T00:00:00Z', respondedAt: null }],
      blocked: [{ userId: 'u3', fullName: 'Spam', blockedAt: '2026-10-02T00:00:00Z' }],
    });
    expect(JSON.stringify(result)).not.toMatch(/"u2"|"u3"/);
    expect(result.network.connections[0]).toMatchObject({ name: 'Bima', status: 'ACCEPTED', message: 'Halo' });
    expect(result.network.blocked).toEqual([{ name: 'Spam', since: '2026-10-02T00:00:00Z' }]);
  });
});
