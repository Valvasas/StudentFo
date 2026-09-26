'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PickerOption {
  readonly label: string;
  readonly group?: string;
  readonly sub?: string;
  readonly count?: number;
}

export interface PinnedOption extends PickerOption {
  /** Nilai yang dikirim ke `onChange`; default = label. */
  readonly value?: string;
  readonly icon?: ReactNode;
}

export type PickKind = 'item' | 'group' | 'custom' | 'pinned';

interface Row {
  readonly key: string;
  readonly kind: 'head' | 'option' | 'separator';
  readonly label: string;
  readonly value: string;
  readonly pickKind: PickKind;
  readonly selectable: boolean;
  readonly sub?: string;
  readonly count?: number;
  readonly icon?: ReactNode;
}

/**
 * Pemilih melayang dengan pencarian (kanvas desain `StudentHubPicker`):
 * kota per provinsi, kampus, program studi.
 *
 * Pola combobox WAI-ARIA: fokus tetap di kotak cari, ↑/↓ memindah opsi aktif
 * lewat `aria-activedescendant`, Enter memilih, Esc menutup dan
 * mengembalikan fokus ke tombol pemicu. Kelompok (provinsi) bisa dipilih
 * sekaligus bila `groupSelectable`.
 */
export function Picker({
  value,
  displayValue,
  onChange,
  options,
  pinned = [],
  title,
  placeholder,
  searchPlaceholder = 'Ketik untuk mencari',
  variant = 'field',
  align = 'left',
  icon,
  groupSelectable = false,
  allowCustom = false,
  id,
  labelledBy,
}: {
  value: string;
  displayValue?: string;
  onChange: (value: string, kind: PickKind) => void;
  options: readonly PickerOption[];
  pinned?: readonly PinnedOption[];
  title: string;
  placeholder: string;
  searchPlaceholder?: string;
  variant?: 'field' | 'pill';
  align?: 'left' | 'right';
  icon?: ReactNode;
  groupSelectable?: boolean;
  allowCustom?: boolean;
  id?: string;
  labelledBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;

  const { rows, selectable, total, custom } = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const hit = (option: PickerOption) =>
      !needle || `${option.label} ${option.group ?? ''} ${option.sub ?? ''}`.toLowerCase().includes(needle);
    const built: Row[] = [];
    for (const option of pinned.filter(hit)) {
      built.push({ key: `p-${option.label}`, kind: 'option', label: option.label, value: option.value ?? option.label, pickKind: 'pinned', selectable: true, sub: option.sub, count: option.count, icon: option.icon });
    }
    const groups = new Map<string, PickerOption[]>();
    for (const option of options.filter(hit)) {
      const group = option.group ?? '';
      groups.set(group, [...(groups.get(group) ?? []), option]);
    }
    if (built.length > 0 && groups.size > 0) built.push({ key: 'sep', kind: 'separator', label: '', value: '', pickKind: 'item', selectable: false });
    for (const [group, items] of groups) {
      if (group) built.push({ key: `g-${group}`, kind: 'head', label: group, value: group, pickKind: 'group', selectable: groupSelectable });
      for (const option of items) {
        built.push({ key: `o-${group}-${option.label}`, kind: 'option', label: option.label, value: option.label, pickKind: 'item', selectable: true, sub: option.sub, count: option.count });
      }
    }
    const exact = [...options, ...pinned].some((option) => option.label.toLowerCase() === needle);
    const withCustom = allowCustom && needle.length > 0 && !exact;
    const pickable = built.filter((row) => row.selectable);
    return { rows: built, selectable: pickable, total: options.filter(hit).length, custom: withCustom };
  }, [search, options, pinned, groupSelectable, allowCustom]);

  const optionCount = selectable.length + (custom ? 1 : 0);
  const activeIndex = Math.min(active, Math.max(optionCount - 1, 0));
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)?.scrollIntoView({ block: 'nearest' });
    // optionId stabil untuk baseId yang sama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    setSearch('');
    setActive(0);
    if (refocus) triggerRef.current?.focus();
  };
  const choose = (next: string, kind: PickKind) => {
    onChange(next, kind);
    close(true);
  };
  const chooseIndex = (index: number) => {
    if (custom && index === selectable.length) return choose(search.trim(), 'custom');
    const row = selectable[index];
    if (row) choose(row.value, row.pickKind);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(Math.min(activeIndex + 1, optionCount - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      chooseIndex(activeIndex);
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const shown = displayValue ?? value;
  let selectableIndex = -1;

  return (
    <div ref={rootRef} className="relative flex flex-col">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelledBy ? `${labelledBy} ${id ?? ''}`.trim() : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'flex items-center gap-2.5 text-left transition-colors duration-150 ease-snap',
          variant === 'field'
            ? cn('h-11 w-full rounded-card border bg-panel pl-3.5 pr-3 text-base hover:border-brand', open ? 'border-brand shadow-[0_0_0_3px_rgba(25,25,25,.08)]' : 'border-line-strong/70')
            : cn('h-12 whitespace-nowrap rounded-sm px-3.5 text-[14.5px] font-medium hover:bg-panel-nested', open && 'bg-panel-nested'),
        )}
      >
        {icon && <span className="flex text-ink-muted">{icon}</span>}
        <span className={cn('min-w-0 flex-1 truncate', !shown && 'text-ink-faint', variant === 'pill' && 'max-w-[200px]')}>{shown || placeholder}</span>
        <ChevronDown aria-hidden className={cn('size-4 text-ink-muted transition-transform duration-200 ease-snap', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={title}
          onKeyDown={onKeyDown}
          className={cn(
            'pop absolute top-[calc(100%+8px)] z-[60] flex max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-modal border border-line bg-panel shadow-overlay',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            variant === 'field' ? 'w-full min-w-[280px]' : 'w-[340px]',
          )}
        >
          <div className="flex flex-col gap-2.5 border-b border-line px-3.5 pb-2.5 pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-semibold">{title}</span>
              <span className="font-mono text-[11.5px] text-ink-muted">{total} pilihan</span>
            </div>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-ink-muted" />
              <input
                ref={inputRef}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setActive(0);
                }}
                placeholder={searchPlaceholder}
                role="combobox"
                aria-label={`Cari ${title.toLowerCase()}`}
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={optionCount > 0 ? optionId(activeIndex) : undefined}
                className="h-11 w-full rounded-sm border border-line-strong/70 bg-panel pl-9 pr-11 text-base focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-focus sm:h-9 sm:text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Hapus pencarian"
                  className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-ink-muted hover:text-ink"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div ref={listRef} id={listId} role="listbox" aria-label={title} className="flex max-h-80 flex-col overflow-y-auto overscroll-contain p-1.5">
            {rows.map((row) => {
              if (row.kind === 'separator') return <div key={row.key} role="presentation" className="mx-1 my-1.5 h-px bg-line" />;
              const index = row.selectable ? ++selectableIndex : -1;
              const selected = row.selectable && row.value === value;
              const hot = row.selectable && index === activeIndex;
              if (row.kind === 'head') {
                return (
                  <div key={row.key} role="presentation" className="sticky -top-1.5 z-[1] flex items-center justify-between gap-2 bg-panel px-2 pb-1 pt-2.5">
                    <span className="font-mono text-[11px] uppercase tracking-[.06em] text-ink-muted">{row.label}</span>
                    {row.selectable && (
                      <div
                        id={optionId(index)}
                        role="option"
                        aria-selected={selected}
                        aria-label={`Semua kota di ${row.label}`}
                        onPointerEnter={() => setActive(index)}
                        onClick={() => choose(row.value, 'group')}
                        className={cn('flex h-6 cursor-pointer items-center gap-1 rounded-[6px] px-2 text-xs font-semibold', hot ? 'bg-panel-nested' : 'hover:bg-panel-nested')}
                      >
                        {selected && <Check aria-hidden className="size-3" strokeWidth={2.4} />}
                        Semua kota
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={row.key}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => choose(row.value, row.pickKind)}
                  className={cn('flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm py-[7px] pl-2.5 pr-2', hot && 'bg-panel-nested')}
                >
                  {row.icon && <span className="flex text-ink-muted">{row.icon}</span>}
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className={cn('truncate text-sm', selected ? 'font-semibold' : 'font-medium')}>{row.label}</span>
                    {row.sub && <span className="truncate text-xs text-ink-muted">{row.sub}</span>}
                  </span>
                  {row.count ? <span className="text-xs text-ink-muted">{row.count}</span> : null}
                  <span className="flex w-4">{selected && <Check aria-hidden className="size-[15px]" strokeWidth={2.4} />}</span>
                </div>
              );
            })}
            {rows.length === 0 && !custom && (
              <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
                <span className="text-sm font-semibold">Tidak ada yang cocok</span>
                <span className="text-[12.5px] text-ink-muted">Coba ejaan lain atau ketik nama singkatnya.</span>
              </div>
            )}
            {custom && (
              <div
                id={optionId(selectable.length)}
                role="option"
                aria-selected={false}
                onPointerEnter={() => setActive(selectable.length)}
                onClick={() => choose(search.trim(), 'custom')}
                className={cn('mt-1 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm border border-dashed border-line-strong px-2.5 text-sm', activeIndex === selectable.length && 'bg-panel-nested')}
              >
                <Plus aria-hidden className="size-[15px]" />
                Pakai “{search.trim()}”
              </div>
            )}
          </div>

          <div aria-hidden className="hidden items-center gap-3.5 border-t border-line bg-panel-nested px-3.5 py-2 text-[11.5px] text-ink-muted sm:flex">
            {[
              ['↑↓', 'pilih'],
              ['Enter', 'konfirmasi'],
              ['Esc', 'tutup'],
            ].map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5">
                <kbd className="rounded border border-line bg-panel px-1.5 font-mono text-ink-soft">{key}</kbd>
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
