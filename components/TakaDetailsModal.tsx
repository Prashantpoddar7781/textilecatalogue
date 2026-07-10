import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { GreyTakaDetailRow } from '../types';

interface Props {
  open: boolean;
  rows: GreyTakaDetailRow[];
  onClose: () => void;
  onApply: (rows: GreyTakaDetailRow[]) => void;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export const TakaDetailsModal: React.FC<Props> = ({ open, rows, onClose, onApply }) => {
  const [localRows, setLocalRows] = useState<GreyTakaDetailRow[]>([]);

  useEffect(() => {
    if (open) {
      setLocalRows(rows.length > 0 ? rows : [{ srNo: 1, mts: 0 }]);
    }
  }, [open, rows]);

  const totalTaka = localRows.filter(r => Number(r.mts) > 0 || r.srNo).length;
  const totalMts = useMemo(
    () => round2(localRows.reduce((sum, row) => sum + (Number(row.mts) || 0), 0)),
    [localRows]
  );

  if (!open) return null;

  const updateRow = (index: number, field: keyof GreyTakaDetailRow, value: string) => {
    setLocalRows(prev => prev.map((row, i) => {
      if (i !== index) return row;
      if (field === 'srNo') return { ...row, srNo: Number(value) || 0 };
      return { ...row, mts: Number(value) || 0 };
    }));
  };

  const addRow = () => {
    setLocalRows(prev => [...prev, { srNo: prev.length + 1, mts: 0 }]);
  };

  const removeRow = (index: number) => {
    setLocalRows(prev => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next.map((row, i) => ({ ...row, srNo: i + 1 })) : [{ srNo: 1, mts: 0 }];
    });
  };

  const handleApply = () => {
    const cleaned = localRows
      .filter(row => Number(row.mts) > 0)
      .map((row, i) => ({ srNo: row.srNo || i + 1, mts: round2(Number(row.mts) || 0) }));
    onApply(cleaned.length ? cleaned : []);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Taka Details</h3>
            <p className="text-xs text-gray-500">Enter serial no. and meters per taka roll</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
              <tr>
                <th className="w-24 p-2">Sr. No.</th>
                <th className="p-2">Mtrs</th>
                <th className="w-12 p-2" />
              </tr>
            </thead>
            <tbody>
              {localRows.map((row, index) => (
                <tr key={index} className="border-b">
                  <td className="p-2">
                    <input
                      type="number"
                      className="w-full rounded-lg border px-2 py-1.5 text-sm font-semibold"
                      value={row.srNo}
                      onChange={e => updateRow(index, 'srNo', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border px-2 py-1.5 text-sm font-semibold"
                      value={row.mts || ''}
                      onChange={e => updateRow(index, 'mts', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
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
          <button
            type="button"
            onClick={addRow}
            className="mt-3 flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Add row
          </button>
        </div>

        <div className="border-t bg-violet-50 px-4 py-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <p><span className="font-black text-gray-600">Total Taka:</span> <span className="font-black text-violet-900">{totalTaka}</span></p>
            <p><span className="font-black text-gray-600">Total Mtrs:</span> <span className="font-black text-violet-900">{totalMts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></p>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
            <button type="button" onClick={handleApply} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">Apply to Rec. Taka / Mts</button>
          </div>
        </div>
      </div>
    </div>
  );
};
