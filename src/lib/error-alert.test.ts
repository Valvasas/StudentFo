import { describe, expect, it } from 'vitest';
import { AlertThrottle, alertBody, toRequestErrorEntry } from './error-alert';

const context = { routePath: '/events/[slug]', routeType: 'render' };

describe('toRequestErrorEntry', () => {
  it('membuang query string dan memangkas pesan', () => {
    const error = Object.assign(new Error(`gagal\n${'x'.repeat(400)}`), { digest: 'abc' });
    const entry = toRequestErrorEntry(error, { path: '/auth/callback?code=RAHASIA&email=a@b.c', method: 'GET' }, context, new Date('2026-10-31T00:00:00Z'));
    expect(entry.path).toBe('/auth/callback');
    expect(entry.message.length).toBe(300);
    expect(entry.message).not.toContain('\n');
    expect(entry).toMatchObject({ digest: 'abc', method: 'GET', at: '2026-10-31T00:00:00.000Z', routeType: 'render' });
  });

  it('menerima galat bukan Error', () => {
    expect(toRequestErrorEntry('meledak', { path: '/', method: 'POST' }, context).message).toBe('meledak');
  });
});

describe('AlertThrottle', () => {
  const entry = (message: string) => toRequestErrorEntry(new Error(message), { path: '/', method: 'GET' }, context);

  it('galat yang sama sekali per jendela; galat lain tetap lolos', () => {
    const throttle = new AlertThrottle(60_000, 10);
    expect(throttle.shouldSend(entry('A'), 0)).toBe(true);
    expect(throttle.shouldSend(entry('A'), 1_000)).toBe(false);
    expect(throttle.shouldSend(entry('B'), 1_000)).toBe(true);
    expect(throttle.shouldSend(entry('A'), 61_000)).toBe(true);
  });

  it('total kiriman per jendela dibatasi', () => {
    const throttle = new AlertThrottle(60_000, 2);
    expect(throttle.shouldSend(entry('1'), 0)).toBe(true);
    expect(throttle.shouldSend(entry('2'), 0)).toBe(true);
    expect(throttle.shouldSend(entry('3'), 0)).toBe(false);
  });
});

describe('alertBody', () => {
  it('berisi kunci Slack dan Discord', () => {
    const body = alertBody(toRequestErrorEntry(new Error('db mati'), { path: '/events', method: 'GET' }, context), 'studentfo.id');
    expect(body.text).toContain('GET /events');
    expect(body.content).toBe(body.text);
  });
});
