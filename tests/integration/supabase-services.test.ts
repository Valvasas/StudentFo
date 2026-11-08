import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { readAdminMfaStep, startTotpEnrollment, verifiedTotpFactorId, verifyTotp } from '@/lib/admin-mfa';
import { mapSupabaseAuthError } from '@/lib/auth-messages';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { actAs, adminClient, createEvent, createUser, sessionClient, sql } from './harness';
import { totp } from './totp';

/**
 * Perilaku yang HANYA bisa dibuktikan dengan GoTrue & Storage sungguhan
 * (ADR-061): penangguhan lewat `banned_until`, hapus akun dengan skema `auth`
 * asli (identities, sessions, refresh_tokens…), dan penghapusan berkas Storage.
 * Jalan lewat `npm run test:integration:services` (Docker); dilewati di
 * `test:integration` biasa.
 */
const GOTRUE = process.env.GOTRUE_URL;
const STORAGE = process.env.STORAGE_URL;
const repo = new SupabaseEventRepository(noCache);

interface AuthResult {
  readonly status: number;
  readonly body: { access_token?: string; refresh_token?: string; user?: { id: string }; error_code?: string; code?: string | number };
}

async function auth(path: string, payload: Record<string, unknown>): Promise<AuthResult> {
  const response = await fetch(`${GOTRUE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

const signUp = async (email: string, password: string) => auth('/signup', { email, password, data: { full_name: `Uji ${email.slice(0, 8)}` } });
const signIn = async (email: string, password: string) => auth('/token?grant_type=password', { email, password });
const refresh = async (refreshToken: string) => auth('/token?grant_type=refresh_token', { refresh_token: refreshToken });

beforeEach(() => actAs(null));

describe.skipIf(!GOTRUE || !STORAGE)('Supabase sungguhan: GoTrue & Storage', () => {
  it('pendaftaran lewat GoTrue mengisi public.users lewat trigger handle_new_user()', async () => {
    const email = `daftar-${randomUUID()}@uji.example`;
    const { status, body } = await signUp(email, 'rahasia-kuat-123');
    expect(status).toBe(200);
    expect(sql(`SELECT email FROM public.users WHERE id = '${body.user!.id}'`)).toBe(email);
  });

  it('penangguhan: GoTrue menolak masuk & penyegaran; aplikasi memetakannya ke "kredensial salah"; dicabut → bisa masuk lagi', async () => {
    const admin = createUser({ role: 'ADMIN' });
    const email = `tangguh-${randomUUID()}@uji.example`;
    const password = 'rahasia-kuat-123';
    const created = await signUp(email, password);
    const userId = created.body.user!.id;
    const session = await signIn(email, password);
    expect(session.status).toBe(200);

    await repo.setUserSuspension({ userId, actorId: admin, suspend: true, reason: 'Uji penangguhan GoTrue' });

    const blocked = await signIn(email, password);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error_code).toBe('user_banned');
    expect(mapSupabaseAuthError({ code: blocked.body.error_code, status: blocked.status })).toBe('invalid_credentials');
    // Sesi lama diputus: refresh token yang dicuri pun tidak bisa memperpanjang akses.
    expect((await refresh(session.body.refresh_token!)).status).toBeGreaterThanOrEqual(400);

    await repo.setUserSuspension({ userId, actorId: admin, suspend: false, reason: null });
    expect((await signIn(email, password)).status).toBe(200);
  });

  it('hapus akun: berkas bukti bayar hilang dari Storage, baris auth asli ikut terhapus, tidak bisa masuk lagi', async () => {
    const admin = createUser({ role: 'ADMIN' });
    const email = `pamit-${randomUUID()}@uji.example`;
    const password = 'rahasia-kuat-123';
    const userId = (await signUp(email, password)).body.user!.id;
    await signIn(email, password);
    const event = createEvent();
    const proofPath = `${event.id}/${randomUUID()}.jpg`;

    const upload = await adminClient()
      .storage.from('payment-proofs')
      .upload(proofPath, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
    expect(upload.error).toBeNull();
    sql(`INSERT INTO public.event_registrations (code, event_id, user_id, full_name, email, status, fee_amount, proof_path)
         VALUES ('SF-${randomUUID().slice(0, 8).toUpperCase()}', '${event.id}', '${userId}', 'Pamit', '${email}', 'PAYMENT_REVIEW', 50000, '${proofPath}')`);
    expect(sql(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'payment-proofs' AND name = '${proofPath}'`)).toBe('1');
    expect(Number(sql(`SELECT count(*) FROM auth.identities WHERE user_id = '${userId}'`))).toBeGreaterThan(0);
    expect(Number(sql(`SELECT count(*) FROM auth.sessions WHERE user_id = '${userId}'`))).toBeGreaterThan(0);

    await repo.deleteAccount({ userId, actorId: admin, reason: 'Permintaan lewat email (uji)' });

    expect(sql(`SELECT count(*) FROM storage.objects WHERE name = '${proofPath}'`)).toBe('0');
    expect((await adminClient().storage.from('payment-proofs').download(proofPath)).error).not.toBeNull();
    for (const table of ['auth.users', 'auth.identities', 'auth.sessions', 'public.users', 'public.event_registrations']) {
      const column = table === 'auth.users' || table === 'public.users' ? 'id' : 'user_id';
      expect(sql(`SELECT count(*) FROM ${table} WHERE ${column} = '${userId}'`), table).toBe('0');
    }
    const after = await signIn(email, password);
    expect(after.status).toBe(400);
    expect(mapSupabaseAuthError({ code: after.body.error_code, status: after.status })).toBe('invalid_credentials');
  });

  it('MFA admin: sandi saja (aal1) tidak membuka is_admin(); TOTP terpasang → aal2 → terbuka; masuk lagi → diminta kode', async () => {
    const email = `admin-mfa-${randomUUID()}@uji.example`;
    const password = 'rahasia-kuat-123';
    const adminId = (await signUp(email, password)).body.user!.id;
    sql(`UPDATE public.users SET role = 'ADMIN' WHERE id = '${adminId}'`);
    sql(`INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id)
         VALUES ('event', gen_random_uuid(), 'Log uji MFA', 'PENDING', 'APPROVED', '${adminId}')`);
    const visibleLog = async (client: ReturnType<typeof sessionClient>) =>
      (await client.from('moderation_log').select('id').eq('actor_id', adminId)).data?.length ?? -1;

    const browser = sessionClient();
    expect((await browser.auth.signInWithPassword({ email, password })).error).toBeNull();
    expect(await readAdminMfaStep(browser)).toBe('enroll');
    expect(await visibleLog(browser)).toBe(0);

    // Dua kali "tampilkan kode QR": faktor belum-terverifikasi lama dibersihkan.
    await startTotpEnrollment(browser);
    const enrollment = (await startTotpEnrollment(browser))!;
    // SVG GoTrue memuat `#` (warna); tanpa encode, peramban memotongnya sebagai fragmen URL.
    expect(enrollment.qrCode.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(enrollment.qrCode).not.toContain('#');
    expect(decodeURIComponent(enrollment.qrCode.slice(enrollment.qrCode.indexOf(',') + 1))).toMatch(/<svg[\s\S]*<\/svg>\s*$/);
    expect((await browser.auth.mfa.listFactors()).data!.all.filter((factor) => factor.status === 'unverified')).toHaveLength(1);

    const wrong = String((Number(totp(enrollment.secret)) + 500_000) % 1_000_000).padStart(6, '0');
    expect(await verifyTotp(browser, enrollment.factorId, wrong)).toBe('invalid');
    expect(await verifyTotp(browser, enrollment.factorId, totp(enrollment.secret))).toBe('ok');
    expect(await readAdminMfaStep(browser)).toBeNull();
    expect(await visibleLog(browser)).toBe(1);

    // Sesi baru (perangkat lain / masuk ulang) mulai dari aal1 lagi.
    const again = sessionClient();
    await again.auth.signInWithPassword({ email, password });
    expect(await readAdminMfaStep(again)).toBe('verify');
    expect(await visibleLog(again)).toBe(0);
    const factorId = await verifiedTotpFactorId(again);
    expect(factorId).toBe(enrollment.factorId);
    // Langkah waktu berikutnya: kode yang sama tidak dipakai dua kali.
    expect(await verifyTotp(again, factorId!, totp(enrollment.secret, Date.now() + 30_000))).toBe('ok');
    expect(await visibleLog(again)).toBe(1);
  });

  it('hapus akun sendiri tanpa berkas: tidak memanggil Storage dengan daftar kosong, tidak tercatat sebagai moderasi', async () => {
    const email = `mandiri-${randomUUID()}@uji.example`;
    const userId = (await signUp(email, 'rahasia-kuat-123')).body.user!.id;
    await repo.deleteAccount({ userId, actorId: userId, reason: null });
    expect(sql(`SELECT count(*) FROM auth.users WHERE id = '${userId}'`)).toBe('0');
    expect(sql(`SELECT count(*) FROM public.moderation_log WHERE subject_id = '${userId}'`)).toBe('0');
  });
});
