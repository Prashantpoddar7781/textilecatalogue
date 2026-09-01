import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  isUnadjAllocation,
  normalizeBankCashSeries,
  slipNumberFromDate,
  UNADJ_BILL_TYPE
} from '../constants/bankCashSeries';
import {
  DEFAULT_PURCHASE_TRANSACTION_TYPE,
  DEFAULT_SALES_TRANSACTION_TYPE,
  getTransactionTypesForParty
} from '../constants/erpTransactionTypes';
import { AccountsInformationDialog } from './AccountsInformationDialog';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';

const UNADJ_PAYMENT_TYPE = 'UNADJ PAYMENT';

const defaultBillTypeForParty = (partyType?: string) =>
  partyType === 'supplier' ? DEFAULT_PURCHASE_TRANSACTION_TYPE : DEFAULT_SALES_TRANSACTION_TYPE;

const isUnadjBillTypeQuery = (value?: string | null) => {
  const q = String(value || '').trim().toLowerCase();
  return q === 'u' || q === 'un' || q.startsWith('unadj');
};

interface Props {
  onBack: () => void;
}

type EntryFilter = 'all' | 'payment' | 'receipt';
type ViewMode = 'entry' | 'register';

const today = () => new Date().toISOString().slice(0, 10);

const formatMoney = (value: number) =>
  (Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const roundMoneyLocal = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/** Customer positive = DR (they owe us). Supplier positive = CR (we owe them). */
const formatPartyBalance = (value: number, partyType?: string) => {
  const abs = formatMoney(Math.abs(value));
  if (partyType === 'supplier') return `${abs} ${value >= 0 ? 'CR' : 'DR'}`;
  return `${abs} ${value >= 0 ? 'DR' : 'CR'}`;
};

const formatBankBalance = (value: number) => `${formatMoney(Math.abs(value))} ${value >= 0 ? 'DR' : 'CR'}`;

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
  const [billType, setBillType] = useState(defaultBillTypeForParty(bankCashDefaultPartyType(DEFAULT_BANK_CASH_SERIES)));
  const [billTypePickerOpen, setBillTypePickerOpen] = useState(false);
  const [billPickerOpen, setBillPickerOpen] = useState(false);
  const [billTypeHighlight, setBillTypeHighlight] = useState(0);
  const [billHighlight, setBillHighlight] = useState(0);
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [restoreAllocations, setRestoreAllocations] = useState<BankPendingBill[] | null>(null);
  const [amountTouched, setAmountTouched] = useState(false);
  const companyRef = useRef<HTMLInputElement>(null);
  const billTypeRef = useRef<HTMLInputElement>(null);
  const billNoRef = useRef<HTMLInputElement>(null);

  const focusInputStart = (el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus();
    el.setSelectionRange?.(0, 0);
  };

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
      const accounts = accountsResult.accounts || [];
      setBankAccounts(accounts);
      const preferredBank = accounts.find(account =>
        String(account.accountType || '').toUpperCase() === 'BANK'
        || (!/cash/i.test(account.name) && String(account.accountType || '').toUpperCase() !== 'CASH')
      )?.name;
      setForm(f => ({
        ...f,
        voucherNumber: voucherResult.voucherNumber,
        companyName: voucherResult.companyName,
        bankName: f.paymentMode === 'cash'
          ? (postingSaleOrPurchaseAccount(f.series) || 'CASH A/C')
          : (f.bankName && !/cash/i.test(f.bankName)
            ? f.bankName
            : (profileResult?.profile?.bankName || preferredBank || accounts[0]?.name || 'Default Bank'))
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

  const loadPendingBills = useCallback(async (
    partyName: string,
    partyType: string,
    excludeEntryId?: string | null,
    selectedBillType?: string
  ) => {
    if (!partyName.trim()) {
      setPendingBills([]);
      setQuickBillNo('');
      return;
    }
    setLoadingBills(true);
    try {
      const typeFilter = String(selectedBillType || '').trim();
      const useTypeFilter = typeFilter && !isUnadjBillTypeQuery(typeFilter);
      const { bills } = await bankEntriesApi.getPendingBills({
        partyName,
        partyType: partyType as any,
        transactionType: useTypeFilter ? typeFilter : undefined,
        excludeEntryId: excludeEntryId || undefined
      });
      const onlyBills = (bills || []).filter(bill => bill.billType !== 'credit_debit_note');
      const seeded = onlyBills
        .map(bill => ({
          ...bill,
          adjustAmount: 0,
          adjustDirection: isUnadjAllocation(bill) ? 'deduct' : (bill.adjustDirection || 'add'),
          entryKind: isUnadjAllocation(bill) ? UNADJ_BILL_TYPE : bill.entryKind
        }))
        .sort((a, b) => {
          const aUnadj = isUnadjAllocation(a) ? 1 : 0;
          const bUnadj = isUnadjAllocation(b) ? 1 : 0;
          if (aUnadj !== bUnadj) return aUnadj - bUnadj;
          return String(a.billNumber).localeCompare(String(b.billNumber), undefined, { numeric: true });
        });

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
        setPendingBills(prev => {
          // Keep already-picked adjust amounts when reloading for a type change.
          const pickedById = new Map(prev.filter(b => (b.adjustAmount || 0) > 0).map(b => [b.billId, b]));
          return merged.map(bill => {
            const picked = pickedById.get(bill.billId);
            if (!picked) return bill;
            return {
              ...bill,
              adjustAmount: Math.min(picked.adjustAmount || 0, bill.pendingAmount || picked.adjustAmount || 0),
              pendingAmount: Math.max(bill.pendingAmount, picked.adjustAmount || 0)
            };
          });
        });
        setRestoreAllocations(null);
      } else {
        setPendingBills(prev => {
          const pickedById = new Map(prev.filter(b => (b.adjustAmount || 0) > 0).map(b => [b.billId, b]));
          if (pickedById.size === 0) return seeded;
          const next = seeded.map(bill => {
            const picked = pickedById.get(bill.billId);
            if (!picked) return bill;
            return {
              ...bill,
              adjustAmount: Math.min(picked.adjustAmount || 0, bill.pendingAmount || picked.adjustAmount || 0),
              pendingAmount: Math.max(bill.pendingAmount, picked.adjustAmount || 0)
            };
          });
          for (const picked of pickedById.values()) {
            if (!next.some(row => row.billId === picked.billId)) next.push(picked);
          }
          return next;
        });
      }
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
    setAmountTouched(false);
    setQuickBillNo('');
    setBillType(defaultBillTypeForParty(partyType));
    setBillPickerOpen(false);
    setBillTypePickerOpen(false);
  };

  useEffect(() => {
    void loadMasterData();
    void loadEntries();
    window.setTimeout(() => focusInputStart(companyRef.current), 0);
  }, []);

  useEffect(() => {
    if (viewMode === 'register') void loadEntries();
  }, [entryTypeFilter, viewMode]);

  useEffect(() => {
    void refreshBalances(form.bankName, form.partyName, form.partyType);
    void loadPendingBills(form.partyName, form.partyType, editingId, billType);
  }, [form.bankName, form.partyName, form.partyType, editingId, billType, refreshBalances, loadPendingBills]);

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

  const isUnadjRow = (bill: BankPendingBill) => isUnadjAllocation(bill);

  const summary = useMemo(() => {
    const billAdjust = roundMoneyLocal(
      adjustedBills
        .filter(bill => !isUnadjRow(bill))
        .reduce((sum, bill) => sum + (bill.adjustAmount || 0), 0)
    );
    const unadjAdjust = roundMoneyLocal(
      adjustedBills
        .filter(bill => isUnadjRow(bill))
        .reduce((sum, bill) => sum + (bill.adjustAmount || 0), 0)
    );
    const unadjAvailable = roundMoneyLocal(
      pendingBills
        .filter(bill => isUnadjRow(bill))
        .reduce((sum, bill) => sum + (bill.pendingAmount || 0), 0)
    );
    const billPending = roundMoneyLocal(
      pendingBills
        .filter(bill => !isUnadjRow(bill))
        .reduce((sum, bill) => sum + (bill.pendingAmount || 0), 0)
    );
    const grossAmount = roundMoneyLocal(billAdjust + unadjAdjust);
    const netBillAmount = roundMoneyLocal(billAdjust - unadjAdjust);
    const taxableValuePaidBills = roundMoneyLocal(
      adjustedBills
        .filter(bill => !isUnadjRow(bill))
        .reduce((sum, bill) => {
          const ratio = bill.billAmount > 0 ? (bill.adjustAmount || 0) / bill.billAmount : 0;
          return sum + (bill.taxableAmount || 0) * ratio;
        }, 0)
    );
    const received = roundMoneyLocal(Number(form.amount) || 0);
    const unadjRemaining = roundMoneyLocal(Math.max(unadjAvailable - unadjAdjust, 0));
    const adjustPending = unadjRemaining > 0
      ? roundMoneyLocal(-unadjRemaining)
      : billPending;
    const adjustLess = roundMoneyLocal(Math.max(netBillAmount - received, 0));
    const adjustAdd = roundMoneyLocal(Math.max(received - Math.max(netBillAmount, 0), 0));
    return {
      grossAmount,
      adjustPending,
      netBillAmount,
      adjustLess,
      adjustAdd,
      taxableValuePaidBills,
      received,
      billAdjust,
      unadjAdjust,
      unadjAvailable
    };
  }, [pendingBills, adjustedBills, form.amount]);

  /** Keep Rec/Paid Amt in sync with bill − unadj net unless the user typed an amount. */
  useEffect(() => {
    if (amountTouched) return;
    if (summary.billAdjust <= 0 && summary.unadjAdjust <= 0) return;
    const next = Math.max(summary.netBillAmount, 0);
    setForm(f => {
      const current = roundMoneyLocal(Number(f.amount) || 0);
      if (current === next) return f;
      return { ...f, amount: next > 0 ? String(next) : '' };
    });
  }, [summary.netBillAmount, summary.billAdjust, summary.unadjAdjust, amountTouched]);

  const billTypeOptions = useMemo(() => {
    const types = getTransactionTypesForParty(form.partyType).map(t => t.value);
    return [UNADJ_PAYMENT_TYPE, ...types.filter(t => t !== UNADJ_PAYMENT_TYPE)];
  }, [form.partyType]);

  const billTypeMatches = useMemo(() => {
    const q = billType.trim().toLowerCase();
    if (!q) return billTypeOptions.slice(0, 12);
    if (isUnadjBillTypeQuery(q)) {
      return [UNADJ_PAYMENT_TYPE, ...billTypeOptions.filter(t => t !== UNADJ_PAYMENT_TYPE && t.toLowerCase().includes(q))];
    }
    return billTypeOptions.filter(t => t.toLowerCase().includes(q)).slice(0, 12);
  }, [billType, billTypeOptions]);

  const unadjMode = isUnadjBillTypeQuery(billType) || billType.trim().toUpperCase() === UNADJ_PAYMENT_TYPE;

  const quickBillMatches = useMemo(() => {
    const pool = unadjMode
      ? pendingBills.filter(bill => isUnadjRow(bill))
      : pendingBills.filter(bill => !isUnadjRow(bill));
    const q = quickBillNo.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(bill =>
      String(bill.billNumber).toLowerCase().includes(q)
      || String(bill.voucherNumber || '').toLowerCase().includes(q)
      || String(bill.transactionType || '').toLowerCase().includes(q)
    );
  }, [pendingBills, quickBillNo, unadjMode]);

  useEffect(() => {
    setBillHighlight(0);
  }, [quickBillMatches]);

  useEffect(() => {
    setBillTypeHighlight(0);
  }, [billTypeMatches]);

  const pickBill = (billId: string, opts?: { toggle?: boolean }) => {
    setPendingBills(prev => {
      const target = prev.find(bill => bill.billId === billId);
      if (!target) return prev;
      const already = (target.adjustAmount || 0) > 0;
      if (already && opts?.toggle === false) return prev;
      return prev.map(bill => {
        if (bill.billId !== billId) return bill;
        return { ...bill, adjustAmount: already && opts?.toggle !== false ? 0 : bill.pendingAmount };
      });
    });
  };

  const pickBillByNumber = (billNumber: string) => {
    const bill = pendingBills.find(row => String(row.billNumber) === String(billNumber))
      || quickBillMatches.find(row => String(row.billNumber) === String(billNumber));
    if (!bill) return;
    pickBill(bill.billId, { toggle: false });
    setQuickBillNo('');
    setBillPickerOpen(false);
    window.setTimeout(() => focusInputStart(billNoRef.current), 0);
  };

  const commitBillType = (value: string) => {
    const next = isUnadjBillTypeQuery(value) ? UNADJ_PAYMENT_TYPE : value.trim().toUpperCase();
    const resolved = billTypeOptions.find(t => t.toUpperCase() === next)
      || billTypeMatches[billTypeHighlight]
      || (isUnadjBillTypeQuery(value) ? UNADJ_PAYMENT_TYPE : value.trim());
    setBillType(resolved);
    setBillTypePickerOpen(false);
    setQuickBillNo('');
    window.setTimeout(() => focusInputStart(billNoRef.current), 0);
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
    setAmountTouched(true);
    const series = normalizeBankCashSeries(
      entry.transactionType
      || (entry.entryType === 'payment'
        ? (entry.paymentMode === 'cash' ? 'CASH PAYMENT' : 'BANK PAYMENT')
        : (entry.paymentMode === 'cash' ? 'CASH RECEIPT' : 'BANK RECEIPT'))
    );
    const entryDate = entry.entryDate?.slice(0, 10) || today();
    const partyType = (entry.partyType as any) || bankCashDefaultPartyType(series);
    const firstAlloc = Array.isArray(entry.billAllocations) ? entry.billAllocations[0] : null;
    setBillType(
      firstAlloc && isUnadjAllocation(firstAlloc)
        ? UNADJ_PAYMENT_TYPE
        : (firstAlloc?.transactionType || defaultBillTypeForParty(partyType))
    );
    setForm({
      series,
      entryType: bankCashEntryType(series),
      entryDate,
      voucherNumber: entry.voucherNumber || '',
      companyName: entry.companyName || '',
      bankName: entry.bankName || '',
      partyType,
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
            transactionType: isUnadjAllocation(item) ? 'UNADJ PAYMENT' : undefined,
            voucherNumber: item.voucherNumber,
            billDate: item.billDate,
            days: item.days || 0,
            grace: item.grace,
            adatDisc: item.adatDisc,
            billAmount: item.billAmount,
            pendingAmount: item.pendingAmount,
            taxableAmount: item.taxableAmount,
            adjustAmount: item.adjustAmount,
            entryKind: isUnadjAllocation(item) ? UNADJ_BILL_TYPE : item.entryKind,
            adjustDirection: isUnadjAllocation(item) ? 'deduct' : (item.adjustDirection || 'add')
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
    setAmountTouched(false);
    setBillType(defaultBillTypeForParty(bankCashDefaultPartyType(DEFAULT_BANK_CASH_SERIES)));
    setBillPickerOpen(false);
    setBillTypePickerOpen(false);
    setForm(emptyForm());
    await loadMasterData();
    window.setTimeout(() => focusInputStart(companyRef.current), 0);
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
    const billAllocations = adjustedBills.map(bill => ({
      ...bill,
      billType: isUnadjRow(bill) ? UNADJ_BILL_TYPE : bill.billType,
      entryKind: isUnadjRow(bill) ? UNADJ_BILL_TYPE : bill.entryKind,
      adjustDirection: isUnadjRow(bill) ? 'deduct' : (bill.adjustDirection || 'add')
    }));

    // Part payment path: no bill picks → entire amount becomes Unadjusted Payment (Empire).
    // Settlement path: bills ± prior unadj → net should match Rec/Paid Amt.
    if (billAllocations.length > 0 && summary.netBillAmount - amount > 0.05) {
      const ok = window.confirm(
        `Adjusted amt (${formatMoney(summary.netBillAmount)}) is more than ${form.entryType === 'receipt' ? 'cheque/rec' : 'paid'} amt (${formatMoney(amount)}). Continue?`
      );
      if (!ok) return;
    }

    setSaving(true);
    setError('');
    try {
      const series = normalizeBankCashSeries(form.series || form.transactionType);
      const firstRealBill = billAllocations.find(bill => !isUnadjRow(bill));
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
        adjustAdd: summary.adjustAdd,
        taxableValuePaidBills: summary.taxableValuePaidBills,
        linkedType: firstRealBill && ['order', 'sales_invoice', 'purchase_bill'].includes(String(firstRealBill.billType))
          ? firstRealBill.billType
          : 'none',
        linkedId: firstRealBill?.billId || null
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
                  <input
                    ref={companyRef}
                    className={inputClass}
                    value={form.companyName}
                    onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Series</label>
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
                    onChange={e => {
                      setAmountTouched(true);
                      setForm(f => ({ ...f, amount: e.target.value }));
                    }}
                  />
                  {summary.unadjAvailable > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-violet-700">
                      Unadj. pending: {formatMoney(summary.unadjAvailable)} — Type U then pick in Bill No.
                    </p>
                  )}
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
                        data-erp-skip-nav
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
                  <p className="mt-1 text-xs font-bold text-sky-800">Cur. Bal.: {formatBankBalance(bankBalance)}</p>
                </div>

                <div>
                  <label className={labelClass}>A/C Name</label>
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <select
                      className={inputClass}
                      value={form.partyType}
                      onChange={e => {
                        const partyType = e.target.value as 'customer' | 'supplier' | 'other';
                        setBillType(defaultBillTypeForParty(partyType));
                        setForm(f => ({
                          ...f,
                          partyType,
                          partyName: ''
                        }));
                      }}
                    >
                      <option value="customer">Customer</option>
                      <option value="supplier">Supplier</option>
                      <option value="other">Other</option>
                    </select>
                    <input
                      className={inputClass}
                      list="bank-party-options"
                      placeholder="Type party name"
                      value={form.partyName}
                      onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key !== 'Enter' || !form.partyName.trim()) return;
                        // After party, jump to Bill Type (Empire keyboard flow).
                        e.preventDefault();
                        e.stopPropagation();
                        focusInputStart(billTypeRef.current);
                      }}
                    />
                  </div>
                  <datalist id="bank-party-options">
                    {partyOptions.map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs font-bold text-amber-800">Cur. Bal.: {formatPartyBalance(partyBalance, form.partyType)}</p>
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

            {/* Bill pick — Empire: Type + Bill No; list only after typing; show selected rows only */}
            <section className="rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Bill allocation</h2>
                  <p className="text-xs text-gray-500">
                    Type <span className="font-black">FINISH PURCHASE</span> / <span className="font-black">FINISH SALES</span>, or <span className="font-black text-violet-700">U</span> for Unadj Payment.
                    Then type in Bill No. — Enter picks. Part payment: leave bills empty and save Rec/Paid Amt.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="relative">
                    <label className={labelClass}>Type</label>
                    <input
                      ref={billTypeRef}
                      className="min-w-[200px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400"
                      placeholder={form.partyType === 'supplier' ? 'FINISH PURCHASE / U' : 'FINISH SALES / U'}
                      value={billType}
                      onFocus={() => setBillTypePickerOpen(true)}
                      onBlur={() => window.setTimeout(() => setBillTypePickerOpen(false), 150)}
                      onChange={e => {
                        setBillType(e.target.value);
                        setBillTypePickerOpen(true);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          setBillTypePickerOpen(true);
                          setBillTypeHighlight(i => Math.min(i + 1, Math.max(billTypeMatches.length - 1, 0)));
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          setBillTypeHighlight(i => Math.max(i - 1, 0));
                          return;
                        }
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          const pick = billTypeMatches[billTypeHighlight] || billTypeMatches[0] || billType;
                          commitBillType(pick);
                        }
                      }}
                    />
                    {billTypePickerOpen && billTypeMatches.length > 0 && (
                      <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border bg-white shadow-lg">
                        {billTypeMatches.map((type, index) => (
                          <button
                            key={type}
                            type="button"
                            data-erp-skip-nav
                            className={`flex w-full px-3 py-2 text-left text-xs font-bold hover:bg-indigo-50 ${
                              index === billTypeHighlight ? 'bg-indigo-100 text-indigo-900' : (type === UNADJ_PAYMENT_TYPE ? 'text-violet-800' : 'text-gray-800')
                            }`}
                            onMouseDown={ev => {
                              ev.preventDefault();
                              commitBillType(type);
                            }}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <label className={labelClass}>Bill No.</label>
                    <input
                      ref={billNoRef}
                      className="min-w-[220px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400"
                      placeholder={unadjMode ? 'Type to list unadj…' : 'Type bill no…'}
                      value={quickBillNo}
                      disabled={!form.partyName.trim()}
                      onFocus={() => {
                        if (form.partyName.trim() && quickBillNo.trim()) setBillPickerOpen(true);
                      }}
                      onBlur={() => window.setTimeout(() => setBillPickerOpen(false), 150)}
                      onChange={e => {
                        const value = e.target.value;
                        setQuickBillNo(value);
                        setBillPickerOpen(Boolean(value.trim()) && Boolean(form.partyName.trim()));
                      }}
                      onKeyDown={e => {
                        if (e.key === 'ArrowDown') {
                          if (!quickBillNo.trim()) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setBillPickerOpen(true);
                          setBillHighlight(i => Math.min(i + 1, Math.max(quickBillMatches.length - 1, 0)));
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          if (!quickBillNo.trim()) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setBillHighlight(i => Math.max(i - 1, 0));
                          return;
                        }
                        if (e.key === 'Enter') {
                          if (quickBillNo.trim() && quickBillMatches.length > 0) {
                            e.preventDefault();
                            e.stopPropagation();
                            const match = quickBillMatches[billHighlight] || quickBillMatches[0];
                            if (match) pickBillByNumber(match.billNumber);
                          }
                          // Empty Bill No. → ErpFormShell advances to next field.
                        }
                      }}
                    />
                    {billPickerOpen && form.partyName.trim() && quickBillNo.trim() && (
                      <div className="absolute z-30 mt-1 max-h-56 w-[320px] overflow-y-auto rounded-xl border bg-white shadow-lg">
                        {loadingBills ? (
                          <div className="px-3 py-3 text-xs text-gray-500">Loading…</div>
                        ) : quickBillMatches.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-gray-500">
                            {unadjMode ? 'No unadjusted payments.' : 'No matching pending bills.'}
                          </div>
                        ) : (
                          quickBillMatches.slice(0, 15).map((bill, index) => (
                            <button
                              key={bill.billId}
                              type="button"
                              data-erp-skip-nav
                              className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-indigo-50 ${
                                index === billHighlight
                                  ? 'bg-indigo-100'
                                  : ''
                              } ${isUnadjRow(bill) ? 'text-violet-800' : 'text-gray-800'}`}
                              onMouseDown={ev => {
                                ev.preventDefault();
                                pickBillByNumber(bill.billNumber);
                              }}
                            >
                              <span className="font-black">{bill.billNumber}</span>
                              <span>{bill.transactionType || 'Bill'} · {formatMoney(bill.pendingAmount)}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    data-erp-skip-nav
                    onClick={() => setPendingBills(prev => prev.map(bill => ({ ...bill, adjustAmount: 0 })))}
                    className="rounded-xl border px-3 py-2.5 text-xs font-black text-gray-700"
                  >
                    Clear picks
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                {!form.partyName ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">Select A/C Name, then Type + Bill No. (keyboard / Enter).</div>
                ) : adjustedBills.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">
                    No bills selected yet. Type in Bill No. and press Enter to pick.
                    Or leave empty and save Rec/Paid Amt as unadjusted part payment.
                  </div>
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
                      {adjustedBills.map(bill => {
                        const unadj = isUnadjRow(bill);
                        return (
                          <tr
                            key={bill.billId}
                            className={`border-t ${unadj ? 'bg-violet-50/80' : 'bg-indigo-50/70'}`}
                          >
                            <td className={`px-3 py-2.5 font-black ${unadj ? 'text-violet-800' : 'text-gray-900'}`}>{bill.billNumber}</td>
                            <td className="px-3 py-2.5">{formatDate(bill.billDate)}</td>
                            <td className={`px-3 py-2.5 text-xs font-semibold ${unadj ? 'text-violet-700' : 'text-gray-600'}`}>
                              {bill.transactionType || '-'}
                            </td>
                            <td className="px-3 py-2.5">{bill.voucherNumber || '-'}</td>
                            <td className="px-3 py-2.5 text-right">
                              {unadj ? formatMoney(-(bill.billAmount || 0)) : formatMoney(bill.taxableAmount || 0)}
                            </td>
                            <td className={`px-3 py-2.5 text-right font-semibold ${unadj ? 'text-violet-800' : ''}`}>
                              {unadj ? formatMoney(-(bill.billAmount || 0)) : formatMoney(bill.billAmount)}
                            </td>
                            <td className={`px-3 py-2.5 text-right font-semibold ${unadj ? 'text-violet-700' : 'text-amber-700'}`}>
                              {unadj ? formatMoney(-(bill.pendingAmount || 0)) : formatMoney(bill.pendingAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <input
                                data-erp-skip-nav
                                className={`w-28 rounded-lg border px-2 py-1.5 text-right text-sm font-bold ${
                                  unadj ? 'border-violet-300 bg-white' : 'border-indigo-300 bg-white'
                                }`}
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
                  <p className={`text-lg font-black ${summary.adjustPending < 0 ? 'text-violet-800' : 'text-amber-900'}`}>
                    {formatMoney(summary.adjustPending)}
                  </p>
                </div>
                <div className="rounded-2xl bg-indigo-50 px-4 py-3">
                  <p className={labelClass}>Net Bill Amt</p>
                  <p className="text-lg font-black text-indigo-900">{formatMoney(summary.netBillAmount)}</p>
                </div>
                <div className="rounded-2xl bg-sky-50 px-4 py-3">
                  <p className={labelClass}>
                    {summary.unadjAdjust > 0 ? 'Adjust Less (Unadj)' : (summary.adjustAdd > 0 ? 'Adjust Add' : 'Adjust Less')}
                  </p>
                  <p className="text-lg font-black text-sky-900">
                    {summary.unadjAdjust > 0
                      ? formatMoney(-summary.unadjAdjust)
                      : formatMoney(summary.adjustAdd > 0 ? summary.adjustAdd : summary.adjustLess)}
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
