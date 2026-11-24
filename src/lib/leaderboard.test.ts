import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  compareStandings,
  EMPTY_COUNTS,
  formulaText,
  LEADERBOARD_WEIGHTS,
  leaderboardHref,
  leaderboardRange,
  parseLeaderboardQuery,
  scoreOf,
} from './leaderboard';

const NOW = new Date('2026-11-24T05:00:00Z');

describe('bobot peringkat', () => {
  it('sama persis dengan leaderboard_weight() di migration (satu sumber kebenaran)', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/20261125100001_achievement_leaderboard.sql', import.meta.url), 'utf8');
    const body = sql.slice(sql.indexOf('FUNCTION public.leaderboard_weight'), sql.indexOf('$$;', sql.indexOf('FUNCTION public.leaderboard_weight')));
    const fromSql = Object.fromEntries([...body.matchAll(/WHEN '([A-Z_0-9]+)' THEN (\d+)/g)].map((match) => [match[1], Number(match[2])]));
    expect(fromSql).toEqual(LEADERBOARD_WEIGHTS);
  });

  it('skor = jumlah berbobot; rumus yang ditampilkan dibangun dari bobot yang sama', () => {
    expect(scoreOf({ ...EMPTY_COUNTS, JUARA_1: 2, FINALIS: 3 })).toBe(26);
    expect(formulaText()).toBe('10 × Juara 1 + 8 × Juara 2 + 6 × Juara 3 + 4 × Juara harapan + 2 × Finalis');
  });

  it('seri: skor → Juara 1 terbanyak → jumlah orang → nama', () => {
    const base = { score: 10, counts: EMPTY_COUNTS, people: 1, name: 'B' };
    expect(compareStandings({ ...base, counts: { ...EMPTY_COUNTS, JUARA_1: 1 } }, base)).toBeLessThan(0);
    expect(compareStandings({ ...base, people: 2 }, base)).toBeLessThan(0);
    expect(compareStandings({ ...base, name: 'A' }, base)).toBeLessThan(0);
  });
});

describe('saringan peringkat di URL', () => {
  it('nilai tak dikenal jatuh ke bawaan; bentuk kanonik tanpa nilai bawaan', () => {
    const query = parseLeaderboardQuery({ tab: 'x', periode: '1999', bidang: 'DROP TABLE' }, NOW);
    expect(query).toEqual({ tab: 'kampus', period: 'semua', category: null });
    expect(leaderboardHref(query)).toBe('/leaderboard');
    const custom = parseLeaderboardQuery({ tab: 'mahasiswa', periode: '2026', bidang: 'desain' }, NOW);
    expect(leaderboardHref(custom)).toBe('/leaderboard?tab=mahasiswa&periode=2026&bidang=desain');
  });

  it('rentang tahun mengikuti tanggal WIB', () => {
    expect(leaderboardRange({ period: '2026', category: null }, NOW)).toEqual({
      since: '2025-12-31T17:00:00.000Z',
      until: '2026-12-31T17:00:00.000Z',
      category: null,
    });
    expect(leaderboardRange({ period: 'semua', category: 'desain' }, NOW)).toEqual({ since: null, until: null, category: 'desain' });
    expect(leaderboardRange({ period: '12-bulan', category: null }, NOW).since).toBe('2025-11-24T05:00:00.000Z');
  });
});
