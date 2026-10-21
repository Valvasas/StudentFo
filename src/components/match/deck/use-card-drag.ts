'use client';

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  classifyMove,
  decideRelease,
  dragOffset,
  dragProgress,
  estimateVelocity,
  isArmed,
  isInEdgeDeadZone,
  isTap,
  stampStrength,
  thresholdFor,
  tiltFor,
  type VelocitySample,
} from '@/lib/deck-gesture';
import { isMotionReduced } from '@/lib/motion-pref';

/** Di dalam target ini seretan tidak dimulai: tombol, tautan, isian tetap bekerja normal. */
const INTERACTIVE = 'a,button,summary,input,textarea,select,label,[data-no-drag]';
const SPRING_MS = 560;
const SAMPLE_LIMIT = 8;

interface Gesture {
  readonly pointerId: number;
  readonly slot: HTMLElement;
  readonly stage: HTMLElement;
  readonly id: string;
  readonly startX: number;
  readonly startY: number;
  readonly startT: number;
  readonly width: number;
  readonly threshold: number;
  readonly reduced: boolean;
  readonly canInvite: boolean;
  phase: 'pending' | 'dragging';
  dx: number;
  armed: boolean;
  samples: VelocitySample[];
  frame: number | null;
}

export interface CardDragOptions {
  enabled: boolean;
  canInviteOf: (id: string) => boolean;
  onSkip: (id: string) => void;
  onInvite: (id: string) => void;
  onBlocked: (id: string) => void;
  onFlip: (id: string) => void;
  /** Jari/kursor menyentuh kartu: petunjuk geser tak perlu lagi. */
  onPress: () => void;
}

/**
 * Seret kartu depan dengan Pointer Events (ADR-058). Dipasang di `<ol>` tumpukan
 * dan bekerja lewat delegasi, jadi tidak ada pendengar yang dipasang manual
 * (tak ada yang bocor, dan aman di Strict Mode).
 *
 * Sentuhan: `touch-action: pan-y` pada slot depan membiarkan gulir vertikal
 * milik peramban; gerak horizontal baru jadi seretan bila jelas dominan.
 * Gerak langsung ke `style.transform` per frame (bukan state React) dan
 * mengikuti `isMotionReduced()` yang dibaca sekali saat sentuhan dimulai.
 * Seret kanan TIDAK mengirim apa pun — hanya memanggil `onInvite` (lembar tinjau).
 */
export function useCardDrag(options: CardDragOptions) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const gesture = useRef<Gesture | null>(null);
  const springTimers = useRef(new Set<number>());

  const clearVisuals = useCallback((g: Gesture, resetStack: boolean) => {
    const { slot, stage } = g;
    delete slot.dataset.dragging;
    delete slot.dataset.armed;
    delete slot.dataset.reduced;
    delete stage.dataset.dragging;
    slot.style.removeProperty('transform');
    slot.style.removeProperty('--no');
    slot.style.removeProperty('--yes');
    if (resetStack) stage.style.setProperty('--q', '0');
  }, []);

  const finishSpring = useCallback((g: Gesture) => {
    if (g.reduced) {
      g.slot.style.removeProperty('will-change');
      return;
    }
    g.slot.dataset.spring = '';
    const timer = window.setTimeout(() => {
      springTimers.current.delete(timer);
      delete g.slot.dataset.spring;
      g.slot.style.removeProperty('will-change');
    }, SPRING_MS);
    springTimers.current.add(timer);
  }, []);

  const springBack = useCallback(
    (g: Gesture) => {
      if (g.frame !== null) cancelAnimationFrame(g.frame);
      g.frame = null;
      clearVisuals(g, true);
      finishSpring(g);
    },
    [clearVisuals, finishSpring],
  );

  const abort = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.frame !== null) cancelAnimationFrame(g.frame);
    g.frame = null;
    clearVisuals(g, true);
    g.slot.style.removeProperty('will-change');
  }, [clearVisuals]);

  useEffect(() => {
    if (!options.enabled) abort();
  }, [options.enabled, abort]);

  useEffect(() => {
    const timers = springTimers.current;
    return () => {
      abort();
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
    };
  }, [abort]);

  const render = useCallback((g: Gesture) => {
    g.frame = null;
    const { slot, stage, threshold, width, reduced, canInvite } = g;
    const offset = dragOffset(g.dx, { threshold, canInvite, reduced });
    slot.style.transform = `translate3d(${offset}px,0,0) rotate(${tiltFor(offset, width, reduced)}deg)`;

    const progress = dragProgress(g.dx, threshold);
    slot.style.setProperty('--no', String(stampStrength(progress, 'left')));
    slot.style.setProperty('--yes', canInvite ? String(stampStrength(progress, 'right')) : '0');

    const armed = isArmed(progress) && (progress < 0 || canInvite);
    if (armed) slot.dataset.armed = progress < 0 ? 'left' : 'right';
    else delete slot.dataset.armed;
    if (armed && !g.armed && !reduced && typeof navigator.vibrate === 'function') navigator.vibrate(8);
    g.armed = armed;

    if (!reduced) {
      const lift = progress < 0 || canInvite ? Math.min(1, Math.abs(progress)) : 0;
      stage.style.setProperty('--q', String(lift));
    }
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = optionsRef.current;
    if (!current.enabled || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // Pointer primer baru berarti yang lama sudah mati (mis. tombol tetikus dilepas di luar jendela).
    if (gesture.current) abort();
    const target = event.target;
    if (!(target instanceof Element) || target.closest(INTERACTIVE)) return;
    const slot = target.closest<HTMLElement>('[data-slot-id]');
    const stage = event.currentTarget;
    if (!slot || !stage.contains(slot) || slot.dataset.depth !== '0' || slot.dataset.leaving !== undefined) return;
    const id = slot.dataset.slotId;
    if (!id) return;
    if (event.pointerType === 'touch' && isInEdgeDeadZone(event.clientX, window.innerWidth)) return;

    const width = slot.offsetWidth;
    current.onPress();
    gesture.current = {
      pointerId: event.pointerId,
      slot,
      stage,
      id,
      startX: event.clientX,
      startY: event.clientY,
      startT: event.timeStamp,
      width,
      threshold: thresholdFor(width),
      reduced: isMotionReduced(),
      canInvite: current.canInviteOf(id),
      phase: 'pending',
      dx: 0,
      armed: false,
      samples: [{ x: event.clientX, t: event.timeStamp }],
      frame: null,
    };
  }, [abort]);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      // Tombol tetikus sudah tak ditekan = pointerup-nya hilang (dilepas di luar jendela): jangan jadikan hover seretan.
      if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
        if (g.phase === 'dragging') springBack(g);
        gesture.current = null;
        return;
      }
      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;

      if (g.phase === 'pending') {
        const intent = classifyMove(dx, dy);
        if (intent === 'pending') return;
        if (intent === 'vertical') {
          gesture.current = null;
          return;
        }
        g.phase = 'dragging';
        try {
          g.slot.setPointerCapture(g.pointerId);
        } catch {
          // Pointer sudah tak aktif; seretan berikutnya akan dibatalkan oleh pointercancel.
        }
        g.slot.dataset.dragging = '';
        g.stage.dataset.dragging = '';
        if (g.reduced) g.slot.dataset.reduced = '';
        g.slot.style.willChange = 'transform';
        window.getSelection()?.removeAllRanges();
      }

      g.dx = dx;
      g.samples.push({ x: event.clientX, t: event.timeStamp });
      if (g.samples.length > SAMPLE_LIMIT) g.samples.shift();
      if (g.frame === null) g.frame = requestAnimationFrame(() => render(g));
    },
    [render, springBack],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      gesture.current = null;
      const handlers = optionsRef.current;

      if (g.phase === 'pending') {
        if (isTap({ dist: Math.hypot(event.clientX - g.startX, event.clientY - g.startY), ms: event.timeStamp - g.startT })) handlers.onFlip(g.id);
        return;
      }

      if (g.frame !== null) cancelAnimationFrame(g.frame);
      g.frame = null;
      try {
        g.slot.releasePointerCapture(g.pointerId);
      } catch {
        // Sudah dilepas.
      }

      const decision = decideRelease({ dx: g.dx, vx: estimateVelocity(g.samples), width: g.width, canInvite: g.canInvite });
      if (decision === 'skip') {
        // Transform seretan dibuang di sini; terbang keluar diambil alih oleh deck lewat data-leaving.
        clearVisuals(g, false);
        g.slot.style.removeProperty('will-change');
        handlers.onSkip(g.id);
        return;
      }
      springBack(g);
      if (decision === 'invite') handlers.onInvite(g.id);
      else if (decision === 'blocked') handlers.onBlocked(g.id);
    },
    [clearVisuals, springBack],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      gesture.current = null;
      if (g.phase === 'dragging') springBack(g);
    },
    [springBack],
  );

  // Sentuhan sudah ditangkap implisit oleh elemen yang disentuh; memindahkan tangkapan ke slot
  // memicu lostpointercapture di elemen itu, dan peristiwa itu menggelembung sampai ke sini.
  // Hanya hilangnya tangkapan MILIK slot yang berarti seretan putus.
  const onLostPointerCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.target !== gesture.current?.slot) return;
      onPointerCancel(event);
    },
    [onPointerCancel],
  );

  return { handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture } };
}
