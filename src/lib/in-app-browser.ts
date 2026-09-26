/**
 * Browser di dalam aplikasi (WebView) tempat Google MENOLAK OAuth
 * ("Error 403: disallowed_useragent", kebijakan "Use secure browsers").
 * Sumber trafik utama produk ini adalah tautan di Instagram/TikTok, jadi
 * tanpa deteksi ini tombol "Masuk dengan Google" pasti berakhir di halaman
 * error Google bagi sebagian besar pengunjung pertama.
 *
 * Urutan penting: nama aplikasi spesifik dulu, lalu penanda WebView Android
 * generik (`; wv)`). Safari/Chrome/CriOS asli tidak cocok pola mana pun.
 */
const IN_APP_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bInstagram\b/i, 'Instagram'],
  [/musical_ly|\btrill_|BytedanceWebview|AppName\/(trill|musical_ly)/i, 'TikTok'],
  [/FBAN\/|FBAV\/|FB_IAB|\bFBIOS\b/, 'Facebook'],
  [/\bLine\/\d/i, 'LINE'],
  [/\bSnapchat\b/i, 'Snapchat'],
  [/\bLinkedInApp\b/i, 'LinkedIn'],
  [/; wv\)/, 'aplikasi'],
];

export function detectInAppBrowser(userAgent: string | null): string | null {
  if (!userAgent) return null;
  return IN_APP_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}
