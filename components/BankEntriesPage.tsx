import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Edit3, Loader2, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import { bankEntriesApi } from '../services/api';
import { BankEntry } from '../types';

interface Props {
  onBack: () => void;
}

type EntryFilter = 'all' | 'payment' | 'receipt';

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  entryType: 'payment' as 'payment' | 'receipt',
  entryDate: today(),
  voucherNumber: '',
  bankName: '',
  accountName: '',
  partyType: 'supplier' as 'customer' | 'supplier' | 'other',
  partyName: '',
  linkedType: 'none',
  linkedId: '',
  amount: '',
  paymentMode: 'bank',
  referenceNumber: '',
  remarks: ''
});

const formatMoney = (value: number) =>
  (Number(value) || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

export const BankEntriesPage: React.FC<Props> = ({ onBack }) => {
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const loadEntries = async () => {
    setLoading(true);
    setError('');
    try {
      const { entries: fetchedEntries } = await bankEntriesApi.getAll({
        search: search.trim() || undefined,
        entryType: entryTypeFilter
      });
      setEntries(fetchedEntries);
    } catch (err: any) {
      setError(err.message || 'Could not load bank entries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEntries();
  }, [entryTypeFilter]);

  const totals = useMemo(() => {
    return entries.reduce((acc, entry) => {
      if (entry.entryType === 'payment') acc.payments += entry.amount;
      if (entry.entryType === 'receipt') acc.receipts += entry.amount;
      return acc;
    }, { payments: 0, receipts: 0 });
  }, [entries]);

  const startEdit = (entry: BankEntry) => {
    setEditingId(entry.id);
    setForm({
      entryType: entry.entryType,
      entryDate: entry.entryDate?.slice(0, 10) || today(),
      voucherNumber: entry.voucherNumber || '',
      bankName: entry.bankName || '',
      accountName: entry.accountName || '',
      partyType: (entry.partyType as any) || 'other',
      partyName: entry.partyName || '',
      linkedType: entry.linkedType || 'none',
      linkedId: entry.linkedId || '',
      amount: String(entry.amount || ''),
      paymentMode: entry.paymentMode || 'bank',
      referenceNumber: entry.referenceNumber || '',
      remarks: entry.remarks || ''
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const saveEntry = async () => {
    if (!form.partyName.trim()) {
      alert('Party name is required.');
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid amount.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        amount,
        entryDate: form.entryDate ? new Date(form.entryDate).toISOString() : new Date().toISOString()
      };
      if (editingId) {
        const { entry } = await bankEntriesApi.update(editingId, payload as any);
        setEntries(prev => prev.map(item => item.id === entry.id ? entry : item));
      } else {
        const { entry } = await bankEntriesApi.create(payload as any);
        setEntries(prev => [entry, ...prev]);
      }
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Could not save bank entry.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: BankEntry) => {
    if (!confirm('Delete this bank entry?')) return;
    try {
      await bankEntriesApi.delete(entry.id);
      setEntries(prev => prev.filter(item => item.id !== entry.id));
      if (editingId === entry.id) resetForm();
    } catch (err: any) {
      setError(err.message || 'Could not delete entry.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            ERP
          </button>
          <h1 className="text-lg font-black text-gray-900">Bank Payment / Receipts</h1>
          <button type="button" onClick={() => void loadEntries()} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold text-gray-700">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Payments</p>
            <p className="mt-1 text-2xl font-black text-red-700">{formatMoney(totals.payments)}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Receipts</p>
            <p className="mt-1 text-2xl font-black text-green-700">{formatMoney(totals.receipts)}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Net Bank Movement</p>
            <p className="mt-1 text-2xl font-black text-gray-900">{formatMoney(totals.receipts - totals.payments)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
          <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">
              {editingId ? 'Edit Entry' : 'New Bank Entry'}
            </h2>
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, entryType: 'payment' }))} className={`rounded-xl px-4 py-3 text-sm font-black ${form.entryType === 'payment' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                  Payment
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, entryType: 'receipt' }))} className={`rounded-xl px-4 py-3 text-sm font-black ${form.entryType === 'receipt' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                  Receipt
                </button>
              </div>

              <input className="rounded-xl border px-3 py-2 text-sm" type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} />
              <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Voucher number" value={form.voucherNumber} onChange={e => setForm(f => ({ ...f, voucherNumber: e.target.value }))} />
              <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Bank name" value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
              <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Account name" value={form.accountName} onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))} />
              <select className="rounded-xl border px-3 py-2 text-sm" value={form.partyType} onChange={e => setForm(f => ({ ...f, partyType: e.target.value as any }))}>
                <option value="supplier">Supplier</option>
                <option value="customer">Customer</option>
                <option value="other">Other</option>
              </select>
              <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Party name" value={form.partyName} onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))} />
              <input className="rounded-xl border px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Amount" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              <select className="rounded-xl border px-3 py-2 text-sm" value={form.paymentMode} onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value }))}>
                <option value="bank">Bank</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="neft_rtgs">NEFT / RTGS</option>
              </select>
              <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Cheque/UTR/reference no." value={form.referenceNumber} onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))} />
              <select className="rounded-xl border px-3 py-2 text-sm" value={form.linkedType} onChange={e => setForm(f => ({ ...f, linkedType: e.target.value }))}>
                <option value="none">No bill linked yet</option>
                <option value="sales_invoice">Sales invoice</option>
                <option value="purchase_bill">Purchase bill</option>
              </select>
              <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Linked bill/invoice ID or number" value={form.linkedId} onChange={e => setForm(f => ({ ...f, linkedId: e.target.value }))} />
              <textarea className="rounded-xl border px-3 py-2 text-sm" rows={3} placeholder="Remarks" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={saveEntry} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
                <button type="button" onClick={resetForm} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700">
                  Clear
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Bank Register</h2>
                <p className="text-xs text-gray-500">Search, edit, and review payment/receipt entries.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input className="rounded-xl border bg-gray-50 py-2 pl-9 pr-3 text-sm" placeholder="Search entries" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void loadEntries(); }} />
                </div>
                <select className="rounded-xl border px-3 py-2 text-sm font-bold" value={entryTypeFilter} onChange={e => setEntryTypeFilter(e.target.value as EntryFilter)}>
                  <option value="all">All</option>
                  <option value="payment">Payments</option>
                  <option value="receipt">Receipts</option>
                </select>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading entries...
                </div>
              ) : entries.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">No bank entries yet.</div>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-gray-500">
                    <tr>
                      <th className="py-2">Date</th>
                      <th>Type</th>
                      <th>Party</th>
                      <th>Bank</th>
                      <th>Reference</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => (
                      <tr key={entry.id} className="border-b">
                        <td className="py-3">{formatDate(entry.entryDate)}</td>
                        <td>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${entry.entryType === 'payment' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            {entry.entryType}
                          </span>
                        </td>
                        <td>
                          <p className="font-bold text-gray-900">{entry.partyName}</p>
                          <p className="text-xs text-gray-400">{entry.voucherNumber || entry.partyType || '-'}</p>
                        </td>
                        <td>{entry.bankName || '-'}</td>
                        <td>{entry.referenceNumber || entry.paymentMode || '-'}</td>
                        <td className={`text-right font-black ${entry.entryType === 'payment' ? 'text-red-700' : 'text-green-700'}`}>
                          {formatMoney(entry.amount)}
                        </td>
                        <td className="text-right">
                          <button type="button" onClick={() => startEdit(entry)} className="mr-2 rounded-lg bg-indigo-50 p-2 text-indigo-700">
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => void deleteEntry(entry)} className="rounded-lg bg-red-50 p-2 text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
