const hourFormatter = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jakarta' });
const dayFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Jakarta',
});

/**
 * Sapaan beranda menurut jam WIB, bukan jam server (UTC di hampir semua
 * hosting) — "Selamat pagi" pukul 21.00 WIB terasa seperti produk yang tidak
 * tahu ia dipakai di mana. Batas mengikuti kebiasaan lisan: siang mulai
 * pukul 11, sore pukul 15, malam pukul 18.
 */
export function greetingFor(now: Date = new Date()): string {
  const hour = Number(hourFormatter.format(now));
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/** "Senin, 5 Oktober" dalam kalender WIB. */
export function todayLabel(now: Date = new Date()): string {
  return dayFormatter.format(now);
}

/** Nama panggilan: kata pertama nama lengkap, dibatasi supaya judul tidak meledak oleh nama tanpa spasi. */
export function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first.length > 0 ? first.slice(0, 24) : 'kamu';
}
