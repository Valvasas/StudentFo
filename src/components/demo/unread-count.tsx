'use client';

import { useEffect, useState } from 'react';
import { DEMO_UNREAD_KEY, DEMO_UNREAD_DEFAULT, readDemoNumber } from '@/lib/demo/browser-store';

/**
 * Jumlah pesan demo yang belum dibaca. Percakapan demo hidup di
 * localStorage peramban (lihat `demo-features.ts`), jadi angkanya hanya
 * bisa dibaca di klien. Server merender nilai awalnya supaya tidak ada
 * lompatan tata letak; setelah hidrasi angka disesuaikan dengan yang
 * sudah dibaca pengunjung.
 */
export function DemoUnreadCount({ className, srSuffix }: { className?: string; srSuffix?: string }) {
  const [count, setCount] = useState(DEMO_UNREAD_DEFAULT);

  useEffect(() => {
    const sync = () => setCount(readDemoNumber(DEMO_UNREAD_KEY, DEMO_UNREAD_DEFAULT));
    sync();
    window.addEventListener('sf-demo-store', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('sf-demo-store', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (count <= 0) return null;
  return (
    <span className={className}>
      {count > 99 ? '99+' : count}
      {srSuffix && <span className="sr-only"> {srSuffix}</span>}
    </span>
  );
}
