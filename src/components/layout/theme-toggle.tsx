'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { THEME_STORAGE_KEY } from '@/lib/appearance';

type Theme = 'light' | 'dark';

/**
 * Pengalih tema.
 *
 * Nilai awal dibaca dari atribut DOM yang sudah disetel ThemeScript,
 * bukan dari localStorage secara langsung — dengan begitu tombol dan
 * halaman tidak pernah menampilkan keadaan yang berbeda.
 *
 * Sampai efek pertama berjalan, tombol dirender dalam bentuk yang sama di
 * server dan klien (label netral) supaya tidak ada ketidakcocokan hidrasi.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    sync();
    // Tema juga bisa diganti dari halaman Personalisasi (atau mengikuti OS);
    // tanpa ini ikon di navbar menunjukkan tema yang sudah tidak berlaku.
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Penyimpanan diblokir (mode penyamaran / izin situs). Tema tetap
      // berubah untuk sesi ini; hanya preferensinya yang tidak tersimpan.
    }
  }

  const isDark = theme === 'dark';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === null ? 'Ganti tema' : isDark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
    >
      {isDark ? <Moon aria-hidden /> : <Sun aria-hidden />}
    </Button>
  );
}
