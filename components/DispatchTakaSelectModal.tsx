import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { GreyTakaDetailRow } from '../types';

interface Props {
  open: boolean;
  rows: GreyTakaDetailRow[];
  onClose: () => void;
  onApply: (rows: GreyTakaDetailRow[]) => void;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export const DispatchTakaSelectModal: React.FC<Props> = ({ open, rows, onClose, onApply }) => {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open, rows]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const selectedRows = useMemo(
    () => rows.filter(row => selected.has(row.srNo)),
    [rows, selected]
  );
  const totalTaka = selectedRows.length;
  const totalMts = round2(selectedRows.reduce((sum, row) => sum + (Number(row.mts) || 0), 0));

  if (!open) return null;

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
    onApply(selectedRows);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Select Taka for Dispatch</h3>
            <p className="text-xs text-gray-500">Choose grey receipt rolls to send to the mill</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No taka available to dispatch for this receipt.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="w-12 p-2">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th className="p-2">Pur</th>
                  <th className="p-2">Taka S</th>
                  <th className="p-2 text-right">Mts.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.srNo} className="cursor-pointer border-b hover:bg-indigo-50" onClick={() => toggle(row.srNo)}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(row.srNo)}
                        onChange={() => toggle(row.srNo)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="p-2 text-gray-500">0</td>
                    <td className="p-2 font-semibold">{row.srNo}</td>
                    <td className="p-2 text-right font-bold">{row.mts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t bg-violet-50 px-4 py-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <p><span className="font-black text-gray-600">Desp. Taka:</span> <span className="font-black text-violet-900">{totalTaka}</span></p>
            <p><span className="font-black text-gray-600">Desp. Mtrs:</span> <span className="font-black text-violet-900">{totalMts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></p>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
            <button
              type="button"
              onClick={handleApply}
              disabled={selectedRows.length === 0}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              Apply to Desp. Taka / Mts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
