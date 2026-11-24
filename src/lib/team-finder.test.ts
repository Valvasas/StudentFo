import { describe, expect, it } from 'vitest';
import type { Match } from '@/lib/matchmaking';
import { NETWORK_LIMITS } from '@/lib/network';
import { parseCrossCampus, pickTeamFinderMatches, teamInviteMessage, whatsappInviteHref } from './team-finder';

function match(userId: string, interests: string[]): Match {
  return {
    candidate: {
      person: { userId, fullName: userId, headline: null, educationLevel: 'D4_S1', major: null, interests },
      city: null,
      skills: [],
      seeking: [],
      remoteOk: true,
      pitch: null,
      portfolio: { entries: 0, wins: 0, finals: 0, verifiedWins: 0 } as never,
      relation: null,
    },
    score: 50,
    components: [],
    reasons: [],
    chemistry: 'kandidat',
    distanceKm: null,
    matchedSeeking: [],
    sharedInterests: [],
  };
}

const campus: Record<string, string | null> = { a: '001002', b: '002001', c: null, d: '002001' };
const options = { eventCategories: ['desain'], viewerInstitutionId: '001002', institutionOf: (id: string) => campus[id] ?? null };

describe('pickTeamFinderMatches', () => {
  it('minat sesuai bidang lomba naik ke depan tanpa mengacak urutan skor', () => {
    const ranked = [match('a', ['teknologi']), match('b', ['desain']), match('c', []), match('d', ['desain', 'bisnis'])];
    expect(pickTeamFinderMatches(ranked, { ...options, crossCampus: false, limit: 4 }).map((m) => m.candidate.person.userId)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('kampus lain: kampus sendiri & yang tidak diketahui tidak dihitung "lain"', () => {
    const ranked = [match('a', []), match('b', []), match('c', []), match('d', [])];
    expect(pickTeamFinderMatches(ranked, { ...options, crossCampus: true }).map((m) => m.candidate.person.userId)).toEqual(['b', 'd']);
    expect(pickTeamFinderMatches(ranked, { ...options, viewerInstitutionId: null, crossCampus: true })).toEqual([]);
  });
});

describe('ajakan', () => {
  it('pesan koneksi tidak pernah melewati batas', () => {
    expect(Array.from(teamInviteMessage('L'.repeat(500))).length).toBeLessThanOrEqual(NETWORK_LIMITS.messageMax);
    expect(teamInviteMessage('Gemastik 2026')).toContain('Gemastik 2026');
  });

  it('WhatsApp = tautan bagikan tanpa nomor, teks ter-encode', () => {
    const href = whatsappInviteHref('Lomba & Esai', 'https://studentfo.test/events/x');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1]!)).toBe('Ayo setim di Lomba & Esai! Detail & pendaftarannya di StudentFo: https://studentfo.test/events/x');
  });

  it('saringan kampus lain hanya dari nilai persis', () => {
    expect(parseCrossCampus({ rekan: 'lintas' })).toBe(true);
    expect(parseCrossCampus({ rekan: 'LINTAS' })).toBe(false);
  });
});
