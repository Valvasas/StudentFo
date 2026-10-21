'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { CandidateRelation } from '@/types/domain';

/**
 * Satu kartu di tumpukan. Hanya data polos + `card` (hasil render server):
 * fungsi seperti `categoryName` tidak bisa menyeberang ke komponen klien,
 * jadi semua teks sudah dirakit di server.
 */
export interface DeckSlide {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly score: number;
  readonly chemistry: string;
  readonly reason: string | null;
  readonly relation: CandidateRelation;
  readonly canInvite: boolean;
  readonly card: ReactNode;
}

export type DeckVia = 'button' | 'gesture' | 'key';

export interface DeckApi {
  /** `false` di server dan sebelum hidrasi: tombol hanya-JS tidak dirender (tak ada tombol mati). */
  readonly live: boolean;
  readonly skip: (id: string, via?: DeckVia) => void;
  readonly flip: (id: string) => void;
  readonly requestInvite: (id: string, via: DeckVia) => void;
  readonly skippedCount: number;
  readonly restoreAll: () => void;
}

const DeckContext = createContext<DeckApi | null>(null);

export function DeckProvider({ value, children }: { value: DeckApi; children: ReactNode }) {
  return <DeckContext.Provider value={value}>{children}</DeckContext.Provider>;
}

/** Konteks mengalir lewat anak yang dirender server; null di luar tumpukan. */
export function useDeck(): DeckApi | null {
  return useContext(DeckContext);
}
