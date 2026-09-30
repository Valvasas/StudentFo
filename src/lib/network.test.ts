import { describe, expect, it } from 'vitest';
import type { NetworkPerson } from '@/types/domain';
import {
  clampConnectionLimit,
  compareConnections,
  CONNECTION_PAGE,
  decodeConnectionCursor,
  encodeConnectionCursor,
  matchesConnectionFilter,
  matchesPeopleSearch,
  NETWORK_LIMITS,
  normalizeConnectionSearch,
  daysAgoLabel,
  parseConnectionMessage,
  parseNetworkProfileForm,
  personMeta,
  rankSuggestions,
  scoreSuggestion,
  suggestionReasons,
  type NetworkViewer,
} from './network';

const viewer: NetworkViewer = {
  id: 'me',
  fullName: 'Dinda Pratiwi',
  educationLevel: 'D4_S1',
  major: 'Rekayasa Perangkat Lunak',
  interests: ['teknologi', 'desain', 'bisnis'],
};

const person = (overrides: Partial<NetworkPerson> & Pick<NetworkPerson, 'userId' | 'fullName'>): NetworkPerson => ({
  headline: null,
  educationLevel: null,
  major: null,
  interests: [],
  ...overrides,
});

const event = { id: 'e1', slug: 'lomba', title: 'Lomba Inovasi', eventType: 'LOMBA' as const };

describe('scoreSuggestion', () => {
  it('menjumlahkan minat, koneksi bersama, tim, jurusan, dan jenjang', () => {
    const result = scoreSuggestion(viewer, {
      person: person({ userId: 'a', fullName: 'A', interests: ['teknologi', 'desain', 'sains'], major: 'rekayasa  perangkat lunak', educationLevel: 'D4_S1' }),
      mutualCount: 2,
      sharedEvents: [event],
    });
    expect(result.sharedInterests).toEqual(['teknologi', 'desain']);
    expect(result.sameMajor).toBe(true);
    expect(result.sameLevel).toBe(true);
    // 2×3 + 2×2 + 1×4 + 2 + 1
    expect(result.score).toBe(17);
  });

  it('membatasi tiap sinyal supaya satu sinyal tidak mendominasi', () => {
    const result = scoreSuggestion(viewer, { person: person({ userId: 'a', fullName: 'A' }), mutualCount: 40, sharedEvents: [event, event, event] });
    expect(result.score).toBe(5 * 2 + 2 * 4);
  });

  it('profil pembaca kosong = semua sinyal profil nol, bukan cocok palsu', () => {
    const empty: NetworkViewer = { id: 'me', fullName: 'X', educationLevel: null, major: null, interests: [] };
    const result = scoreSuggestion(empty, { person: person({ userId: 'a', fullName: 'A', educationLevel: null }), mutualCount: 0, sharedEvents: [] });
    expect(result).toMatchObject({ score: 0, sameLevel: false, sameMajor: false });
  });
});

describe('rankSuggestions', () => {
  it('skor tertinggi dulu, seri diurutkan nama, diri sendiri dibuang, dipotong ke limit', () => {
    const ranked = rankSuggestions(
      viewer,
      [
        { person: person({ userId: 'z', fullName: 'Zaki', interests: ['teknologi'] }), mutualCount: 0, sharedEvents: [] },
        { person: person({ userId: 'b', fullName: 'Bela', interests: ['teknologi'] }), mutualCount: 0, sharedEvents: [] },
        { person: person({ userId: 'me', fullName: 'Aku', interests: ['teknologi', 'desain'] }), mutualCount: 9, sharedEvents: [] },
        { person: person({ userId: 'c', fullName: 'Caca' }), mutualCount: 3, sharedEvents: [] },
      ],
      2,
    );
    expect(ranked.map((item) => item.person.userId)).toEqual(['c', 'b']);
  });
});

describe('suggestionReasons', () => {
  it('urut dari yang paling kuat, maksimal tiga', () => {
    const suggestion = scoreSuggestion(viewer, {
      person: person({ userId: 'a', fullName: 'A', interests: ['teknologi', 'desain', 'bisnis'], major: 'Rekayasa Perangkat Lunak' }),
      mutualCount: 2,
      sharedEvents: [event],
    });
    expect(suggestionReasons(suggestion, (slug) => slug.toUpperCase())).toEqual([
      'Ikut tim di Lomba Inovasi',
      '2 koneksi bersama',
      'Minat sama: TEKNOLOGI, DESAIN +1',
    ]);
  });

  it('jenjang dipakai hanya kalau jurusan tidak sama', () => {
    const suggestion = scoreSuggestion(viewer, { person: person({ userId: 'a', fullName: 'A', educationLevel: 'D4_S1' }), mutualCount: 0, sharedEvents: [] });
    expect(suggestionReasons(suggestion, String)).toEqual(['Sama-sama D4/S1']);
  });
});

describe('matchesPeopleSearch', () => {
  const rani = person({ userId: 'r', fullName: 'Rani Prameswari', major: 'Teknik Informatika', headline: 'Frontend & aksesibilitas' });

  it('semua kata harus cocok, tanpa peduli huruf besar & diakritik', () => {
    expect(matchesPeopleSearch(rani, 'rani informatika')).toBe(true);
    expect(matchesPeopleSearch(rani, 'RÁNI frontend')).toBe(true);
    expect(matchesPeopleSearch(rani, 'rani hukum')).toBe(false);
    expect(matchesPeopleSearch(rani, '   ')).toBe(true);
  });
});

describe('daysAgoLabel', () => {
  // 07:30 WIB, 27 September.
  const now = new Date('2026-09-27T00:30:00Z');

  it('dihitung per hari kalender WIB, bukan per 24 jam', () => {
    // 23:00 WIB 26 September = kemarin, walau baru 8,5 jam lalu.
    expect(daysAgoLabel('2026-09-26T16:00:00Z', now)).toBe('kemarin');
    expect(daysAgoLabel('2026-09-26T17:30:00Z', now)).toBe('hari ini');
  });

  it('minggu & bulan untuk rentang panjang; waktu di masa depan = hari ini', () => {
    expect(daysAgoLabel('2026-09-17T05:00:00Z', now)).toBe('10 hari lalu');
    expect(daysAgoLabel('2026-09-06T05:00:00Z', now)).toBe('3 minggu lalu');
    expect(daysAgoLabel('2026-06-01T05:00:00Z', now)).toBe('3 bulan lalu');
    expect(daysAgoLabel('2026-09-30T05:00:00Z', now)).toBe('hari ini');
    expect(daysAgoLabel('bukan tanggal', now)).toBe('');
  });
});

describe('personMeta', () => {
  it('menggabungkan jurusan & jenjang yang ada saja', () => {
    expect(personMeta({ major: 'Statistika', educationLevel: 'S2' })).toBe('Statistika · S2');
    expect(personMeta({ major: null, educationLevel: null })).toBe('');
  });
});

describe('parseNetworkProfileForm', () => {
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  };

  it('checkbox tidak dicentang = tidak bisa ditemukan; headline kosong = null', () => {
    expect(parseNetworkProfileForm(form({ headline: '   ' })).data).toEqual({ discoverable: false, headline: null });
  });

  it('merapikan spasi dan menolak headline terlalu panjang', () => {
    expect(parseNetworkProfileForm(form({ discoverable: 'on', headline: '  Suka   riset  ' })).data).toEqual({ discoverable: true, headline: 'Suka riset' });
    expect(parseNetworkProfileForm(form({ headline: 'x'.repeat(NETWORK_LIMITS.headlineMax + 1) })).success).toBe(false);
  });

  it('pesan pengantar opsional dengan batas panjang', () => {
    expect(parseConnectionMessage('').data).toBeNull();
    expect(parseConnectionMessage('Halo!').data).toBe('Halo!');
    expect(parseConnectionMessage('x'.repeat(NETWORK_LIMITS.messageMax + 1)).success).toBe(false);
  });
});

describe('kursor koneksi (ADR-041)', () => {
  const cursor = { status: 'ACCEPTED' as const, createdAt: '2026-09-27T10:00:00.123456+00:00', id: '0f8b6a1e-1c2d-4e3f-8a9b-0c1d2e3f4a5b' };

  it('bolak-balik utuh, termasuk stempel mikrodetik Postgres', () => {
    const encoded = encodeConnectionCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeConnectionCursor(encoded)).toEqual(cursor);
  });

  it('menolak apa pun yang bisa menyusup ke filter PostgREST', () => {
    const forge = (status: string, createdAt: string, id: string) =>
      btoa(JSON.stringify([status, createdAt, id])).replace(/=+$/, '');
    expect(decodeConnectionCursor(forge('ACCEPTED', '2026-09-27T10:00:00Z),or(id.not.is.null', cursor.id))).toBeNull();
    expect(decodeConnectionCursor(forge('ACCEPTED', cursor.createdAt, `${cursor.id},x`))).toBeNull();
    expect(decodeConnectionCursor(forge('REJECTED', cursor.createdAt, cursor.id))).toBeNull();
    expect(decodeConnectionCursor(forge('ACCEPTED', '2026-13-45T99:99:99Z', cursor.id))).toBeNull();
    expect(decodeConnectionCursor('bukan base64!')).toBeNull();
    expect(decodeConnectionCursor('a'.repeat(500))).toBeNull();
    expect(decodeConnectionCursor(btoa('{"status":"ACCEPTED"}'))).toBeNull();
  });

  it('urutan: menunggu dulu, lalu terbaru, lalu id — total', () => {
    const rows = [
      { status: 'ACCEPTED' as const, createdAt: '2026-09-27T10:00:00Z', id: 'a' },
      { status: 'PENDING' as const, createdAt: '2026-01-01T00:00:00Z', id: 'b' },
      { status: 'ACCEPTED' as const, createdAt: '2026-09-27T10:00:00Z', id: 'c' },
      { status: 'ACCEPTED' as const, createdAt: '2026-09-28T10:00:00Z', id: 'd' },
    ];
    expect([...rows].sort(compareConnections).map((row) => row.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('batas halaman dipotong ke rentang yang aman untuk max_rows', () => {
    expect(clampConnectionLimit(0)).toBe(1);
    expect(clampConnectionLimit(Number.NaN)).toBe(1);
    expect(clampConnectionLimit(10_000)).toBe(CONNECTION_PAGE.maxLimit);
    expect(CONNECTION_PAGE.maxLimit + 1).toBeLessThanOrEqual(1000);
  });
});

describe('saringan koneksi per tugas (ADR-048)', () => {
  const person = { fullName: 'Rani Prameswari' } as NetworkPerson;
  const accepted = { status: 'ACCEPTED', direction: 'incoming', person } as const;
  const incoming = { status: 'PENDING', direction: 'incoming', person } as const;
  const outgoing = { status: 'PENDING', direction: 'outgoing', person } as const;

  it('setiap jenis hanya memuat daftarnya sendiri; tanpa jenis = semua', () => {
    expect([accepted, incoming, outgoing].map((item) => matchesConnectionFilter(item, { kind: 'accepted' }))).toEqual([true, false, false]);
    expect([accepted, incoming, outgoing].map((item) => matchesConnectionFilter(item, { kind: 'incoming' }))).toEqual([false, true, false]);
    expect([accepted, incoming, outgoing].map((item) => matchesConnectionFilter(item, { kind: 'outgoing' }))).toEqual([false, false, true]);
    expect([accepted, incoming, outgoing].every((item) => matchesConnectionFilter(item, {}))).toBe(true);
  });

  it('pencarian nama tidak peka huruf besar dan hanya mencocokkan potongan nama', () => {
    expect(matchesConnectionFilter(accepted, { search: 'prames' })).toBe(true);
    expect(matchesConnectionFilter(accepted, { search: 'RANI P' })).toBe(true);
    expect(matchesConnectionFilter(accepted, { search: 'dimas' })).toBe(false);
  });

  it('karakter bermakna khusus di filter PostgREST dibuang sebelum sampai ke SQL', () => {
    expect(normalizeConnectionSearch('  Rani%_*,(or)  ')).toBe('Rani or');
    expect(normalizeConnectionSearch("O'Neil-Putra A.")).toBe("O'Neil-Putra A.");
    expect(normalizeConnectionSearch(null)).toBe('');
    expect(normalizeConnectionSearch('a'.repeat(200))).toHaveLength(60);
  });
});
