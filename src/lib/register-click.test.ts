import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/lib/auth';
import { recordSignal } from '@/lib/recommendation-signals';
import { noteRegisterClick } from './register-click';

vi.mock('@/lib/recommendation-signals', () => ({ recordSignal: vi.fn(async () => undefined) }));

const user = { id: 'user-1', interests: [], educationLevel: null } as unknown as AuthUser;

function fakeRepository() {
  return { saveEvent: vi.fn(async () => undefined), addTrackerItemIfAbsent: vi.fn(async () => undefined) };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('noteRegisterClick (ADR-090)', () => {
  it('mencatat klik lalu menyimpan + menaruh acara di Papan lamaran lewat jalur "hanya bila belum dilacak"', async () => {
    const repository = fakeRepository();

    await noteRegisterClick('event-1', user, repository);

    expect(recordSignal).toHaveBeenCalledWith('register_click', 'event-1', user);
    // Klik sudah sinyal niat; sinyal `save` kedua akan menghitung satu niat dua kali.
    expect(recordSignal).toHaveBeenCalledOnce();
    expect(repository.saveEvent).toHaveBeenCalledWith('user-1', 'event-1');
    expect(repository.addTrackerItemIfAbsent).toHaveBeenCalledWith('user-1', 'event-1');
  });

  it('gagal menyimpan tidak pernah menahan pendaftar', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const repository = fakeRepository();
    repository.saveEvent.mockRejectedValueOnce(new Error('basis data sibuk'));

    await expect(noteRegisterClick('event-1', user, repository)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
  });
});
