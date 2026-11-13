import { describe, expect, it } from 'vitest';
import {
  BADGES,
  EARLY_BIRD_DAYS,
  FOUNDING_MEMBER_UNTIL,
  evaluateBadges,
  isFreshBadge,
  monthlyStreak,
  nearestBadgeGoal,
  settleRegistrations,
  summarizeBadges,
  type AchievementFacts,
  type BadgeKey,
  type RegistrationFact,
} from './achievements';

const NOW = new Date('2026-11-05T05:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const lomba = (eventId: string, overrides: Partial<RegistrationFact> = {}): RegistrationFact => ({
  eventId,
  eventType: 'LOMBA',
  eventStatus: 'EXPIRED',
  deadlineAt: daysAgo(10),
  status: 'CONFIRMED',
  confirmedAt: daysAgo(20),
  ...overrides,
});

const facts = (overrides: Partial<AchievementFacts> = {}): AchievementFacts => ({
  registrations: [],
  managedEventIds: [],
  approvedSubmissions: 0,
  organizerStatus: null,
  organizerReviewedAt: null,
  hostedEventClosedAt: [],
  ...overrides,
});

const badge = (input: AchievementFacts, key: BadgeKey) => {
  const found = evaluateBadges(input, NOW).find((item) => item.definition.key === key);
  if (!found) throw new Error(`lencana ${key} tidak ada`);
  return found;
};

describe('lencana Petarung Lomba — contoh "ikut 3 lomba"', () => {
  it('tiga lomba terkonfirmasi yang sudah ditutup = tingkat 2 "Aktif Berkompetisi"', () => {
    const result = badge(facts({ registrations: [lomba('a'), lomba('b'), lomba('c')] }), 'kompetitor');
    expect(result.tier).toBe(2);
    expect(result.current?.title).toBe('Aktif Berkompetisi');
    expect(result.next?.threshold).toBe(10);
  });

  it('daftar lalu batal tidak meninggalkan apa pun — tidak ada lencana yang "tersimpan"', () => {
    const result = badge(facts({ registrations: [lomba('a'), lomba('b', { status: 'CANCELLED' }), lomba('c', { status: 'CANCELLED' })] }), 'kompetitor');
    expect(result.count).toBe(1);
    expect(result.tier).toBe(1);
  });

  it('belum dibayar, bukti masih diperiksa, atau ditolak panitia = tidak dihitung', () => {
    const result = badge(
      facts({
        registrations: [
          lomba('a', { status: 'AWAITING_PAYMENT' }),
          lomba('b', { status: 'PAYMENT_REVIEW' }),
          lomba('c', { status: 'REJECTED' }),
        ],
      }),
      'kompetitor',
    );
    expect(result.count).toBe(0);
    expect(result.tier).toBe(0);
  });

  it('terkonfirmasi tapi pendaftaran belum ditutup = menunggu, bukan dihitung (cegah daftar → dapat lencana → batal)', () => {
    const open = lomba('a', { eventStatus: 'APPROVED', deadlineAt: new Date(NOW.getTime() + 3 * 86_400_000).toISOString() });
    const result = badge(facts({ registrations: [open] }), 'kompetitor');
    expect(result.count).toBe(0);
    expect(result.pending).toBe(1);
  });

  it('acara tayang tanpa tenggat tidak pernah "ditutup" sampai kedaluwarsa', () => {
    const result = badge(facts({ registrations: [lomba('a', { eventStatus: 'APPROVED', deadlineAt: null })] }), 'kompetitor');
    expect(result.count).toBe(0);
    expect(result.pending).toBe(1);
  });

  it('lomba yang dikelola sendiri tidak dihitung — penyelenggara tidak bisa memberi lencana ke dirinya', () => {
    const result = badge(facts({ registrations: [lomba('mine'), lomba('b')], managedEventIds: ['mine'] }), 'kompetitor');
    expect(result.count).toBe(1);
  });

  it('acara yang hilang/ditolak/menunggu moderasi tidak dihitung', () => {
    const result = badge(
      facts({
        registrations: [lomba('gone', { eventType: null, eventStatus: null }), lomba('rejected', { eventStatus: 'REJECTED' }), lomba('pending', { eventStatus: 'PENDING' })],
      }),
      'kompetitor',
    );
    expect(result.count).toBe(0);
    expect(result.pending).toBe(0);
  });

  it('satu acara dihitung sekali walau ada beberapa baris (daftar ulang setelah batal)', () => {
    const result = badge(facts({ registrations: [lomba('a'), lomba('a', { confirmedAt: daysAgo(15) })] }), 'kompetitor');
    expect(result.count).toBe(1);
  });

  it('tanggal diraih = saat lomba ke-N selesai (terkonfirmasi DAN ditutup), urut waktu', () => {
    const result = badge(
      facts({
        registrations: [
          lomba('a', { deadlineAt: daysAgo(30), confirmedAt: daysAgo(40) }),
          lomba('b', { deadlineAt: daysAgo(12), confirmedAt: daysAgo(14) }),
          // Dikonfirmasi panitia SETELAH pendaftaran ditutup → jadi saat dikonfirmasi.
          lomba('c', { deadlineAt: daysAgo(20), confirmedAt: daysAgo(5) }),
        ],
      }),
      'kompetitor',
    );
    expect(result.earnedAt).toBe(daysAgo(5));
  });

  it('acara yang dikedaluwarsakan lebih awal tidak menghasilkan tanggal di masa depan', () => {
    const future = new Date(NOW.getTime() + 5 * 86_400_000).toISOString();
    const { settled } = settleRegistrations({ registrations: [lomba('a', { eventStatus: 'EXPIRED', deadlineAt: future })], managedEventIds: [] }, NOW);
    expect(settled[0]?.at).toBe(NOW.getTime());
  });
});

describe('Pembelajar & Penjelajah', () => {
  it('workshop, seminar (KONFERENSI), dan pelatihan masuk Pembelajar; lomba tidak', () => {
    const result = badge(
      facts({
        registrations: [
          lomba('w', { eventType: 'WORKSHOP' }),
          lomba('k', { eventType: 'KONFERENSI' }),
          lomba('p', { eventType: 'PELATIHAN' }),
          lomba('l'),
        ],
      }),
      'pembelajar',
    );
    expect(result.count).toBe(3);
    expect(result.tier).toBe(1);
  });

  it('Penjelajah menghitung JENIS, bukan jumlah — sepuluh lomba tetap satu jenis', () => {
    const many = Array.from({ length: 10 }, (_, index) => lomba(`l${index}`));
    expect(badge(facts({ registrations: many }), 'penjelajah').tier).toBe(0);
    const mixed = badge(facts({ registrations: [...many, lomba('w', { eventType: 'WORKSHOP' }), lomba('b', { eventType: 'BEASISWA' })] }), 'penjelajah');
    expect(mixed.count).toBe(3);
    expect(mixed.current?.title).toBe('Serba Bisa');
  });

  it('jenis baru yang masih menunggu ditutup tampil sebagai "menunggu", jenis lama tidak dihitung ganda', () => {
    const open = { eventStatus: 'APPROVED' as const, deadlineAt: new Date(NOW.getTime() + 86_400_000).toISOString() };
    const result = badge(facts({ registrations: [lomba('a'), lomba('b', open), lomba('m', { ...open, eventType: 'MAGANG' })] }), 'penjelajah');
    expect(result.count).toBe(1);
    expect(result.pending).toBe(1);
  });
});

describe('Kontributor & lencana penyelenggara', () => {
  it('kiriman disetujui moderator menaikkan tingkat; angka negatif dari sumber rusak tidak pernah jadi tingkat', () => {
    expect(badge(facts({ approvedSubmissions: 5 }), 'kontributor').tier).toBe(2);
    expect(badge(facts({ approvedSubmissions: -3 }), 'kontributor').tier).toBe(0);
  });

  it('lencana penyelenggara tidak muncul untuk akun yang tidak pernah mengajukan diri', () => {
    const keys = evaluateBadges(facts(), NOW).map((item) => item.definition.key);
    expect(keys).not.toContain('terverifikasi');
    expect(keys).not.toContain('tuan-rumah');
  });

  it('terverifikasi hanya untuk status VERIFIED; menunggu = "menunggu", dicabut = hilang', () => {
    expect(badge(facts({ organizerStatus: 'VERIFIED', organizerReviewedAt: daysAgo(2) }), 'terverifikasi')).toMatchObject({ tier: 1, earnedAt: daysAgo(2) });
    expect(badge(facts({ organizerStatus: 'PENDING' }), 'terverifikasi')).toMatchObject({ tier: 0, pending: 1 });
    expect(badge(facts({ organizerStatus: 'REVOKED', organizerReviewedAt: daysAgo(1) }), 'terverifikasi').tier).toBe(0);
  });

  it('Tuan Rumah: tanggal dari acara ke-N yang ditutup; tanggal yang tidak diketahui = tanpa tanggal', () => {
    expect(badge(facts({ organizerStatus: 'VERIFIED', hostedEventClosedAt: [daysAgo(3), daysAgo(9)] }), 'tuan-rumah')).toMatchObject({ tier: 1, earnedAt: daysAgo(9) });
    expect(badge(facts({ organizerStatus: 'VERIFIED', hostedEventClosedAt: [null] }), 'tuan-rumah')).toMatchObject({ tier: 1, earnedAt: null });
  });
});

describe('ringkasan', () => {
  it('summarizeBadges menjumlah tingkat', () => {
    const progress = evaluateBadges(facts({ registrations: [lomba('a'), lomba('b'), lomba('c')], approvedSubmissions: 1 }), NOW);
    // Lomba tingkat 2 + Kontributor tingkat 1 + Gerak Cepat tingkat 1 (ketiganya terkonfirmasi 10 hari
    // sebelum tutup); tiga lomba tetap satu jenis & satu bulan, jadi Penjelajah dan Konsisten belum.
    // Sembilan lencana peserta × 3 tingkat; Angkatan Perintis tidak ikut tanpa tanggal bergabung.
    expect(summarizeBadges(progress)).toEqual({ earned: 3, tiersEarned: 4, tiersTotal: 27 });
  });

  it('"Baru" hanya untuk tingkat yang tercapai ≤ 7 hari dan punya tanggal', () => {
    const fresh = badge(facts({ registrations: [lomba('a', { deadlineAt: daysAgo(2), confirmedAt: daysAgo(4) })] }), 'kompetitor');
    expect(isFreshBadge(fresh, NOW)).toBe(true);
    expect(isFreshBadge(badge(facts({ registrations: [lomba('a')] }), 'kompetitor'), NOW)).toBe(false);
    expect(isFreshBadge(badge(facts({ approvedSubmissions: 1 }), 'kontributor'), NOW)).toBe(false);
  });

  it('target terdekat = sisa hitungan paling sedikit, tanpa lencana penyelenggara & yang sudah mentok', () => {
    const progress = evaluateBadges(
      facts({
        registrations: [lomba('a'), lomba('b'), lomba('w', { eventType: 'WORKSHOP' })],
        organizerStatus: 'PENDING',
      }),
      NOW,
    );
    // Lomba: 2 → 3 (sisa 1); Penjelajah: 2 jenis → 3 (sisa 1, kalah urutan); Pembelajar: 1 → 5.
    expect(nearestBadgeGoal(progress)?.definition.key).toBe('kompetitor');
    expect(nearestBadgeGoal([])).toBeNull();
  });

  it('target terdekat mendahulukan lencana yang sudah dimulai daripada yang belum disentuh', () => {
    // Satu workshop + satu beasiswa: Penjelajah 2 dari 3 (sisa 1) menang atas
    // lencana lomba 0 dari 1 (sisa 1 juga, tapi belum dimulai).
    const progress = evaluateBadges(facts({ registrations: [lomba('w', { eventType: 'WORKSHOP' }), lomba('b', { eventType: 'BEASISWA' })] }), NOW);
    expect(nearestBadgeGoal(progress)?.definition.key).toBe('penjelajah');
  });
});

describe('ragam lencana (ADR-082) — sudut pandang baru atas catatan yang sama', () => {
  it('beasiswa, magang, dan volunteer punya lencananya sendiri dan tidak dihitung sebagai lomba', () => {
    const input = facts({
      registrations: [
        lomba('b1', { eventType: 'BEASISWA' }),
        lomba('b2', { eventType: 'BEASISWA' }),
        lomba('b3', { eventType: 'BEASISWA' }),
        lomba('m1', { eventType: 'MAGANG' }),
        lomba('v1', { eventType: 'VOLUNTEER' }),
      ],
    });
    expect(badge(input, 'pemburu-beasiswa')).toMatchObject({ count: 3, tier: 2 });
    expect(badge(input, 'pemburu-beasiswa').current?.title).toBe('Pejuang Beasiswa');
    expect(badge(input, 'perintis-karier')).toMatchObject({ count: 1, tier: 1 });
    expect(badge(input, 'relawan')).toMatchObject({ count: 1, tier: 1 });
    expect(badge(input, 'kompetitor').count).toBe(0);
    expect(badge(input, 'pembelajar').count).toBe(0);
  });

  it('lencana per jenis mengikuti aturan "jadi" yang sama: batal, belum ditutup, dan acara sendiri tidak dihitung', () => {
    const open = { eventStatus: 'APPROVED' as const, deadlineAt: new Date(NOW.getTime() + 2 * 86_400_000).toISOString() };
    const result = badge(
      facts({
        registrations: [
          lomba('b1', { eventType: 'BEASISWA', status: 'CANCELLED' }),
          lomba('b2', { eventType: 'BEASISWA', ...open }),
          lomba('mine', { eventType: 'BEASISWA' }),
        ],
        managedEventIds: ['mine'],
      }),
      'pemburu-beasiswa',
    );
    expect(result).toMatchObject({ count: 0, tier: 0, pending: 1 });
  });

  it(`Gerak Cepat: terkonfirmasi ≥ ${EARLY_BIRD_DAYS} hari sebelum tutup; kurang sehari, tanpa tenggat, atau dikonfirmasi belakangan = tidak`, () => {
    const result = badge(
      facts({
        registrations: [
          lomba('tepat', { deadlineAt: daysAgo(10), confirmedAt: daysAgo(10 + EARLY_BIRD_DAYS) }),
          lomba('kurang', { deadlineAt: daysAgo(10), confirmedAt: daysAgo(10 + EARLY_BIRD_DAYS - 1) }),
          lomba('tanpa-tenggat', { deadlineAt: null, confirmedAt: daysAgo(60) }),
          // Berbayar: panitia baru mengonfirmasi setelah pendaftaran ditutup.
          lomba('telat-dikonfirmasi', { deadlineAt: daysAgo(20), confirmedAt: daysAgo(18) }),
        ],
      }),
      'gerak-cepat',
    );
    expect(result).toMatchObject({ count: 1, tier: 1 });
    expect(result.current?.title).toBe('Tidak Menunda');
    // "Diraih" = saat pendaftaran kegiatan itu ditutup, bukan saat mendaftar.
    expect(result.earnedAt).toBe(daysAgo(10));
  });

  it('Gerak Cepat tidak bisa dipancing dengan daftar-awal lalu batal', () => {
    const result = badge(facts({ registrations: [lomba('a', { status: 'CANCELLED', confirmedAt: daysAgo(40) })] }), 'gerak-cepat');
    expect(result.count).toBe(0);
  });

  it('Konsisten: tiga bulan beruntun = tingkat 2; dua kegiatan di bulan yang sama tetap satu bulan', () => {
    const closing = (eventId: string, iso: string) => lomba(eventId, { deadlineAt: iso, confirmedAt: '2026-06-01T03:00:00.000Z' });
    const result = badge(
      facts({
        registrations: [
          closing('agu-1', '2026-08-10T16:59:00.000Z'),
          closing('agu-2', '2026-08-25T16:59:00.000Z'),
          closing('sep', '2026-09-12T16:59:00.000Z'),
          closing('okt', '2026-10-03T16:59:00.000Z'),
        ],
      }),
      'konsisten',
    );
    expect(result).toMatchObject({ count: 3, tier: 2 });
    expect(result.current?.title).toBe('Triwulan Penuh');
    expect(result.earnedAt).toBe('2026-10-03T16:59:00.000Z');
  });

  it('Konsisten: jeda sebulan memutus rentetan, tetapi rentetan terpanjang yang lama tidak hilang', () => {
    const closing = (eventId: string, iso: string) => lomba(eventId, { deadlineAt: iso, confirmedAt: '2026-01-05T03:00:00.000Z' });
    const result = badge(
      facts({
        registrations: [
          closing('mar', '2026-03-10T16:59:00.000Z'),
          closing('apr', '2026-04-10T16:59:00.000Z'),
          // Mei kosong.
          closing('jun', '2026-06-10T16:59:00.000Z'),
        ],
      }),
      'konsisten',
    );
    expect(result).toMatchObject({ count: 2, tier: 1 });
    expect(result.earnedAt).toBe('2026-04-10T16:59:00.000Z');
  });

  it('monthlyStreak: bulan dihitung per kalender WIB dan Desember → Januari tetap beruntun', () => {
    const at = (iso: string) => Date.parse(iso);
    // 31 Agu 17.30 UTC = 1 Sep 00.30 WIB → September, bukan Agustus.
    expect(monthlyStreak([at('2026-08-31T17:30:00.000Z'), at('2026-10-05T03:00:00.000Z')]).longest).toBe(2);
    expect(monthlyStreak([at('2026-08-31T16:30:00.000Z'), at('2026-10-05T03:00:00.000Z')]).longest).toBe(1);
    const acrossYear = monthlyStreak([at('2026-11-20T03:00:00.000Z'), at('2026-12-20T03:00:00.000Z'), at('2027-01-20T03:00:00.000Z')]);
    expect(acrossYear.longest).toBe(3);
    expect(acrossYear.reachedAt.map((value) => new Date(value).toISOString())).toEqual([
      '2026-11-20T03:00:00.000Z',
      '2026-12-20T03:00:00.000Z',
      '2027-01-20T03:00:00.000Z',
    ]);
    expect(monthlyStreak([])).toEqual({ longest: 0, reachedAt: [] });
  });

  it('Angkatan Perintis: hanya akun yang lahir sebelum batasnya; sesudah itu lencananya tidak ditampilkan sama sekali', () => {
    const joined = daysAgo(30);
    expect(badge(facts({ memberSince: joined }), 'perintis')).toMatchObject({ tier: 1, earnedAt: joined });
    const keysOf = (memberSince: string | null | undefined) => evaluateBadges(facts({ memberSince }), NOW).map((item) => item.definition.key);
    expect(keysOf(FOUNDING_MEMBER_UNTIL)).not.toContain('perintis');
    expect(keysOf(null)).not.toContain('perintis');
    expect(keysOf(undefined)).not.toContain('perintis');
    expect(keysOf('bukan-tanggal')).not.toContain('perintis');
    // Jam server yang melompat: akun "dibuat besok" tidak diberi lencana.
    expect(keysOf(new Date(NOW.getTime() + 86_400_000).toISOString())).not.toContain('perintis');
  });

  it('setiap lencana punya tingkat yang menaik dan nama tingkat yang unik', () => {
    const titles = new Set<string>();
    for (const definition of BADGES) {
      const thresholds = definition.levels.map((level) => level.threshold);
      expect(thresholds, definition.key).toEqual([...thresholds].sort((a, b) => a - b));
      expect(new Set(thresholds).size, definition.key).toBe(thresholds.length);
      for (const level of definition.levels) {
        expect(titles.has(level.title), level.title).toBe(false);
        titles.add(level.title);
      }
    }
  });
});
