import { describe, expect, it } from 'vitest';
import { hideGettingStartedFor, isGettingStartedHidden } from './getting-started';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('panduan Mulai di sini', () => {
  it('disembunyikan per akun, bukan per perangkat', () => {
    const value = hideGettingStartedFor(undefined, A);
    expect(isGettingStartedHidden(value, A)).toBe(true);
    expect(isGettingStartedHidden(value, B)).toBe(false);
  });

  it('mengingat beberapa akun tanpa duplikat dan tanpa tumbuh tak terbatas', () => {
    let value = hideGettingStartedFor(undefined, A);
    value = hideGettingStartedFor(value, A);
    expect(value).toBe(A);
    for (let index = 0; index < 8; index += 1) value = hideGettingStartedFor(value, `${index}`.repeat(8));
    expect(value.split('.')).toHaveLength(5);
    expect(isGettingStartedHidden(value, A)).toBe(false);
  });

  it('isi cookie yang diubah tangan diabaikan', () => {
    expect(isGettingStartedHidden(`<script>.${A}`, A)).toBe(true);
    expect(hideGettingStartedFor('x y;z', B)).toBe(B);
  });
});
