import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getGstDefaultsForTransactionType } from '../constants/erpTransactionTypes';
import { salesOrdersApi } from '../services/api';
import { SalesItemMaster } from '../types';

interface Props {
  open: boolean;
  initialName?: string;
  /** Grey purchase qualities are stored as Type GREY, the same row a later bill can pick. */
  preset?: 'grey' | 'finish';
  onClose: () => void;
  onSaved: (item: SalesItemMaster) => void;
}

const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const numberKeys = ['cut', 'sellingRate', 'rate2', 'rate3', 'workCut', 'gstRate'];

const blank = (name: string, preset?: string) => {
  const kind = preset === 'grey' ? 'grey' : 'finish';
  const gst = getGstDefaultsForTransactionType(kind === 'grey' ? 'GREY PURCHASE' : 'FINISH SALES');
  return {
    name,
    mainScreen: name,
    packing: 'NAKED',
    cut: 0,
    greyQuality: '',
    finishType: kind === 'grey' ? 'GREY' : 'FINISH',
    itemType: 'SAREE',
    screenSeries: '',
    category: '',
    unit: 'PCS',
    sellingRate: 0,
    rate2: 0,
    rate3: 0,
    workCut: 0,
    hsnSac: gst.hsnCode,
    gstRate: gst.gstRate,
    remark: ''
  };
};

export const QualityInformationDialog: React.FC<Props> = ({
  open,
  initialName = '',
  preset = 'finish',
  onClose,
  onSaved
}) => {
  const [form, setForm] = useState(() => blank(initialName, preset));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(blank(initialName, preset));
  }, [open, initialName, preset]);

  if (!open) return null;

  const save = async () => {
    if (!form.name.trim() || !form.mainScreen.trim()) {
      setError('Name and Main Screen are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { item } = await salesOrdersApi.createItem({ ...form });
      onSaved(item);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not save Quality Information.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-indigo-50 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">Quality Information</h2>
            <p className="text-xs font-semibold text-indigo-700">
              {preset === 'grey' ? 'New grey quality — Type GREY, item SAREE, packing NAKED' : 'Add the item to the master'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-white"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div>}
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ['Name', 'name'], ['Main Screen', 'mainScreen'], ['Packing', 'packing'],
            ['Cut', 'cut'], ['Grey Quality', 'greyQuality'], ['Type', 'finishType'],
            ['Item Type', 'itemType'], ['Screen Series', 'screenSeries'], ['Category', 'category'],
            ['Unit', 'unit'], ['Selling Rate', 'sellingRate'], ['Rate 2', 'rate2'],
            ['Rate 3', 'rate3'], ['Work Cut', 'workCut'], ['HSN / SAC', 'hsnSac'],
            ['GST %', 'gstRate'], ['Remark', 'remark']
          ] as const).map(([label, key]) => (
            <label key={key}>
              <span className={labelClass}>{label}</span>
              <input
                className={inputClass}
                type={numberKeys.includes(key) ? 'number' : 'text'}
                value={form[key]}
                onChange={e => setForm(prev => ({
                  ...prev,
                  [key]: e.target.type === 'number' ? (Number(e.target.value) || 0) : e.target.value
                }))}
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Quality'}
          </button>
        </div>
      </div>
    </div>
  );
};
