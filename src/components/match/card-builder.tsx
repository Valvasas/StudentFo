'use client';

import { useCallback, useEffect, useState, type AnimationEvent, type CSSProperties } from 'react';
import { useFormStatus } from 'react-dom';
import { MapPin, Wifi } from 'lucide-react';
import { Avatar, TINT_BG } from '@/components/ui/avatar';
import { PadlockDoodle, PuzzleKnobDoodle } from '@/components/ui/illustrations';
import { isMotionReduced } from '@/lib/motion-pref';
import { coverTintOf } from '@/lib/tint';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, SEEKER_LIMITS, skillLabel, type EducationLevel, type TeamSkillSlug } from '@/types/domain';

type Phase = 'idle' | 'out' | 'in';

/** FNV-1a: kemiringan stiker harus sama di server dan klien (hidrasi), bukan acak per render. */
function hashOf(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function Ticks({ count, limit }: { count: number; limit: number }) {
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: limit }, (_, index) => (
        <span key={index} className="cap-tick" data-on={index < count ? '' : undefined} />
      ))}
    </span>
  );
}

/** `animate` dibekukan saat pasang: hanya stiker yang masuk SETELAH kartu tampil yang menempel dengan gerak. */
function Sticker({ slug, animate }: { slug: TeamSkillSlug; animate: boolean }) {
  const [enters] = useState(animate);
  const hash = hashOf(slug);
  return (
    <span
      className={cn('sticker', enters && 'stick-in')}
      data-tape={hash % 2 === 0 ? 'left' : 'right'}
      style={{ '--r': `${((hash % 7) - 3) * 0.9}deg` } as CSSProperties}
    >
      {skillLabel(slug)}
    </span>
  );
}

function Piece({ slug, animate }: { slug: TeamSkillSlug; animate: boolean }) {
  const [enters] = useState(animate);
  return (
    <span className={cn('piece', enters && 'piece-in')}>
      {skillLabel(slug)}
      <span className="piece-knob">
        <PuzzleKnobDoodle />
      </span>
    </span>
  );
}

function GhostPiece() {
  return (
    <span className="piece piece-ghost breathe">
      <span className="piece-knob">
        <PuzzleKnobDoodle filled={false} />
      </span>
    </span>
  );
}

/**
 * Kartu koleksi yang hidup di samping form (ADR-058). Semuanya pratinjau:
 * `aria-hidden`, tanpa elemen fokusable; teks penghitung dan galat yang
 * dibacakan ada di SkillMatrix. Render awal tanpa animasi apa pun — stiker
 * baru bergerak untuk pilihan yang datang setelah mount, dan kartu membalik
 * dua fase (keluar, tukar muka, masuk) saat saklar "buka" berubah.
 */
export function CardBuilder({
  person,
  city,
  skills,
  seeking,
  remoteOk,
  pitch,
  open,
}: {
  person: { id: string; name: string; major: string | null; level: EducationLevel | null };
  city: string;
  skills: ReadonlySet<TeamSkillSlug>;
  seeking: ReadonlySet<TeamSkillSlug>;
  remoteOk: boolean;
  pitch: string;
  open: boolean;
}) {
  const { pending } = useFormStatus();
  const [ready, setReady] = useState(false);
  const [shownOpen, setShownOpen] = useState(open);
  const [phase, setPhase] = useState<Phase>('idle');
  const [flips, setFlips] = useState(0);

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (open === shownOpen || phase !== 'idle') return;
    if (isMotionReduced()) setShownOpen(open);
    else setPhase('out');
  }, [open, shownOpen, phase]);

  const settleOut = useCallback(() => {
    setShownOpen(open);
    setFlips((count) => count + 1);
    setPhase('in');
  }, [open]);

  // Cadangan bila `animationend` tidak datang (tab di latar, gaya pengguna mematikan animasi).
  useEffect(() => {
    if (phase === 'out') {
      const timer = window.setTimeout(settleOut, 400);
      return () => window.clearTimeout(timer);
    }
    if (phase === 'in') {
      const timer = window.setTimeout(() => setPhase('idle'), 500);
      return () => window.clearTimeout(timer);
    }
  }, [phase, settleOut]);

  const onFaceAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (phase === 'out') settleOut();
    else if (phase === 'in') setPhase('idle');
  };

  const sub = [person.major, person.level ? EDUCATION_LEVEL_LABEL[person.level] : null].filter(Boolean).join(' · ');
  const trimmedPitch = pitch.trim();
  const ghostCount = seeking.size >= SEEKER_LIMITS.seeking ? 0 : Math.max(1, 3 - seeking.size);

  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-3">
      <p className="text-[13px] font-semibold text-ink-muted">Beginilah kartumu terlihat orang lain</p>
      <aside className="pcard" data-open={open ? '' : undefined} data-sending={pending && open ? '' : undefined}>
        <div
          className={cn('pcard-faces', phase === 'out' && 'face-turn-out', phase === 'in' && 'face-turn-in')}
          data-face={shownOpen ? 'front' : 'back'}
          onAnimationEnd={onFaceAnimationEnd}
        >
          <div data-face-side="front" className="flex min-w-0 flex-col">
            <div className={cn('dot-grid relative h-[72px] shrink-0', TINT_BG[coverTintOf(person.id)])}>
              <span className="absolute left-5 top-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink">Kartu pemain</span>
              <span key={flips} className={cn('pcard-stamp absolute right-4 top-3', flips > 0 && 'stamp')} style={{ '--d': '140ms' } as CSSProperties}>
                Terbuka
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-4 px-5 pb-5">
              <div className="relative -mt-7 flex items-end gap-3.5">
                <Avatar name={person.name} seed={person.id} size="lg" ring />
                <div className="flex min-w-0 flex-col pb-0.5">
                  <span className="truncate font-display text-[21px] font-bold leading-tight tracking-[-0.025em] text-ink">{person.name}</span>
                  {sub && <span className="truncate text-[13px] text-ink-muted">{sub}</span>}
                </div>
              </div>

              <p className="min-h-[3.4em] break-words text-[14.5px] leading-relaxed text-ink-soft">
                {trimmedPitch ? <>&ldquo;{trimmedPitch}&rdquo;</> : <span className="text-ink-faint">Satu kalimat tentang gaya kerjamu tampil di sini.</span>}
              </p>

              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-muted">
                <li className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin aria-hidden className="size-3.5 shrink-0" />
                  <span className="truncate">{city || 'Kota belum dipilih'}</span>
                </li>
                {remoteOk && (
                  <li className="inline-flex items-center gap-1.5">
                    <Wifi aria-hidden className="size-3.5 shrink-0" /> Bersedia kerja daring
                  </li>
                )}
              </ul>

              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Dibawa</span>
                  <Ticks count={skills.size} limit={SEEKER_LIMITS.skills} />
                </div>
                <div className="flex min-h-[44px] flex-wrap content-start gap-x-2 gap-y-2.5 pt-1.5">
                  {skills.size === 0 ? (
                    <span className="slot-empty">+ Tempel keahlian pertamamu</span>
                  ) : (
                    [...skills].map((slug) => <Sticker key={slug} slug={slug} animate={ready} />)
                  )}
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Dicari</span>
                  <Ticks count={seeking.size} limit={SEEKER_LIMITS.seeking} />
                </div>
                <div className="flex min-h-[44px] flex-wrap content-start items-center gap-x-5 gap-y-2.5 pr-3 pt-1">
                  {[...seeking].map((slug) => (
                    <Piece key={slug} slug={slug} animate={ready} />
                  ))}
                  {Array.from({ length: ghostCount }, (_, index) => (
                    <GhostPiece key={index} />
                  ))}
                </div>
                {seeking.size === 0 && <span className="text-[13px] text-ink-muted">Terbuka untuk siapa saja</span>}
              </section>
            </div>
          </div>

          <div data-face-side="back" className="dot-grid flex min-w-0 flex-col items-center justify-center gap-3 bg-panel-nested px-8 py-10 text-center text-ink">
            <PadlockDoodle />
            <p className="font-display text-[19px] font-bold tracking-[-0.02em]">Kartumu lagi tertutup</p>
            <p className="max-w-[28ch] text-[13.5px] leading-relaxed text-ink-muted">
              Belum ada yang bisa melihatmu — dan kamu juga belum bisa mencari. Buka kartumu kapan saja.
            </p>
          </div>
        </div>
        {pending && open && <span className="pcard-ready stamp">Siap main</span>}
      </aside>
    </div>
  );
}
