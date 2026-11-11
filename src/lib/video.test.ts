import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANONICAL_VIDEO_PATTERN, normalizeVideoUrl, parseVideo, VIDEO_URL_MAX } from '@/lib/video';

describe('normalizeVideoUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['http://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['  https://vimeo.com/76979871  ', 'https://vimeo.com/76979871'],
    ['https://vimeo.com/channels/staffpicks/76979871', 'https://vimeo.com/76979871'],
    ['https://player.vimeo.com/video/76979871?h=abc', 'https://vimeo.com/76979871'],
  ])('%s → bentuk kanonis', (input, expected) => {
    expect(normalizeVideoUrl(input)).toBe(expected);
  });

  it.each([
    '',
    'bukan tautan',
    'https://www.youtube.com/@kanal',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/watch?v=terlalupendek',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://evil.example/youtu.be/dQw4w9WgXcQ',
    'javascript:alert(1)//youtu.be/dQw4w9WgXcQ',
    'ftp://youtu.be/dQw4w9WgXcQ',
    'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ',
    'https://vimeo.com/channels/staffpicks',
    'https://www.instagram.com/reel/abc',
    'https://www.tiktok.com/@akun/video/1234567890',
  ])('menolak %s', (input) => {
    expect(normalizeVideoUrl(input)).toBeNull();
  });

  it('hasilnya selalu lolos pola kanonis & batas panjang kolom', () => {
    for (const input of ['youtu.be/dQw4w9WgXcQ', 'https://vimeo.com/123456789012']) {
      const canonical = normalizeVideoUrl(input);
      expect(canonical).not.toBeNull();
      expect(CANONICAL_VIDEO_PATTERN.test(canonical ?? '')).toBe(true);
      expect((canonical ?? '').length).toBeLessThanOrEqual(VIDEO_URL_MAX);
    }
  });
});

describe('parseVideo', () => {
  it('YouTube diputar lewat youtube-nocookie, Vimeo dengan dnt=1', () => {
    expect(parseVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({
      provider: 'youtube',
      id: 'dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1',
    });
    expect(parseVideo('https://vimeo.com/76979871')).toMatchObject({
      provider: 'vimeo',
      id: '76979871',
      embedUrl: 'https://player.vimeo.com/video/76979871?autoplay=1&dnt=1',
    });
  });

  it('bentuk non-kanonis tidak ditebak', () => {
    expect(parseVideo('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(parseVideo(null)).toBeNull();
    expect(parseVideo(undefined)).toBeNull();
  });
});

describe('pola kanonis = CHECK SQL', () => {
  it('regex di migration identik dengan CANONICAL_VIDEO_PATTERN', () => {
    const sql = readFileSync('supabase/migrations/20261109100002_event_media.sql', 'utf8');
    const match = /video_url ~ '([^']+)'/.exec(sql);
    expect(match?.[1]).toBe(CANONICAL_VIDEO_PATTERN.source.replace(/\\\//g, '/'));
    expect(sql).toContain(`video_url VARCHAR(${VIDEO_URL_MAX})`);
  });
});
