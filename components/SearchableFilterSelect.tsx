import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

export type FilterOption = {
  value: string;
  label: string;
};

interface Props {
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  className?: string;
  triggerClassName?: string;
  searchable?: boolean;
}

const triggerClassName =
  "bg-white border-2 border-gray-100 px-4 py-2.5 rounded-2xl text-xs font-bold outline-none shadow-sm touch-manipulation inline-flex items-center gap-2 max-w-[14rem]";

export const SearchableFilterSelect: React.FC<Props> = ({
  value,
  options,
  onChange,
  searchPlaceholder = 'Type to search…',
  className = '',
  triggerClassName: triggerClassNameOverride,
  searchable = true
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label || 'Select',
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const spaceAbove = r.top - 12;
      const maxHeight = Math.min(360, Math.max(180, Math.max(spaceBelow, spaceAbove)));
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      setMenuStyle({
        width,
        left,
        maxHeight,
        top: openUp ? undefined : r.bottom + 6,
        bottom: openUp ? window.innerHeight - r.top + 6 : undefined
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open, searchable]);

  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setQuery('');
          setOpen((prev) => !prev);
        }}
        className={triggerClassNameOverride || triggerClassName}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[80] bg-white border-2 border-gray-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={menuStyle}
        >
          {searchable && (
            <div className="p-2 border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}
          <ul className="flex-1 min-h-0 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-500 font-semibold">No matches</li>
            ) : (
              filtered.map((option) => {
                const selected = option.value === value;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`w-full text-left px-4 py-3 text-sm font-bold touch-manipulation ${
                        selected ? 'bg-indigo-50 text-indigo-700' : 'text-gray-800 hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        onChange(option.value);
                        close();
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
};
