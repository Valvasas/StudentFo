import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  communityDisplayName,
  COMMUNITY_LIMITS,
  COMMUNITY_TOPIC_LABEL,
  COMMUNITY_TOPICS,
  encodeCommunityCursor,
  hasContactInfo,
  parseCommunityCursor,
  parseCommunityPostForm,
  parseCommunityReply,
  toCommunityTopic,
} from '@/lib/community';

const MIGRATION = readFileSync('supabase/migrations/20261112100002_community.sql', 'utf8');

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe('communityDisplayName (cermin community_display_name)', () => {
  it.each([
    ['Dinda Pratiwi Sari', 'Dinda S.'],
    ['  bima  ', 'bima'],
    ['Rani   prameswari', 'Rani P.'],
    ['', 'Anggota'],
    [null, 'Anggota'],
  ])('%s → %s', (input, expected) => {
    expect(communityDisplayName(input)).toBe(expected);
  });
});

describe('hasContactInfo (cermin community_has_contact)', () => {
  it.each(['hubungi 081234567890 ya', 'WA +62 812-3456-7890', 'email aku: dinda.uji@kampus.ac.id', 'gabung https://chat.whatsapp.com/AbCd', 't.me/grupku'])(
    'menolak: %s',
    (text) => expect(hasContactInfo(text)).toBe(true),
  );
  it.each(['Batas 14 Nov 2026 pukul 08.00 WIB, hadiah Rp 2.500.000', 'Tim 3-5 orang, kode lomba 0812'])('meloloskan: %s', (text) =>
    expect(hasContactInfo(text)).toBe(false),
  );
});

describe('form postingan & balasan', () => {
  const valid = { topic: 'tanya', title: '  Boleh tim lintas kampus?  ', body: 'Ada yang tahu apakah lomba ini boleh tim lintas kampus?', eventId: '' };

  it('isian sah dirapikan; kegiatan opsional', () => {
    expect(parseCommunityPostForm(form(valid))).toEqual({
      ok: true,
      value: { topic: 'tanya', title: 'Boleh tim lintas kampus?', body: valid.body, eventId: null },
    });
    const eventId = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
    expect(parseCommunityPostForm(form({ ...valid, eventId }))).toMatchObject({ ok: true, value: { eventId } });
  });

  it('topik, panjang, dan id kegiatan dari daftar/bentuk tertutup', () => {
    expect(parseCommunityPostForm(form({ ...valid, topic: 'gosip' }))).toEqual({ ok: false, problem: 'invalid' });
    expect(parseCommunityPostForm(form({ ...valid, title: 'Hai' }))).toEqual({ ok: false, problem: 'invalid' });
    expect(parseCommunityPostForm(form({ ...valid, body: 'x'.repeat(COMMUNITY_LIMITS.bodyMax + 1) }))).toEqual({ ok: false, problem: 'invalid' });
    expect(parseCommunityPostForm(form({ ...valid, eventId: '../../etc' }))).toEqual({ ok: false, problem: 'invalid' });
  });

  it('kontak pribadi ditolak dengan masalah tersendiri (pesannya berbeda)', () => {
    expect(parseCommunityPostForm(form({ ...valid, body: 'Yang minat chat 081234567890 ya' }))).toEqual({ ok: false, problem: 'contact' });
    expect(parseCommunityReply('  Hubungi aku di dinda@contoh.id ')).toEqual({ ok: false, problem: 'contact' });
    expect(parseCommunityReply(' Boleh! ')).toEqual({ ok: true, value: 'Boleh!' });
    expect(parseCommunityReply('x')).toEqual({ ok: false, problem: 'invalid' });
  });
});

describe('kursor lini masa', () => {
  it('pulang-pergi; nilai rusak ditolak', () => {
    const cursor = { at: '2026-11-12T03:00:00.000Z', id: '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b' };
    expect(parseCommunityCursor(encodeCommunityCursor(cursor))).toEqual(cursor);
    for (const bad of ['', 'abc', '2026-11-12_bukan-uuid', 'bukan-tanggal_3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b', `${'x'.repeat(90)}`]) {
      expect(parseCommunityCursor(bad)).toBeNull();
    }
  });
});

describe('kode dan SQL sepakat (migration 20261112100002)', () => {
  it('topik = CHECK community_posts.topic, semuanya berlabel', () => {
    const check = /topic\s+VARCHAR\(16\) NOT NULL CHECK \(topic IN \(([^)]+)\)\)/.exec(MIGRATION);
    expect(check?.[1]?.split(',').map((value) => value.trim().replace(/'/g, ''))).toEqual([...COMMUNITY_TOPICS]);
    expect(Object.keys(COMMUNITY_TOPIC_LABEL).sort()).toEqual([...COMMUNITY_TOPICS].sort());
    expect(toCommunityTopic('cari-tim')).toBe('cari-tim');
    expect(toCommunityTopic('CARI-TIM')).toBeNull();
  });

  it('batas panjang & laju = CHECK dan consume_rate_limit()', () => {
    expect(MIGRATION).toContain(`char_length(btrim(title)) BETWEEN ${COMMUNITY_LIMITS.titleMin} AND ${COMMUNITY_LIMITS.titleMax}`);
    expect(MIGRATION).toContain(`char_length(btrim(body)) BETWEEN ${COMMUNITY_LIMITS.bodyMin} AND ${COMMUNITY_LIMITS.bodyMax}`);
    expect(MIGRATION).toContain(`char_length(btrim(body)) BETWEEN ${COMMUNITY_LIMITS.replyMin} AND ${COMMUNITY_LIMITS.replyMax}`);
    expect(MIGRATION).toContain(`'community-post:' || uid::text, ${COMMUNITY_LIMITS.postsPerDay}, 86400`);
    expect(MIGRATION).toContain(`'community-reply:' || uid::text, ${COMMUNITY_LIMITS.repliesPerDay}, 86400`);
    expect(MIGRATION).toContain(`'community-helpful:' || uid::text, ${COMMUNITY_LIMITS.helpfulPerDay}, 86400`);
    expect(MIGRATION).toContain(`IF reporters >= ${COMMUNITY_LIMITS.autoHideReporters} THEN`);
  });

  it('fungsi baru tertutup bagi anon; moderasi hanya service_role', () => {
    expect(MIGRATION).not.toMatch(/GRANT [^;]+ TO anon/);
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_resolve_community_report\([^)]*\) TO service_role;/);
    expect(MIGRATION).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_[a-z_]+\([^)]*\) TO authenticated/);
  });
});
