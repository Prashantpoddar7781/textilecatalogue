import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Edit3, Loader2, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import { bankEntriesApi, invoicesApi } from '../services/api';
import { BankEntry, BankPendingBill, CompletedOrderParty, PurchaseBillParty } from '../types';
import { DEFAULT_PURCHASE_TRANSACTION_TYPE, DEFAULT_SALES_TRANSACTION_TYPE, ERP_TRANSACTION_TYPES } from '../constants/erpTransactionTypes';

interface Props {
  onBack: () => void;
}

type EntryFilter = 'all' | 'payment' | 'receipt';
type ViewMode = 'entry' | 'register';

const today = () => new Date().toISOString().slice(0, 10);

const formatMoney = (value: number) =>
  (Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatBalance = (value: number) => `${formatMoney(Math.abs(value))} ${value >= 0 ? 'DR' : 'CR'}`;

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500';

const emptyForm = () => ({
  entryType: 'receipt' as 'payment' | 'receipt',
  entryDate: today(),
  voucherNumber: '',
  companyName: '',
  bankName: '',
  partyType: 'customer' as 'customer' | 'supplier' | 'other',
  partyName: '',
  transactionType: DEFAULT_SALES_TRANSACTION_TYPE,
  amount: '',
  paymentMode: 'bank',
  chequeNumber: '',
  chequeDate: '',
  slipNumber: '',
  billNumber: '',
  remarks: ''
});

export const BankEntriesPage: React.FC<Props> = ({ onBack }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('entry');
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [pendingBills, setPendingBills] = useState<BankPendingBill[]>([]);
  const [completedParties, setCompletedParties] = useState<CompletedOrderParty[]>([]);
  const [purchaseParties, setPurchaseParties] = useState<PurchaseBillParty[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Array<{ name: string; balance: number }>>([]);
  const [bankBalance, setBankBalance] = useState(1000000);
  const [partyBalance, setPartyBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);
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

  const loadMasterData = async () => {
    try {
      const [voucherResult, accountsResult, partiesResult, purchasePartiesResult, profileResult] = await Promise.all([
        bankEntriesApi.getNextVoucher(),
        bankEntriesApi.getBankAccounts(),
        bankEntriesApi.getCompletedOrderParties(),
        bankEntriesApi.getPurchaseBillParties(),
        invoicesApi.getProfile().catch(() => null)
      ]);
      setCompletedParties(partiesResult.parties || []);
      setPurchaseParties(purchasePartiesResult.parties || []);
      setBankAccounts(accountsResult.accounts || []);
      setForm(f => ({
        ...f,
        voucherNumber: voucherResult.voucherNumber,
        companyName: voucherResult.companyName,
        bankName: f.bankName || profileResult?.profile?.bankName || accountsResult.accounts?.[0]?.name || 'Default Bank'
      }));
    } catch (err: any) {
      console.warn('Failed to load bank master data', err);
    }
  };

  const refreshBalances = useCallback(async (bankName?: string, partyName?: string, partyType?: string) => {
    try {
      const { bankBalance: nextBankBalance, partyBalance: nextPartyBalance } = await bankEntriesApi.getBalances({
        bankName: bankName || undefined,
        partyName: partyName || undefined,
        partyType: (partyType as any) || 'customer'
      });
      setBankBalance(nextBankBalance);
      setPartyBalance(nextPartyBalance);
    } catch {
      setBankBalance(1000000);
      setPartyBalance(0);
    }
  }, []);

  const loadPendingBills = useCallback(async (partyName: string, partyType: string, transactionType?: string) => {
    if (!partyName.trim()) {
      setPendingBills([]);
      return;
    }
    setLoadingBills(true);
    try {
      const { bills } = await bankEntriesApi.getPendingBills({
        partyName,
        partyType: partyType as any,
        transactionType: transactionType || undefined
      });
      setPendingBills(bills.map(bill => ({ ...bill, adjustAmount: 0 })));
    } catch {
      setPendingBills([]);
    } finally {
      setLoadingBills(false);
    }
  }, []);

  useEffect(() => {
    void loadMasterData();
    void loadEntries();
  }, []);

  useEffect(() => {
    if (viewMode === 'register') {
      void loadEntries();
    }
  }, [entryTypeFilter, viewMode]);

  useEffect(() => {
    void refreshBalances(form.bankName, form.partyName, form.partyType);
    void loadPendingBills(form.partyName, form.partyType, form.transactionType);
  }, [form.bankName, form.partyName, form.partyType, form.transactionType, refreshBalances, loadPendingBills]);

  const summary = useMemo(() => {
    const selected = pendingBills.filter(bill => bill.adjustAmount > 0);
    const grossAmount = selected.reduce((sum, bill) => sum + bill.billAmount, 0);
    const adjustPending = selected.reduce((sum, bill) => sum + bill.pendingAmount, 0);
    const adjustAdd = selected.reduce((sum, bill) => sum + bill.adjustAmount, 0);
    const taxableValuePaidBills = selected.reduce((sum, bill) => {
      const ratio = bill.billAmount > 0 ? bill.adjustAmount / bill.billAmount : 0;
      return sum + (bill.taxableAmount || 0) * ratio;
    }, 0);
    const netBillAmount = adjustAdd;
    return { grossAmount, adjustPending, adjustAdd, netBillAmount, taxableValuePaidBills };
  }, [pendingBills]);

  const partyOptions = useMemo(() => {
    if (form.partyType === 'supplier') {
      return purchaseParties.map(p => p.name);
    }
    if (form.partyType === 'customer') {
      return completedParties.map(p => p.name);
    }
    return [];
  }, [completedParties, purchaseParties, form.partyType]);

  const selectedPartySummary = useMemo(() => {
    if (form.partyType === 'supplier') {
      return purchaseParties.find(party => party.name === form.partyName);
    }
    return completedParties.find(party => party.name === form.partyName);
  }, [completedParties, purchaseParties, form.partyName, form.partyType]);

  const updateBillAdjust = (billId: string, value: string) => {
    const adjustAmount = Math.max(0, Number(value) || 0);
    setPendingBills(prev => prev.map(bill => {
      if (bill.billId !== billId) return bill;
      const capped = Math.min(adjustAmount, bill.pendingAmount);
      return { ...bill, adjustAmount: capped };
    }));
  };

  const applyReceivedAmount = () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter received/paid amount first.');
      return;
    }
    let remaining = amount;
    setPendingBills(prev => prev.map(bill => {
      if (remaining <= 0) return { ...bill, adjustAmount: 0 };
      const adjustAmount = Math.min(bill.pendingAmount, remaining);
      remaining -= adjustAmount;
      return { ...bill, adjustAmount };
    }));
  };

  const startEdit = async (entry: BankEntry) => {
    setEditingId(entry.id);
    setViewMode('entry');
    setForm({
      entryType: entry.entryType,
      entryDate: entry.entryDate?.slice(0, 10) || today(),
      voucherNumber: entry.voucherNumber || '',
      companyName: entry.companyName || '',
      bankName: entry.bankName || '',
      partyType: (entry.partyType as any) || 'customer',
      partyName: entry.partyName || '',
      transactionType: entry.transactionType || (entry.partyType === 'supplier' ? DEFAULT_PURCHASE_TRANSACTION_TYPE : DEFAULT_SALES_TRANSACTION_TYPE),
      amount: String(entry.amount || ''),
      paymentMode: entry.paymentMode || 'bank',
      chequeNumber: entry.chequeNumber || '',
      chequeDate: entry.chequeDate?.slice(0, 10) || '',
      slipNumber: entry.slipNumber || '',
      billNumber: entry.billNumber || '',
      remarks: entry.remarks || ''
    });
    if (Array.isArray(entry.billAllocations) && entry.billAllocations.length > 0) {
      setPendingBills(entry.billAllocations.map(item => ({
        billId: item.billId,
        billType: item.billType,
        billNumber: item.billNumber,
        voucherNumber: item.voucherNumber,
        billDate: item.billDate,
        days: item.days,
        grace: item.grace,
        adatDisc: item.adatDisc,
        billAmount: item.billAmount,
        pendingAmount: item.pendingAmount,
        taxableAmount: item.taxableAmount,
        adjustAmount: item.adjustAmount
      })));
    }
  };

  const resetForm = async () => {
    setEditingId(null);
    setPendingBills([]);
    setForm(emptyForm());
    await loadMasterData();
  };

  const saveEntry = async () => {
    if (!form.partyName.trim()) {
      alert('Party account name is required.');
      return;
    }
    if (!form.bankName.trim()) {
      alert('Bank / cash account is required.');
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid received/paid amount.');
      return;
    }

    const billAllocations = pendingBills
      .filter(bill => bill.adjustAmount > 0)
      .map(bill => ({ ...bill }));

    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        amount,
        entryDate: form.entryDate ? new Date(form.entryDate).toISOString() : new Date().toISOString(),
        chequeDate: form.chequeDate ? new Date(form.chequeDate).toISOString() : null,
        billAllocations,
        grossAmount: summary.grossAmount,
        adjustPending: summary.adjustPending,
        netBillAmount: summary.netBillAmount,
        adjustAdd: summary.adjustAdd,
        taxableValuePaidBills: summary.taxableValuePaidBills,
        linkedType: billAllocations[0]?.billType || 'none',
        linkedId: billAllocations[0]?.billId || null
      };
      if (editingId) {
        const { entry } = await bankEntriesApi.update(editingId, payload as any);
        setEntries(prev => prev.map(item => item.id === entry.id ? entry : item));
      } else {
        const { entry } = await bankEntriesApi.create(payload as any);
        setEntries(prev => [entry, ...prev]);
      }
      await resetForm();
      await loadMasterData();
      await loadEntries();
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
      if (editingId === entry.id) await resetForm();
    } catch (err: any) {
      setError(err.message || 'Could not delete entry.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            ERP
          </button>
          <div className="text-center">
            <h1 className="text-lg font-black text-gray-900">Bill-wise Receipts / Payments</h1>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
              {editingId ? 'Edit Mode' : 'Add Mode'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('entry')}
              className={`rounded-xl px-3 py-2 text-xs font-black ${viewMode === 'entry' ? 'bg-indigo-600 text-white' : 'border bg-white text-gray-700'}`}
            >
              Entry
            </button>
            <button
              type="button"
              onClick={() => setViewMode('register')}
              className={`rounded-xl px-3 py-2 text-xs font-black ${viewMode === 'register' ? 'bg-indigo-600 text-white' : 'border bg-white text-gray-700'}`}
            >
              Register
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

        {viewMode === 'entry' ? (
          <div className="space-y-4">
            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className={labelClass}>V. No.</label>
                  <input className={inputClass} value={form.voucherNumber} onChange={e => setForm(f => ({ ...f, voucherNumber: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Date</label>
                  <input className={inputClass} type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Company</label>
                  <input className={inputClass} value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Bank Receipt / Payment</label>
                  <select className={inputClass} value={form.entryType} onChange={e => setForm(f => ({ ...f, entryType: e.target.value as any }))}>
                    <option value="receipt">Bank Receipt</option>
                    <option value="payment">Bank Payment</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass}>A/C Name</label>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <select
                      className={inputClass}
                      value={form.partyType}
                      onChange={e => {
                        const partyType = e.target.value as 'customer' | 'supplier' | 'other';
                        setForm(f => ({
                          ...f,
                          partyType,
                          partyName: '',
                          transactionType: partyType === 'supplier'
                            ? DEFAULT_PURCHASE_TRANSACTION_TYPE
                            : DEFAULT_SALES_TRANSACTION_TYPE
                        }));
                      }}
                    >
                      <option value="customer">Customer</option>
                      <option value="supplier">Supplier</option>
                      <option value="other">Other</option>
                    </select>
                    {partyOptions.length > 0 ? (
                      <select className={inputClass} value={form.partyName} onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))}>
                        <option value="">Select party</option>
                        {partyOptions.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    ) : (
                      <input className={inputClass} placeholder="Party account name" value={form.partyName} onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))} />
                    )}
                  </div>
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-900">
                    Party Balance: {formatBalance(partyBalance)}
                    {selectedPartySummary ? (
                      form.partyType === 'supplier'
                        ? ` · ${(selectedPartySummary as PurchaseBillParty).billCount} scanned bill${(selectedPartySummary as PurchaseBillParty).billCount === 1 ? '' : 's'}`
                        : ` · ${(selectedPartySummary as CompletedOrderParty).orderCount} completed order${(selectedPartySummary as CompletedOrderParty).orderCount === 1 ? '' : 's'}`
                    ) : ''}
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Bank / Cash</label>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <select className={inputClass} value={form.paymentMode} onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value }))}>
                      <option value="bank">Bank</option>
                      <option value="cash">Cash</option>
                    </select>
                    <input
                      className={inputClass}
                      list="bank-account-options"
                      placeholder="HDFC BANK LTD."
                      value={form.bankName}
                      onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                    />
                    <datalist id="bank-account-options">
                      {bankAccounts.map(account => (
                        <option key={account.name} value={account.name} />
                      ))}
                    </datalist>
                  </div>
                  <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-black text-sky-900">
                    Bank Balance: {formatBalance(bankBalance)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <label className={labelClass}>{form.entryType === 'receipt' ? 'Rec. Amt.' : 'Pay. Amt.'}</label>
                  <input className={inputClass} type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <button type="button" onClick={applyReceivedAmount} className="rounded-xl bg-indigo-50 px-4 py-2.5 text-sm font-black text-indigo-700 hover:bg-indigo-100">
                  Auto-adjust bills
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <div>
                  <label className={labelClass}>Chq. No.</label>
                  <input className={inputClass} value={form.chequeNumber} onChange={e => setForm(f => ({ ...f, chequeNumber: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Chq. Date</label>
                  <input className={inputClass} type="date" value={form.chequeDate} onChange={e => setForm(f => ({ ...f, chequeDate: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Slip No.</label>
                  <input className={inputClass} value={form.slipNumber} onChange={e => setForm(f => ({ ...f, slipNumber: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Type</label>
                  <select className={inputClass} value={form.transactionType} onChange={e => setForm(f => ({ ...f, transactionType: e.target.value }))}>
                    {ERP_TRANSACTION_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Bill No.</label>
                  <input className={inputClass} placeholder="Manual bill ref." value={form.billNumber} onChange={e => setForm(f => ({ ...f, billNumber: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Remark</label>
                  <input className={inputClass} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Pending Bills</h2>
                <p className="text-xs text-gray-500">Select party and type to load matching pending bills. Enter adjust amount against each bill.</p>
              </div>
              <div className="overflow-x-auto">
                {loadingBills ? (
                  <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading pending bills...
                  </div>
                ) : pendingBills.length === 0 ? (
                  <div className="px-5 py-16 text-center text-sm text-gray-400">
                    {form.partyName
                      ? form.partyType === 'supplier'
                        ? `No pending ${form.transactionType} purchase bills left for this supplier.`
                        : `No pending ${form.transactionType} sales bills left for this customer.`
                      : form.partyType === 'supplier'
                        ? 'Choose a supplier from scanned purchase bills to load pending bills.'
                        : 'Choose a customer from completed orders to load pending bills.'}
                  </div>
                ) : (
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Bill No.</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Voucher</th>
                        <th className="px-4 py-3">Bill Date</th>
                        <th className="px-4 py-3">Days</th>
                        <th className="px-4 py-3">Grace</th>
                        <th className="px-4 py-3">Adat/Disc</th>
                        <th className="px-4 py-3 text-right">Bill Amount</th>
                        <th className="px-4 py-3 text-right">Pend Amt</th>
                        <th className="px-4 py-3 text-right">Adjust</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBills.map(bill => (
                        <tr key={bill.billId} className="border-t">
                          <td className="px-4 py-3 font-bold text-gray-900">{bill.billNumber}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-gray-600">{bill.transactionType || '-'}</td>
                          <td className="px-4 py-3">{bill.voucherNumber || '-'}</td>
                          <td className="px-4 py-3">{formatDate(bill.billDate)}</td>
                          <td className="px-4 py-3">{bill.days}</td>
                          <td className="px-4 py-3">{bill.grace ?? 0}</td>
                          <td className="px-4 py-3">{formatMoney(bill.adatDisc || 0)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatMoney(bill.billAmount)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-amber-700">{formatMoney(bill.pendingAmount)}</td>
                          <td className="px-4 py-3 text-right">
                            <input
                              className="w-28 rounded-lg border px-2 py-1.5 text-right text-sm font-bold"
                              type="number"
                              min="0"
                              step="0.01"
                              max={bill.pendingAmount}
                              value={bill.adjustAmount || ''}
                              onChange={e => updateBillAdjust(bill.billId, e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className={labelClass}>Gross Amt</p>
                  <p className="text-lg font-black text-gray-900">{formatMoney(summary.grossAmount)}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className={labelClass}>Adjust Pend.</p>
                  <p className="text-lg font-black text-gray-900">{formatMoney(summary.adjustPending)}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className={labelClass}>Net Bill Amt.</p>
                  <p className="text-lg font-black text-gray-900">{formatMoney(summary.netBillAmount)}</p>
                </div>
                <div className="rounded-2xl bg-indigo-50 px-4 py-3">
                  <p className={labelClass}>Adjust Add</p>
                  <p className="text-lg font-black text-indigo-900">{formatMoney(summary.adjustAdd)}</p>
                </div>
                <div className="rounded-2xl bg-green-50 px-4 py-3">
                  <p className={labelClass}>Taxable Value (Paid Bills)</p>
                  <p className="text-lg font-black text-green-900">{formatMoney(summary.taxableValuePaidBills)}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveEntry()} disabled={saving} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Entry
                </button>
                <button type="button" onClick={() => void resetForm()} className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700">
                  Clear
                </button>
              </div>
            </section>
          </div>
        ) : (
          <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Bank Register</h2>
                <p className="text-xs text-gray-500">Saved bill-wise receipts and payments.</p>
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
                <button type="button" onClick={() => void loadEntries()} className="rounded-xl border px-3 py-2 text-xs font-bold text-gray-700">
                  <RefreshCw className={`inline h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
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
                      <th className="py-2">V.No.</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Party</th>
                      <th>Bank</th>
                      <th>Chq/Slip</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Adjust Add</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => (
                      <tr key={entry.id} className="border-b">
                        <td className="py-3 font-bold">{entry.voucherNumber || '-'}</td>
                        <td>{formatDate(entry.entryDate)}</td>
                        <td>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${entry.entryType === 'payment' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            {entry.entryType}
                          </span>
                        </td>
                        <td>
                          <p className="font-bold text-gray-900">{entry.partyName}</p>
                          <p className="text-xs text-gray-400">{entry.partyType || '-'}</p>
                        </td>
                        <td>{entry.bankName || '-'}</td>
                        <td>{entry.chequeNumber || entry.slipNumber || '-'}</td>
                        <td className={`text-right font-black ${entry.entryType === 'payment' ? 'text-red-700' : 'text-green-700'}`}>
                          {formatMoney(entry.amount)}
                        </td>
                        <td className="text-right font-semibold">{formatMoney(entry.adjustAdd || 0)}</td>
                        <td className="text-right">
                          <button type="button" onClick={() => void startEdit(entry)} className="mr-2 rounded-lg bg-indigo-50 p-2 text-indigo-700">
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
        )}
      </main>
    </div>
  );
};
