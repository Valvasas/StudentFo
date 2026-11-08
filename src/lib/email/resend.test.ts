import { describe, expect, it, vi } from 'vitest';
import type { OutgoingEmail } from './deadline-email';
import { RESEND_BATCH_MAX, sendResendBatch } from './resend';

const email: OutgoingEmail = { to: 'ana@contoh.id', subject: 'S', text: 'T', html: '<p>H</p>', headers: { 'List-Unsubscribe': '<https://x>' } };

describe('sendResendBatch', () => {
  it('satu POST batch dengan kunci & pengirim; header ikut', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"data":[{"id":"1"}]}', { status: 200 }));
    expect(await sendResendBatch([email, email], { apiKey: 're_kunci', from: 'StudentFo <p@x.id>', fetchImpl })).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails/batch');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_kunci');
    expect(JSON.parse(init.body as string)).toEqual([
      { from: 'StudentFo <p@x.id>', to: ['ana@contoh.id'], subject: 'S', text: 'T', html: '<p>H</p>', headers: { 'List-Unsubscribe': '<https://x>' } },
      { from: 'StudentFo <p@x.id>', to: ['ana@contoh.id'], subject: 'S', text: 'T', html: '<p>H</p>', headers: { 'List-Unsubscribe': '<https://x>' } },
    ]);
  });

  it('gagal = ok:false dengan status; alamat penerima di pesan galat disamarkan', async () => {
    const fetchImpl = vi.fn(async () => new Response('Invalid `to` field: ana@contoh.id', { status: 422 }));
    expect(await sendResendBatch([email], { apiKey: 'k', from: 'p@x.id', fetchImpl })).toEqual({ ok: false, status: 422, detail: 'Invalid `to` field: [email]' });
    const network = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    expect(await sendResendBatch([email], { apiKey: 'k', from: 'p@x.id', fetchImpl: network })).toMatchObject({ ok: false, status: 0 });
  });

  it('kosong = tidak memanggil apa pun; di atas batas batch = galat pemrograman', async () => {
    const fetchImpl = vi.fn();
    expect(await sendResendBatch([], { apiKey: 'k', from: 'p@x.id', fetchImpl })).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(sendResendBatch(Array(RESEND_BATCH_MAX + 1).fill(email), { apiKey: 'k', from: 'p@x.id', fetchImpl })).rejects.toThrow();
  });
});
