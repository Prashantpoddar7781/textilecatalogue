import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { bankEntriesApi, commissionsApi, partiesApi, vouchersApi } from '../services/api';
import { getNavigableFields } from '../hooks/useErpFormKeyboard';
import { parseVoucherNumber } from '../utils/parseVoucherNumber';
import { clearBankOutstandingPrefill, readBankOutstandingPrefill } from '../utils/bankOutstandingPrefill';
import { AccountParty, BankEntry, BankPendingBill, CompletedOrderParty, PurchaseBillParty } from '../types';
import { partyRoleForAccountType } from '../constants/accountTypes';
import { postingSaleOrPurchaseAccount, warnsOnManualEntry } from '../constants/erpTransactionPostingRules';
import {
  BANK_CASH_SERIES,
  bankCashDefaultPartyType,
  bankCashEntryType,
  bankCashPaymentMode,
  defaultBillTypeForEntry,
  DEFAULT_BANK_CASH_SERIES,
  getBankSettlementTypeOptions,
  isDeductAllocation,
  isJournalAllocation,
  isJournalBillTypeQuery,
  isNoteAllocation,
  isUnadjAllocation,
  matchBankSettlementTypes,
  normalizeBankCashSeries,
  isChequeReturnedEntry,
  slipNumberFromDate,
  JOURNAL_TYPE,
  UNADJ_BILL_TYPE,
  UNADJ_PAYMENT_TYPE
} from '../constants/bankCashSeries';
import { parseNoteType } from '../constants/creditDebitNoteTypes';
import { AccountsInformationDialog } from './AccountsInformationDialog';
import { openChequePrint } from '../utils/stationeryPrint';
import { ErpFormShell, useErpFormActions } from './ErpFormShell';
import { ErpPageBack } from './ErpPageBack';
import { PhotoEntryButton } from './PhotoEntryButton';
import { PhotoExtraction } from '../services/api';
import { matchPhotoParty } from '../utils/photoEntry';
import { ErpSaveButton } from './ErpSaveButton';

const isUnadjBillTypeQuery = (value?: string | null) => {
  const q = String(value || '').trim().toLowerCase();
  return q === 'u' || q === 'un' || q.startsWith('unadj');
};

const matchesSelectedBillType = (bill: BankPendingBill, selectedType?: string | null) => {
  const selected = String(selectedType || '').trim();
  if (!selected) return false;
  if (isUnadjBillTypeQuery(selected) || selected.toUpperCase() === UNADJ_PAYMENT_TYPE) {
    return isUnadjAllocation(bill) || (isJournalAllocation(bill) && String(bill.adjustDirection || '').toLowerCase() === 'deduct');
  }
  if (isJournalBillTypeQuery(selected) || selected.toUpperCase() === JOURNAL_TYPE) {
    return isJournalAllocation(bill);
  }
  const note = parseNoteType(selected);
  if (note && /note/i.test(selected)) {
    return bill.billType === 'credit_debit_note' && parseNoteType(bill.transactionType)?.value === note.value;
  }
  if (isJournalAllocation(bill)) {
    return String(bill.oppositeAccount || '').trim().toUpperCase() === selected.toUpperCase();
  }
  return String(bill.transactionType || '').trim().toUpperCase() === selected.toUpperCase()
    && bill.billType !== 'credit_debit_note'
    && !isUnadjAllocation(bill)
    && !isJournalAllocation(bill);
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

const compareOldestBill = (
  a: { billDate?: string | null; billNumber?: string | null },
  b: { billDate?: string | null; billNumber?: string | null }
) => {
  const dateA = new Date(a.billDate || 0).getTime() || 0;
  const dateB = new Date(b.billDate || 0).getTime() || 0;
  if (dateA !== dateB) return dateA - dateB;
  return String(a.billNumber || '').localeCompare(String(b.billNumber || ''), undefined, { numeric: true });
};

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

function BillPickField({
  inputRef,
  value,
  disabled,
  placeholder,
  onFocus,
  onBlur,
  onChange,
  onArrow,
  onPick
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  disabled: boolean;
  placeholder: string;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  onArrow: (key: 'ArrowDown' | 'ArrowUp') => void;
  onPick: () => boolean;
}) {
  const actions = useErpFormActions();
  return (
    <input
      ref={inputRef}
      data-erp-enter-custom
      data-erp-arrow-custom
      className="w-full min-w-[7rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-semibold outline-none focus:border-indigo-400"
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          onArrow(e.key);
          return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
        if (onPick()) return;
        if (value.trim()) return;
        actions?.requestSave();
      }}
    />
  );
}

/** Empire-style bill-wise receipt/payment — bills, returns, unadj, and credit/debit notes. */
export const BankEntriesPage: React.FC<Props> = ({ onBack }) => {
  const editIdFromUrl = useMemo(() => new URLSearchParams(window.location.search).get('edit'), []);
  const [viewMode, setViewMode] = useState<ViewMode>('entry');
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [pendingBills, setPendingBills] = useState<BankPendingBill[]>([]);
  const [completedParties, setCompletedParties] = useState<CompletedOrderParty[]>([]);
  const [purchaseParties, setPurchaseParties] = useState<PurchaseBillParty[]>([]);
  const [accountParties, setAccountParties] = useState<AccountParty[]>([]);
  const [commissionPercent, setCommissionPercent] = useState('');
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<Array<{ name: string; balance: number; accountType?: string }>>([]);
  const [bankBalance, setBankBalance] = useState(0);
  const [partyBalance, setPartyBalance] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [chequeReturnStep, setChequeReturnStep] = useState<null | 'confirm' | 'date' | 'represent'>(null);
  const [chequeReturnDate, setChequeReturnDate] = useState(today);
  const [returningCheque, setReturningCheque] = useState(false);
  const seriesRef = useRef(form.series);
  const defaultBankRef = useRef('');
  seriesRef.current = form.series;
  const voucherValueRef = useRef(form.voucherNumber);
  voucherValueRef.current = form.voucherNumber;
  const nextBySeriesRef = useRef<Record<string, string>>({});
  const formEpoch = useRef(0);
  const loadSeq = useRef(0);
  const loadedPartyKey = useRef('');
  const openingVoucher = useRef(false);
  const [quickBillNo, setQuickBillNo] = useState('');
  const [billType, setBillType] = useState(defaultBillTypeForEntry(bankCashEntryType(DEFAULT_BANK_CASH_SERIES)));
  const [billTypePickerOpen, setBillTypePickerOpen] = useState(false);
  const [billPickerOpen, setBillPickerOpen] = useState(false);
  const [billTypeHighlight, setBillTypeHighlight] = useState(0);
  const [billHighlight, setBillHighlight] = useState(-1);
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [restoreAllocations, setRestoreAllocations] = useState<BankPendingBill[] | null>(null);
  const [amountTouched, setAmountTouched] = useState(false);
  /** After user confirms, further bill picks take full pending even if over Rec/Paid Amt (case 2 → Unadj). */
  const [allowOverAllocation, setAllowOverAllocation] = useState(false);
  const [allocatedVoucher, setAllocatedVoucher] = useState('');
  const companyRef = useRef<HTMLInputElement>(null);
  const voucherRef = useRef<HTMLInputElement>(null);
  const billTypeRef = useRef<HTMLInputElement>(null);
  const billNoRef = useRef<HTMLInputElement>(null);
  const billListChosen = useRef(false);

  const focusInputStart = (el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus();
    el.setSelectionRange?.(0, 0);
  };

  const focusTypeField = () => {
    const el = billTypeRef.current;
    if (!el) return;
    el.focus();
    el.select?.();
    setBillTypePickerOpen(true);
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
    const epoch = formEpoch.current;
    try {
      const [nextResults, accountsResult, partiesResult, purchasePartiesResult, accountResult] = await Promise.all([
        Promise.all(BANK_CASH_SERIES.map(async name => {
          const result = await bankEntriesApi.getNextVoucher(name);
          return [name, result] as const;
        })),
        bankEntriesApi.getBankAccounts(),
        bankEntriesApi.getCompletedOrderParties(),
        bankEntriesApi.getPurchaseBillParties(),
        partiesApi.list().catch(() => ({ parties: [] as AccountParty[] }))
      ]);
      const nextMap: Record<string, string> = {};
      let companyName = '';
      for (const [name, result] of nextResults) {
        nextMap[name] = String(result.voucherNumber || '');
        companyName = result.companyName || companyName;
      }
      nextBySeriesRef.current = { ...nextBySeriesRef.current, ...nextMap };
      setCompletedParties(partiesResult.parties || []);
      setPurchaseParties(purchasePartiesResult.parties || []);
      setAccountParties(accountResult.parties || []);
      const accounts = accountsResult.accounts || [];
      setBankAccounts(accounts);
      const preferredBank = accountsResult.defaultBankName
        || accounts.find(account =>
          String(account.accountType || '').toUpperCase() === 'BANK'
          && !/cash/i.test(account.name)
        )?.name
        || '';
      defaultBankRef.current = preferredBank;
      const activeSeries = seriesRef.current;
      const nextNo = nextBySeriesRef.current[activeSeries] || '';
      const userIsTyping = Boolean(
        voucherValueRef.current
        && allocatedVoucher
        && voucherValueRef.current !== allocatedVoucher
      );
      if (!editingIdRef.current && formEpoch.current === epoch && nextNo && !userIsTyping) {
        setAllocatedVoucher(nextNo);
      }
      setForm(f => ({
        ...f,
        voucherNumber: editingIdRef.current || formEpoch.current !== epoch || userIsTyping
          ? f.voucherNumber
          : (nextBySeriesRef.current[f.series] || f.voucherNumber),
        companyName: companyName || f.companyName,
        bankName: f.paymentMode === 'cash'
          ? (postingSaleOrPurchaseAccount(f.series) || 'CASH A/C')
          : (editingIdRef.current
            ? f.bankName
            : (preferredBank || f.bankName || accounts[0]?.name || 'Default Bank'))
      }));
    } catch (err: any) {
      console.warn('Failed to load bank master data', err);
    }
  };

  const keepPickedBill = (bill: BankPendingBill, picked: BankPendingBill) => {
    const discountAmount = Number(picked.discountAmount) || 0;
    const discountPercent = Number(picked.discountPercent) || 0;
    const adjustAmount = Math.min(
      picked.adjustAmount || 0,
      Math.max(bill.pendingAmount || 0, (picked.adjustAmount || 0) + discountAmount)
    );
    return {
      ...bill,
      adjustAmount,
      pendingAmount: Math.max(bill.pendingAmount || 0, adjustAmount + discountAmount),
      discountPercent,
      discountAmount,
      adjustDirection: picked.adjustDirection || bill.adjustDirection
    };
  };

  const loadPendingBills = useCallback(async (
    partyName: string,
    partyType: string,
    excludeEntryId?: string | null,
    isCurrent: () => boolean = () => true
  ) => {
    if (!isCurrent()) return;
    if (!partyName.trim()) {
      setPendingBills([]);
      setQuickBillNo('');
      return;
    }
    setLoadingBills(true);
    try {
      const { bills } = await bankEntriesApi.getPendingBills({
        partyName,
        partyType: partyType as any,
        excludeEntryId: excludeEntryId || undefined
      });
      if (!isCurrent()) return;
      const seeded = (bills || [])
        .map(bill => ({
          ...bill,
          adjustAmount: 0,
          adjustDirection: isUnadjAllocation(bill) || isDeductAllocation(bill)
            ? 'deduct'
            : (bill.adjustDirection || 'add'),
          entryKind: isUnadjAllocation(bill) ? UNADJ_BILL_TYPE : bill.entryKind
        }))
        .sort(compareOldestBill);

      if (restoreAllocations?.length) {
        const byId = new Map(restoreAllocations.map(item => [item.billId, item]));
        const merged = seeded.map(bill => {
          const saved = byId.get(bill.billId);
          if (!saved) return bill;
          return keepPickedBill(bill, saved);
        });
        for (const saved of restoreAllocations) {
          if (!merged.some(row => row.billId === saved.billId)) {
            merged.push({ ...saved });
          }
        }
        setPendingBills(prev => {
          const pickedById = new Map(prev.filter(b => (b.adjustAmount || 0) > 0).map(b => [b.billId, b]));
          return merged.map(bill => {
            const picked = pickedById.get(bill.billId);
            if (!picked) return bill;
            return keepPickedBill(bill, picked);
          }).sort(compareOldestBill);
        });
        if (excludeEntryId) clearBankOutstandingPrefill(excludeEntryId);
        setRestoreAllocations(null);
      } else {
        setPendingBills(prev => {
          const pickedById = new Map(prev.filter(b => (b.adjustAmount || 0) > 0).map(b => [b.billId, b]));
          if (pickedById.size === 0) return seeded;
          const next = seeded.map(bill => {
            const picked = pickedById.get(bill.billId);
            if (!picked) return bill;
            return keepPickedBill(bill, picked);
          });
          for (const picked of pickedById.values()) {
            if (!next.some(row => row.billId === picked.billId)) next.push(picked);
          }
          return next.sort(compareOldestBill);
        });
      }
    } catch (err: any) {
      if (!isCurrent()) return;
      setPendingBills([]);
      setError(err.message || 'Could not load pending bills.');
    } finally {
      if (isCurrent()) setLoadingBills(false);
    }
  }, [restoreAllocations]);

  const applySeries = (seriesValue: string) => {
    const series = normalizeBankCashSeries(seriesValue);
    if (series === seriesRef.current && !editingIdRef.current) return;
    const entryType = bankCashEntryType(series);
    const paymentMode = bankCashPaymentMode(series);
    const partyType = bankCashDefaultPartyType(series);
    const cashAccount = postingSaleOrPurchaseAccount(series) || 'CASH A/C';
    const nextNo = nextBySeriesRef.current[series] || '';
    seriesRef.current = series;
    formEpoch.current += 1;
    const epoch = formEpoch.current;
    editingIdRef.current = null;
    setEditingId(null);
    setRestoreAllocations(null);
    setPendingBills([]);
    setAmountTouched(false);
    setAllowOverAllocation(false);
    setQuickBillNo('');
    setCommissionPercent('');
    setCommissionTouched(false);
    setBillType(defaultBillTypeForEntry(entryType));
    setBillPickerOpen(false);
    setBillTypePickerOpen(false);
    if (nextNo) {
      setAllocatedVoucher(nextNo);
      voucherValueRef.current = nextNo;
    }
    const voucherAtRequest = voucherValueRef.current;
    setForm(f => ({
      ...f,
      series,
      transactionType: series,
      entryType,
      paymentMode,
      partyType,
      partyName: '',
      amount: '',
      chequeNumber: '',
      referenceNumber: '',
      remarks: '',
      bankName: paymentMode === 'cash'
        ? cashAccount
        : (f.bankName && !/cash/i.test(f.bankName) ? f.bankName : (defaultBankRef.current || f.bankName)),
      slipNumber: slipNumberFromDate(f.entryDate),
      voucherNumber: nextNo || f.voucherNumber
    }));
    if (window.location.search) window.history.replaceState(null, '', '/erp/bank');
    void bankEntriesApi.getNextVoucher(series).then(result => {
      const number = String(result.voucherNumber || '');
      if (!number) return;
      nextBySeriesRef.current = { ...nextBySeriesRef.current, [series]: number };
      if (formEpoch.current !== epoch || editingIdRef.current || seriesRef.current !== series) return;
      if (voucherValueRef.current !== voucherAtRequest) return;
      setAllocatedVoucher(number);
      setForm(current => current.series === series ? {
        ...current,
        voucherNumber: number,
        companyName: result.companyName || current.companyName
      } : current);
    }).catch(() => undefined);
  };

  useEffect(() => {
    void loadMasterData();
    void loadEntries();
    window.setTimeout(() => focusInputStart(voucherRef.current || companyRef.current), 0);
  }, []);

  useEffect(() => {
    if (viewMode === 'register') void loadEntries();
  }, [entryTypeFilter, viewMode]);

  useEffect(() => {
    setForm(f => {
      const nextSlip = slipNumberFromDate(f.entryDate);
      if (f.slipNumber === nextSlip) return f;
      return { ...f, slipNumber: nextSlip };
    });
  }, [form.entryDate]);

  const partyOptions = useMemo(() => {
    const names = new Set<string>();
    for (const party of accountParties) if (party.name) names.add(party.name);
    for (const party of completedParties) if (party.name) names.add(party.name);
    for (const party of purchaseParties) if (party.name) names.add(party.name);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [accountParties, completedParties, purchaseParties]);

  const partyTypeForName = (name: string, entryType?: string) => {
    const key = name.trim().toLowerCase();
    const matches = accountParties.filter(row => row.name.trim().toLowerCase() === key);
    const isCustomer = (party: AccountParty) =>
      party.role === 'customer' || partyRoleForAccountType(party.accountType) === 'customer';
    const receipt = String(entryType || form.entryType).toLowerCase() !== 'payment';
    if (receipt) {
      if (matches.some(isCustomer)) return 'customer' as const;
      if (completedParties.some(row => row.name.trim().toLowerCase() === key)) return 'customer' as const;
      if (matches.length) return 'supplier' as const;
    } else {
      if (matches.some(party => !isCustomer(party))) return 'supplier' as const;
      if (purchaseParties.some(row => row.name.trim().toLowerCase() === key)) return 'supplier' as const;
      if (matches.some(isCustomer)) return 'customer' as const;
    }
    return null;
  };

  useEffect(() => {
    const namedType = partyTypeForName(form.partyName, form.entryType);
    const resolvedType = namedType || form.partyType;
    const partyName = form.partyName.trim();
    if (partyName && namedType && namedType !== form.partyType) {
      loadSeq.current += 1;
      setForm(current => (
        current.partyName === form.partyName && current.partyType !== namedType
          ? { ...current, partyType: namedType }
          : current
      ));
      return;
    }

    const partyKey = `${partyName.toLowerCase()}|${resolvedType}`;
    if (partyKey !== loadedPartyKey.current) {
      loadedPartyKey.current = partyKey;
      setPartyBalance(partyName ? null : 0);
      setPendingBills([]);
      setLoadingBills(Boolean(partyName));
    }

    const seq = ++loadSeq.current;
    const exact = partyOptions.some(name => name.trim().toLowerCase() === partyName.toLowerCase());
    const delay = !partyName || exact ? 0 : 350;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await bankEntriesApi.getBalances({
            bankName: form.bankName || undefined,
            partyName: partyName || undefined,
            partyType: (resolvedType as 'customer' | 'supplier' | 'other') || 'customer'
          });
          if (loadSeq.current !== seq) return;
          setBankBalance(result.bankBalance);
          setPartyBalance(result.partyBalance);
        } catch {
          if (loadSeq.current !== seq) return;
          setBankBalance(0);
          setPartyBalance(0);
        }
      })();
      void loadPendingBills(partyName, resolvedType, editingId, () => loadSeq.current === seq);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [form.bankName, form.partyName, form.partyType, form.entryType, editingId, accountParties, completedParties, purchaseParties, partyOptions, loadPendingBills]);

  const partyDhara = () => {
    const key = form.partyName.trim().toLowerCase();
    const party = accountParties.find(row => row.name.trim().toLowerCase() === key);
    return Number(party?.dhara || party?.discountRate) || 0;
  };

  const applyPhoto = (x: PhotoExtraction) => {
    const notes: string[] = [];
    const gstByName = new Map(accountParties.map(party => [party.name.toLowerCase(), party.gstNumber || '']));
    const match = matchPhotoParty(partyOptions.map(name => ({ name, gstNumber: gstByName.get(name.toLowerCase()) || '' })), x);
    const amount = x.payment.amount || x.totalAmount;
    const mode = x.payment.mode.toLowerCase();
    setForm(f => ({
      ...f,
      partyName: match?.name || x.party.name || f.partyName,
      entryDate: x.docDate || f.entryDate,
      amount: amount ? String(amount) : f.amount,
      chequeNumber: x.payment.chequeNo || f.chequeNumber,
      chequeDate: x.payment.chequeNo && x.docDate ? x.docDate : f.chequeDate,
      referenceNumber: x.payment.utr || x.docNo || f.referenceNumber,
      remarks: [mode && mode.toUpperCase(), x.payment.bankName, x.remarks].filter(Boolean).join(' · ') || f.remarks
    }));
    if (amount) setAmountTouched(true);
    if (!match && x.party.name) notes.push(`"${x.party.name}" was not found for this series' party type — check the party.`);
    notes.push('Allocate the amount against the bills below before saving.');
    return notes;
  };

  const adjustedBills = useMemo(
    () => pendingBills.filter(bill => (bill.adjustAmount || 0) > 0 || (bill.discountAmount || 0) > 0),
    [pendingBills]
  );

  useEffect(() => {
    if (form.entryType !== 'receipt' || commissionTouched || !form.partyName.trim()) return;
    const broker = pendingBills.find(bill => String(bill.brokerName || '').trim())?.brokerName || '';
    if (!broker) return;
    let cancelled = false;
    commissionsApi.defaultPercent({ party: form.partyName, broker }).then(result => {
      if (cancelled || commissionTouched) return;
      if (result.commissionPercent != null) setCommissionPercent(String(result.commissionPercent));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [commissionTouched, form.entryType, form.partyName, pendingBills]);

  const isUnadjRow = (bill: BankPendingBill) => isUnadjAllocation(bill);
  const isDeductRow = (bill: BankPendingBill) => isDeductAllocation(bill);
  const isNoteRow = (bill: BankPendingBill) => isNoteAllocation(bill);

  const summary = useMemo(() => {
    const billAdjust = roundMoneyLocal(
      adjustedBills
        .filter(bill => !isDeductRow(bill))
        .reduce((sum, bill) => sum + (bill.adjustAmount || 0), 0)
    );
    const unadjAdjust = roundMoneyLocal(
      adjustedBills
        .filter(bill => isDeductRow(bill))
        .reduce((sum, bill) => sum + (bill.adjustAmount || 0), 0)
    );
    const unadjAvailable = roundMoneyLocal(
      pendingBills
        .filter(bill => isUnadjRow(bill))
        .reduce((sum, bill) => sum + (bill.pendingAmount || 0), 0)
    );
    const billPending = roundMoneyLocal(
      pendingBills
        .filter(bill => !isDeductRow(bill))
        .reduce((sum, bill) => sum + (bill.pendingAmount || 0), 0)
    );
    const grossAmount = roundMoneyLocal(billAdjust + unadjAdjust);
    const netBillAmount = roundMoneyLocal(billAdjust - unadjAdjust);
    const taxableValuePaidBills = roundMoneyLocal(
      adjustedBills.reduce((sum, bill) => {
        const ratio = bill.billAmount > 0 ? (bill.adjustAmount || 0) / bill.billAmount : 0;
        const signed = isDeductRow(bill) ? -1 : 1;
        return sum + signed * (bill.taxableAmount || 0) * ratio;
      }, 0)
    );
    const received = roundMoneyLocal(Number(form.amount) || 0);
    const unadjRemaining = roundMoneyLocal(Math.max(unadjAvailable - unadjAdjust, 0));
    const adjustPending = unadjRemaining > 0
      ? roundMoneyLocal(-unadjRemaining)
      : billPending;
    const adjustLess = roundMoneyLocal(Math.max(netBillAmount - received, 0));
    const adjustAdd = roundMoneyLocal(Math.max(received - Math.max(netBillAmount, 0), 0));
    const settlementComplete = (billAdjust > 0 || unadjAdjust > 0)
      && received > 0.001
      && Math.abs(netBillAmount - received) <= 0.05;
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
      unadjAvailable,
      settlementComplete
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

  const billTypeOptions = useMemo(() => getBankSettlementTypeOptions(), []);

  const billTypeMatches = useMemo(() => {
    const q = billType.trim();
    if (!q) return [];
    return matchBankSettlementTypes(q, billTypeOptions);
  }, [billType, billTypeOptions]);

  const unadjMode = isUnadjBillTypeQuery(billType) || billType.trim().toUpperCase() === UNADJ_PAYMENT_TYPE;
  const selectedNoteType = parseNoteType(billType);
  const noteMode = Boolean(selectedNoteType && /note/i.test(billType));

  const quickBillMatches = useMemo(() => {
    const pool = pendingBills.filter(bill =>
      matchesSelectedBillType(bill, billType)
      && !((bill.adjustAmount || 0) > 0 || (bill.discountAmount || 0) > 0)
    );
    const q = quickBillNo.trim().toLowerCase();
    const rank = (bill: BankPendingBill) => {
      if (!q) return 1;
      const number = String(bill.billNumber || '').toLowerCase();
      const voucher = String(bill.voucherNumber || '').toLowerCase();
      if (number === q || number.startsWith(q) || voucher === q || voucher.startsWith(q)) return 0;
      if (number.includes(q) || voucher.includes(q)) return 1;
      return 2;
    };
    return [...pool].sort((a, b) => {
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return compareOldestBill(a, b);
    });
  }, [pendingBills, quickBillNo, billType]);

  useEffect(() => {
    setBillHighlight(-1);
    billListChosen.current = false;
  }, [quickBillMatches]);

  useEffect(() => {
    setBillTypeHighlight(0);
  }, [billTypeMatches]);

  /**
   * Empire allocation against Rec/Paid Amt:
   * 1) Full settle — picks cover amount exactly.
   * 2) Over-pick bills then Unadj / credit-debit note — confirm once, then full bill amounts.
   * 3) Partial — next bill gets only the remaining Rec/Paid Amt; rest stays pending.
   */
  const allocationAgainstAmount = (args: {
    pending: number;
    isDeduct: boolean;
    billSum: number;
    deductSum: number;
    received: number;
  }): number | null => {
    const pending = roundMoneyLocal(Math.max(args.pending, 0));
    if (pending <= 0) return null;
    const received = roundMoneyLocal(Math.max(args.received, 0));
    const billSum = roundMoneyLocal(args.billSum);
    const deductSum = roundMoneyLocal(args.deductSum);

    if (args.isDeduct) {
      // A return, unadj, or note can be picked before any bill. Rec/Paid Amt follows the net.
      if (!amountTouched || billSum <= 0) {
        return pending;
      }
      const needed = roundMoneyLocal(Math.max(billSum - deductSum - received, 0));
      if (needed <= 0) {
        alert(
          form.entryType === 'receipt'
            ? 'Bills already match Rec. Amt. This adjustment is not needed.'
            : 'Bills already match Paid Amt. This adjustment is not needed.'
        );
        return null;
      }
      return Math.min(pending, needed);
    }

    if (!amountTouched || received <= 0) {
      return pending;
    }

    const room = roundMoneyLocal(received + deductSum - billSum);
    if (pending <= room) {
      return pending;
    }

    if (allowOverAllocation) {
      return pending;
    }

    if (room > 0) {
      const takeFull = window.confirm(
        `This bill (${formatMoney(pending)}) is more than amount left to adjust (${formatMoney(room)}).\n\n` +
        `OK = take full bill (then pick Unadj / credit or debit note to balance)\n` +
        `Cancel = adjust only ${formatMoney(room)} and leave the rest pending`
      );
      if (takeFull) {
        setAllowOverAllocation(true);
        return pending;
      }
      return room;
    }

    const takeFull = window.confirm(
      `Adjusted amt already covers ${form.entryType === 'receipt' ? 'Rec' : 'Paid'} Amt (${formatMoney(received)}).\n\n` +
      `OK = take full bill (${formatMoney(pending)}) and balance later with Unadj / credit or debit note\n` +
      `Cancel = do not pick this bill`
    );
    if (!takeFull) return null;
    setAllowOverAllocation(true);
    return pending;
  };

  const settleWithDiscount = (bill: BankPendingBill, adjust: number) => {
    if (isDeductAllocation(bill)) {
      return { adjustAmount: adjust, discountPercent: 0, discountAmount: 0 };
    }
    const pendingAmt = roundMoneyLocal(bill.pendingAmount || 0);
    const taxable = Number(bill.taxableAmount) || Number(bill.billAmount) || 0;
    const pct = partyDhara();
    const computed = pct > 0 && taxable > 0 ? roundMoneyLocal(taxable * pct / 100) : 0;
    const shortfall = roundMoneyLocal(Math.max(pendingAmt - adjust, 0));
    if (computed > 0.05 && shortfall > 0.05 && Math.abs(shortfall - computed) <= 1) {
      return { adjustAmount: adjust, discountPercent: pct, discountAmount: shortfall };
    }
    if (computed > 0.05 && Math.abs(adjust - pendingAmt) <= 0.05) {
      const discount = roundMoneyLocal(Math.min(computed, pendingAmt));
      return {
        adjustAmount: roundMoneyLocal(Math.max(pendingAmt - discount, 0)),
        discountPercent: pct,
        discountAmount: discount
      };
    }
    return { adjustAmount: adjust, discountPercent: 0, discountAmount: 0 };
  };

  const pickBill = (billId: string, opts?: { toggle?: boolean }) => {
    const target = pendingBills.find(bill => bill.billId === billId);
    if (!target) return false;
    const already = (target.adjustAmount || 0) > 0 || (target.discountAmount || 0) > 0;
    if (already) {
      if (opts?.toggle === false) return false;
      setPendingBills(prev => prev.map(bill => (
        bill.billId === billId ? { ...bill, adjustAmount: 0, discountPercent: 0, discountAmount: 0 } : bill
      )));
      return true;
    }

    const billSum = pendingBills
      .filter(bill => !isDeductAllocation(bill))
      .reduce((sum, bill) => sum + (bill.adjustAmount || 0), 0);
    const deductSum = pendingBills
      .filter(bill => isDeductAllocation(bill))
      .reduce((sum, bill) => sum + (bill.adjustAmount || 0), 0);
    const received = roundMoneyLocal(Number(form.amount) || 0);
    const isDeduct = isDeductAllocation(target);
    const pending = roundMoneyLocal(target.pendingAmount || 0);

    const allocate = allocationAgainstAmount({
      pending,
      isDeduct,
      billSum,
      deductSum,
      received
    });
    if (allocate == null || allocate <= 0) return false;
    const settled = settleWithDiscount(target, allocate);
    setPendingBills(prev => prev.map(bill => (
      bill.billId === billId ? { ...bill, ...settled } : bill
    )));
    return true;
  };

  const afterPickFocusDiscount = (billId: string) => {
    setQuickBillNo('');
    setBillPickerOpen(false);
    billListChosen.current = false;
    window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-erp-disc="${billId}"]`);
      if (!el) return;
      el.focus();
      el.select?.();
    }, 0);
  };

  const pickBillByNumber = (billNumber: string) => {
    const bill = pendingBills.find(row => String(row.billNumber) === String(billNumber))
      || quickBillMatches.find(row => String(row.billNumber) === String(billNumber));
    if (!bill) return;
    const picked = pickBill(bill.billId, { toggle: false });
    if (picked === false) return;
    afterPickFocusDiscount(bill.billId);
  };

  const commitBillType = (value: string) => {
    const next = isUnadjBillTypeQuery(value)
      ? UNADJ_PAYMENT_TYPE
      : (isJournalBillTypeQuery(value) ? JOURNAL_TYPE : value.trim().toUpperCase());
    const resolved = billTypeOptions.find(t => t.toUpperCase() === next)
      || billTypeMatches[billTypeHighlight]
      || (isUnadjBillTypeQuery(value) ? UNADJ_PAYMENT_TYPE : (isJournalBillTypeQuery(value) ? JOURNAL_TYPE : value.trim()));
    setBillType(resolved);
    setBillTypePickerOpen(false);
    setQuickBillNo('');
    setBillPickerOpen(true);
    window.setTimeout(() => focusInputStart(billNoRef.current), 0);
  };

  const updateBillDiscount = (billId: string, patch: { percent?: string; amount?: string }) => {
    setPendingBills(prev => prev.map(bill => {
      if (bill.billId !== billId || isDeductAllocation(bill)) return bill;
      const taxable = Number(bill.taxableAmount) || Number(bill.billAmount) || 0;
      const pending = roundMoneyLocal(bill.pendingAmount || 0);
      let percent = Number(bill.discountPercent) || 0;
      let amount = Number(bill.discountAmount) || 0;
      let adjust = roundMoneyLocal(bill.adjustAmount || 0);
      if (patch.percent != null) {
        percent = Math.max(0, Number(patch.percent) || 0);
        amount = taxable > 0 ? roundMoneyLocal(taxable * percent / 100) : 0;
      }
      if (patch.amount != null) {
        amount = Math.max(0, Number(patch.amount) || 0);
        percent = taxable > 0 ? roundMoneyLocal((amount / taxable) * 100) : percent;
      }
      if (amount > pending) amount = pending;
      if (adjust + amount > pending + 0.001) {
        adjust = roundMoneyLocal(Math.max(pending - amount, 0));
      }
      return { ...bill, discountPercent: percent, discountAmount: amount, adjustAmount: adjust };
    }));
  };

  const updateBillAdjust = (billId: string, value: string) => {
    const adjustAmount = Math.max(0, Number(value) || 0);
    setPendingBills(prev => prev.map(bill => {
      if (bill.billId !== billId) return bill;
      return { ...bill, adjustAmount: Math.min(adjustAmount, bill.pendingAmount) };
    }));
  };

  const startEdit = async (entry: BankEntry) => {
    editingIdRef.current = entry.id;
    setEditingId(entry.id);
    setAllocatedVoucher(String(entry.voucherNumber || ''));
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
        : firstAlloc && isJournalAllocation(firstAlloc)
          ? JOURNAL_TYPE
          : (firstAlloc?.transactionType || defaultBillTypeForEntry(bankCashEntryType(series)))
    );
    const storedPercent = Array.isArray(entry.billAllocations)
      ? entry.billAllocations.find(item => Number(item.commissionPercent) > 0)?.commissionPercent
      : null;
    setCommissionPercent(storedPercent != null ? String(storedPercent) : '');
    setCommissionTouched(storedPercent != null);
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
    const stored = Array.isArray(entry.billAllocations) && entry.billAllocations.length > 0
      ? entry.billAllocations.map(item => ({
          billId: item.billId,
          billType: item.billType,
          billNumber: item.billNumber,
          transactionType: isUnadjAllocation(item)
            ? UNADJ_PAYMENT_TYPE
            : item.transactionType,
          voucherNumber: item.voucherNumber,
          billDate: item.billDate,
          days: item.days || 0,
          grace: item.grace,
          interestRate: item.interestRate,
          interestDays: item.interestDays,
          interestAmount: item.interestAmount,
          adatDisc: item.adatDisc,
          discountPercent: item.discountPercent,
          discountAmount: item.discountAmount,
          billAmount: item.billAmount,
          pendingAmount: item.pendingAmount,
          taxableAmount: item.taxableAmount,
          adjustAmount: item.adjustAmount,
          entryKind: isUnadjAllocation(item) ? UNADJ_BILL_TYPE : item.entryKind,
          noteKind: item.noteKind,
          noteSide: item.noteSide,
          adjustDirection: isDeductAllocation(item) ? 'deduct' : (item.adjustDirection || 'add')
        }))
      : [];
    const prefill = readBankOutstandingPrefill(entry.id) || [];
    const byId = new Map(stored.map(item => [item.billId, item]));
    for (const bill of prefill) {
      if (!bill?.billId || byId.has(bill.billId)) continue;
      byId.set(bill.billId, bill);
    }
    setRestoreAllocations(byId.size ? [...byId.values()] : null);
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

  const openTypedVoucher = async (raw: string) => {
    const typed = parseVoucherNumber(raw);
    const shown = parseVoucherNumber(allocatedVoucher);
    if (!typed || (shown && typed === shown)) return false;
    if (openingVoucher.current) return false;
    openingVoucher.current = true;
    const epoch = formEpoch.current;
    const series = seriesRef.current;
    setError('');
    try {
      const found = await vouchersApi.lookup({
        module: 'bank',
        voucher: String(typed),
        transactionType: series
      });
      if (formEpoch.current !== epoch || seriesRef.current !== series) return false;
      const { entry } = await bankEntriesApi.getById(found.id);
      if (formEpoch.current !== epoch || seriesRef.current !== series) return false;
      await startEdit(entry);
      const number = String(entry.voucherNumber || typed);
      setAllocatedVoucher(number);
      window.history.replaceState(null, '', found.editPath || `/erp/bank?edit=${found.id}`);
      return true;
    } catch (err: any) {
      if (formEpoch.current !== epoch || seriesRef.current !== series) return false;
      setError(err.message || `No voucher ${raw} found.`);
      setForm(f => ({ ...f, voucherNumber: allocatedVoucher || f.voucherNumber }));
      voucherValueRef.current = allocatedVoucher || voucherValueRef.current;
      return false;
    } finally {
      openingVoucher.current = false;
    }
  };

  const onVoucherEnter = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    const field = event.currentTarget;
    const typed = parseVoucherNumber(field.value);
    const shown = parseVoucherNumber(allocatedVoucher);
    if (typed && (!shown || typed !== shown)) {
      await openTypedVoucher(field.value);
      return;
    }
    const formEl = field.closest('[data-erp-form]') as HTMLElement | null;
    if (!formEl) return;
    const fields = getNavigableFields(formEl);
    const index = fields.indexOf(field);
    if (index >= 0 && index < fields.length - 1) focusInputStart(fields[index + 1] as HTMLInputElement);
  };

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
    editingIdRef.current = null;
    setEditingId(null);
    setPendingBills([]);
    setRestoreAllocations(null);
    setQuickBillNo('');
    setAmountTouched(false);
    setAllowOverAllocation(false);
    setBillType(defaultBillTypeForEntry(bankCashEntryType(DEFAULT_BANK_CASH_SERIES)));
    setCommissionPercent('');
    setCommissionTouched(false);
    setBillPickerOpen(false);
    setBillTypePickerOpen(false);
    setForm(emptyForm());
    formEpoch.current += 1;
    if (window.location.search) window.history.replaceState(null, '', '/erp/bank');
    await loadMasterData();
    window.setTimeout(() => focusInputStart(voucherRef.current || companyRef.current), 0);
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
      adjustDirection: isDeductRow(bill) ? 'deduct' : (bill.adjustDirection || 'add'),
      commissionPercent: form.entryType === 'receipt' ? (Number(commissionPercent) || 0) : (bill.commissionPercent || 0)
    }));

    // Part payment path: no bill picks → entire amount becomes Unadjusted Payment (Empire).
    // Settlement path: bills − unadj/notes must match Rec/Paid Amt.
    if (billAllocations.length > 0 && summary.netBillAmount - amount > 0.05) {
      alert(
        `Bill adjusted (${formatMoney(summary.netBillAmount)}) is more than ${form.entryType === 'receipt' ? 'Rec' : 'Paid'} Amt (${formatMoney(amount)}).\n\n` +
        `Either:\n` +
        `• Reduce Adjust on bills, or\n` +
        `• Type U / J / C / D → pick Unadj, Journal, or a credit/debit note to balance (${formatMoney(summary.netBillAmount - amount)} still needed).`
      );
      setBillType(UNADJ_PAYMENT_TYPE);
      window.setTimeout(() => focusInputStart(billNoRef.current), 0);
      return;
    }

    const seriesForWarn = normalizeBankCashSeries(form.series || form.transactionType);
    if (
      !editingId
      && warnsOnManualEntry(seriesForWarn)
      && allocatedVoucher
      && String(form.voucherNumber || '').trim()
      && String(form.voucherNumber).trim() !== allocatedVoucher
    ) {
      if (!confirm(`Voucher no. was changed from ${allocatedVoucher} to ${form.voucherNumber}. Continue?`)) return;
    }

    setSaving(true);
    setError('');
    try {
      const series = normalizeBankCashSeries(form.series || form.transactionType);
      const firstRealBill = billAllocations.find(bill =>
        !isDeductRow(bill)
        && !isNoteRow(bill)
        && ['order', 'sales_invoice', 'purchase_bill'].includes(String(bill.billType))
      );
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
    if (!confirm('Delete this entry? It will be removed from the books.')) return;
    try {
      await bankEntriesApi.delete(entry.id);
      setEntries(prev => prev.filter(item => item.id !== entry.id));
      if (editingId === entry.id) await resetForm();
    } catch (err: any) {
      setError(err.message || 'Could not delete entry.');
    }
  };

  const passChequeReturn = async (represent: boolean) => {
    if (!editingId || returningCheque) return;
    setReturningCheque(true);
    setError('');
    setNotice('');
    try {
      const result = await bankEntriesApi.chequeReturn(editingId, {
        returnDate: chequeReturnDate,
        represent
      });
      setForm(current => ({ ...current, remarks: result.entry.remarks || current.remarks }));
      const when = new Date(chequeReturnDate).toLocaleDateString('en-IN');
      const depositNote = result.deposit
        ? ` Deposited again as bank receipt ${result.deposit.voucherNumber}.`
        : '';
      setNotice(`Cheque return passed on ${when} as bank payment ${result.payment.voucherNumber}.${depositNote}`);
      setChequeReturnStep(null);
    } catch (err: any) {
      setError(err.message || 'Could not pass the cheque return.');
      setChequeReturnStep(null);
    } finally {
      setReturningCheque(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4">
          <ErpPageBack onBack={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900" />
          <div className="text-center">
            <h1 className="text-lg font-black text-gray-900">Bill-wise Receipts / Payments</h1>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
              {editingId ? 'Edit Mode' : 'Add Mode'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editingId && viewMode === 'entry' && (
              <button
                type="button"
                onClick={() => void deleteEntry({ id: editingId } as BankEntry)}
                className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-rose-700"
              >
                Delete entry
              </button>
            )}
            {viewMode === 'entry' && <PhotoEntryButton kind="bank" onApply={applyPhoto} />}
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
        {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div>}

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
                  <input
                    ref={voucherRef}
                    className={inputClass}
                    value={form.voucherNumber}
                    data-erp-voucher-jump=""
                    autoComplete="off"
                    title="Type a voucher number and press Enter to open that entry"
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => {
                      voucherValueRef.current = e.target.value;
                      setForm(f => ({ ...f, voucherNumber: e.target.value }));
                    }}
                    onBlur={e => { void openTypedVoucher(e.currentTarget.value); }}
                    onKeyDown={e => { void onVoucherEnter(e); }}
                  />
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
                      setAllowOverAllocation(false);
                      setForm(f => ({ ...f, amount: e.target.value }));
                    }}
                  />
                  {form.entryType === 'receipt' && (
                    <label className="mt-2 block">
                      <span className={labelClass}>Comm %</span>
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        value={commissionPercent}
                        onChange={e => {
                          setCommissionTouched(true);
                          setCommissionPercent(e.target.value);
                        }}
                      />
                    </label>
                  )}
                  {summary.adjustLess > 0.05 && (
                    <p className="mt-1 text-[11px] font-semibold text-rose-700">
                      Bills exceed {form.entryType === 'receipt' ? 'Rec' : 'Paid'} by {formatMoney(summary.adjustLess)} — Type U, J, C or D to pick Unadj / Journal / note, or lower Adjust.
                    </p>
                  )}
                  {summary.unadjAvailable > 0 && summary.adjustLess <= 0.05 && (
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
                  <div>
                    <input
                      className={inputClass}
                      list="bank-party-options"
                      placeholder="Type party name"
                      value={form.partyName}
                      onChange={e => {
                        const value = e.target.value;
                        setAllowOverAllocation(false);
                        const match = accountParties.find(party => party.name.trim().toLowerCase() === value.trim().toLowerCase());
                        const broker = Boolean(match && /broker|brok/i.test(match.accountType || ''));
                        const partyType = partyTypeForName(value, form.entryType) || (broker ? 'supplier' : form.partyType);
                        if (broker && form.entryType === 'payment') {
                          setBillType('PURCHASE (COMM)');
                          setForm(f => ({ ...f, partyName: match?.name || value, partyType: 'supplier' }));
                          return;
                        }
                        setForm(f => ({ ...f, partyName: value, partyType }));
                      }}
                      onKeyDown={e => {
                        if (e.key !== 'Enter' || !form.partyName.trim()) return;
                        // After party, jump to Bill Type (Empire keyboard flow).
                        e.preventDefault();
                        e.stopPropagation();
                        focusTypeField();
                      }}
                    />
                  </div>
                  <datalist id="bank-party-options">
                    {partyOptions.map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs font-bold text-amber-800">Cur. Bal.: {partyBalance == null ? '…' : formatPartyBalance(partyBalance, form.partyType)}</p>
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
                  {form.entryType === 'payment' && form.paymentMode === 'bank' && (
                    <button
                      type="button"
                      className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-slate-800 disabled:opacity-40"
                      disabled={!form.partyName.trim() || !(Number(form.amount) > 0)}
                      onClick={() => {
                        const party = accountParties.find(row => row.name.trim().toLowerCase() === form.partyName.trim().toLowerCase());
                        const opened = openChequePrint({
                          payee: form.partyName,
                          date: form.chequeDate || form.entryDate,
                          amount: Number(form.amount) || 0,
                          remark: form.remarks,
                          address: [party?.address, party?.city].filter(Boolean).join(', '),
                          phone: party?.mobileNumber || ''
                        });
                        if (!opened) setError('Allow pop-ups for this site, then print the cheque again.');
                      }}
                    >
                      Print cheque
                    </button>
                  )}
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
                  <input
                    className={inputClass}
                    value={form.remarks}
                    onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      e.stopPropagation();
                      setBillTypePickerOpen(true);
                      window.setTimeout(() => focusTypeField(), 0);
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Bill lines — Type, then Bill, on the same row as the amounts. */}
            <section data-erp-line-grid className="rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
                <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Bill allocation</h2>
                <button
                  type="button"
                  data-erp-skip-nav
                  onClick={() => {
                    setAllowOverAllocation(false);
                    setPendingBills(prev => prev.map(bill => ({ ...bill, adjustAmount: 0, discountPercent: 0, discountAmount: 0 })));
                  }}
                  className="rounded-xl border px-3 py-2 text-xs font-black text-gray-700"
                >
                  Clear picks
                </button>
              </div>
              <div>
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Bill</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2 text-right">Taxable</th>
                      <th className="px-3 py-2 text-right">Bill Amt</th>
                      <th className="px-3 py-2">V.No</th>
                      <th className="px-3 py-2">Days</th>
                      <th className="px-3 py-2 text-right">Disc %</th>
                      <th className="px-3 py-2 text-right">Disc Amt</th>
                      <th className="px-3 py-2 text-right">Adjust</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustedBills.map(bill => {
                      const deduct = isDeductRow(bill);
                      return (
                        <tr
                          key={bill.billId}
                          data-erp-line
                          data-erp-line-filled
                          className={`border-t ${deduct ? 'bg-violet-50/80' : 'bg-indigo-50/70'}`}
                        >
                          <td className={`px-3 py-2.5 text-xs font-semibold ${deduct ? 'text-violet-700' : 'text-gray-600'}`}>
                            {bill.oppositeAccount ? `${bill.transactionType || 'JOURNAL'} · ${bill.oppositeAccount}` : (bill.transactionType || '-')}
                          </td>
                          <td className={`px-3 py-2.5 font-black ${deduct ? 'text-violet-800' : 'text-gray-900'}`}>{bill.billNumber}</td>
                          <td className="px-3 py-2.5">{formatDate(bill.billDate)}</td>
                          <td className="px-3 py-2.5 text-right">
                            {deduct ? formatMoney(-(bill.taxableAmount || bill.billAmount || 0)) : formatMoney(bill.taxableAmount || 0)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-semibold ${deduct ? 'text-violet-800' : ''}`}>
                            {deduct ? formatMoney(-(bill.billAmount || 0)) : formatMoney(bill.billAmount)}
                          </td>
                          <td className="px-3 py-2.5">{bill.voucherNumber || '-'}</td>
                          <td className="px-3 py-2.5 tabular-nums">{bill.days || 0}{bill.grace ? ` / ${bill.grace}g` : ''}</td>
                          <td className="px-3 py-2.5 text-right">
                            {deduct ? '—' : (
                              <input
                                data-erp-disc={bill.billId}
                                className="w-16 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-right text-sm font-bold"
                                type="number"
                                min="0"
                                step="0.01"
                                value={bill.discountPercent || ''}
                                onChange={e => updateBillDiscount(bill.billId, { percent: e.target.value })}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {deduct ? '—' : (
                              <input
                                className="w-24 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-right text-sm font-bold"
                                type="number"
                                min="0"
                                step="0.01"
                                value={bill.discountAmount || ''}
                                onChange={e => updateBillDiscount(bill.billId, { amount: e.target.value })}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              className={`w-28 rounded-lg border px-2 py-1.5 text-right text-sm font-bold ${
                                deduct ? 'border-violet-300 bg-white' : 'border-indigo-300 bg-white'
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
                    <tr data-erp-line className="border-t bg-white">
                      <td className="relative px-2 py-2">
                        <input
                          ref={billTypeRef}
                          data-erp-add-line
                          data-erp-arrow-custom
                          data-erp-enter-custom
                          data-erp-line-default
                          className="w-full min-w-[11rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-semibold outline-none focus:border-indigo-400"
                          placeholder={form.entryType === 'payment' ? 'FINISH PURCHASE' : 'FINISH SALES'}
                          value={billType}
                          onFocus={() => {
                            setBillTypePickerOpen(true);
                            window.setTimeout(() => billTypeRef.current?.select?.(), 0);
                          }}
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
                              if (billTypeMatches.length) {
                                const pick = billTypeMatches[billTypeHighlight] || billTypeMatches[0] || billType;
                                commitBillType(pick);
                              } else {
                                window.setTimeout(() => focusInputStart(billNoRef.current), 0);
                              }
                            }
                          }}
                        />
                        {billTypePickerOpen && !billType.trim() && (
                          <div className="absolute z-30 mt-1 w-64 rounded-xl border bg-white px-3 py-2 text-[11px] font-semibold text-gray-500 shadow-lg">
                            Type a letter — U Unadj, J journal, C credit note, D debit note, S sales, P purchase
                          </div>
                        )}
                        {billTypePickerOpen && billTypeMatches.length > 0 && (
                          <div className="absolute z-50 mt-1 max-h-52 w-64 overflow-y-auto rounded-xl border bg-white shadow-lg">
                            {billTypeMatches.map((type, index) => (
                              <button
                                key={type}
                                type="button"
                                data-erp-skip-nav
                                className={`flex w-full px-3 py-2 text-left text-xs font-bold hover:bg-indigo-50 ${
                                  index === billTypeHighlight
                                    ? 'bg-indigo-100 text-indigo-900'
                                    : (type === UNADJ_PAYMENT_TYPE || type === JOURNAL_TYPE || /note/i.test(type) ? 'text-violet-800' : 'text-gray-800')
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
                      </td>
                      <td className="relative px-2 py-2">
                        <BillPickField
                          inputRef={billNoRef}
                          value={quickBillNo}
                          disabled={!form.partyName.trim()}
                          placeholder="Bill"
                          onFocus={() => {
                            billListChosen.current = false;
                            setBillHighlight(-1);
                            if (form.partyName.trim() && billType.trim()) setBillPickerOpen(true);
                          }}
                          onBlur={() => window.setTimeout(() => {
                            if (document.activeElement === billNoRef.current) return;
                            setBillPickerOpen(false);
                          }, 150)}
                          onChange={value => {
                            billListChosen.current = false;
                            setQuickBillNo(value);
                            setBillPickerOpen(Boolean(form.partyName.trim()));
                          }}
                          onArrow={key => {
                            if (!form.partyName.trim() || !quickBillMatches.length) return;
                            billListChosen.current = true;
                            setBillPickerOpen(true);
                            setBillHighlight(i => key === 'ArrowDown'
                              ? Math.min(i + 1, quickBillMatches.length - 1)
                              : Math.max(i - 1, 0));
                          }}
                          onPick={() => {
                            const typed = quickBillNo.trim();
                            const chosen = (typed || billListChosen.current) && quickBillMatches.length > 0;
                            if (!chosen) return false;
                            const match = (billHighlight >= 0 ? quickBillMatches[billHighlight] : null) || (typed ? quickBillMatches[0] : null);
                            if (!match) return false;
                            pickBillByNumber(match.billNumber);
                            return true;
                          }}
                        />
                        {billPickerOpen && form.partyName.trim() && (
                          <div className="absolute z-50 mt-1 max-h-64 w-[36rem] overflow-y-auto rounded-xl border bg-white shadow-lg">
                            {loadingBills ? (
                              <div className="px-3 py-3 text-xs text-gray-500">Loading…</div>
                            ) : quickBillMatches.length === 0 ? (
                              <div className="px-3 py-3 text-xs text-gray-500">
                                {unadjMode ? 'No unadjusted payments.' : (noteMode ? 'No matching pending notes.' : 'No matching pending bills.')}
                              </div>
                            ) : (
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-[10px] uppercase text-gray-500">
                                  <tr>
                                    <th className="px-2 py-1">Bill</th>
                                    <th className="px-2 py-1">Date</th>
                                    <th className="px-2 py-1 text-right">Taxable</th>
                                    <th className="px-2 py-1 text-right">Pending</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {quickBillMatches.slice(0, 40).map((bill, index) => (
                                    <tr
                                      key={bill.billId}
                                      className={index === billHighlight ? 'bg-indigo-100' : 'hover:bg-indigo-50'}
                                    >
                                      <td colSpan={4} className="p-0">
                                        <button
                                          type="button"
                                          data-erp-skip-nav
                                          className={`flex w-full items-center px-2 py-1.5 text-left ${isDeductRow(bill) ? 'text-violet-800' : 'text-gray-800'}`}
                                          onMouseDown={ev => {
                                            ev.preventDefault();
                                            pickBillByNumber(bill.billNumber);
                                          }}
                                        >
                                          <span className="w-16 font-black">{bill.billNumber}</span>
                                          <span className="w-24">{formatDate(bill.billDate)}</span>
                                          <span className="ml-auto w-24 text-right">{formatMoney(bill.taxableAmount || 0)}</span>
                                          <span className="w-28 text-right font-semibold">{formatMoney(isDeductRow(bill) ? -(bill.pendingAmount || 0) : (bill.pendingAmount || 0))}</span>
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </td>
                      <td colSpan={8} />
                    </tr>
                  </tbody>
                </table>
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
                    {summary.unadjAdjust > 0 ? 'Adjust Less' : (summary.adjustAdd > 0 ? 'Adjust Add' : 'Adjust Less')}
                  </p>
                  <p className={`text-lg font-black ${summary.settlementComplete ? 'text-emerald-600' : 'text-sky-900'}`}>
                    {summary.settlementComplete
                      ? formatMoney(0)
                      : summary.unadjAdjust > 0
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
                {editingId && form.series === 'BANK RECEIPT' && !isChequeReturnedEntry(form) && (
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const dd = String(now.getDate()).padStart(2, '0');
                      const mm = String(now.getMonth() + 1).padStart(2, '0');
                      setChequeReturnDate(`${now.getFullYear()}-${mm}-${dd}`);
                      setChequeReturnStep('confirm');
                    }}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-black uppercase tracking-wide text-amber-900"
                  >
                    Chq Return
                  </button>
                )}
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

      {chequeReturnStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            {chequeReturnStep === 'confirm' && (
              <>
                <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Please be sure</h2>
                <p className="mt-3 text-sm font-semibold text-gray-700">
                  Are you sure you want to pass return cheque entry for this cheque?
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setChequeReturnStep('date')} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">Yes</button>
                  <button type="button" onClick={() => setChequeReturnStep(null)} className="rounded-xl border px-4 py-2 text-sm font-black text-gray-700">No</button>
                </div>
              </>
            )}
            {chequeReturnStep === 'date' && (
              <>
                <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Cheque return entry</h2>
                <label className="mt-3 block text-sm font-semibold text-gray-700">
                  Please enter return date
                  <input
                    type="date"
                    className="mt-2 w-full rounded-xl border px-3 py-2 font-semibold"
                    value={chequeReturnDate}
                    onChange={event => setChequeReturnDate(event.target.value)}
                  />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setChequeReturnStep('represent')} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">OK</button>
                  <button type="button" onClick={() => setChequeReturnStep(null)} className="rounded-xl border px-4 py-2 text-sm font-black text-gray-700">Cancel</button>
                </div>
              </>
            )}
            {chequeReturnStep === 'represent' && (
              <>
                <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Please select option</h2>
                <p className="mt-3 text-sm font-semibold text-gray-700">Re-present this cheque in bank?</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" disabled={returningCheque} onClick={() => void passChequeReturn(true)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">Yes</button>
                  <button type="button" disabled={returningCheque} onClick={() => void passChequeReturn(false)} className="rounded-xl border px-4 py-2 text-sm font-black text-gray-700 disabled:opacity-60">No</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
