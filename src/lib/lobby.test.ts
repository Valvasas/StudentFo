import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOBBY_INTENTS, type EventSummary, type LobbyMember } from '@/types/domain';
import { hasRegistered, isLobbyEvent, isLobbyOpen, lobbyEventsOf, parseLobbyMember, rankLobbyMembers } from './lobby';

const now = new Date('2026-11-08T03:00:00Z');

describe('aturan lobi ↔ SQL (migration 20261108100003)', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261108100003_event_lobby.sql', import.meta.url), 'utf8');

  it('daftar status lobi identik dengan CHECK `intent`', () => {
    const check = /intent\s+VARCHAR\(12\) NOT NULL CHECK \(intent IN \(([^)]+)\)\)/.exec(sql)?.[1] ?? '';
    expect(check.split(',').map((value) => value.trim().replace(/'/g, ''))).toEqual([...LOBBY_INTENTS]);
  });

  it('tahap Papan lamaran & status pendaftaran yang dihitung sama dengan can_use_lobby()', () => {
    expect(sql).toContain("t.status IN ('APPLIED', 'INTERVIEW', 'ACCEPTED')");
    expect(sql).toContain("r.status IN ('AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED')");
  });
});

describe('kelayakan', () => {
  it('"sudah mendaftar" = Papan lamaran Sudah daftar ke atas, atau pendaftaran formulir yang masih hidup', () => {
    expect(hasRegistered('SAVED', null)).toBe(false);
    expect(hasRegistered('APPLIED', null)).toBe(true);
    expect(hasRegistered('REJECTED', null)).toBe(false);
    expect(hasRegistered(null, 'AWAITING_PAYMENT')).toBe(true);
    expect(hasRegistered(null, 'CANCELLED')).toBe(false);
    expect(hasRegistered(null, 'REJECTED')).toBe(false);
  });

  it('hanya lomba yang pernah tayang', () => {
    expect(isLobbyEvent({ eventType: 'LOMBA', status: 'APPROVED' })).toBe(true);
    expect(isLobbyEvent({ eventType: 'LOMBA', status: 'EXPIRED' })).toBe(true);
    expect(isLobbyEvent({ eventType: 'LOMBA', status: 'PENDING' })).toBe(false);
    expect(isLobbyEvent({ eventType: 'BEASISWA', status: 'APPROVED' })).toBe(false);
    expect(isLobbyEvent({ eventType: null, status: null })).toBe(false);
  });

  it('terbuka = tayang dan tenggat utama belum lewat (tanpa tenggat = terbuka)', () => {
    expect(isLobbyOpen({ status: 'APPROVED', primaryDeadlineAt: '2026-11-09T00:00:00Z' }, now)).toBe(true);
    expect(isLobbyOpen({ status: 'APPROVED', primaryDeadlineAt: '2026-11-08T03:00:00Z' }, now)).toBe(false);
    expect(isLobbyOpen({ status: 'APPROVED', primaryDeadlineAt: null }, now)).toBe(true);
    expect(isLobbyOpen({ status: 'EXPIRED', primaryDeadlineAt: null }, now)).toBe(false);
  });
});

describe('lobbyEventsOf', () => {
  const event = (id: string, overrides: Partial<EventSummary> = {}) =>
    ({ id, slug: id, title: `Lomba ${id}`, organizer: 'Panitia', status: 'APPROVED', eventType: 'LOMBA', primaryDeadlineAt: '2026-11-20T00:00:00Z', ...overrides }) as EventSummary;

  it('satu lomba sekali dari dua sumber; yang buka dulu, tenggat terdekat dulu', () => {
    const events = lobbyEventsOf(
      [
        { status: 'APPLIED', event: event('b', { primaryDeadlineAt: '2026-11-30T00:00:00Z' }) },
        { status: 'SAVED', event: event('c') },
        { status: 'APPLIED', event: event('tutup', { status: 'EXPIRED' }) },
        { status: 'APPLIED', event: event('beasiswa', { eventType: 'BEASISWA' }) },
      ],
      [
        { status: 'CONFIRMED', event: { ...event('a'), eventType: 'LOMBA', status: 'APPROVED' } },
        { status: 'CONFIRMED', event: { ...event('b'), eventType: 'LOMBA', status: 'APPROVED' } },
        { status: 'CANCELLED', event: { ...event('d'), eventType: 'LOMBA', status: 'APPROVED' } },
      ],
      now,
    );
    expect(events.map((item) => item.id)).toEqual(['a', 'b', 'tutup']);
  });
});

describe('rankLobbyMembers', () => {
  const member = (fullName: string, intent: LobbyMember['intent'], relation: LobbyMember['relation'] = 'none', joinedAt = '2026-11-01T00:00:00Z'): LobbyMember => ({
    userId: fullName,
    fullName,
    intent,
    note: null,
    joinedAt,
    relation,
  });

  it('pencari tim melihat tim yang butuh anggota dulu, lalu koneksi, lalu yang terbaru', () => {
    const ranked = rankLobbyMembers(
      [member('Siap', 'SIAP'), member('Koneksi', 'CARI_TIM', 'connected'), member('Tim', 'CARI_ANGGOTA'), member('Baru', 'CARI_TIM', 'none', '2026-11-05T00:00:00Z')],
      'CARI_TIM',
    );
    expect(ranked.map((item) => item.fullName)).toEqual(['Tim', 'Koneksi', 'Baru', 'Siap']);
  });
});

describe('parseLobbyMember', () => {
  const form = (intent: string, note: string) => {
    const data = new FormData();
    data.append('intent', intent);
    data.append('note', note);
    return data;
  };

  it('catatan dirapikan, kosong = null, maksimal 160; status dari daftar tertutup', () => {
    expect(parseLobbyMember(form('CARI_TIM', '  Bisa   UI  ')).data).toEqual({ intent: 'CARI_TIM', note: 'Bisa UI' });
    expect(parseLobbyMember(form('SIAP', '')).data).toEqual({ intent: 'SIAP', note: null });
    expect(parseLobbyMember(form('CARI_TIM', 'x'.repeat(161))).success).toBe(false);
    expect(parseLobbyMember(form('ADMIN', '')).success).toBe(false);
  });
});
