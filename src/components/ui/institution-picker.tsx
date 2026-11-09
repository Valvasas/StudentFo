'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, GraduationCap, PenLine, School } from 'lucide-react';
import { controlClass } from '@/components/ui/field';
import { INSTITUTION_KIND_LABEL, institutionDisplayName, isCampusKind, type InstitutionHit } from '@/lib/institution-kinds';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 180;

/**
 * Pemilih tempat studi (ADR-076) — combobox WAI-ARIA dengan saran dari
 * `/api/institusi`. Dua input terkirim: `idName` (NPSN/kode PT, hanya bila
 * dipilih dari daftar) dan `textName` (nama). Mengetik ulang setelah memilih
 * menghapus id — nama yang diketik bebas tidak pernah menyamar jadi entri
 * direktori. Tanpa JavaScript ini isian teks biasa yang tetap terkirim.
 */
export function InstitutionPicker({
  id,
  idName = 'institutionId',
  textName = 'institution',
  defaultId,
  defaultName,
  scope = 'semua',
  maxLength,
  minLength,
  required = false,
  describedBy,
  placeholder = 'Mis. Universitas Indonesia, SMAN 3 Bandung',
}: {
  id: string;
  idName?: string;
  textName?: string;
  defaultId: string | null;
  defaultName: string | null;
  scope?: 'semua' | 'kampus' | 'sekolah';
  maxLength: number;
  minLength?: number;
  required?: boolean;
  describedBy?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(defaultName ?? '');
  const [selected, setSelected] = useState<string | null>(defaultId);
  const [results, setResults] = useState<readonly InstitutionHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const statusId = useId();

  useEffect(() => {
    const query = text.trim();
    if (selected || query.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    const timer = window.setTimeout(() => {
      fetch(`/api/institusi?jenis=${scope}&q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((body: { results: InstitutionHit[] }) => {
          setResults(body.results);
          setActive(0);
          setStatus('idle');
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('error');
        });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, selected, scope]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const choose = (hit: InstitutionHit) => {
    setText(institutionDisplayName(hit.name, hit.short));
    setSelected(hit.id);
    setOpen(false);
  };

  const typed = text.trim().length >= 2;
  // Tampil juga saat hasilnya nol: justru saat itulah "Lainnya" paling dibutuhkan.
  const showList = open && !selected && typed && (results.length > 0 || status !== 'loading');

  const keepTyped = () => {
    setSelected(null);
    setOpen(false);
  };
  // Baris terakhir "Lainnya" = pakai teks yang diketik apa adanya (kursus, pesantren tanpa NPSN, luar negeri).
  const rowCount = results.length + 1;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (event.key === 'ArrowDown' && typed) setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % rowCount);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + rowCount) % rowCount);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = results[active];
      if (hit) choose(hit);
      else keepTyped();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };


  const hint = selected
    ? 'Terpilih dari direktori resmi.'
    : status === 'error'
      ? 'Saran gagal dimuat — nama yang kamu ketik tetap tersimpan.'
      : text.trim().length >= 2 && status === 'idle' && results.length === 0
        ? 'Tidak ada di direktori — tidak apa-apa, nama yang kamu ketik tersimpan apa adanya.'
        : '';

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <input type="hidden" name={idName} value={selected ?? ''} />
      <div className="relative">
        <input
          id={id}
          name={textName}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-describedby={[describedBy, statusId].filter(Boolean).join(' ')}
          autoComplete="off"
          value={text}
          maxLength={maxLength}
          minLength={minLength}
          required={required}
          placeholder={placeholder}
          onChange={(event) => {
            setText(event.target.value);
            setSelected(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(controlClass, selected && 'pr-10')}
        />
        {selected && <Check aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-success" />}
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Saran tempat studi"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-card border border-line bg-panel p-1 shadow-pop"
          >
            {results.map((hit, index) => {
              const Icon = isCampusKind(hit.kind) ? GraduationCap : School;
              return (
                <li
                  key={hit.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(hit)}
                  onPointerEnter={() => setActive(index)}
                  className={cn('flex min-h-11 cursor-pointer items-start gap-2.5 rounded-sm px-2.5 py-2 text-sm', index === active && 'bg-panel-nested')}
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{institutionDisplayName(hit.name, hit.short)}</span>
                    <span className="text-[12.5px] text-ink-muted">
                      {INSTITUTION_KIND_LABEL[hit.kind]}
                      {!isCampusKind(hit.kind) && (hit.negeri ? ' negeri' : ' swasta')}
                      {hit.region ? ` · ${hit.region}` : ''}
                    </span>
                  </span>
                </li>
              );
            })}
            <li
              id={`${listId}-${results.length}`}
              role="option"
              aria-selected={active === results.length}
              onPointerDown={(event) => event.preventDefault()}
              onClick={keepTyped}
              onPointerEnter={() => setActive(results.length)}
              className={cn(
                'mt-1 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm border-t border-line px-2.5 py-2 text-sm',
                active === results.length && 'bg-panel-nested',
              )}
            >
              <PenLine aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 break-words">
                Lainnya: pakai “<span className="font-medium">{text.trim()}</span>” apa adanya
              </span>
            </li>
          </ul>
        )}
      </div>
      <p id={statusId} aria-live="polite" className={cn('text-[12.5px] text-ink-muted', !hint && 'sr-only')}>
        {hint || (status === 'loading' ? 'Mencari…' : '')}
      </p>
    </div>
  );
}
