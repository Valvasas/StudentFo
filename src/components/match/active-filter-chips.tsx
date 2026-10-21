import Link from 'next/link';
import { X } from 'lucide-react';
import { PAGE } from '@/app/teams/cocok/shared';
import { filterTokens, releaseFilter } from '@/lib/match-filter-release';
import { serializeMatchQuery, type MatchQuery } from '@/lib/matchmaking';

/**
 * Satu <a> per saringan aktif; mengetuknya melepas saringan itu (URL kanonik
 * tanpa `cari=1`, jadi radar tidak berputar). Saringan aktif tetap terlihat
 * walau <details> saringan tertutup.
 */
export function ActiveFilterChips({ query }: { query: MatchQuery }) {
  const tokens = filterTokens(query);
  if (tokens.length === 0) return null;
  return (
    <ul aria-label="Saringan aktif" className="flex flex-wrap gap-2">
      {tokens.map((token) => (
        <li key={`${token.key}-${token.skill ?? ''}`}>
          <Link
            href={`${PAGE}${serializeMatchQuery(releaseFilter(query, token.key, token.skill))}`}
            scroll={false}
            className="press relative inline-flex h-9 items-center gap-1.5 rounded-pill border border-line-strong bg-panel px-3 text-[13px] font-medium text-ink hover:bg-panel-nested after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
          >
            <span className="sr-only">Lepas saringan </span>
            {token.label}
            <X aria-hidden className="size-3.5 text-ink-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
