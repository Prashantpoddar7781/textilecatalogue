import React, { useMemo, useState } from 'react';
import { partyNameMatches } from '../utils/partyNameMatch';

interface Props {
  value: string;
  onChange: (value: string) => void;
  names: string[];
  placeholder?: string;
}

/** Type a party name and pick it from the matches. A near spelling still appears. */
export const PartyNameField: React.FC<Props> = ({ value, onChange, names, placeholder }) => {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = value.trim();
    if (!q) return [];
    return names.filter(name => partyNameMatches(q, name)).slice(0, 20);
  }, [names, value]);

  return (
    <div className="relative">
      <input
        className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold"
        value={value}
        placeholder={placeholder || 'Type a party name'}
        onChange={e => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white shadow-lg">
          {matches.map(name => (
            <li key={name}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-amber-50"
                onMouseDown={e => {
                  e.preventDefault();
                  onChange(name);
                  setOpen(false);
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
