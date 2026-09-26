import { describe, expect, it } from 'vitest';
import { isLikelyHumanAgent } from './signal-filter';

describe('isLikelyHumanAgent', () => {
  it('browser seluler & desktop (termasuk in-app browser Instagram/TikTok) dihitung', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91',
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 trill_2023 BytedanceWebview/d8a21c6',
    ]) {
      expect(isLikelyHumanAgent(ua), ua).toBe(true);
    }
  });

  it('crawler, pratinjau tautan chat, dan alat CLI tidak dihitung', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'WhatsApp/2.23.20.0 A',
      'TelegramBot (like TwitterBot)',
      'facebookexternalhit/1.1',
      'Slackbot-LinkExpanding 1.0',
      'curl/8.5.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/126.0 Safari/537.36',
    ]) {
      expect(isLikelyHumanAgent(ua), ua).toBe(false);
    }
  });

  it('tanpa user-agent = bukan browser', () => {
    expect(isLikelyHumanAgent(null)).toBe(false);
    expect(isLikelyHumanAgent('')).toBe(false);
  });
});
