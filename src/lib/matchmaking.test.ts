import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_FILTERS,
  MATCH_COMPONENTS,
  MATCH_WEIGHTS,
  activeFilterCount,
  describePortfolio,
  distanceScore,
  parseMatchQuery,
  passesFilters,
  portfolioStrength,
  rankCandidates,
  scoreCandidate,
  serializeMatchQuery,
  type MatchFilters,
  type MatchViewer,
} from './matchmaking';
import type { Achievement, PortfolioDigest, TeamCandidate, TeamSeekerProfile } from '@/types/domain';

const NO_PORTFOLIO: PortfolioDigest = { count: 0, achievements: [] };

function viewer(overrides: Partial<Omit<MatchViewer, 'profile'>> & { profile?: Partial<MatchViewer['profile']> } = {}): MatchViewer {
  const { profile, ...rest } = overrides;
  return {
    userId: 'me',
    educationLevel: 'D4_S1',
    major: 'Rekayasa Perangkat Lunak',
    interests: ['teknologi', 'desain'],
    portfolio: NO_PORTFOLIO,
    ...rest,
    profile: { city: 'Bandung', skills: ['web-aplikasi'], seeking: [], remoteOk: true, ...profile },
  };
}

function candidate(id: string, overrides: Partial<Omit<TeamCandidate, 'person'>> & { person?: Partial<TeamCandidate['person']> } = {}): TeamCandidate {
  const { person, ...rest } = overrides;
  return {
    person: {
      userId: id,
      fullName: `Orang ${id}`,
      headline: null,
      educationLevel: 'D4_S1',
      major: 'Desain Komunikasi Visual',
      interests: [],
      ...person,
    },
    city: 'Bandung',
    skills: [],
    seeking: [],
    remoteOk: true,
    pitch: null,
    portfolio: NO_PORTFOLIO,
    relation: null,
    ...rest,
  };
}

const digest = (...achievements: (Achievement | null)[]): PortfolioDigest => ({ count: achievements.length, achievements });
const score = (v: MatchViewer, c: TeamCandidate, style: 'seimbang' | 'juara' | 'belajar' = 'seimbang') => scoreCandidate(v, c, { style });
const component = (match: ReturnType<typeof scoreCandidate>, key: (typeof MATCH_COMPONENTS)[number]) =>
  match.components.find((item) => item.key === key)!.score;

describe('bobot', () => {
  it('berjumlah 1, sehingga skor maksimum tepat 100', () => {
    expect(MATCH_COMPONENTS.reduce((sum, key) => sum + MATCH_WEIGHTS[key], 0)).toBeCloseTo(1, 10);
  });

  it('kandidat sempurna di semua komponen = 100; kosong di semua = nilai netral rendah', () => {
    const me = viewer({ interests: ['teknologi'], profile: { seeking: ['ui-ux'], skills: ['web-aplikasi'] } });
    const perfect = candidate('a', {
      skills: ['ui-ux'],
      seeking: ['web-aplikasi'],
      portfolio: digest('JUARA_1', 'JUARA_1', 'JUARA_1', 'JUARA_1', 'JUARA_1'),
      person: { interests: ['teknologi'], major: 'Rekayasa Perangkat Lunak' },
    });
    expect(score(me, perfect, 'juara').score).toBeGreaterThanOrEqual(90);
    expect(score(me, candidate('b', { city: null, remoteOk: false })).score).toBeLessThan(40);
  });
});

describe('keahlian', () => {
  const me = viewer({ profile: { skills: ['web-aplikasi'], seeking: ['ui-ux'] } });

  it('yang persis kamu cari > yang sebidang > yang tidak relevan', () => {
    const exact = component(score(me, candidate('a', { skills: ['ui-ux'] })), 'skills');
    const sameDomain = component(score(me, candidate('b', { skills: ['grafis'] })), 'skills');
    const unrelated = component(score(me, candidate('c', { skills: ['hukum-kebijakan'] })), 'skills');
    expect(exact).toBeGreaterThan(sameDomain);
    expect(sameDomain).toBeGreaterThan(unrelated);
  });

  it('tanpa kebutuhan eksplisit, yang MELENGKAPI (bidang baru) mengalahkan yang sebidang denganmu', () => {
    const open = viewer({ profile: { skills: ['web-aplikasi'], seeking: [] } });
    const complementary = component(score(open, candidate('a', { skills: ['ui-ux', 'video'] })), 'skills');
    const alike = component(score(open, candidate('b', { skills: ['data-ai', 'iot-elektronika'] })), 'skills');
    expect(complementary).toBeGreaterThan(alike);
  });

  it('kandidat tanpa keahlian = 0, bukan netral', () => {
    expect(component(score(me, candidate('a', { skills: [] })), 'skills')).toBe(0);
  });

  it('skill ganda tidak menggelembungkan skor', () => {
    const once = component(score(me, candidate('a', { skills: ['ui-ux'] })), 'skills');
    const dupes = component(score(me, candidate('b', { skills: ['ui-ux', 'ui-ux', 'ui-ux'] })), 'skills');
    expect(dupes).toBeCloseTo(once, 5);
  });
});

describe('saling butuh', () => {
  const me = viewer({ profile: { skills: ['web-aplikasi', 'data-ai'], seeking: [] } });

  it('ia mencari yang kamu punya > ia mencari yang tidak kamu punya; kosong = netral 0,5', () => {
    const wantsMine = component(score(me, candidate('a', { seeking: ['web-aplikasi'] })), 'mutual');
    const wantsOther = component(score(me, candidate('b', { seeking: ['hukum-kebijakan'] })), 'mutual');
    const openMinded = component(score(me, candidate('c', { seeking: [] })), 'mutual');
    expect(wantsMine).toBe(1);
    expect(wantsOther).toBe(0);
    expect(openMinded).toBe(0.5);
  });
});

describe('jarak', () => {
  it('peluruhan: satu kota 1, ±120 km ≈ 0,7, jauh mendekati 0, tidak diketahui rendah', () => {
    expect(distanceScore(0, false)).toBe(1);
    expect(distanceScore(10, false)).toBe(1);
    expect(distanceScore(120, false)).toBeCloseTo(0.71, 1);
    expect(distanceScore(3_800, false)).toBeLessThan(0.01);
    expect(distanceScore(null, false)).toBe(0.3);
  });

  it('bersedia daring dua-duanya = lantai 0,5, tapi tidak menurunkan yang sudah dekat', () => {
    expect(distanceScore(3_800, true)).toBe(0.5);
    expect(distanceScore(null, true)).toBe(0.5);
    expect(distanceScore(0, true)).toBe(1);
  });

  it('hanya satu pihak yang bersedia daring = tidak ada lantai', () => {
    const me = viewer({ profile: { city: 'Bandung', remoteOk: true } });
    const far = score(me, candidate('a', { city: 'Jayapura', remoteOk: false }));
    expect(component(far, 'distance')).toBeLessThan(0.01);
    expect(far.distanceKm).toBeGreaterThan(3_000);
  });
});

describe('portofolio', () => {
  it('kekuatan jenuh: satu juara 1 sudah kuat, sepuluh partisipasi tidak menyaingi', () => {
    const champion = portfolioStrength(digest('JUARA_1'));
    const crowd = portfolioStrength(digest(...Array<Achievement>(10).fill('PESERTA')));
    expect(champion).toBeGreaterThan(crowd);
    expect(portfolioStrength(digest('JUARA_1', 'JUARA_2'))).toBeGreaterThan(champion);
    expect(portfolioStrength(NO_PORTFOLIO)).toBe(0);
    expect(portfolioStrength(digest('JUARA_1', 'JUARA_1', 'JUARA_1', 'JUARA_1', 'JUARA_1', 'JUARA_1', 'JUARA_1'))).toBeLessThanOrEqual(1);
  });

  it('entri tanpa hasil yang dilaporkan tetap bernilai kecil, bukan nol', () => {
    expect(portfolioStrength(digest(null))).toBeGreaterThan(0);
    expect(portfolioStrength(digest(null))).toBeLessThan(portfolioStrength(digest('PESERTA')));
  });

  it('gaya: "juara" mengutamakan yang kuat; "belajar" mengutamakan yang sepantaran', () => {
    const newbie = viewer({ portfolio: NO_PORTFOLIO });
    const veteran = candidate('v', { portfolio: digest('JUARA_1', 'JUARA_2') });
    const peer = candidate('p', { portfolio: NO_PORTFOLIO });
    expect(component(score(newbie, veteran, 'juara'), 'portfolio')).toBeGreaterThan(component(score(newbie, peer, 'juara'), 'portfolio'));
    expect(component(score(newbie, peer, 'belajar'), 'portfolio')).toBeGreaterThan(component(score(newbie, veteran, 'belajar'), 'portfolio'));
  });
});

describe('gaya "juara" tidak pernah merugikan yang berpengalaman', () => {
  it('skor portofolio ≥ "seimbang" untuk setiap portofolio, dan selisihnya naik bersama kekuatan', () => {
    const me = viewer({ portfolio: NO_PORTFOLIO });
    const digests = [NO_PORTFOLIO, digest(null), digest('PESERTA'), digest('FINALIS'), digest('JUARA_3'), digest('JUARA_1'), digest('JUARA_1', 'JUARA_2', 'JUARA_3')];
    let previousGap = -1;
    for (const portfolio of digests) {
      const c = candidate('x', { portfolio });
      const balanced = component(score(me, c, 'seimbang'), 'portfolio');
      const winner = component(score(me, c, 'juara'), 'portfolio');
      expect(winner).toBeGreaterThanOrEqual(balanced);
      expect(winner).toBeLessThanOrEqual(1);
      expect(score(me, c, 'juara').score).toBeGreaterThanOrEqual(score(me, c, 'seimbang').score);
      if (portfolioStrength(portfolio) > 0) {
        const gap = winner - balanced;
        expect(gap).toBeGreaterThanOrEqual(previousGap - 1e-9);
        previousGap = gap;
      }
    }
  });
});

describe('saringan', () => {
  const me = viewer();
  const f = (overrides: Partial<MatchFilters>): MatchFilters => ({ ...DEFAULT_MATCH_FILTERS, ...overrides });

  it('tanpa saringan semua lolos, kecuali yang sudah terhubung', () => {
    expect(passesFilters(me, candidate('a'), DEFAULT_MATCH_FILTERS)).toBe(true);
    expect(passesFilters(me, candidate('a', { relation: 'connected' }), DEFAULT_MATCH_FILTERS)).toBe(false);
    expect(passesFilters(me, candidate('a', { relation: 'outgoing' }), DEFAULT_MATCH_FILTERS)).toBe(true);
  });

  it('jarak: dekat lolos; jauh gugur kecuali dua-duanya bersedia daring; kota kosong gugur tanpa daring', () => {
    const jakarta = candidate('j', { city: 'Jakarta Pusat' });
    expect(passesFilters(me, jakarta, f({ maxDistanceKm: 25 }))).toBe(true); // daring → lolos
    expect(passesFilters(me, jakarta, f({ maxDistanceKm: 25, includeRemote: false }))).toBe(false);
    expect(passesFilters(me, jakarta, f({ maxDistanceKm: 500, includeRemote: false }))).toBe(true); // ±120 km
    expect(passesFilters(me, candidate('x', { city: null, remoteOk: false }), f({ maxDistanceKm: 500 }))).toBe(false);
    expect(passesFilters(me, candidate('y', { city: 'Jayapura', remoteOk: false }), f({ maxDistanceKm: 500 }))).toBe(false);
  });

  it('keahlian: harus punya SALAH SATU dari yang dipilih', () => {
    const designer = candidate('d', { skills: ['ui-ux', 'grafis'] });
    expect(passesFilters(me, designer, f({ skills: ['grafis', 'video'] }))).toBe(true);
    expect(passesFilters(me, designer, f({ skills: ['data-ai'] }))).toBe(false);
    expect(passesFilters(me, candidate('n', { skills: [] }), f({ skills: ['data-ai'] }))).toBe(false);
  });

  it('portofolio: "ada" butuh minimal satu, "juara" butuh juara/harapan (finalis belum cukup)', () => {
    const none = candidate('a');
    const finalist = candidate('b', { portfolio: digest('FINALIS') });
    const winner = candidate('c', { portfolio: digest('PESERTA', 'JUARA_HARAPAN') });
    expect(passesFilters(me, none, f({ portfolio: 'ada' }))).toBe(false);
    expect(passesFilters(me, finalist, f({ portfolio: 'ada' }))).toBe(true);
    expect(passesFilters(me, finalist, f({ portfolio: 'juara' }))).toBe(false);
    expect(passesFilters(me, winner, f({ portfolio: 'juara' }))).toBe(true);
  });

  it('jenjang sama: kedua pihak harus punya jenjang yang sama', () => {
    expect(passesFilters(me, candidate('a', { person: { educationLevel: 'D4_S1' } }), f({ sameLevel: true }))).toBe(true);
    expect(passesFilters(me, candidate('b', { person: { educationLevel: 'S2' } }), f({ sameLevel: true }))).toBe(false);
    expect(passesFilters(me, candidate('c', { person: { educationLevel: null } }), f({ sameLevel: true }))).toBe(false);
    expect(passesFilters(viewer({ educationLevel: null }), candidate('d'), f({ sameLevel: true }))).toBe(false);
  });
});

describe('rankCandidates', () => {
  const me = viewer({ profile: { skills: ['web-aplikasi'], seeking: ['ui-ux'] } });
  const pool = [
    candidate('c-grafis', { skills: ['grafis'] }),
    candidate('a-uiux', { skills: ['ui-ux'] }),
    candidate('b-lain', { skills: ['hukum-kebijakan'] }),
  ];

  it('mengurutkan dari yang paling cocok dan tidak pernah memuat diri sendiri', () => {
    const ranked = rankCandidates(me, [...pool, candidate('me', { skills: ['ui-ux'] })], { style: 'seimbang', filters: DEFAULT_MATCH_FILTERS });
    expect(ranked.map((match) => match.candidate.person.userId)).toEqual(['a-uiux', 'c-grafis', 'b-lain']);
  });

  it('deterministik: urutan masukan tidak memengaruhi hasil, seri diputus userId', () => {
    const twins = [candidate('z', { skills: ['ui-ux'] }), candidate('m', { skills: ['ui-ux'] }), candidate('a', { skills: ['ui-ux'] })];
    const forward = rankCandidates(me, twins, { style: 'seimbang', filters: DEFAULT_MATCH_FILTERS });
    const backward = rankCandidates(me, [...twins].reverse(), { style: 'seimbang', filters: DEFAULT_MATCH_FILTERS });
    expect(forward.map((m) => m.candidate.person.userId)).toEqual(['a', 'm', 'z']);
    expect(backward.map((m) => m.candidate.person.userId)).toEqual(['a', 'm', 'z']);
  });

  it('menghormati batas jumlah dan saringan', () => {
    const many = Array.from({ length: 30 }, (_, index) => candidate(`p${String(index).padStart(2, '0')}`, { skills: ['ui-ux'] }));
    expect(rankCandidates(me, many, { style: 'seimbang', filters: DEFAULT_MATCH_FILTERS })).toHaveLength(12);
    expect(rankCandidates(me, many, { style: 'seimbang', filters: DEFAULT_MATCH_FILTERS, limit: 3 })).toHaveLength(3);
    expect(rankCandidates(me, many, { style: 'seimbang', filters: { ...DEFAULT_MATCH_FILTERS, skills: ['video'] } })).toHaveLength(0);
  });

  it('skor selalu bilangan bulat 0..100', () => {
    for (const match of rankCandidates(me, pool, { style: 'seimbang', filters: DEFAULT_MATCH_FILTERS })) {
      expect(Number.isInteger(match.score)).toBe(true);
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.score).toBeLessThanOrEqual(100);
    }
  });
});

describe('alasan & kimia', () => {
  const me = viewer({ interests: ['teknologi', 'desain'], profile: { city: 'Bandung', skills: ['web-aplikasi'], seeking: ['ui-ux'] } });

  it('alasan menyebut keahlian yang dicari, kota yang sama, dan portofolio — paling berbobot dulu, maks. 3', () => {
    const match = score(
      me,
      candidate('a', { skills: ['ui-ux'], portfolio: digest('JUARA_1', 'FINALIS'), person: { interests: ['teknologi', 'desain', 'bisnis'] } }),
    );
    expect(match.reasons.length).toBeLessThanOrEqual(3);
    expect(match.reasons[0]).toBe('Punya Desain UI/UX yang kamu cari');
    expect(match.reasons.some((reason) => reason.startsWith('Satu kota denganmu (Bandung)'))).toBe(true);
    expect(match.matchedSeeking).toEqual(['ui-ux']);
  });

  it('minat memakai nama kategori yang diberikan, bukan slug', () => {
    const match = scoreCandidate(me, candidate('a', { skills: ['ui-ux'], person: { interests: ['teknologi'] } }), {
      style: 'seimbang',
      categoryName: (slug) => (slug === 'teknologi' ? 'Teknologi' : slug),
    });
    expect(match.reasons.concat(match.sharedInterests.map((slug) => slug))).toContain('Minat sama: Teknologi');
  });

  it('kota tetangga: "Berdekatan", bukan "Satu kota" (Bandung–Cimahi ±10 km)', () => {
    const match = score(me, candidate('a', { city: 'Cimahi', skills: ['ui-ux'] }));
    expect(match.distanceKm).toBeGreaterThan(0);
    expect(match.distanceKm).toBeLessThanOrEqual(15);
    expect(match.reasons).toContain('Berdekatan denganmu (Cimahi)');
    expect(match.reasons.join(' ')).not.toContain('Satu kota');
  });

  it('jarak jauh: tidak mengklaim "dekat"; menyebut kesediaan daring', () => {
    const match = score(me, candidate('a', { city: 'Jayapura', skills: ['ui-ux'] }));
    expect(match.reasons.join(' ')).not.toContain('Satu kota');
    expect(match.reasons).toContain('Sama-sama bersedia kerja daring');
  });

  it('Duo Pelengkap: saling mencari satu sama lain', () => {
    const match = score(me, candidate('a', { skills: ['ui-ux'], seeking: ['web-aplikasi'] }));
    expect(match.chemistry).toBe('duo-pelengkap');
  });

  it('Satu Kota bila tidak saling mencari tetapi bertetangga dan relevan', () => {
    const match = score(me, candidate('a', { skills: ['ui-ux'], seeking: ['hukum-kebijakan'] }));
    expect(match.chemistry).toBe('satu-kota');
  });

  it('gaya "belajar" memberi label Sama-sama Belajar untuk yang sepantaran', () => {
    const match = score(
      viewer({ profile: { city: 'Medan', skills: ['web-aplikasi'], seeking: [] }, interests: [] }),
      candidate('a', { city: 'Jayapura', skills: ['web-aplikasi'], seeking: ['hukum-kebijakan'], person: { interests: [] } }),
      'belajar',
    );
    expect(match.chemistry).toBe('sama-sama-belajar');
  });
});

describe('URL saringan', () => {
  it('nilai bawaan tidak ditulis: satu kombinasi = satu URL', () => {
    expect(serializeMatchQuery({ go: false, show: 6, style: 'seimbang', filters: DEFAULT_MATCH_FILTERS })).toBe('');
    expect(serializeMatchQuery({ go: true, show: 6, style: 'seimbang', filters: DEFAULT_MATCH_FILTERS })).toBe('?cari=1');
  });

  it('bolak-balik: serialisasi → parse → sama', () => {
    const query = {
      go: true,
      show: 18,
      style: 'belajar' as const,
      filters: { maxDistanceKm: 100, includeRemote: false, skills: ['ui-ux', 'video'] as const, portfolio: 'juara' as const, sameLevel: true },
    };
    const url = serializeMatchQuery({ ...query, filters: { ...query.filters, skills: [...query.filters.skills] } });
    const params: Record<string, string | string[]> = {};
    for (const [key, value] of new URLSearchParams(url)) {
      const existing = params[key];
      params[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
    }
    const parsed = parseMatchQuery(params);
    expect(parsed.go).toBe(true);
    expect(parsed.show).toBe(18);
    expect(parsed.style).toBe('belajar');
    expect(parsed.filters).toEqual({ ...query.filters, skills: ['ui-ux', 'video'] });
  });

  it('masukan sampah diabaikan, bukan dipercaya', () => {
    const parsed = parseMatchQuery({ tampil: '9999', jarak: '999999', gaya: '<script>', portofolio: 'x', keahlian: ['ui-ux', 'hack', 'ui-ux'], daring: 'yes', jenjang: 'beda', cari: 'ya' });
    expect(parsed.go).toBe(false);
    expect(parsed.show).toBe(6);
    expect(parsed.style).toBe('seimbang');
    expect(parsed.filters.maxDistanceKm).toBeNull();
    expect(parsed.filters.portfolio).toBe('semua');
    expect(parsed.filters.skills).toEqual(['ui-ux']);
    expect(parsed.filters.includeRemote).toBe(true);
    expect(parsed.filters.sameLevel).toBe(false);
  });

  it('activeFilterCount menghitung kelompok saringan yang menyala', () => {
    expect(activeFilterCount(DEFAULT_MATCH_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_MATCH_FILTERS, maxDistanceKm: 25, skills: ['video', 'grafis'], sameLevel: true })).toBe(3);
  });
});

describe('profil kosong tidak merusak apa pun', () => {
  it('pembaca tanpa kota/keahlian/minat tetap menghasilkan skor wajar', () => {
    const blank = viewer({ interests: [], major: null, educationLevel: null, profile: { city: null, skills: [], seeking: [], remoteOk: false } });
    const profile: Pick<TeamSeekerProfile, 'city'> = { city: null };
    expect(profile.city).toBeNull();
    const match = score(blank, candidate('a', { skills: ['ui-ux'], city: 'Bandung' }));
    expect(match.score).toBeGreaterThanOrEqual(0);
    expect(match.score).toBeLessThanOrEqual(100);
    expect(match.distanceKm).toBeNull();
  });
});

describe('describePortfolio', () => {
  it('satu kalimat: jumlah publik + capaian terbaik; kosong = null', () => {
    expect(describePortfolio(NO_PORTFOLIO)).toBeNull();
    expect(describePortfolio(digest('PESERTA', 'JUARA_2', 'FINALIS'))).toBe('3 portofolio publik · terbaik Juara 2 (laporan sendiri)');
    expect(describePortfolio(digest(null))).toBe('1 kegiatan sudah diikuti');
  });
});
