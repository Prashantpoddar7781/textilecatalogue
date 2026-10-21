import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { GreyTakaDetailRow } from '../types';
import { ErpFormShell, useErpFormActions } from './ErpFormShell';

interface Props {
  open: boolean;
  rows: GreyTakaDetailRow[];
  onClose: () => void;
  onApply: (rows: GreyTakaDetailRow[]) => void;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

const TakaMetresGrid: React.FC<{
  rows: GreyTakaDetailRow[];
  setRows: React.Dispatch<React.SetStateAction<GreyTakaDetailRow[]>>;
}> = ({ rows, setRows }) => {
  const actions = useErpFormActions();
  const mtrsRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const first = mtrsRefs.current[0];
      first?.focus();
      first?.select();
    }, 40);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (pendingFocus.current == null) return;
    const index = pendingFocus.current;
    pendingFocus.current = null;
    const timer = window.setTimeout(() => {
      const field = mtrsRefs.current[index];
      field?.focus();
      field?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rows]);

  const onMetresEnter = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    const metres = Number(rows[index]?.mts) || 0;
    if (metres <= 0) {
      actions?.requestSave();
      return;
    }
    if (index < rows.length - 1) {
      const next = mtrsRefs.current[index + 1];
      next?.focus();
      next?.select();
      return;
    }
    pendingFocus.current = index + 1;
    setRows(prev => [...prev, { srNo: prev.length + 1, mts: 0 }]);
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-xs font-semibold text-violet-800">
          Type metres and press Enter for the next taka. Enter on a blank metres asks to save.
        </p>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
            <tr>
              <th className="w-24 p-2">Sr. No.</th>
              <th className="p-2">Mtrs</th>
              <th className="w-12 p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b">
                <td className="p-2">
                  <input
                    type="number"
                    data-erp-skip-nav
                    tabIndex={-1}
                    className="w-full rounded-lg border bg-gray-50 px-2 py-1.5 text-sm font-semibold"
                    value={row.srNo}
                    onChange={e => setRows(prev => prev.map((item, i) => i === index ? { ...item, srNo: Number(e.target.value) || 0 } : item))}
                  />
                </td>
                <td className="p-2">
                  <input
                    ref={el => { mtrsRefs.current[index] = el; }}
                    type="number"
                    step="0.01"
                    data-erp-enter-custom
                    className="w-full rounded-lg border px-2 py-1.5 text-sm font-semibold"
                    value={row.mts || ''}
                    onChange={e => setRows(prev => prev.map((item, i) => i === index ? { ...item, mts: Number(e.target.value) || 0 } : item))}
                    onKeyDown={e => onMetresEnter(index, e)}
                  />
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setRows(prev => {
                      const next = prev.filter((_, i) => i !== index);
                      return next.length ? next.map((item, i) => ({ ...item, srNo: i + 1 })) : [{ srNo: 1, mts: 0 }];
                    })}
                    className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export const TakaDetailsModal: React.FC<Props> = ({ open, rows, onClose, onApply }) => {
  const [localRows, setLocalRows] = useState<GreyTakaDetailRow[]>([{ srNo: 1, mts: 0 }]);
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setSeenOpen(true);
    setLocalRows(rows.length > 0 ? rows : [{ srNo: 1, mts: 0 }]);
  }
  if (!open && seenOpen) setSeenOpen(false);

  const totalTaka = localRows.filter(row => Number(row.mts) > 0).length;
  const totalMts = useMemo(
    () => round2(localRows.reduce((sum, row) => sum + (Number(row.mts) || 0), 0)),
    [localRows]
  );

  if (!open) return null;

  const handleApply = () => {
    const cleaned = localRows
      .filter(row => Number(row.mts) > 0)
      .map((row, i) => ({ srNo: row.srNo || i + 1, mts: round2(Number(row.mts) || 0) }));
    onApply(cleaned);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Taka Details</h3>
            <p className="text-xs text-gray-500">Sr. 1 metres first. Enter keeps adding the next taka.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ErpFormShell
          onSave={handleApply}
          showHint={false}
          confirmTitle="Save taka details?"
          confirmMessage="Press Yes to update Rec. Taka and Rec. Mts from this breakdown."
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TakaMetresGrid rows={localRows} setRows={setLocalRows} />
          <div className="border-t bg-violet-50 px-4 py-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <p><span className="font-black text-gray-600">Total Taka:</span> <span className="font-black text-violet-900">{totalTaka}</span></p>
              <p><span className="font-black text-gray-600">Total Mtrs:</span> <span className="font-black text-violet-900">{totalMts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></p>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
              <SaveTakaButton />
            </div>
          </div>
        </ErpFormShell>
      </div>
    </div>
  );
};

const SaveTakaButton: React.FC = () => {
  const actions = useErpFormActions();
  return (
    <button
      type="button"
      onClick={() => actions?.requestSave()}
      className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white"
    >
      Apply to Rec. Taka / Mts
    </button>
  );
};
