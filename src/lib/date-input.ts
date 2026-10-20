const longDate = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * "2026-12-12" → "Sabtu, 12 Desember 2026". Nilai `<input type="date">` selalu
 * ISO, tetapi TAMPILANNYA mengikuti locale peramban (mm/dd/yyyy di en-US);
 * kalimat panjang ini tidak ambigu di locale mana pun. Tanggal yang tidak ada
 * di kalender (31 Februari) = null, bukan digeser diam-diam.
 */
export function formatPickedDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return longDate.format(date);
}
