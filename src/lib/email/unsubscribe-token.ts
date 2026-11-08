import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Tautan berhenti-langganan di setiap email (ADR-062 #6): `<userId>.<hmac>`.
 * Berlaku tanpa masuk akun — orang yang mau berhenti tidak boleh dipaksa
 * mengingat sandi dulu. Tanpa kedaluwarsa (tautan di email lama tetap harus
 * bisa menghentikan email); dampak terburuk tautan bocor = berhenti menerima
 * pengingat, yang bisa dinyalakan lagi dari Pengaturan.
 */
const PURPOSE = 'deadline-email-unsubscribe:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signature(userId: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${PURPOSE}:${userId.toLowerCase()}`).digest();
}

export function createUnsubscribeToken(userId: string, secret: string): string {
  return `${userId.toLowerCase()}.${signature(userId, secret).toString('base64url')}`;
}

/** userId bila token sah, selain itu null — tidak membedakan alasan gagalnya. */
export function verifyUnsubscribeToken(token: string | null | undefined, secret: string | undefined): string | null {
  if (!token || !secret || token.length > 200) return null;
  const [userId, signed, extra] = token.split('.');
  if (!userId || !signed || extra !== undefined || !UUID.test(userId)) return null;
  const expected = signature(userId, secret);
  const actual = Buffer.from(signed, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? userId.toLowerCase() : null;
}
