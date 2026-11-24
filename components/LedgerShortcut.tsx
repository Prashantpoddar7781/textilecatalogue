import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AccountLedgerPage } from './AccountLedgerPage';
import { getErpSession } from '../services/erpSession';
import { partyNameFromFocus } from '../utils/ledgerShortcut';

/** Ctrl+L opens the ledger over the current ERP screen. Esc closes it. */
export const LedgerShortcut: React.FC = () => {
  const [party, setParty] = useState<string | null>(null);
  const openRef = useRef(false);
  openRef.current = party !== null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ledgerOpen = openRef.current;
      if (key === 'escape' && ledgerOpen) {
        event.preventDefault();
        event.stopPropagation();
        setParty(null);
        return;
      }
      if (key !== 'l' || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
      if (!window.location.pathname.startsWith('/erp')) return;
      event.preventDefault();
      event.stopPropagation();
      if (ledgerOpen) {
        setParty(null);
        return;
      }
      const onLedger = window.location.pathname.replace(/\/$/, '') === '/erp/ledger';
      if (onLedger) {
        document.querySelector<HTMLInputElement>('[data-ledger-search]')?.focus();
        return;
      }
      setParty(partyNameFromFocus());
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (party === null) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-auto bg-[#F6F7FB]">
      <AccountLedgerPage
        embedded
        initialParty={party}
        erpSession={getErpSession()}
        onBack={() => setParty(null)}
      />
    </div>,
    document.body
  );
};
