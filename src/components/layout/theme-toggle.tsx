'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('sf-theme', next);
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
