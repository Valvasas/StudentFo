import { afterEach, describe, expect, it, vi } from 'vitest';
import { notFound, redirect } from 'next/navigation';
import { withFallback } from './fallback';

describe('withFallback', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mengembalikan hasil pemuatan kalau berhasil', async () => {
    await expect(withFallback('x', async () => 7, 0)).resolves.toBe(7);
  });

  it('mengembalikan nilai cadangan kalau pemuatan melempar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await withFallback(
      'notifikasi',
      async () => {
        throw new Error('connection refused');
      },
      [] as readonly string[],
    );
    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('tidak menelan redirect() dan notFound() milik Next.js', async () => {
    await expect(withFallback('x', async () => redirect('/login'), null)).rejects.toThrow();
    await expect(withFallback('x', async () => notFound(), null)).rejects.toThrow();
  });
});
