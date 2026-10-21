'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { parseSkipStore, presentIn, restoreAll as restoreAllHistory, serializeSkipStore, skip as skipHistory, undo as undoHistory, visibleSlides, type SkipHistory } from '@/lib/deck-state';
import { isMotionReduced } from '@/lib/motion-pref';
import { cn } from '@/lib/utils';
import { DeckBar, type DeckView } from './deck-bar';
import { DeckProvider, type DeckApi, type DeckSlide, type DeckVia } from './deck-context';
import { InviteSheet } from './invite-sheet';
import { NudgeHint, useNudgeHint } from './nudge-hint';
import { useCardDrag } from './use-card-drag';

const subscribeNothing = () => () => {};
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const VIEW_KEY = 'sf-deck-view';
const END_HEADING_ID = 'akhir-judul';
/** Jeda dasar kartu "dibagikan" selama radar masih menutup panggung (lihat `scan-results`). */
const SCAN_BASE_MS = 2500;
const DEAL_SETTLE_MS = 1500;
const LEAVE_SAFETY_MS = 400;
const FLIP_SAFETY_MS = 420;
const NUDGE_DELAY_MS = 400;
/** Kemiringan awal kartu saat dibagikan, per kedalaman. */
const DEAL_TILT = ['-4deg', '-1.8deg', '2.2deg'] as const;

type FocusAfter = 'results' | 'group' | 'end';

function safeStorage(kind: 'session' | 'local'): Storage | null {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function setFace(article: HTMLElement, face: 'front' | 'back') {
  article.dataset.face = face;
  const details = article.querySelector<HTMLDetailsElement>('details.mc-more');
  if (details) details.open = face === 'back';
}

/** Menjalankan `fn` tepat sekali: saat animasi `el` selesai, atau setelah `safetyMs` bila peristiwanya tak datang. */
function onceAnimated(el: HTMLElement, event: 'animationend' | 'transitionend', safetyMs: number, fn: () => void): () => void {
  let done = false;
  let timer = 0;
  const finish = () => {
    if (done) return;
    done = true;
    el.removeEventListener(event, onEnd);
    window.clearTimeout(timer);
    fn();
  };
  const onEnd = (ended: Event) => {
    if (ended.target !== el) return;
    if (event === 'transitionend' && (ended as TransitionEvent).propertyName !== 'opacity') return;
    finish();
  };
  el.addEventListener(event, onEnd);
  timer = window.setTimeout(finish, safetyMs);
  return () => {
    done = true;
    el.removeEventListener(event, onEnd);
    window.clearTimeout(timer);
  };
}

/**
 * Respons pemindaian yang sudah pernah dipasang di tab ini (per `epoch`, UUID baru di setiap respons server).
 * Kembali/Maju memulihkan respons lama dari cache router dengan `epoch` yang sama: itu pemulihan, bukan
 * pemindaian baru — URL tak bisa dipakai sebagai penanda karena entri yang ditinggal sebelum `cari=1`
 * dibersihkan tetap membawanya.
 */
const consumedScans = new Set<string>();

const announceBlocked = (name: string) => `Kamu sudah punya ajakan dengan ${name}. Pakai tombol di kartunya.`;

/**
 * Tumpukan hasil pencocokan (ADR-058). Dirender server sebagai REL scroll-snap
 * yang utuh (`data-mode='rail'`, DOM identik dengan mode hidup); setelah
 * hidrasi JS hanya MENAMBAH: tumpukan, seret, balik kartu, Lewati/Urungkan,
 * lembar tinjau. Kartu belakang tetap di DOM (opacity + `inert`, bukan
 * display:none) supaya hitungan <article> dan urutan peringkat tidak berubah.
 *
 * Tidak ada gestur yang mengirim ajakan: geser kanan, panah kanan, dan tombol
 * "Ajak jadi partner" hanya membuka lembar tinjau; mengirim = form POST di sana.
 */
export function MatchDeck({
  viewerId,
  slides,
  heading,
  endCard,
  footer,
  returnTo,
  focusTargetId,
  scanning,
  epoch,
  messageMax,
}: {
  viewerId: string;
  slides: readonly DeckSlide[];
  /** h2 judul hasil dari server; tetap ada tanpa JS. */
  heading: ReactNode;
  endCard: ReactNode;
  /** Baris di bawah tumpukan ("N dari M lolos", "Tampilkan lagi"): ikut diselubungi selama radar. */
  footer: ReactNode;
  returnTo: string;
  focusTargetId: string;
  scanning: boolean;
  /** Berganti di setiap respons server (mis. setelah ajakan): menutup lembar dan memulihkan muka kartu. */
  epoch: string;
  messageMax: number;
}) {
  const live = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [skipped, setSkipped] = useState<SkipHistory>([]);
  const [view, setViewState] = useState<DeckView>('stack');
  const [inviteTarget, setInviteTarget] = useState<DeckSlide | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [returningId, setReturningId] = useState<string | null>(null);
  const [dealing, setDealing] = useState(true);
  // Selama radar menutup panggung (lapisannya pointer-events: none), tumpukan di bawahnya tak boleh diklik/difokus.
  const [veiled, setVeiled] = useState(false);
  const [seenEpoch, setSeenEpoch] = useState(epoch);

  if (seenEpoch !== epoch) {
    setSeenEpoch(epoch);
    setInviteTarget(null);
  }

  const deckRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLOListElement>(null);
  const skippedRef = useRef<SkipHistory>([]);
  const flippedRef = useRef<string | null>(null);
  const inviteRef = useRef<{ target: DeckSlide | null; via: DeckVia }>({ target: null, via: 'button' });
  const leavingRef = useRef<string | null>(null);
  const focusAfter = useRef<FocusAfter | null>(null);
  const flippingRef = useRef(new Set<string>());
  const cancelers = useRef(new Set<() => void>());
  const returnTimer = useRef(0);
  const freshEpoch = useRef<string | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const stack = live && view === 'stack';
  const visible = useMemo(() => visibleSlides(slides, skipped), [slides, skipped]);
  const slideIds = useMemo(() => new Set(slides.map((slide) => slide.id)), [slides]);
  const skippedHere = useMemo(() => presentIn(skipped, slideIds), [skipped, slideIds]);
  const slideIdsRef = useRef(slideIds);
  const visibleRef = useRef(visible);
  const slidesRef = useRef(slides);
  const stackRef = useRef(stack);
  useIsoLayoutEffect(() => {
    visibleRef.current = visible;
    slidesRef.current = slides;
    slideIdsRef.current = slideIds;
    stackRef.current = stack;
  });

  // Teks yang sama dua kali berturut-turut tidak mengubah DOM, jadi pembaca layar diam; spasi tak terlihat membuatnya berubah.
  const announce = useCallback((text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text)), []);

  const findSlot = useCallback((id: string) => deckRef.current?.querySelector<HTMLElement>(`[data-slot-id="${CSS.escape(id)}"]`) ?? null, []);

  const trackCancel = useCallback((cancel: () => void) => {
    cancelers.current.add(cancel);
    return cancel;
  }, []);

  const commitSkipped = useCallback((next: SkipHistory) => {
    skippedRef.current = next;
    setSkipped(next);
    const storage = safeStorage('session');
    try {
      storage?.setItem(`sf-deck-skip:${viewerId}`, serializeSkipStore(next));
    } catch {
      // Kuota penuh atau penyimpanan diblokir: tumpukan tetap berfungsi untuk halaman ini.
    }
  }, [viewerId]);

  const resetFaces = useCallback(() => {
    deckRef.current?.querySelectorAll<HTMLElement>('.mc[data-face="back"]').forEach((article) => setFace(article, 'front'));
    flippedRef.current = null;
  }, []);

  // Sebelum lukisan pertama, supaya kartu yang sudah dilewati / tampilan grid tidak berkedip dulu.
  useIsoLayoutEffect(() => {
    if (!scanning || consumedScans.has(epoch)) {
      let raw: string | null = null;
      try {
        raw = safeStorage('session')?.getItem(`sf-deck-skip:${viewerId}`) ?? null;
      } catch {
        raw = null;
      }
      const ids = parseSkipStore(raw);
      if (ids.length > 0) {
        skippedRef.current = ids;
        setSkipped(ids);
      }
    }

    try {
      if (safeStorage('local')?.getItem(VIEW_KEY) === 'grid') setViewState('grid');
    } catch {
      // Pilihan tampilan hanya kenyamanan.
    }
    // Hanya saat dipasang; pemindaian berikutnya ditangani efek di bawah.
  }, [viewerId]);

  // Pemindaian baru (Simpan kartu, "Cari ulang", "Kocok ulang tumpukan") = tumpukan baru: lewati dikosongkan,
  // tumpukan diselubungi selama radar, lalu kartu dibagikan lagi. Pemulihan riwayat (Kembali/Maju) tidak.
  useIsoLayoutEffect(() => {
    if (scanning && !consumedScans.has(epoch)) {
      consumedScans.add(epoch);
      freshEpoch.current = epoch;
      commitSkipped([]);
      setDealing(true);
      setVeiled(true);
    } else if (freshEpoch.current !== epoch) {
      // Pindah ke tampilan tanpa radar (atau pulih dari riwayat) di tengah pemindaian: selubung tak boleh tertinggal.
      setVeiled(false);
    }
  }, [epoch, scanning, commitSkipped]);

  // Kartu dibagikan saat radar selesai, bukan 2,5 dtk setelah hidrasi: sisa jeda dihitung dari animasi lapisan
  // radar yang sudah berjalan sejak dilukis (hidrasi lambat tak boleh membuat panggung kosong setelah radar hilang).
  const [scanBase, setScanBase] = useState(SCAN_BASE_MS);
  useIsoLayoutEffect(() => {
    if (!live || !scanning) return;
    if (isMotionReduced() || freshEpoch.current !== epoch) {
      setScanBase(0);
      return;
    }
    const overlay = document.getElementById(focusTargetId)?.querySelector<HTMLElement>('.scan-overlay');
    const elapsed = typeof overlay?.getAnimations === 'function' ? overlay.getAnimations()[0]?.currentTime : null;
    setScanBase(typeof elapsed === 'number' ? Math.max(0, SCAN_BASE_MS - elapsed) : SCAN_BASE_MS);
  }, [live, scanning, epoch, focusTargetId]);

  useEffect(() => {
    if (!veiled) return;
    const timer = window.setTimeout(() => setVeiled(false), scanBase);
    return () => window.clearTimeout(timer);
  }, [veiled, scanBase, epoch]);

  // Elemen yang sedang difokus bisa mendadak jadi `inert` tanpa ia sendiri bergerak (tombol kartu penutup saat
  // tumpukan terisi lagi, seluruh tumpukan saat diselubungi radar) atau hilang dari DOM ("Tarik N lagi" yang
  // terakhir). Chromium baru memindahkan fokus dari elemen inert ke <body> saat melukis, jadi di sini (sebelum
  // lukis) fokus masih bisa diselamatkan; elemen yang dicabut sudah melepas fokusnya, maka diingat lewat onFocus.
  useIsoLayoutEffect(() => {
    const active = document.activeElement;
    const last = lastFocus.current;
    const dropped = (active === null || active === document.body) && last !== null && !last.isConnected;
    const stranded = active instanceof HTMLElement && deckRef.current?.contains(active) === true && active.closest('[inert]') !== null;
    if (!dropped && !stranded) return;
    lastFocus.current = null;
    document.getElementById(focusTargetId)?.focus({ preventScroll: true });
  }, [visible, veiled, focusTargetId]);

  useEffect(() => {
    if (!live) return;
    resetFaces();
    const timer = window.setTimeout(() => setDealing(false), (scanning ? scanBase : 0) + DEAL_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [live, scanning, scanBase, epoch, resetFaces]);

  useEffect(() => {
    inviteRef.current = { target: null, via: 'button' };
    resetFaces();
  }, [epoch, resetFaces]);

  useEffect(() => {
    const cancelSet = cancelers.current;
    const flipping = flippingRef.current;
    return () => {
      for (const cancel of cancelSet) cancel();
      cancelSet.clear();
      flipping.clear();
      window.clearTimeout(returnTimer.current);
    };
  }, []);

  // `--q` (naiknya kartu belakang saat seret/terbang) harus kembali ke 0 pada commit yang sama
  // dengan perubahan kedalaman, kalau tidak kartu belakang melompat satu frame.
  useIsoLayoutEffect(() => {
    stageRef.current?.style.setProperty('--q', '0');
  }, [skipped, view]);

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const element = target === 'group' ? groupRef.current : document.getElementById(target === 'end' ? END_HEADING_ID : focusTargetId);
    // Tanpa gulir: kartu berikutnya muncul di tempat yang sama, jadi halaman tak perlu melompat ke atas bagian.
    element?.focus({ preventScroll: target !== 'end' });
  }, [skipped, focusTargetId]);

  const leave = useCallback(
    (id: string, done: () => void) => {
      const slot = findSlot(id);
      if (!slot || isMotionReduced()) {
        done();
        return;
      }
      const asCard = stackRef.current && slot.dataset.depth === '0';
      if (asCard) stageRef.current?.style.setProperty('--q', '1');
      slot.dataset.leaving = asCard ? 'left' : 'fade';
      const cancel = trackCancel(
        onceAnimated(slot, 'transitionend', LEAVE_SAFETY_MS, () => {
          cancelers.current.delete(cancel);
          done();
        }),
      );
    },
    [findSlot, trackCancel],
  );

  const skip = useCallback(
    (id: string, via: DeckVia = 'button') => {
      if (leavingRef.current) return;
      const list = visibleRef.current;
      const index = list.findIndex((slide) => slide.id === id);
      const slide = list[index];
      if (!slide) return;
      leavingRef.current = id;
      const next = list[index + 1];
      focusAfter.current = next ? (via === 'key' ? 'group' : 'results') : 'end';
      leave(id, () => {
        leavingRef.current = null;
        const history = skipHistory(skippedRef.current, id);
        if (flippedRef.current === id) flippedRef.current = null;
        commitSkipped(history);
        if (next) {
          announce(`${slide.name} dilewati. Berikutnya: ${next.name}, cocok ${next.score} persen. Sisa ${list.length - 1} kartu.`);
        } else {
          const invited = slidesRef.current.filter((candidate) => candidate.relation === 'outgoing').length;
          const tally = [invited > 0 ? `${invited} diajak` : null, `${presentIn(history, slideIdsRef.current).length} dilewati`].filter(Boolean).join(', ');
          announce(`${slide.name} dilewati. Tumpukan habis. ${tally}.`);
        }
      });
    },
    [announce, commitSkipped, leave],
  );

  const undo = useCallback(() => {
    const { history, restored } = undoHistory(skippedRef.current, slideIdsRef.current);
    if (restored === null) return;
    const slide = slidesRef.current.find((candidate) => candidate.id === restored);
    // Urungkan terakhir menonaktifkan tombol yang sedang difokus; pindahkan fokus sebelum ia hilang.
    if (presentIn(history, slideIdsRef.current).length === 0) focusAfter.current = stackRef.current ? 'group' : 'results';
    setReturningId(restored);
    window.clearTimeout(returnTimer.current);
    returnTimer.current = window.setTimeout(() => setReturningId(null), 600);
    commitSkipped(history);
    if (slide) announce(`${slide.name} dikembalikan ke tumpukan.`);
  }, [announce, commitSkipped]);

  const restoreAll = useCallback(() => {
    const count = presentIn(skippedRef.current, slideIdsRef.current).length;
    if (count === 0) return;
    focusAfter.current = 'results';
    commitSkipped(restoreAllHistory(skippedRef.current, slideIdsRef.current));
    announce(`${count} kartu dikembalikan ke tumpukan.`);
  }, [announce, commitSkipped]);

  const flip = useCallback(
    (id: string) => {
      const slot = findSlot(id);
      const article = slot?.querySelector<HTMLElement>('.mc');
      if (!article || flippingRef.current.has(id)) return;
      const toBack = article.dataset.face !== 'back';
      const previous = flippedRef.current;
      if (toBack && previous && previous !== id) {
        const other = findSlot(previous)?.querySelector<HTMLElement>('.mc');
        if (other) setFace(other, 'front');
      }
      const name = slidesRef.current.find((candidate) => candidate.id === id)?.name ?? '';
      const swap = () => {
        // Flap ada di muka depan yang disembunyikan; tanpa ini fokus jatuh ke <body>. Ringkasan punggung tampil di kedua muka.
        const flapFocused = toBack && article.contains(document.activeElement);
        setFace(article, toBack ? 'back' : 'front');
        if (flapFocused) article.querySelector<HTMLElement>('details.mc-more > summary')?.focus({ preventScroll: true });
        flippedRef.current = toBack ? id : null;
        announce(toBack ? `Rincian kecocokan ${name} dibuka.` : `Kartu ${name} dibalik ke depan.`);
      };
      const faces = article.querySelector<HTMLElement>('.mc-faces');
      if (!faces || isMotionReduced()) {
        swap();
        return;
      }
      flippingRef.current.add(id);
      faces.classList.add('face-turn-out');
      const cancelOut = trackCancel(
        onceAnimated(faces, 'animationend', FLIP_SAFETY_MS, () => {
          cancelers.current.delete(cancelOut);
          swap();
          faces.classList.replace('face-turn-out', 'face-turn-in');
          const cancelIn = trackCancel(
            onceAnimated(faces, 'animationend', FLIP_SAFETY_MS, () => {
              cancelers.current.delete(cancelIn);
              faces.classList.remove('face-turn-in');
              flippingRef.current.delete(id);
            }),
          );
        }),
      );
    },
    [announce, findSlot, trackCancel],
  );

  const openInvite = useCallback((target: DeckSlide | null, via: DeckVia) => {
    inviteRef.current = { target, via };
    setInviteTarget(target);
  }, []);

  const requestInvite = useCallback(
    (id: string, via: DeckVia) => {
      const slide = slidesRef.current.find((candidate) => candidate.id === id);
      if (!slide) return;
      if (!slide.canInvite) {
        announce(announceBlocked(slide.name));
        return;
      }
      openInvite(slide, via);
    },
    [announce, openInvite],
  );

  const closeInvite = useCallback(() => {
    const { target, via } = inviteRef.current;
    if (!target) return;
    openInvite(null, via);
    // Dialog asli mengembalikan fokus ke pemicu; untuk panah/seret pemicunya adalah grup tumpukan.
    if (via !== 'button') window.requestAnimationFrame(() => groupRef.current?.focus());
  }, [openInvite]);

  const setView = useCallback(
    (next: DeckView) => {
      resetFaces();
      setViewState(next);
      try {
        safeStorage('local')?.setItem(VIEW_KEY, next);
      } catch {
        // Pilihan tampilan hanya kenyamanan.
      }
      announce(next === 'grid' ? 'Tampilan semua kartu.' : 'Tampilan tumpukan.');
    },
    [announce, resetFaces],
  );

  const front = visible[0];
  const nudge = useNudgeHint(stack && !dealing && visible.length > 1 && inviteTarget === null, NUDGE_DELAY_MS);
  const { stop: stopNudge } = nudge;

  const { handlers } = useCardDrag({
    enabled: stack && front !== undefined && inviteTarget === null,
    canInviteOf: (id) => slidesRef.current.find((slide) => slide.id === id)?.canInvite ?? false,
    onSkip: (id) => skip(id, 'gesture'),
    onInvite: (id) => requestInvite(id, 'gesture'),
    onBlocked: (id) => {
      const slide = slidesRef.current.find((candidate) => candidate.id === id);
      if (slide) announce(announceBlocked(slide.name));
    },
    onFlip: flip,
    onPress: stopNudge,
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!stack || event.target !== event.currentTarget || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!front || leavingRef.current) return;
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        skip(front.id, 'key');
        break;
      case 'ArrowRight':
        event.preventDefault();
        requestInvite(front.id, 'key');
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault();
        flip(front.id);
        break;
    }
  };

  // Ringkasan di sisi belakang kartu (<summary>) menjadi pembalik: native <details> hanya dipakai tanpa JS.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!live || !(event.target instanceof Element)) return;
    const summary = event.target.closest('summary');
    if (!summary?.parentElement?.classList.contains('mc-more')) return;
    const id = summary.closest<HTMLElement>('[data-slot-id]')?.dataset.slotId;
    if (!id) return;
    event.preventDefault();
    flip(id);
  };

  const api = useMemo<DeckApi>(
    () => ({ live, skip, flip, requestInvite, skippedCount: skippedHere.length, restoreAll }),
    [live, skip, flip, requestInvite, skippedHere.length, restoreAll],
  );

  const mode = live ? view : 'rail';
  const dealt = stack && dealing;

  const slotProps = (index: number, key: string | null) => {
    const depth = index < 3 ? String(index) : 'x';
    const className = cn(
      'deck-slot',
      dealt && index < 3 && 'deal-in',
      stack && key !== null && key === returningId && 'undo-return',
      stack && index === 0 && nudge.showing && 'nudge',
    );
    return {
      className,
      'data-depth': stack ? depth : undefined,
      inert: stack && index > 0,
      style: { '--i': Math.min(index, 3), '--rf': DEAL_TILT[Math.min(index, 2)] } as CSSProperties,
    };
  };

  return (
    <DeckProvider value={api}>
      <div
        ref={deckRef}
        className="deck"
        inert={live && veiled}
        onFocus={(event) => {
          if (event.target instanceof HTMLElement) lastFocus.current = event.target;
        }}
        data-mode={mode} data-live={live || undefined} style={{ '--base': dealing && scanning ? `${scanBase}ms` : '0ms' } as CSSProperties}>
        <DeckBar
          heading={heading}
          live={live}
          remaining={visible.length}
          total={slides.length}
          skippedCount={skippedHere.length}
          canUndo={skippedHere.length > 0}
          onUndo={undo}
          onRestoreAll={restoreAll}
          view={view}
          onView={setView}
        />

        <div
          ref={groupRef}
          role="group"
          aria-roledescription={stack && visible.length > 0 ? 'tumpukan kartu' : undefined}
          aria-label="Kandidat partner, urut dari yang paling cocok"
          aria-describedby={stack && visible.length > 0 ? 'deck-keys' : undefined}
          tabIndex={stack && visible.length > 0 ? 0 : undefined}
          onKeyDown={onKeyDown}
          onClick={onClick}
          className="deck-viewport"
        >
          <ol ref={stageRef} className="deck-stage" {...handlers}>
            {visible.map((slide, index) => (
              <li key={slide.id} data-slot-id={slide.id} {...slotProps(index, slide.id)}>
                {slide.card}
              </li>
            ))}
            <li data-end="" {...slotProps(visible.length, null)}>
              {endCard}
            </li>
          </ol>
        </div>

        {stack && visible.length > 0 && (
          <>
            <p id="deck-keys" className="deck-keys hidden text-center text-[12.5px] text-ink-muted md:block">
              Panah kiri: lewati · kanan: ajak · atas/bawah: balik kartu
            </p>
            <p className="text-center text-[13px] text-ink-muted">Geser kiri untuk lewati, kanan untuk meninjau ajakan. Atau pakai tombolnya.</p>
            <NudgeHint showing={nudge.showing} />
          </>
        )}

        {footer}

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {live && <InviteSheet target={inviteTarget} returnTo={returnTo} messageMax={messageMax} onClose={closeInvite} />}
      </div>
    </DeckProvider>
  );
}
