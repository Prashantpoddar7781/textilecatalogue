import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { MillReceiptTakaRow } from '../types';

interface Props {
  open: boolean;
  rows: MillReceiptTakaRow[];
  onClose: () => void;
  onApply: (rows: MillReceiptTakaRow[]) => void;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export const MillReceiptTakaModal: React.FC<Props> = ({ open, rows, onClose, onApply }) => {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [recMtsBySr, setRecMtsBySr] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    const initial: Record<number, string> = {};
    for (const row of rows) {
      initial[row.srNo] = String(row.recMts ?? row.greyMts ?? '');
    }
    setRecMtsBySr(initial);
  }, [open, rows]);

  const selectedRows = useMemo(() => {
    return rows
      .filter(row => selected.has(row.srNo))
      .map(row => {
        const greyMts = round2(row.greyMts);
        const recMts = round2(Number(recMtsBySr[row.srNo]) || 0);
        const shortMts = round2(Math.max(0, greyMts - recMts));
        const shortPct = greyMts > 0 ? round2((shortMts / greyMts) * 100) : 0;
        return { srNo: row.srNo, greyMts, recMts, shortMts, shortPct };
      });
  }, [rows, selected, recMtsBySr]);

  const totals = useMemo(() => ({
    greyMts: round2(selectedRows.reduce((s, r) => s + r.greyMts, 0)),
    recMts: round2(selectedRows.reduce((s, r) => s + r.recMts, 0)),
    taka: selectedRows.length
  }), [selectedRows]);

  if (!open) return null;

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (srNo: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(srNo)) next.delete(srNo);
      else next.add(srNo);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map(row => row.srNo)));
  };

  const handleApply = () => {
    if (!selectedRows.length) return;
    onApply(selectedRows);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Taka Details</h3>
            <p className="text-xs text-gray-500">
              Grey Mts: {totals.greyMts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              {' · '}
              Fin Mts: {totals.recMts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No taka left to receive for this dispatch.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="w-12 p-2">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th className="p-2">Taka Sr.</th>
                  <th className="p-2 text-right">Grey M</th>
                  <th className="p-2 text-right">Rec Mts</th>
                  <th className="p-2 text-right">Short %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const greyMts = round2(row.greyMts);
                  const recMts = round2(Number(recMtsBySr[row.srNo]) || 0);
                  const shortPct = greyMts > 0 ? round2((Math.max(0, greyMts - recMts) / greyMts) * 100) : 0;
                  return (
                    <tr
                      key={row.srNo}
                      className="cursor-pointer border-b hover:bg-teal-50"
                      onClick={() => toggle(row.srNo)}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(row.srNo)}
                          onChange={() => toggle(row.srNo)}
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td className="p-2 font-semibold">{row.srNo}</td>
                      <td className="p-2 text-right font-bold">
                        {greyMts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                        <input
                          type="number"
                          step="0.01"
                          value={recMtsBySr[row.srNo] ?? ''}
                          onChange={e => setRecMtsBySr(prev => ({ ...prev, [row.srNo]: e.target.value }))}
                          className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm font-bold outline-none focus:border-teal-400"
                        />
                      </td>
                      <td className="p-2 text-right font-semibold text-rose-700">{shortPct.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t bg-teal-50 px-4 py-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <p><span className="font-black text-gray-600">Rec. Taka:</span> <span className="font-black text-teal-900">{totals.taka}</span></p>
            <p><span className="font-black text-gray-600">Grey Mts:</span> <span className="font-black text-teal-900">{totals.greyMts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></p>
            <p><span className="font-black text-gray-600">Fin Mts:</span> <span className="font-black text-teal-900">{totals.recMts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></p>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
            <button
              type="button"
              onClick={handleApply}
              disabled={selectedRows.length === 0}
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              Apply Received Takas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
