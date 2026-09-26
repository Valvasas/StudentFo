import { describe, expect, it } from 'vitest';
import { detectInAppBrowser } from './in-app-browser';

describe('detectInAppBrowser', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91 (iPhone14,5; iOS 17_5; id_ID)', 'Instagram'],
    ['Mozilla/5.0 (Linux; Android 13; SM-A145F Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 Instagram 330.0.0.40.92 Android', 'Instagram'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/id Region/ID', 'TikTok'],
    ['Mozilla/5.0 (Linux; Android 12; RMX3263 Build/SP1A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 trill_2023204030 JsSdk/1.0 NetType/4G Channel/googleplay AppName/trill', 'TikTok'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 BytedanceWebview/d8a21c6', 'TikTok'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.35.110;FBBV/612345678]', 'Facebook'],
    ['Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36 Line/14.8.0', 'LINE'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36', 'aplikasi'],
  ])('%s → %s', (ua, name) => {
    expect(detectInAppBrowser(ua)).toBe(name);
  });

  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  ])('browser sungguhan tidak ditandai: %s', (ua) => {
    expect(detectInAppBrowser(ua)).toBeNull();
  });

  it('tanpa user-agent → null (jangan sembunyikan tombol berdasarkan tebakan)', () => {
    expect(detectInAppBrowser(null)).toBeNull();
  });
});
