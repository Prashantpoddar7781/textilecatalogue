import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Edit3, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { bankEntriesApi, invoicesApi } from '../services/api';
import { AccountParty, BankEntry, BankPendingBill, CompletedOrderParty, PurchaseBillParty } from '../types';
import { postingSaleOrPurchaseAccount } from '../constants/erpTransactionPostingRules';
import {
  BANK_CASH_SERIES,
  bankCashDefaultPartyType,
  bankCashEntryType,
  bankCashPaymentMode,
  DEFAULT_BANK_CASH_SERIES,
  normalizeBankCashSeries,
  slipNumberFromDate
} from '../constants/bankCashSeries';
import { AccountsInformationDialog } from './AccountsInformationDialog';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';

interface Props {
  onBack: () => void;
}

type EntryFilter = 'all' | 'payment' | 'receipt';
type ViewMode = 'entry' | 'register';

const today = () => new Date().toISOString().slice(0, 10);

const formatMoney = (value: number) =>
  (Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const roundMoneyLocal = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const formatBalance = (value: number) => `${formatMoney(Math.abs(value))} ${value >= 0 ? 'DR' : 'CR'}`;

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500';

const emptyForm = () => {
  const series = DEFAULT_BANK_CASH_SERIES;
  const entryDate = today();
  return {
    series,
    entryType: bankCashEntryType(series) as 'payment' | 'receipt',
    entryDate,
    voucherNumber: '',
    companyName: '',
    bankName: '',
    partyType: bankCashDefaultPartyType(series) as 'customer' | 'supplier' | 'other',
    partyName: '',
    transactionType: series,
    amount: '',
    paymentMode: bankCashPaymentMode(series) as 'bank' | 'cash',
    chequeNumber: '',
    chequeDate: entryDate,
    slipNumber: slipNumberFromDate(entryDate),
    referenceNumber: '',
    remarks: ''
  };
};

/** Empire-style bill-wise receipt/payment — bills only, no credit/debit notes yet. */
export const BankEntriesPage: React.FC<Props> = ({ onBack }) => {
  const editIdFromUrl = useMemo(() => new URLSearchParams(window.location.search).get('edit'), []);
  const [viewMode, setViewMode] = useState<ViewMode>('entry');
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [pendingBills, setPendingBills] = useState<BankPendingBill[]>([]);
  const [completedParties, setCompletedParties] = useState<CompletedOrderParty[]>([]);
  const [purchaseParties, setPurchaseParties] = useState<PurchaseBillParty[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Array<{ name: string; balance: number; accountType?: string }>>([]);
  const [bankBalance, setBankBalance] = useState(0);
  const [partyBalance, setPartyBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [quickBillNo, setQuickBillNo] = useState('');
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [restoreAllocations, setRestoreAllocations] = useState<BankPendingBill[] | null>(null);

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
        bankName: f.paymentMode === 'cash'
          ? (postingSaleOrPurchaseAccount(f.series) || 'CASH A/C')
          : (f.bankName || profileResult?.profile?.bankName || accountsResult.accounts?.[0]?.name || 'Default Bank')
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
      setBankBalance(0);
      setPartyBalance(0);
    }
  }, []);

  const loadPendingBills = useCallback(async (partyName: string, partyType: string) => {
    if (!partyName.trim()) {
      setPendingBills([]);
      setQuickBillNo('');
      return;
    }
    setLoadingBills(true);
    try {
      const { bills } = await bankEntriesApi.getPendingBills({
        partyName,
        partyType: partyType as any
      });
      const onlyBills = (bills || []).filter(bill => bill.billType !== 'credit_debit_note');
      const seeded = onlyBills
        .map(bill => ({ ...bill, adjustAmount: 0 }))
        .sort((a, b) => String(a.billNumber).localeCompare(String(b.billNumber), undefined, { numeric: true }));

      if (restoreAllocations?.length) {
        const byId = new Map(restoreAllocations.map(item => [item.billId, item]));
        const merged = seeded.map(bill => {
          const saved = byId.get(bill.billId);
          if (!saved) return bill;
          return {
            ...bill,
            adjustAmount: Math.min(saved.adjustAmount || 0, bill.pendingAmount),
            pendingAmount: Math.max(bill.pendingAmount, saved.adjustAmount || 0)
          };
        });
        for (const saved of restoreAllocations) {
          if (saved.billType === 'credit_debit_note') continue;
          if (!merged.some(row => row.billId === saved.billId)) {
            merged.push({ ...saved });
          }
        }
        setPendingBills(merged);
        setRestoreAllocations(null);
      } else {
        setPendingBills(seeded);
      }
      setQuickBillNo('');
    } catch (err: any) {
      setPendingBills([]);
      setError(err.message || 'Could not load pending bills.');
    } finally {
      setLoadingBills(false);
    }
  }, [restoreAllocations]);

  const applySeries = (seriesValue: string) => {
    const series = normalizeBankCashSeries(seriesValue);
    const entryType = bankCashEntryType(series);
    const paymentMode = bankCashPaymentMode(series);
    const partyType = bankCashDefaultPartyType(series);
    const cashAccount = postingSaleOrPurchaseAccount(series) || 'CASH A/C';
    setForm(f => ({
      ...f,
      series,
      transactionType: series,
      entryType,
      paymentMode,
      partyType,
      partyName: '',
      bankName: paymentMode === 'cash' ? cashAccount : f.bankName,
      slipNumber: slipNumberFromDate(f.entryDate)
    }));
    setPendingBills([]);
  };

  useEffect(() => {
    void loadMasterData();
    void loadEntries();
  }, []);

  useEffect(() => {
    if (viewMode === 'register') void loadEntries();
  }, [entryTypeFilter, viewMode]);

  useEffect(() => {
    void refreshBalances(form.bankName, form.partyName, form.partyType);
    void loadPendingBills(form.partyName, form.partyType);
  }, [form.bankName, form.partyName, form.partyType, refreshBalances, loadPendingBills]);

  useEffect(() => {
    setForm(f => {
      const nextSlip = slipNumberFromDate(f.entryDate);
      if (f.slipNumber === nextSlip) return f;
      return { ...f, slipNumber: nextSlip };
    });
  }, [form.entryDate]);

  const partyOptions = useMemo(() => {
    if (form.partyType === 'supplier') return purchaseParties.map(p => p.name);
    if (form.partyType === 'customer') return completedParties.map(p => p.name);
    return [];
  }, [completedParties, purchaseParties, form.partyType]);

  const adjustedBills = useMemo(
    () => pendingBills.filter(bill => (bill.adjustAmount || 0) > 0),
    [pendingBills]
  );

  const summary = useMemo(() => {
    const adjustPending = roundMoneyLocal(
      pendingBills.reduce((sum, bill) => sum + (bill.pendingAmount || 0), 0)
    );
    const netBillAmount = roundMoneyLocal(
      adjustedBills.reduce((sum, bill) => sum + (bill.adjustAmount || 0), 0)
    );
    const taxableValuePaidBills = roundMoneyLocal(
      adjustedBills.reduce((sum, bill) => {
        const ratio = bill.billAmount > 0 ? (bill.adjustAmount || 0) / bill.billAmount : 0;
        return sum + (bill.taxableAmount || 0) * ratio;
      }, 0)
    );
    const received = roundMoneyLocal(Number(form.amount) || 0);
    const adjustLess = roundMoneyLocal(Math.max(netBillAmount - received, 0));
    const adjustAdd = roundMoneyLocal(Math.max(received - netBillAmount, 0));
    return {
      grossAmount: 0,
      adjustPending,
      netBillAmount,
      adjustLess,
      adjustAdd,
      taxableValuePaidBills,
      received
    };
  }, [pendingBills, adjustedBills, form.amount]);

  const pickBill = (billId: string) => {
    setPendingBills(prev => {
      const target = prev.find(bill => bill.billId === billId);
      if (!target) return prev;
      const already = (target.adjustAmount || 0) > 0;
      return prev.map(bill => {
        if (bill.billId !== billId) return bill;
        return { ...bill, adjustAmount: already ? 0 : bill.pendingAmount };
      });
    });
    setForm(f => {
      const target = pendingBills.find(bill => bill.billId === billId);
      if (!target) return f;
      const nextAdjust = (target.adjustAmount || 0) > 0 ? 0 : target.pendingAmount;
      if (nextAdjust > 0 && !(Number(f.amount) > 0)) {
        return { ...f, amount: String(nextAdjust) };
      }
      return f;
    });
  };

  const pickBillByNumber = (billNumber: string) => {
    const bill = pendingBills.find(row => String(row.billNumber) === String(billNumber));
    if (!bill) return;
    pickBill(bill.billId);
    setQuickBillNo('');
  };

  const updateBillAdjust = (billId: string, value: string) => {
    const adjustAmount = Math.max(0, Number(value) || 0);
    setPendingBills(prev => prev.map(bill => {
      if (bill.billId !== billId) return bill;
      return { ...bill, adjustAmount: Math.min(adjustAmount, bill.pendingAmount) };
    }));
  };

  const startEdit = async (entry: BankEntry) => {
    setEditingId(entry.id);
    setViewMode('entry');
    const series = normalizeBankCashSeries(
      entry.transactionType
      || (entry.entryType === 'payment'
        ? (entry.paymentMode === 'cash' ? 'CASH PAYMENT' : 'BANK PAYMENT')
        : (entry.paymentMode === 'cash' ? 'CASH RECEIPT' : 'BANK RECEIPT'))
    );
    const entryDate = entry.entryDate?.slice(0, 10) || today();
    setForm({
      series,
      entryType: bankCashEntryType(series),
      entryDate,
      voucherNumber: entry.voucherNumber || '',
      companyName: entry.companyName || '',
      bankName: entry.bankName || '',
      partyType: (entry.partyType as any) || bankCashDefaultPartyType(series),
      partyName: entry.partyName || '',
      transactionType: series,
      amount: String(entry.amount || ''),
      paymentMode: bankCashPaymentMode(series),
      chequeNumber: entry.chequeNumber || '',
      chequeDate: entry.chequeDate?.slice(0, 10) || entryDate,
      slipNumber: entry.slipNumber || slipNumberFromDate(entryDate),
      referenceNumber: entry.referenceNumber || '',
      remarks: entry.remarks || ''
    });
    if (Array.isArray(entry.billAllocations) && entry.billAllocations.length > 0) {
      setRestoreAllocations(
        entry.billAllocations
          .filter(item => item.billType !== 'credit_debit_note')
          .map(item => ({
            billId: item.billId,
            billType: item.billType,
            billNumber: item.billNumber,
            voucherNumber: item.voucherNumber,
            billDate: item.billDate,
            days: item.days || 0,
            grace: item.grace,
            adatDisc: item.adatDisc,
            billAmount: item.billAmount,
            pendingAmount: item.pendingAmount,
            taxableAmount: item.taxableAmount,
            adjustAmount: item.adjustAmount
          }))
      );
    } else {
      setRestoreAllocations(null);
    }
  };

  useEffect(() => {
    if (!editIdFromUrl) return;
    void (async () => {
      try {
        const { entry } = await bankEntriesApi.getById(editIdFromUrl);
        await startEdit(entry);
      } catch (err: any) {
        setError(err.message || 'Could not load bank entry for edit.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editIdFromUrl]);

  const onBankAccountSaved = (party: AccountParty) => {
    const name = party.name;
    setBankAccounts(prev => {
      if (prev.some(account => account.name.toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, { name, balance: 0, accountType: party.accountType || 'BANK' }];
    });
    setForm(f => ({ ...f, bankName: name, paymentMode: 'bank' }));
    setShowAddBank(false);
    setNewBankName('');
  };

  const resetForm = async () => {
    setEditingId(null);
    setPendingBills([]);
    setRestoreAllocations(null);
    setQuickBillNo('');
    setForm(emptyForm());
    await loadMasterData();
  };

  const saveEntry = async () => {
    if (!form.partyName.trim()) {
      alert('A/C Name (party) is required.');
      return;
    }
    if (!form.bankName.trim()) {
      alert('Bank / Cash account is required.');
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert(form.entryType === 'receipt' ? 'Enter Rec. Amt.' : 'Enter Paid Amt.');
      return;
    }
    const billAllocations = adjustedBills.map(bill => ({ ...bill }));
    if (billAllocations.length === 0) {
      alert('Pick at least one bill to adjust (click the bill row or enter Bill No.).');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const series = normalizeBankCashSeries(form.series || form.transactionType);
      const payload = {
        entryType: bankCashEntryType(series),
        paymentMode: bankCashPaymentMode(series),
        transactionType: series,
        entryDate: form.entryDate ? new Date(form.entryDate).toISOString() : new Date().toISOString(),
        voucherNumber: form.voucherNumber,
        companyName: form.companyName,
        bankName: form.bankName,
        partyType: form.partyType,
        partyName: form.partyName,
        amount,
        chequeNumber: form.chequeNumber,
        chequeDate: form.chequeDate ? new Date(form.chequeDate).toISOString() : null,
        slipNumber: form.slipNumber || slipNumberFromDate(form.entryDate),
        referenceNumber: form.referenceNumber,
        remarks: form.remarks,
        billAllocations,
        grossAmount: summary.grossAmount,
        adjustPending: summary.adjustPending,
        netBillAmount: summary.netBillAmount,
        adjustAdd: summary.netBillAmount,
        taxableValuePaidBills: summary.taxableValuePaidBills,
        linkedType: billAllocations[0]?.billType || 'none',
        linkedId: billAllocations[0]?.billId || null
      };
      if (editingId) {
        await bankEntriesApi.update(editingId, payload as any);
      } else {
        await bankEntriesApi.create(payload as any);
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
          <ErpFormShell onSave={saveEntry} saving={saving} className="space-y-4">
            {/* Header — Empire order */}
            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div className="xl:col-span-2">
                  <label className={labelClass}>Company</label>
                  <input className={inputClass} value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Type</label>
                  <select className={inputClass} value={form.series} onChange={e => applySeries(e.target.value)}>
                    {BANK_CASH_SERIES.map(series => (
                      <option key={series} value={series}>{series}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>V. No.</label>
                  <input className={inputClass} value={form.voucherNumber} onChange={e => setForm(f => ({ ...f, voucherNumber: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Date</label>
                  <input className={inputClass} type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>{form.entryType === 'receipt' ? 'Rec. Amt.' : 'Paid Amt.'}</label>
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className={labelClass}>Bank / Cash</label>
                  <div className="flex gap-2">
                    <input
                      className={inputClass}
                      list="bank-account-options"
                      placeholder={form.paymentMode === 'cash' ? 'CASH A/C' : 'IDBI BANK'}
                      value={form.bankName}
                      disabled={form.paymentMode === 'cash'}
                      onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                    />
                    {form.paymentMode === 'bank' && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewBankName(form.bankName.trim());
                          setShowAddBank(true);
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </button>
                    )}
                  </div>
                  <datalist id="bank-account-options">
                    {bankAccounts.map(account => (
                      <option key={account.name} value={account.name} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs font-bold text-sky-800">Cur. Bal.: {formatBalance(bankBalance)}</p>
                </div>

                <div>
                  <label className={labelClass}>A/C Name</label>
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <select
                      className={inputClass}
                      value={form.partyType}
                      onChange={e => setForm(f => ({
                        ...f,
                        partyType: e.target.value as 'customer' | 'supplier' | 'other',
                        partyName: ''
                      }))}
                    >
                      <option value="customer">Customer</option>
                      <option value="supplier">Supplier</option>
                      <option value="other">Other</option>
                    </select>
                    {partyOptions.length > 0 ? (
                      <select
                        className={inputClass}
                        value={form.partyName}
                        onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))}
                      >
                        <option value="">Select party</option>
                        {partyOptions.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inputClass}
                        placeholder="Party name"
                        value={form.partyName}
                        onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))}
                      />
                    )}
                  </div>
                  <p className="mt-1 text-xs font-bold text-amber-800">Cur. Bal.: {formatBalance(partyBalance)}</p>
                </div>

                <div>
                  <label className={labelClass}>Draw / Cheque (other party&apos;s bank)</label>
                  <input
                    className={inputClass}
                    placeholder="HDFC"
                    value={form.referenceNumber}
                    onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                  <input
                    className={inputClass}
                    value={form.slipNumber}
                    onChange={e => setForm(f => ({ ...f, slipNumber: e.target.value }))}
                    title="Auto from date — 16/07 → 1607"
                  />
                </div>
                <div>
                  <label className={labelClass}>Remark</label>
                  <input className={inputClass} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
                </div>
              </div>
            </section>

            {/* Bill pick — Empire: enter bill no or click row */}
            <section className="rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Pending bills</h2>
                  <p className="text-xs text-gray-500">
                    Enter Bill No. or click a row. Adjust fills with pending amount (same as Empire bill pick).
                  </p>
                </div>
                <div className="flex items-end gap-2">
                  <div>
                    <label className={labelClass}>Bill No.</label>
                    <select
                      className="min-w-[200px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold"
                      value={quickBillNo}
                      onChange={e => {
                        const value = e.target.value;
                        setQuickBillNo(value);
                        if (value) pickBillByNumber(value);
                      }}
                    >
                      <option value="">Pick bill…</option>
                      {pendingBills.map(bill => (
                        <option key={bill.billId} value={bill.billNumber}>
                          {bill.billNumber} · {bill.transactionType || 'Bill'} · {formatMoney(bill.pendingAmount)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingBills(prev => prev.map(bill => ({ ...bill, adjustAmount: 0 })))}
                    className="rounded-xl border px-3 py-2.5 text-xs font-black text-gray-700"
                  >
                    Clear picks
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                {loadingBills ? (
                  <div className="flex items-center justify-center py-14 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading pending bills…
                  </div>
                ) : !form.partyName ? (
                  <div className="px-5 py-12 text-center text-sm text-gray-400">Select A/C Name to load pending bills.</div>
                ) : pendingBills.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-gray-400">No pending bills for this party.</div>
                ) : (
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Bill</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">V.No</th>
                        <th className="px-3 py-2 text-right">Taxable</th>
                        <th className="px-3 py-2 text-right">Bill Amt</th>
                        <th className="px-3 py-2 text-right">Pend Amt</th>
                        <th className="px-3 py-2 text-right">Adjust</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBills.map(bill => {
                        const picked = (bill.adjustAmount || 0) > 0;
                        return (
                          <tr
                            key={bill.billId}
                            className={`cursor-pointer border-t ${picked ? 'bg-indigo-50/70' : 'hover:bg-gray-50'}`}
                            onClick={() => pickBill(bill.billId)}
                          >
                            <td className="px-3 py-2.5 font-black text-gray-900">{bill.billNumber}</td>
                            <td className="px-3 py-2.5">{formatDate(bill.billDate)}</td>
                            <td className="px-3 py-2.5 text-xs font-semibold text-gray-600">{bill.transactionType || '-'}</td>
                            <td className="px-3 py-2.5">{bill.voucherNumber || '-'}</td>
                            <td className="px-3 py-2.5 text-right">{formatMoney(bill.taxableAmount || 0)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold">{formatMoney(bill.billAmount)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-amber-700">{formatMoney(bill.pendingAmount)}</td>
                            <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                              <input
                                className={`w-28 rounded-lg border px-2 py-1.5 text-right text-sm font-bold ${picked ? 'border-indigo-300 bg-white' : 'border-gray-200 bg-gray-50'}`}
                                type="number"
                                min="0"
                                step="0.01"
                                max={bill.pendingAmount}
                                value={bill.adjustAmount || ''}
                                onChange={e => updateBillAdjust(bill.billId, e.target.value)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Footer totals — Empire labels */}
            <section className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className={labelClass}>Gross Amt</p>
                  <p className="text-lg font-black text-gray-900">{formatMoney(summary.grossAmount)}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 px-4 py-3">
                  <p className={labelClass}>Adjust Pend.</p>
                  <p className="text-lg font-black text-amber-900">{formatMoney(summary.adjustPending)}</p>
                </div>
                <div className="rounded-2xl bg-indigo-50 px-4 py-3">
                  <p className={labelClass}>Net Bill Amt</p>
                  <p className="text-lg font-black text-indigo-900">{formatMoney(summary.netBillAmount)}</p>
                </div>
                <div className="rounded-2xl bg-sky-50 px-4 py-3">
                  <p className={labelClass}>{summary.adjustAdd > 0 ? 'Adjust Add' : 'Adjust Less'}</p>
                  <p className="text-lg font-black text-sky-900">
                    {formatMoney(summary.adjustAdd > 0 ? summary.adjustAdd : summary.adjustLess)}
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                  <p className={labelClass}>Taxable (Paid Bills)</p>
                  <p className="text-lg font-black text-emerald-900">{formatMoney(summary.taxableValuePaidBills)}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ErpSaveButton
                  saving={saving}
                  label="Save Entry"
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void resetForm()}
                  className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700"
                >
                  Clear
                </button>
              </div>
            </section>
          </ErpFormShell>
        ) : (
          <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Bank Register</h2>
                <p className="text-xs text-gray-500">Click a row to edit.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    data-erp-skip-nav
                    className="rounded-xl border bg-gray-50 py-2 pl-9 pr-3 text-sm"
                    placeholder="Search entries"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void loadEntries(); }}
                  />
                </div>
                <select
                  className="rounded-xl border px-3 py-2 text-sm font-bold"
                  value={entryTypeFilter}
                  onChange={e => setEntryTypeFilter(e.target.value as EntryFilter)}
                >
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
                  Loading entries…
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
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => (
                      <tr
                        key={entry.id}
                        className="cursor-pointer border-b hover:bg-indigo-50/40"
                        onClick={() => {
                          window.history.replaceState({}, '', `/erp/bank?edit=${entry.id}`);
                          void startEdit(entry);
                        }}
                      >
                        <td className="py-3 font-bold">{entry.voucherNumber || '-'}</td>
                        <td>{formatDate(entry.entryDate)}</td>
                        <td>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${entry.entryType === 'payment' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            {entry.transactionType || entry.entryType}
                          </span>
                        </td>
                        <td>
                          <p className="font-bold text-gray-900">{entry.partyName}</p>
                          <p className="text-xs text-gray-400">
                            {entry.partyType || '-'}
                            {entry.referenceNumber ? ` · Draw ${entry.referenceNumber}` : ''}
                          </p>
                        </td>
                        <td>{entry.bankName || '-'}</td>
                        <td>{entry.chequeNumber || entry.slipNumber || '-'}</td>
                        <td className={`text-right font-black ${entry.entryType === 'payment' ? 'text-red-700' : 'text-green-700'}`}>
                          {formatMoney(entry.amount)}
                        </td>
                        <td className="text-right" onClick={e => e.stopPropagation()}>
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

      <AccountsInformationDialog
        open={showAddBank}
        initialName={newBankName}
        context="other"
        suggestedAccountType="BANK"
        onClose={() => {
          setShowAddBank(false);
          setNewBankName('');
        }}
        onSaved={onBankAccountSaved}
      />
    </div>
  );
};
