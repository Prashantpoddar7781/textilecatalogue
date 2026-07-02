import React, { useRef, useState } from 'react';
import { ArrowLeft, Camera, Loader2, Plus, Save, Trash2, Upload } from 'lucide-react';
import { purchasesApi } from '../services/api';
import { PurchaseBillExtraction } from '../types';

interface Props {
  onBack: () => void;
}

const emptyExtraction = (): PurchaseBillExtraction => ({
  supplier: {
    name: '',
    gstNumber: '',
    mobileNumber: '',
    address: '',
    city: '',
    state: '',
    pincode: ''
  },
  billNumber: '',
  billDate: '',
  voucherNumber: '',
  lineItems: [],
  taxableAmount: 0,
  discountAmount: 0,
  cgstAmount: 0,
  sgstAmount: 0,
  igstAmount: 0,
  totalTaxAmount: 0,
  grandTotal: 0,
  confidence: 'low',
  notes: ''
});

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const toNumber = (value: string) => Number(value || 0) || 0;

export const ScanPurchaseBillPage: React.FC<Props> = ({ onBack }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<PurchaseBillExtraction | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setSuccess('');
    const dataUrl = await fileToDataUrl(file);
    setImageDataUrl(dataUrl);
    setExtraction(null);
    setExtracting(true);
    try {
      const { extraction: result } = await purchasesApi.extractBill(dataUrl);
      setExtraction(result);
    } catch (err: any) {
      setExtraction(emptyExtraction());
      setError(err.message || 'Could not extract bill. Please check API key or image quality.');
    } finally {
      setExtracting(false);
    }
  };

  const updateSupplier = (key: keyof PurchaseBillExtraction['supplier'], value: string) => {
    setExtraction(prev => prev ? ({ ...prev, supplier: { ...prev.supplier, [key]: value } }) : prev);
  };

  const updateRoot = (key: keyof PurchaseBillExtraction, value: any) => {
    setExtraction(prev => prev ? ({ ...prev, [key]: value }) : prev);
  };

  const updateLine = (index: number, key: string, value: any) => {
    setExtraction(prev => {
      if (!prev) return prev;
      const lineItems = prev.lineItems.map((line, idx) => idx === index ? { ...line, [key]: value } : line);
      const taxableAmount = lineItems.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
      return { ...prev, lineItems, taxableAmount };
    });
  };

  const addLine = () => {
    setExtraction(prev => prev ? ({
      ...prev,
      lineItems: [
        ...prev.lineItems,
        { description: '', hsnCode: '', quantity: 0, cut: 0, pcs: 0, unit: 'pcs', rate: 0, amount: 0, remarks: '' }
      ]
    }) : prev);
  };

  const removeLine = (index: number) => {
    setExtraction(prev => prev ? ({ ...prev, lineItems: prev.lineItems.filter((_, idx) => idx !== index) }) : prev);
  };

  const saveBill = async () => {
    if (!extraction) return;
    if (!extraction.supplier.name.trim()) {
      alert('Supplier name is required before saving.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const totals = {
        taxableAmount: extraction.lineItems.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
        totalTaxAmount: toNumber(String(extraction.cgstAmount)) + toNumber(String(extraction.sgstAmount)) + toNumber(String(extraction.igstAmount)),
      };
      const payload = {
        ...extraction,
        taxableAmount: totals.taxableAmount,
        totalTaxAmount: totals.totalTaxAmount,
        grandTotal: extraction.grandTotal || totals.taxableAmount + totals.totalTaxAmount
      };
      const { supplier, bill } = await purchasesApi.saveBill(payload, imageDataUrl);
      setSuccess(`Saved ${bill.billNumber || 'purchase bill'} to ${supplier.name} ledger.`);
    } catch (err: any) {
      setError(err.message || 'Could not save purchase bill.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFF]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-lg font-black text-gray-900">Scan Purchase Bill</h1>
          <div className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Upload or Click Photo</h2>
            <p className="mt-1 text-xs text-gray-500">Upload a purchase bill image. The app will extract supplier details and line items.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm font-black text-gray-800">
                <Upload className="mx-auto mb-2 h-5 w-5" />
                Upload
              </button>
              <button type="button" onClick={() => cameraInputRef.current?.click()} className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm font-black text-indigo-800">
                <Camera className="mx-auto mb-2 h-5 w-5" />
                Camera
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => void handleFile(e.target.files?.[0])} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={e => void handleFile(e.target.files?.[0])} />

            {imageDataUrl && (
              <img src={imageDataUrl} alt="Purchase bill" className="mt-4 max-h-[520px] w-full rounded-2xl border object-contain" />
            )}
          </section>

          <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            {extracting ? (
              <div className="flex min-h-[360px] items-center justify-center text-sm font-semibold text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Extracting purchase bill...
              </div>
            ) : !extraction ? (
              <div className="flex min-h-[360px] items-center justify-center text-center">
                <div>
                  <p className="text-lg font-black text-gray-900">No bill uploaded yet</p>
                  <p className="mt-1 text-sm text-gray-500">Upload a sample bill to extract supplier and item entries.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
                {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{success}</div>}

                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Supplier Details</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Supplier name" value={extraction.supplier.name || ''} onChange={e => updateSupplier('name', e.target.value)} />
                    <input className="rounded-xl border px-3 py-2 text-sm" placeholder="GSTIN" value={extraction.supplier.gstNumber || ''} onChange={e => updateSupplier('gstNumber', e.target.value)} />
                    <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Mobile / phone" value={extraction.supplier.mobileNumber || ''} onChange={e => updateSupplier('mobileNumber', e.target.value)} />
                    <input className="rounded-xl border px-3 py-2 text-sm" placeholder="State" value={extraction.supplier.state || ''} onChange={e => updateSupplier('state', e.target.value)} />
                    <input className="rounded-xl border px-3 py-2 text-sm sm:col-span-2" placeholder="Address" value={extraction.supplier.address || ''} onChange={e => updateSupplier('address', e.target.value)} />
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Bill Details</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Bill no." value={extraction.billNumber || ''} onChange={e => updateRoot('billNumber', e.target.value)} />
                    <input className="rounded-xl border px-3 py-2 text-sm" type="date" value={extraction.billDate || ''} onChange={e => updateRoot('billDate', e.target.value)} />
                    <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Voucher no." value={extraction.voucherNumber || ''} onChange={e => updateRoot('voucherNumber', e.target.value)} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Items</h2>
                    <button type="button" onClick={addLine} className="flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700">
                      <Plus className="h-4 w-4" />
                      Add Line
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {extraction.lineItems.map((line, idx) => (
                      <div key={idx} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                        <div className="grid gap-2 sm:grid-cols-6">
                          <input className="rounded-lg border px-2 py-2 text-xs sm:col-span-2" placeholder="Item / product" value={line.description || ''} onChange={e => updateLine(idx, 'description', e.target.value)} />
                          <input className="rounded-lg border px-2 py-2 text-xs" placeholder="HSN" value={line.hsnCode || ''} onChange={e => updateLine(idx, 'hsnCode', e.target.value)} />
                          <input className="rounded-lg border px-2 py-2 text-xs" placeholder="Qty" type="number" value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', toNumber(e.target.value))} />
                          <input className="rounded-lg border px-2 py-2 text-xs" placeholder="Cut" type="number" value={line.cut || ''} onChange={e => updateLine(idx, 'cut', toNumber(e.target.value))} />
                          <input className="rounded-lg border px-2 py-2 text-xs" placeholder="Pcs" type="number" value={line.pcs || ''} onChange={e => updateLine(idx, 'pcs', toNumber(e.target.value))} />
                          <input className="rounded-lg border px-2 py-2 text-xs" placeholder="Rate" type="number" value={line.rate || ''} onChange={e => updateLine(idx, 'rate', toNumber(e.target.value))} />
                          <input className="rounded-lg border px-2 py-2 text-xs" placeholder="Amount" type="number" value={line.amount || ''} onChange={e => updateLine(idx, 'amount', toNumber(e.target.value))} />
                          <button type="button" onClick={() => removeLine(idx)} className="rounded-lg bg-red-50 px-2 py-2 text-xs font-black text-red-700">
                            <Trash2 className="mx-auto h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 sm:grid-cols-4">
                  <input className="rounded-xl border px-3 py-2 text-sm" type="number" placeholder="Taxable" value={extraction.taxableAmount || ''} onChange={e => updateRoot('taxableAmount', toNumber(e.target.value))} />
                  <input className="rounded-xl border px-3 py-2 text-sm" type="number" placeholder="CGST" value={extraction.cgstAmount || ''} onChange={e => updateRoot('cgstAmount', toNumber(e.target.value))} />
                  <input className="rounded-xl border px-3 py-2 text-sm" type="number" placeholder="SGST" value={extraction.sgstAmount || ''} onChange={e => updateRoot('sgstAmount', toNumber(e.target.value))} />
                  <input className="rounded-xl border px-3 py-2 text-sm" type="number" placeholder="Grand total" value={extraction.grandTotal || ''} onChange={e => updateRoot('grandTotal', toNumber(e.target.value))} />
                </div>

                {extraction.notes && <p className="text-xs font-semibold text-amber-700">OCR notes: {extraction.notes}</p>}

                <button type="button" onClick={saveBill} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving to Supplier Ledger...' : 'Save Purchase Entry to Ledger'}
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
