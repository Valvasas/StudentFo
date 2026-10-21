'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { SEEKER_LIMITS } from '@/types/domain';
import { cn } from '@/lib/utils';

/**
 * Angka yang berdenyut hanya saat NILAINYA berubah. Penghitung `bumps` jadi
 * `key` sehingga animasi sekali-jalan terulang; render ulang karena sebab lain
 * (mis. mengetik pengantar) dan render pertama tidak memicunya.
 */
function BumpNumber({ value }: { value: number }) {
  const [seen, setSeen] = useState(value);
  const [bumps, setBumps] = useState(0);
  if (seen !== value) {
    setSeen(value);
    setBumps((count) => count + 1);
  }
  return (
    <span key={bumps} className={cn('inline-block tabular-nums', bumps > 0 && 'tick-bump')}>
      {value}
    </span>
  );
}

/**
 * Di ponsel kartu hidup berada di tengah form, jadi tanpa ini orang mengisi
 * tanpa pernah melihatnya. Bilah ringkas ini ikut menggulir di bawah navbar
 * (tinggi navbar berbeda di ponsel dan tablet, jadi diukur; nilai CSS hanya
 * cadangan sebelum JS). Seluruhnya `aria-hidden`: hitungan yang dibacakan ada
 * di SkillMatrix.
 */
export function CardMiniBar({
  person,
  skillCount,
  seekingCount,
  open,
}: {
  person: { id: string; name: string };
  skillCount: number;
  seekingCount: number;
  open: boolean;
}) {
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    const navbar = document.querySelector<HTMLElement>('body > header');
    if (!navbar) return;
    const measure = () => setTop(Math.round(navbar.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(navbar);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden="true"
      className="card-mini-bar sticky top-[6.4rem] z-30 -mx-5 flex h-12 items-center gap-2.5 border-b border-line bg-panel px-5 text-[12.5px] sm:-mx-8 sm:px-8 md:top-[4.1rem] lg:hidden"
      style={top === null ? undefined : { top }}
    >
      <Avatar name={person.name} seed={person.id} size="xs" />
      <span className="hidden font-semibold text-ink min-[400px]:inline">Kartumu</span>
      <span className="whitespace-nowrap text-ink-muted">
        Dibawa{' '}
        <b className="font-semibold text-ink">
          <BumpNumber value={skillCount} />/{SEEKER_LIMITS.skills}
        </b>
      </span>
      <span className="whitespace-nowrap text-ink-muted">
        Dicari{' '}
        <b className="font-semibold text-ink">
          <BumpNumber value={seekingCount} />/{SEEKER_LIMITS.seeking}
        </b>
      </span>
      <span className="ml-auto inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap font-medium text-ink">
        <span className={cn('size-2 shrink-0 rounded-pill border-2 border-current', open && 'bg-current')} />
        {open ? 'Terbuka' : 'Tertutup'}
      </span>
    </div>
  );
}
