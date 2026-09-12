/**
 * Skrip anti-kedip tema.
 *
 * Harus berjalan SEBELUM paint pertama. Kalau tema baru diterapkan setelah
 * React hidrasi, pengguna dark mode melihat kilatan putih di setiap kali
 * pindah halaman — gangguan nyata, terutama saat membaca di ruang gelap.
 *
 * Ditulis mentah, tanpa dependensi, dan sengaja pendek karena ini
 * memblokir render. `try/catch` wajib: localStorage melempar error di mode
 * penyamaran pada beberapa browser, dan kegagalannya tidak boleh
 * menjatuhkan seluruh halaman.
 */
const script = `(function(){try{var s=localStorage.getItem('sf-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s==='dark'||s==='light'?s:(m?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
