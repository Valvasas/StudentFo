import { describe, expect, it } from 'vitest';
import { canUseViewTransition, isTransitionableClick, VIEW_TRANSITION_CAP_MS } from './view-transition';

const env = { supported: true, reducedMotion: false } as const;
const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const here = new URL('https://studentfo.test/events?type=LOMBA');
const detail = new URL('https://studentfo.test/events/lomba-a');

describe('canUseViewTransition (ADR-099)', () => {
  it('hanya bila didukung, gerak tidak dikurangi, dan koneksi tidak lambat/hemat data', () => {
    expect(canUseViewTransition(env)).toBe(true);
    expect(canUseViewTransition({ ...env, effectiveType: '4g' })).toBe(true);
    expect(canUseViewTransition({ ...env, supported: false })).toBe(false);
    expect(canUseViewTransition({ ...env, reducedMotion: true })).toBe(false);
    expect(canUseViewTransition({ ...env, saveData: true })).toBe(false);
    for (const slow of ['slow-2g', '2g', '3g']) expect(canUseViewTransition({ ...env, effectiveType: slow })).toBe(false);
  });

  it('jendela beku dibatasi di bawah dua detik', () => {
    expect(VIEW_TRANSITION_CAP_MS).toBeGreaterThan(0);
    expect(VIEW_TRANSITION_CAP_MS).toBeLessThan(2000);
  });
});

describe('isTransitionableClick', () => {
  it('klik kiri polos ke halaman lain di situs yang sama', () => {
    expect(isTransitionableClick(click, '', detail, here)).toBe(true);
    expect(isTransitionableClick(click, '_self', detail, here)).toBe(true);
  });

  it('klik berpengubah, tombol lain, tab baru, atau sudah dicegah = perilaku tautan biasa', () => {
    for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
      expect(isTransitionableClick({ ...click, [key]: true }, '', detail, here)).toBe(false);
    }
    expect(isTransitionableClick({ ...click, button: 1 }, '', detail, here)).toBe(false);
    expect(isTransitionableClick({ ...click, defaultPrevented: true }, '', detail, here)).toBe(false);
    expect(isTransitionableClick(click, '_blank', detail, here)).toBe(false);
  });

  it('halaman yang sama (hanya query/jangkar berbeda) atau situs lain tidak ditunggu', () => {
    expect(isTransitionableClick(click, '', new URL('https://studentfo.test/events?type=MAGANG'), here)).toBe(false);
    expect(isTransitionableClick(click, '', new URL('https://contoh.test/events/lomba-a'), here)).toBe(false);
  });
});
