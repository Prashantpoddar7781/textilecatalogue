import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Loader2, RefreshCw, Search } from 'lucide-react';
import { purchasesApi } from '../services/api';
import { PurchaseBill, Supplier, SupplierLedgerEntry } from '../types';

interface Props {
  onBack: () => void;
}

const formatMoney = (value: number) =>
  (Number(value) || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

export const SupplierLedgerPage: React.FC<Props> = ({ onBack }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [ledger, setLedger] = useState<SupplierLedgerEntry[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedBill, setSelectedBill] = useState<PurchaseBill | null>(null);
  const [runningBalance, setRunningBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const loadSuppliers = async () => {
    setLoading(true);
    setError('');
    try {
      const { suppliers: fetchedSuppliers } = await purchasesApi.getSuppliers();
      setSuppliers(fetchedSuppliers);
      if (!selectedSupplierId && fetchedSuppliers[0]) {
        setSelectedSupplierId(fetchedSuppliers[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  const loadLedger = async (supplierId: string) => {
    if (!supplierId) return;
    setLedgerLoading(true);
    setSelectedBill(null);
    setError('');
    try {
      const result = await purchasesApi.getSupplierLedger(supplierId);
      setSelectedSupplier(result.supplier);
      setLedger(result.ledger);
      setRunningBalance(result.runningBalance);
    } catch (err: any) {
      setError(err.message || 'Could not load ledger.');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
  }, []);

  useEffect(() => {
    if (selectedSupplierId) void loadLedger(selectedSupplierId);
  }, [selectedSupplierId]);

  const filteredSuppliers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(supplier =>
      supplier.name.toLowerCase().includes(q)
      || (supplier.gstNumber || '').toLowerCase().includes(q)
      || (supplier.mobileNumber || '').toLowerCase().includes(q)
    );
  }, [query, suppliers]);

  const openBill = async (billId: string) => {
    setError('');
    try {
      const { bill } = await purchasesApi.getBill(billId);
      setSelectedBill(bill);
    } catch (err: any) {
      setError(err.message || 'Could not load bill detail.');
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
          <h1 className="text-lg font-black text-gray-900">Supplier Ledger</h1>
          <button type="button" onClick={() => void loadSuppliers()} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Suppliers</h2>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input className="w-full rounded-2xl border bg-gray-50 py-2.5 pl-9 pr-3 text-sm" placeholder="Search supplier/GST/mobile" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">No suppliers yet. Scan a purchase bill first.</p>
              ) : filteredSuppliers.map(supplier => (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() => setSelectedSupplierId(supplier.id)}
                  className={`w-full rounded-2xl border p-3 text-left ${selectedSupplierId === supplier.id ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-gray-50'}`}
                >
                  <p className="font-black text-gray-900">{supplier.name}</p>
                  <p className="text-xs text-gray-500">{supplier.gstNumber || 'GST not captured'}</p>
                  <div className="mt-2 flex justify-between text-xs font-bold">
                    <span>{supplier.billCount || 0} bill(s)</span>
                    <span>{formatMoney(supplier.runningBalance || 0)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
            {!selectedSupplier ? (
              <div className="flex min-h-[420px] items-center justify-center text-center">
                <div>
                  <FileText className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-sm font-bold text-gray-600">Select a supplier to view ledger.</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">{selectedSupplier.name}</h2>
                    <p className="text-sm text-gray-500">{selectedSupplier.address || selectedSupplier.city || 'Supplier details from scanned bills'}</p>
                    {selectedSupplier.gstNumber && <p className="text-xs font-bold text-gray-600">GSTIN: {selectedSupplier.gstNumber}</p>}
                    {selectedSupplier.mobileNumber && <p className="text-xs font-bold text-gray-600">Mobile: {selectedSupplier.mobileNumber}</p>}
                  </div>
                  <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-right">
                    <p className="text-xs font-black uppercase text-indigo-600">Running Balance</p>
                    <p className="text-xl font-black text-indigo-950">{formatMoney(runningBalance)} Cr</p>
                  </div>
                </div>

                {ledgerLoading ? (
                  <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading ledger...
                  </div>
                ) : ledger.length === 0 ? (
                  <p className="py-16 text-center text-sm text-gray-400">No purchase entries for this supplier.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b text-xs uppercase text-gray-500">
                        <tr>
                          <th className="py-2">Date</th>
                          <th>Bill/Doc</th>
                          <th>Account</th>
                          <th className="text-right">Dr.</th>
                          <th className="text-right">Cr.</th>
                          <th className="text-right">Run. Bal.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map(entry => (
                          <tr key={entry.id} className="cursor-pointer border-b hover:bg-indigo-50" onClick={() => void openBill(entry.id)}>
                            <td className="py-3">{formatDate(entry.date)}</td>
                            <td>{entry.billNumber || entry.voucherNumber || entry.id.slice(-6)}</td>
                            <td>{entry.account}<span className="ml-2 text-xs text-gray-400">({entry.lineCount} lines)</span></td>
                            <td className="text-right">{entry.debitAmount ? formatMoney(entry.debitAmount) : '-'}</td>
                            <td className="text-right">{entry.creditAmount ? formatMoney(entry.creditAmount) : '-'}</td>
                            <td className="text-right font-bold">{formatMoney(entry.runningBalance)} Cr</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedBill && (
                  <div className="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50/60 p-4">
                    <h3 className="text-sm font-black uppercase tracking-wide text-indigo-950">Bill Detail: {selectedBill.billNumber || selectedBill.id}</h3>
                    <div className="mt-3 overflow-x-auto rounded-2xl bg-white">
                      <table className="min-w-full text-left text-xs">
                        <thead className="border-b text-gray-500">
                          <tr>
                            <th className="p-2">Item</th>
                            <th>HSN</th>
                            <th>Qty</th>
                            <th>Cut</th>
                            <th>Pcs</th>
                            <th>Rate</th>
                            <th className="text-right pr-2">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedBill.lineItems.map((line, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="p-2 font-semibold">{line.description}</td>
                              <td>{line.hsnCode || '-'}</td>
                              <td>{line.quantity || '-'}</td>
                              <td>{line.cut || '-'}</td>
                              <td>{line.pcs || '-'}</td>
                              <td>{line.rate ? formatMoney(line.rate) : '-'}</td>
                              <td className="pr-2 text-right font-bold">{formatMoney(line.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                      <p><span className="font-bold">Taxable:</span> {formatMoney(selectedBill.taxableAmount)}</p>
                      <p><span className="font-bold">CGST:</span> {formatMoney(selectedBill.cgstAmount)}</p>
                      <p><span className="font-bold">SGST:</span> {formatMoney(selectedBill.sgstAmount)}</p>
                      <p><span className="font-bold">Total:</span> {formatMoney(selectedBill.grandTotal)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
