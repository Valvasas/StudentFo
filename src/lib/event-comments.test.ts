import { describe, expect, it } from 'vitest';
import type { EventComment } from '@/types/domain';
import { buildCommentThreads, countComments, EVENT_COMMENT_LIMITS, parseEventComment } from './event-comments';

const author = { name: 'Dinda P.', username: null, avatarId: null };
const comment = (id: string, createdAt: string, parentId: string | null = null): EventComment => ({
  id,
  parentId,
  body: `isi ${id}`,
  author,
  role: null,
  isMine: false,
  createdAt,
});

describe('parseEventComment', () => {
  it('memangkas spasi & menyeragamkan baris baru (CRLF = satu karakter seperti di peramban)', () => {
    expect(parseEventComment('  halo\r\nsemua  ')).toEqual({ ok: true, value: 'halo\nsemua' });
    const full = 'a'.repeat(EVENT_COMMENT_LIMITS.bodyMax - 1) + '\r\n';
    expect(parseEventComment(full).ok).toBe(true);
  });

  it('menolak terlalu pendek/panjang', () => {
    expect(parseEventComment(' a ')).toEqual({ ok: false, problem: 'invalid' });
    expect(parseEventComment('a'.repeat(EVENT_COMMENT_LIMITS.bodyMax + 1))).toEqual({ ok: false, problem: 'invalid' });
  });

  it('menolak kontak pribadi dengan penyaring yang sama dengan Komunitas', () => {
    expect(parseEventComment('chat aku 081234567890')).toEqual({ ok: false, problem: 'contact' });
    expect(parseEventComment('gabung t.me/grupku')).toEqual({ ok: false, problem: 'contact' });
    expect(parseEventComment('Batas 14 Nov pukul 08.00, hadiah Rp 2.500.000').ok).toBe(true);
  });
});

describe('buildCommentThreads', () => {
  it('utama terbaru dulu, balasan lama → baru, balasan yatim dibuang', () => {
    const threads = buildCommentThreads([
      comment('a', '2026-11-10T01:00:00Z'),
      comment('b', '2026-11-12T01:00:00Z'),
      comment('a2', '2026-11-11T03:00:00Z', 'a'),
      comment('a1', '2026-11-11T01:00:00Z', 'a'),
      comment('x1', '2026-11-11T01:00:00Z', 'tidak-termuat'),
    ]);
    expect(threads.map((thread) => thread.id)).toEqual(['b', 'a']);
    expect(threads[1]?.replies.map((reply) => reply.id)).toEqual(['a1', 'a2']);
    expect(countComments(threads)).toBe(4);
  });
});
