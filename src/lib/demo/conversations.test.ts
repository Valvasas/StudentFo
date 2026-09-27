import { describe, expect, it } from 'vitest';
import { MESSAGE_MAX, parseStoredMessages } from './conversations';

describe('parseStoredMessages', () => {
  it('membuang percakapan asing dan pesan rusak', () => {
    const parsed = parseStoredMessages({
      bagas: [{ from: 'me', time: '10.00', text: 'halo' }, { from: 'me', text: 42 }, 'x'],
      palsu: [{ from: 'me', time: '10.00', text: 'tidak dikenal' }],
    });
    expect(parsed).toEqual({ bagas: [{ from: 'me', time: '10.00', text: 'halo' }] });
  });

  it('memotong pesan terlalu panjang; isi bukan objek → kosong', () => {
    expect(parseStoredMessages({ bagas: [{ from: 'me', time: '1', text: 'x'.repeat(5000) }] }).bagas?.[0]?.text).toHaveLength(MESSAGE_MAX);
    expect(parseStoredMessages('rusak')).toEqual({});
  });
});
