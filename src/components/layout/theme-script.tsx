import { MOTION_STORAGE_KEY, THEME_STORAGE_KEY } from '@/lib/appearance';

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
 *
 * Ikut dipasang di sini karena harus sebelum paint pertama juga:
 * `data-motion="reduce"` dari Personalisasi (ADR-055), dan pendengar
 * `touchstart` kosong — tanpa pendengar itu Safari iOS tidak pernah
 * menyalakan `:active`, jadi tombol taktil tidak terasa ditekan di iPhone.
 */
const script = `(function(){var d=document.documentElement;try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s==='dark'||s==='light'?s:(m?'dark':'light');d.setAttribute('data-theme',t);if(localStorage.getItem('${MOTION_STORAGE_KEY}')==='reduce')d.setAttribute('data-motion','reduce');}catch(e){d.setAttribute('data-theme','light');}try{document.addEventListener('touchstart',function(){},{passive:true});}catch(e){}})();`;

export function ThemeScript({ nonce }: { nonce: string | undefined }) {
  // Browser mengosongkan atribut `nonce` di DOM setelah parse (supaya tidak
  // bisa dicuri skrip lain), jadi React selalu melihat nonce server ≠ klien
  // dan melaporkan hydration mismatch palsu di setiap halaman.
  return <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: script }} />;
}
