import React, { useEffect, useRef, useState } from 'react';
import { GST_TYPE_OPTIONS, canonicalGstType } from '../utils/partyGst';

export const GstTypeSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  className?: string;
}> = ({ value, onChange, className }) => (
  <select className={className} value={canonicalGstType(value)} onChange={e => onChange(e.target.value)}>
    <option value="">Select</option>
    {GST_TYPE_OPTIONS.map(option => (
      <option key={option} value={option}>{option}</option>
    ))}
  </select>
);

export const MissingGstDialog: React.FC<{
  open: boolean;
  partyName: string;
  onYes: () => void;
  onNo: () => void;
}> = ({ open, partyName, onYes, onNo }) => {
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => yesRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">GST</p>
        <h3 className="mt-1 text-base font-black text-slate-900">
          GST is not present in the master. Do you want to continue?
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          {partyName ? `${partyName} has no GSTIN on the account.` : 'This party has no GSTIN on the account.'}
          {' '}Yes keeps the party. You can then pick Local GST, Interstate GST, or Non GST.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onNo} className="rounded-lg border px-4 py-2 text-xs font-black uppercase text-slate-600">
            No
          </button>
          <button
            ref={yesRef}
            type="button"
            onClick={onYes}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white"
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
};

/** Ask once when the chosen master party has no GSTIN. Yes runs `yes`, No runs `no`. */
export function useMissingGstPrompt() {
  const [open, setOpen] = useState(false);
  const [partyName, setPartyName] = useState('');
  const yesRef = useRef<() => void>(() => {});
  const noRef = useRef<() => void>(() => {});
  const asked = useRef('');

  const askIfMissing = (
    party: { name: string; gstNumber?: string | null },
    yes: () => void,
    no: () => void
  ) => {
    if (String(party.gstNumber || '').trim()) {
      yes();
      return;
    }
    const key = party.name.trim().toLowerCase();
    if (asked.current === key) {
      yes();
      return;
    }
    yesRef.current = () => {
      asked.current = key;
      setOpen(false);
      yes();
    };
    noRef.current = () => {
      asked.current = '';
      setOpen(false);
      no();
    };
    setPartyName(party.name);
    setOpen(true);
  };

  const dialog = (
    <MissingGstDialog
      open={open}
      partyName={partyName}
      onYes={() => yesRef.current()}
      onNo={() => noRef.current()}
    />
  );

  return { askIfMissing, dialog };
}
