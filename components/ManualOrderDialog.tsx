import React, { useEffect, useState } from 'react';
import { X, Package, LayoutGrid, Plus, Trash2, Loader2 } from 'lucide-react';
import { designsApi, ordersApi } from '../services/api';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type Kind = 'open' | 'design';

interface DesignOption {
  id: string;
  name: string;
  catalogueLabel?: string;
}

export const ManualOrderDialog: React.FC<Props> = ({ onClose, onCreated }) => {
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [kind, setKind] = useState<Kind | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [parcelQuantity, setParcelQuantity] = useState('');

  const [lines, setLines] = useState<{ designId: string; quantity: string }[]>([{ designId: '', quantity: '1' }]);

  const [designOptions, setDesignOptions] = useState<DesignOption[]>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingDesigns(true);
        const { designs } = await designsApi.getAll({ limit: 500, sortBy: 'newest' });
        if (cancelled) return;
        setDesignOptions(
          (designs || []).map((d: any) => ({
            id: d.id,
            name: (d.name || 'Untitled').trim() || 'Untitled',
            catalogueLabel: d.catalogue?.name || d.catalogueName
          }))
        );
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoadingDesigns(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const labelForDesign = (d: DesignOption) =>
    d.catalogueLabel ? `${d.name} · ${d.catalogueLabel}` : d.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) return;
    const name = customerName.trim();
    if (!name) {
      alert('Please enter customer name.');
      return;
    }

    setSubmitting(true);
    try {
      if (kind === 'open') {
        const pq = parseInt(parcelQuantity, 10);
        if (!Number.isFinite(pq) || pq < 1) {
          alert('Enter a valid parcel quantity (at least 1).');
          setSubmitting(false);
          return;
        }
        await ordersApi.createManual({
          kind: 'open',
          buyerName: name,
          remarks: remarks.trim() || undefined,
          parcelQuantity: pq
        });
      } else {
        const parsedLines = lines
          .filter(l => l.designId && l.quantity)
          .map(l => ({
            designId: l.designId,
            quantity: parseInt(l.quantity, 10)
          }))
          .filter(l => Number.isFinite(l.quantity) && l.quantity >= 1);

        if (parsedLines.length === 0) {
          alert('Add at least one design with quantity.');
          setSubmitting(false);
          return;
        }

        await ordersApi.createManual({
          kind: 'design',
          buyerName: name,
          remarks: remarks.trim() || undefined,
          lines: parsedLines
        });
      }
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create order.';
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const pickKind = (k: Kind) => {
    setKind(k);
    setStep('form');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 safe-area-top safe-area-bottom">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[min(92vh,720px)] flex flex-col overflow-hidden">
        <div className="shrink-0 px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900">Create order</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'pick' ? (
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-600">Choose how you want to record this order.</p>
            <button
              type="button"
              onClick={() => pickKind('open')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-colors"
            >
              <div className="p-3 rounded-xl bg-amber-100 text-amber-800">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Open order</p>
                <p className="text-xs text-gray-500 mt-0.5">Parcel quantity only — no design linked yet.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => pickKind('design')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-colors"
            >
              <div className="p-3 rounded-xl bg-indigo-100 text-indigo-800">
                <LayoutGrid className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Design order</p>
                <p className="text-xs text-gray-500 mt-0.5">Pick designs from your catalogue and quantities.</p>
              </div>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
              <button
                type="button"
                onClick={() => {
                  setStep('pick');
                  setKind(null);
                }}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                ← Change order type
              </button>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Customer name *</label>
                <input
                  required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Customer or shop name"
                />
              </div>

              {kind === 'open' && (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700">Parcel quantity *</label>
                    <input
                      type="number"
                      min={1}
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={parcelQuantity}
                      onChange={e => setParcelQuantity(e.target.value)}
                      placeholder="Number of parcels"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700">Remarks</label>
                    <textarea
                      rows={3}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="Notes, delivery, etc."
                    />
                  </div>
                </>
              )}

              {kind === 'design' && (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700">Remark</label>
                    <textarea
                      rows={2}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="Applies to this whole order"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-gray-700">Designs & quantities</label>
                      <button
                        type="button"
                        onClick={() => setLines(prev => [...prev, { designId: '', quantity: '1' }])}
                        className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"
                      >
                        <Plus className="w-4 h-4" />
                        Add line
                      </button>
                    </div>
                    {loadingDesigns ? (
                      <p className="text-xs text-gray-500 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading designs…
                      </p>
                    ) : designOptions.length === 0 ? (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                        No designs in your catalogue yet. Add designs first.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {lines.map((line, idx) => (
                          <div key={idx} className="flex gap-2 items-start">
                            <select
                              className="flex-1 min-w-0 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                              value={line.designId}
                              onChange={e => {
                                const v = e.target.value;
                                setLines(prev =>
                                  prev.map((row, i) => (i === idx ? { ...row, designId: v } : row))
                                );
                              }}
                            >
                              <option value="">Select design…</option>
                              {designOptions.map(d => (
                                <option key={d.id} value={d.id}>
                                  {labelForDesign(d)}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={1}
                              className="w-24 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                              value={line.quantity}
                              onChange={e => {
                                const v = e.target.value;
                                setLines(prev =>
                                  prev.map((row, i) => (i === idx ? { ...row, quantity: v } : row))
                                );
                              }}
                            />
                            {lines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-xl shrink-0"
                                aria-label="Remove line"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="shrink-0 p-4 border-t bg-gray-50 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-bold text-gray-700 bg-white border border-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Create order
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
