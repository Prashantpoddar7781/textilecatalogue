import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { partiesApi } from '../services/api';
import { AccountParty } from '../types';
import { PartyEntryContext } from '../constants/accountTypes';
import { AccountsInformationDialog, AddPartyConfirmDialog } from './AccountsInformationDialog';

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Shown in the suggestion list. A name already saved as any party is not asked again. */
  suggestPattern?: RegExp;
  extraKnownNames?: string[];
  suggestedAccountType?: string;
  context?: PartyEntryContext;
  listId?: string;
  placeholder?: string;
  onPartySaved?: (party: AccountParty) => void;
}

/** Free-typed name. If it is not already in the party master, ask and open Accounts Information. */
export const MasterNameInput: React.FC<Props> = ({
  value,
  onChange,
  className,
  suggestPattern,
  extraKnownNames = [],
  suggestedAccountType,
  context = 'other',
  listId,
  placeholder,
  onPartySaved
}) => {
  const [parties, setParties] = useState<AccountParty[]>([]);
  const [pending, setPending] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const asked = useRef('');

  useEffect(() => {
    let cancelled = false;
    partiesApi.list()
      .then(result => { if (!cancelled) setParties(result.parties || []); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const known = useMemo(() => {
    const names = new Set(parties.map(party => party.name.trim().toLowerCase()));
    for (const name of extraKnownNames) {
      const key = name.trim().toLowerCase();
      if (key) names.add(key);
    }
    return names;
  }, [parties, extraKnownNames]);

  const suggestions = useMemo(() => {
    const fromParties = parties
      .filter(party => !suggestPattern || suggestPattern.test(party.accountType || ''))
      .map(party => party.name);
    return Array.from(new Set([...extraKnownNames, ...fromParties].map(name => name.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }, [parties, extraKnownNames, suggestPattern]);

  const ask = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (known.has(trimmed.toLowerCase())) return;
    if (asked.current === trimmed.toLowerCase()) return;
    asked.current = trimmed.toLowerCase();
    setPending(trimmed);
    setConfirmOpen(true);
  };

  return (
    <>
      <input
        className={className}
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={e => ask(e.target.value)}
      />
      {listId && (
        <datalist id={listId}>
          {suggestions.map(name => <option key={name} value={name} />)}
        </datalist>
      )}
      {createPortal(
        <>
          <AddPartyConfirmDialog
            open={confirmOpen}
            partyName={pending}
            onNo={() => {
              setConfirmOpen(false);
              asked.current = '';
            }}
            onYes={() => {
              setConfirmOpen(false);
              setDialogOpen(true);
            }}
          />
          <AccountsInformationDialog
            open={dialogOpen}
            initialName={pending}
            context={context}
            suggestedAccountType={suggestedAccountType}
            onClose={() => {
              setDialogOpen(false);
              asked.current = '';
            }}
            onSaved={party => {
              setParties(prev => prev.some(row => row.id === party.id) ? prev : [...prev, party]);
              onChange(party.name);
              onPartySaved?.(party);
              setDialogOpen(false);
              asked.current = party.name.trim().toLowerCase();
            }}
          />
        </>,
        document.body
      )}
    </>
  );
};
