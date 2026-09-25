import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DEMO_SESSION_MAX_AGE_SECONDS,
  decodeDemoSession,
  encodeDemoSession,
  type DemoSession,
} from './session-token';

const SECRET = 'a'.repeat(64);
const NOW = 1_790_000_000;

const session: DemoSession = {
  v: 1,
  uid: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90',
  persona: 'mahasiswa',
  role: 'USER',
  fullName: 'Dinda Pratiwi',
  educationLevel: 'D4_S1',
  major: 'Rekayasa Perangkat Lunak',
  interests: ['teknologi', 'desain'],
  iat: NOW,
};

function tamperBody(token: string, patch: Partial<DemoSession>): string {
  const [body, signature] = token.split('.') as [string, string];
  const json = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  return `${Buffer.from(JSON.stringify({ ...json, ...patch })).toString('base64url')}.${signature}`;
}

describe('encode/decodeDemoSession', () => {
  it('bolak-balik tanpa kehilangan data', () => {
    expect(decodeDemoSession(encodeDemoSession(session, SECRET), SECRET, NOW)).toEqual(session);
  });

  it('menolak eskalasi peran lewat edit isi cookie', () => {
    const forged = tamperBody(encodeDemoSession(session, SECRET), { role: 'ADMIN' });
    expect(decodeDemoSession(forged, SECRET, NOW)).toBeNull();
  });

  it('menolak token yang ditandatangani rahasia lain', () => {
    const token = encodeDemoSession(session, 'b'.repeat(64));
    expect(decodeDemoSession(token, SECRET, NOW)).toBeNull();
  });

  it('menolak token kedaluwarsa dan iat dari masa depan', () => {
    const token = encodeDemoSession(session, SECRET);
    expect(decodeDemoSession(token, SECRET, NOW + DEMO_SESSION_MAX_AGE_SECONDS + 1)).toBeNull();
    expect(decodeDemoSession(token, SECRET, NOW - 3600)).toBeNull();
  });

  it.each([
    ['kosong', ''],
    ['tanpa titik', 'abc'],
    ['tiga bagian', 'a.b.c'],
    ['tanda tangan beda panjang', 'eyJ2IjoxfQ.x'],
    ['terlalu panjang', `${'a'.repeat(5000)}.b`],
  ])('menolak format rusak: %s', (_, token) => {
    expect(decodeDemoSession(token, SECRET, NOW)).toBeNull();
  });

  it('menolak payload bertanda tangan sah tapi tidak sesuai skema', () => {
    // Penanda tangan jujur, isi keliru (persona tak dikenal) — skema tetap penjaga terakhir.
    const body = Buffer.from(JSON.stringify({ ...session, persona: 'superadmin' })).toString('base64url');
    const signature = createHmac('sha256', SECRET).update(body).digest('base64url');
    expect(decodeDemoSession(`${body}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it('encode menolak sesi yang tidak valid alih-alih menerbitkan token rusak', () => {
    expect(() => encodeDemoSession({ ...session, uid: 'bukan-uuid' }, SECRET)).toThrow();
  });
});
