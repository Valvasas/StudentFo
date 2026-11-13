import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { UploadedImage } from '@/lib/image-file';
import type { NetworkViewer } from '@/lib/network';
import { PROFILE_MEDIA_RATE_LIMIT } from '@/lib/profile-media';
import { MemoryEventRepository } from './memory-repository';
import type { MediaViewer } from './repository';

/**
 * Foto profil & banner (ADR-083) di mode seed — skenario yang sama dengan
 * supabase/tests/116_profile_media.test.sql: menulis hanya milik sendiri,
 * siapa-melihat = aturan detail profil (ADR-077), berkas lama tidak pernah
 * tertinggal, dan moderator bisa mencabut dengan alasan tercatat.
 */

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

const person = (id: string): NetworkViewer => ({ id, fullName: `Nama ${id}`, educationLevel: 'D4_S1', major: null, interests: [] });
const ana = person('ana');
const budi = person('budi');
const viewer = (id: string, isAdmin = false): MediaViewer => ({ id, isAdmin });
const image = (fill = 1): UploadedImage => ({ type: 'image/png', width: 400, height: 400, bytes: new Uint8Array(256).fill(fill) });

describe('MemoryEventRepository — foto profil & banner', () => {
  let repository: MemoryEventRepository;

  beforeEach(async () => {
    repository = new MemoryEventRepository(new Date('2026-11-10T03:00:00Z'));
    // Ana anggota yang bisa ditemukan; Budi pembaca biasa.
    await repository.updateNetworkProfile(ana, { discoverable: true, headline: null });
    await repository.updateNetworkProfile(budi, { discoverable: true, headline: null });
  });

  it('bawaan kosong; pemilik selalu membaca miliknya', async () => {
    expect(await repository.getOwnProfileMedia('orang-baru')).toEqual({ avatarId: null, bannerId: null, bannerPreset: null, available: true });
    expect((await repository.listProfileMedia('budi', ['orang-baru'])).size).toBe(0);
  });

  it('memasang foto: berkasnya terbaca pemilik & anggota yang boleh melihat profilnya; tamu tidak', async () => {
    await repository.setProfileImage('ana', 'avatar', image(7));
    const own = await repository.getOwnProfileMedia('ana');
    expect(own.avatarId).toMatch(/^[0-9a-f-]{36}$/);

    const file = await repository.getProfileMediaFile(viewer('ana'), own.avatarId!);
    expect(file?.contentType).toBe('image/png');
    expect(file?.bytes[0]).toBe(7);

    expect(await repository.getProfileMediaFile(viewer('budi'), own.avatarId!)).not.toBeNull();
    expect((await repository.listProfileMedia('budi', ['ana'])).get('ana')?.avatarId).toBe(own.avatarId);
    expect(await repository.getProfileMediaFile(null, own.avatarId!)).toBeNull();
    expect(await repository.getProfileMediaFile(viewer('budi'), '../../etc/passwd')).toBeNull();
  });

  it('mengganti foto membuang berkas lama; foto & banner berdiri sendiri', async () => {
    await repository.setProfileImage('ana', 'avatar', image(1));
    await repository.setProfileImage('ana', 'banner', image(2));
    const first = await repository.getOwnProfileMedia('ana');

    await repository.setProfileImage('ana', 'avatar', image(3));
    const second = await repository.getOwnProfileMedia('ana');
    expect(second.avatarId).not.toBe(first.avatarId);
    expect(second.bannerId).toBe(first.bannerId);
    expect(await repository.getProfileMediaFile(viewer('ana'), first.avatarId!)).toBeNull();

    await repository.removeProfileImage('ana', 'banner');
    const third = await repository.getOwnProfileMedia('ana');
    expect(third).toMatchObject({ avatarId: second.avatarId, bannerId: null });
    expect(await repository.getProfileMediaFile(viewer('ana'), first.bannerId!)).toBeNull();
    // Menghapus yang sudah kosong bukan kegagalan.
    await repository.removeProfileImage('ana', 'banner');
  });

  it('banner bawaan tersimpan terpisah dari unggahan dan ikut terlihat pembaca', async () => {
    await repository.setBannerPreset('ana', 'ombak');
    expect((await repository.listProfileMedia('budi', ['ana'])).get('ana')).toEqual({ avatarId: null, bannerId: null, bannerPreset: 'ombak' });
    await repository.setProfileImage('ana', 'banner', image());
    expect((await repository.getOwnProfileMedia('ana')).bannerPreset).toBe('ombak');
    await repository.setBannerPreset('ana', null);
    expect((await repository.getOwnProfileMedia('ana')).bannerPreset).toBeNull();
  });

  it('profil "hanya koneksi" tertutup bagi orang asing, terbuka bagi koneksinya', async () => {
    // seed-user-14 = visibilitas NETWORK & tidak bisa ditemukan; seed-user-1 koneksinya (seed).
    expect((await repository.listProfileMedia('budi', ['seed-user-14'])).size).toBe(0);
    expect((await repository.listProfileMedia('seed-user-1', ['seed-user-14'])).get('seed-user-14')?.bannerPreset).toBe('bintang');

    await repository.setProfileImage('seed-user-14', 'avatar', image());
    const { avatarId } = await repository.getOwnProfileMedia('seed-user-14');
    expect(await repository.getProfileMediaFile(viewer('budi'), avatarId!)).toBeNull();
    expect(await repository.getProfileMediaFile(viewer('seed-user-1'), avatarId!)).not.toBeNull();
  });

  it('memblokir atau menangguhkan menutup gambarnya', async () => {
    await repository.setProfileImage('ana', 'avatar', image());
    const { avatarId } = await repository.getOwnProfileMedia('ana');

    await repository.blockPerson('ana', 'budi');
    expect(await repository.getProfileMediaFile(viewer('budi'), avatarId!)).toBeNull();
    expect((await repository.listProfileMedia('budi', ['ana'])).size).toBe(0);
    await repository.unblockPerson('ana', 'budi');
    expect(await repository.getProfileMediaFile(viewer('budi'), avatarId!)).not.toBeNull();

    await repository.setUserSuspension({ userId: 'ana', actorId: 'admin', actorName: 'Admin', suspend: true, reason: 'Uji penangguhan' });
    expect(await repository.getProfileMediaFile(viewer('budi'), avatarId!)).toBeNull();
    expect((await repository.listProfileMedia('budi', ['ana'])).size).toBe(0);
    // Akun yang ditangguhkan tidak bisa memasang gambar baru.
    expect(await reason(repository.setProfileImage('ana', 'avatar', image()))).toBe('profile_media_unavailable');
    // Moderator tetap bisa membukanya untuk memutuskan.
    expect(await repository.getProfileMediaFile(viewer('admin', true), avatarId!)).not.toBeNull();
  });

  it(`dibatasi ${PROFILE_MEDIA_RATE_LIMIT.limit} unggahan per hari`, async () => {
    for (let index = 0; index < PROFILE_MEDIA_RATE_LIMIT.limit; index += 1) {
      await repository.setProfileImage('ana', index % 2 ? 'avatar' : 'banner', image());
    }
    expect(await reason(repository.setProfileImage('ana', 'avatar', image()))).toBe('profile_media_rate_limited');
    // Menghapus & mengganti banner bawaan tidak ikut dihitung.
    await repository.removeProfileImage('ana', 'avatar');
    await repository.setBannerPreset('ana', 'daun');
  });

  it('moderator mencabut: berkas hilang, banner bawaan tetap, tercatat tanpa mengubah status akun', async () => {
    await repository.setBannerPreset('ana', 'senja');
    await repository.setProfileImage('ana', 'avatar', image());
    await repository.setProfileImage('ana', 'banner', image());
    const before = await repository.getOwnProfileMedia('ana');

    const input = { userId: 'ana', actorId: 'admin', actorName: 'Admin Uji' };
    expect(await reason(repository.clearProfileMediaAsAdmin({ ...input, reason: 'abc' }))).toBe('suspension_reason_required');
    expect(await reason(repository.clearProfileMediaAsAdmin({ ...input, userId: 'tidak-ada', reason: 'Foto orang lain' }))).toBe('user_not_found');
    expect((await repository.getOwnProfileMedia('ana')).avatarId).toBe(before.avatarId);

    await repository.clearProfileMediaAsAdmin({ ...input, reason: '  Foto orang lain  ' });
    expect(await repository.getOwnProfileMedia('ana')).toEqual({ avatarId: null, bannerId: null, bannerPreset: 'senja', available: true });
    expect(await repository.getProfileMediaFile(viewer('admin', true), before.avatarId!)).toBeNull();
    expect(await repository.getProfileMediaFile(viewer('ana'), before.bannerId!)).toBeNull();

    const [entry] = await repository.listModerationLog(1);
    expect(entry).toMatchObject({
      subjectType: 'user',
      subjectId: 'ana',
      title: 'Foto & banner dicabut — Nama ana',
      fromStatus: null,
      toStatus: 'ACTIVE',
      actorName: 'Admin Uji',
      reason: 'Foto orang lain',
    });

    expect(await reason(repository.clearProfileMediaAsAdmin({ ...input, reason: 'Sudah kosong' }))).toBe('profile_media_empty');
    // Pemilik boleh memasang gambar baru setelah dicabut.
    await repository.setProfileImage('ana', 'avatar', image());
    expect((await repository.getOwnProfileMedia('ana')).avatarId).not.toBeNull();
  });

  it('pencarian admin memuat id gambar unggahan supaya bisa dinilai', async () => {
    await repository.setProfileImage('ana', 'avatar', image());
    const { avatarId } = await repository.getOwnProfileMedia('ana');
    const [row] = await repository.searchUsers('Nama ana', 5);
    expect(row).toMatchObject({ id: 'ana', avatarId, bannerId: null });
  });

  it('hapus akun ikut menghapus berkas gambarnya', async () => {
    await repository.setProfileImage('ana', 'avatar', image());
    const { avatarId } = await repository.getOwnProfileMedia('ana');
    await repository.deleteAccount({ userId: 'ana', actorId: 'ana', reason: null });
    expect(await repository.getProfileMediaFile(viewer('admin', true), avatarId!)).toBeNull();
    expect(await repository.getOwnProfileMedia('ana')).toMatchObject({ avatarId: null, bannerId: null, bannerPreset: null });
  });
});
