'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEMO_STORE_EVENT, writeDemoJson } from '@/lib/demo/browser-store';

/**
 * Nilai tersimpan di peramban + penulisnya. Render pertama selalu memakai
 * `fallback` (sama dengan server) supaya tidak ada ketidakcocokan hidrasi;
 * isi tersimpan dibaca setelah terpasang. Perubahan dari tab lain ikut
 * tersinkron lewat event `storage`.
 */
export function useDemoStore<T>(key: string, fallback: T, parse: (raw: unknown) => T): readonly [T, (next: T) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(key);
        setValue(raw === null ? fallback : parse(JSON.parse(raw)));
      } catch {
        setValue(fallback);
      }
      setLoaded(true);
    };
    read();
    window.addEventListener(DEMO_STORE_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(DEMO_STORE_EVENT, read);
      window.removeEventListener('storage', read);
    };
    // fallback & parse dianggap konstan per pemakaian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = useCallback((next: T) => {
    setValue(next);
    writeDemoJson(key, next);
  }, [key]);

  return [value, save, loaded] as const;
}
