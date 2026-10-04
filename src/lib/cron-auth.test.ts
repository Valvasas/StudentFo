import { describe, expect, it } from 'vitest';
import { isAuthorizedCronRequest } from './cron-auth';

const SECRET = 'r'.repeat(40);

describe('isAuthorizedCronRequest', () => {
  it('hanya Bearer dengan rahasia persis', () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${SECRET.slice(1)}`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Basic ${SECRET}`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(null, SECRET)).toBe(false);
  });

  it('gagal tertutup bila rahasia tidak dipasang atau terlalu lemah', () => {
    expect(isAuthorizedCronRequest('Bearer ', undefined)).toBe(false);
    expect(isAuthorizedCronRequest('Bearer undefined', undefined)).toBe(false);
    expect(isAuthorizedCronRequest('Bearer pendek', 'pendek')).toBe(false);
  });
});
