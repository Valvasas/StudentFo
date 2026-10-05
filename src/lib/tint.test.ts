import { describe, expect, it } from 'vitest';
import { coverTintOf, TINTS, tintOf } from './tint';

describe('tintOf', () => {
  it('deterministik: id yang sama selalu tint yang sama', () => {
    expect(tintOf('seed-user-1')).toBe(tintOf('seed-user-1'));
    expect(tintOf('')).toBe(tintOf(''));
  });

  it('selalu salah satu dari lima tint', () => {
    for (const seed of ['a', 'Rani Prameswari', '73c3186a-4240-44cd-9cee-b7ad031e8351', '🙂', 'x'.repeat(500)]) {
      expect(TINTS).toContain(tintOf(seed));
    }
  });

  it('id berurutan tersebar ke beberapa tint, tidak menumpuk di satu warna', () => {
    const used = new Set(Array.from({ length: 12 }, (_, index) => tintOf(`seed-user-${index + 1}`)));
    expect(used.size).toBeGreaterThanOrEqual(4);
  });
});

describe('coverTintOf', () => {
  it('tidak pernah sama dengan tint avatar dari id yang sama', () => {
    for (let index = 0; index < 50; index += 1) {
      const seed = `seed-user-${index}`;
      expect(coverTintOf(seed)).not.toBe(tintOf(seed));
    }
  });
});
