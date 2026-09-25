import { describe, expect, it } from 'vitest';
import { DEMO_DATA_TTL_MS, isDemoStoreExpired } from './index';

describe('isDemoStoreExpired', () => {
  const created = 1_000_000;

  it('masih segar sebelum TTL', () => {
    expect(isDemoStoreExpired(created, created + DEMO_DATA_TTL_MS - 1)).toBe(false);
  });

  it('kedaluwarsa tepat di TTL', () => {
    expect(isDemoStoreExpired(created, created + DEMO_DATA_TTL_MS)).toBe(true);
  });

  it('jam mundur (mis. sinkronisasi NTP) dianggap kedaluwarsa, bukan data abadi', () => {
    expect(isDemoStoreExpired(created, created - 1)).toBe(true);
  });
});
