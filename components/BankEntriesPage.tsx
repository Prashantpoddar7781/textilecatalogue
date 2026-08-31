import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Edit3, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { bankEntriesApi, invoicesApi } from '../services/api';
import { AccountParty, BankEntry, BankPendingBill, CompletedOrderParty, PurchaseBillParty } from '../types';
import { ERP_TRANSACTION_TYPES } from '../constants/erpTransactionTypes';
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

const getEntryLabel = (bill: BankPendingBill) => {
  if (bill.billType === 'credit_debit_note') {
    return bill.noteKind === 'credit' ? 'Cr Note' : 'Dr Note';
  }
  return 'Bill';
};

const effectiveAdjust = (bill: BankPendingBill) => {
  const amount = bill.adjustAmount || 0;
  return bill.adjustDirection === 'deduct' ? -amount : amount;
};

const noteLinksToBill = (note: BankPendingBill, bill: BankPendingBill) => {
  if (note.billType !== 'credit_debit_note' || bill.billType === 'credit_debit_note') return false;
  if (note.adjustBillId && note.adjustBillId === bill.billId) return true;
  const billNo = String(bill.billNumber || '');
  return [note.adjustBillNumber, note.refBillNumber].filter(Boolean).map(String).includes(billNo);
};

const applyLinkedNoteAdjustments = (items: BankPendingBill[]) => {
  const bills = items.filter(item => item.billType !== 'credit_debit_note');
  return items.map(item => {
    if (item.billType !== 'credit_debit_note') return item;
    const linkedBill = bills.find(bill => noteLinksToBill(item, bill));
    if (!linkedBill || linkedBill.adjustAmount <= 0) {
      return linkedBill ? { ...item, adjustAmount: 0 } : item;
    }
    return { ...item, adjustAmount: item.pendingAmount };
  });
};

const sortPendingItems = (items: BankPendingBill[]) => {
  const bills = items.filter(item => item.billType !== 'credit_debit_note');
  const notes = items.filter(item => item.billType === 'credit_debit_note');
  const usedNoteIds = new Set<string>();
  const ordered: BankPendingBill[] = [];
  for (const bill of bills) {
    ordered.push(bill);
    for (const note of notes) {
      if (noteLinksToBill(note, bill)) {
        ordered.push(note);
        usedNoteIds.add(note.billId);
      }
    }
  }
  ordered.push(...notes.filter(note => !usedNoteIds.has(note.billId)));
  return ordered;
};

const getLinkedNoteIds = (items: BankPendingBill[], billId: string) =>
  items
    .filter(item => item.billType === 'credit_debit_note')
    .filter(note => {
      const bill = items.find(row => row.billId === billId && row.billType !== 'credit_debit_note');
      return bill ? noteLinksToBill(note, bill) : false;
    })
    .map(note => note.billId);

const computeAdjustmentBreakdown = (
  items: BankPendingBill[],
  selectedIds: Set<string>,
  receivedAmount: number
) => {
  const isSelected = (id: string) => selectedIds.has(id);
  const billRows = items.filter(item => item.billType !== 'credit_debit_note' && isSelected(item.billId));
  const noteRows = items.filter(item => item.billType === 'credit_debit_note' && isSelected(item.billId));

  const totalBillPending = roundMoneyLocal(billRows.reduce((sum, bill) => sum + bill.pendingAmount, 0));
  const totalBillAmount = roundMoneyLocal(billRows.reduce((sum, bill) => sum + bill.billAmount, 0));
  const billAdjustTotal = roundMoneyLocal(billRows.reduce((sum, bill) => sum + (bill.adjustAmount || 0), 0));
  const creditDeduct = roundMoneyLocal(
    noteRows.filter(note => note.adjustDirection === 'deduct').reduce((sum, note) => sum + (note.adjustAmount || 0), 0)
  );
  const debitAdd = roundMoneyLocal(
    noteRows.filter(note => note.adjustDirection === 'add').reduce((sum, note) => sum + (note.adjustAmount || 0), 0)
  );
  const netCashRequired = roundMoneyLocal(billAdjustTotal - creditDeduct + debitAdd);
  const balanceLeftOnBills = roundMoneyLocal(
    billRows.reduce((sum, bill) => sum + Math.max(bill.pendingAmount - (bill.adjustAmount || 0), 0), 0)
  );
  const received = roundMoneyLocal(receivedAmount);
  const unallocated = roundMoneyLocal(received - netCashRequired);
  const shortfall = unallocated < 0 ? Math.abs(unallocated) : 0;
  const excess = unallocated > 0 ? unallocated : 0;

  return {
    selectedBillCount: billRows.length,
    selectedNoteCount: noteRows.filter(note => (note.adjustAmount || 0) > 0).length,
    totalBillPending,
    totalBillAmount,
    billAdjustTotal,
    creditDeduct,
    debitAdd,
    netCashRequired,
    balanceLeftOnBills,
    received,
    applied: netCashRequired,
    shortfall,
    excess
  };
};

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
    billTypeFilter: '',
    amount: '',
    paymentMode: bankCashPaymentMode(series) as 'bank' | 'cash',
    chequeNumber: '',
    chequeDate: entryDate,
    slipNumber: slipNumberFromDate(entryDate),
    referenceNumber: '',
    billNumber: '',
    remarks: ''
  };
};

export const BankEntriesPage: React.FC<Props> = ({ onBack }) => {
  const editIdFromUrl = useMemo(() => new URLSearchParams(window.location.search).get('edit'), []);
  const [viewMode, setViewMode] = useState<ViewMode>('entry');
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [pendingBills, setPendingBills] = useState<BankPendingBill[]>([]);
  const [completedParties, setCompletedParties] = useState<CompletedOrderParty[]>([]);
  const [purchaseParties, setPurchaseParties] = useState<PurchaseBillParty[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Array<{ name: string; balance: number; accountType?: string }>>([]);
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
  const [pendingNoteCount, setPendingNoteCount] = useState(0);
  const [selectedAdjustIds, setSelectedAdjustIds] = useState<Set<string>>(new Set());
  const [quickBillPick, setQuickBillPick] = useState('');
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
      setPendingNoteCount(0);
      setSelectedAdjustIds(new Set());
      setQuickBillPick('');
      return;
    }
    setLoadingBills(true);
    try {
      const { bills, noteCount } = await bankEntriesApi.getPendingBills({
        partyName,
        partyType: partyType as any,
        transactionType: transactionType || undefined
      });
      setPendingBills(prev => {
        const seeded = sortPendingItems(bills.map(bill => ({ ...bill, adjustAmount: 0 })));
        if (!restoreAllocations?.length) return seeded;
        const byId = new Map<string, BankPendingBill>(
          restoreAllocations.map(item => [item.billId, item])
        );
        const merged = seeded.map(bill => {
          const saved = byId.get(bill.billId);
          if (!saved) return bill;
          return {
            ...bill,
            adjustAmount: saved.adjustAmount || 0,
            pendingAmount: Math.max(bill.pendingAmount, saved.adjustAmount || 0)
          };
        });
        for (const saved of restoreAllocations) {
          if (!merged.some(row => row.billId === saved.billId)) {
            merged.push({ ...saved });
          }
        }
        return sortPendingItems(merged);
      });
      setPendingNoteCount(noteCount ?? bills.filter(b => b.billType === 'credit_debit_note').length);
      if (restoreAllocations?.length) {
        setSelectedAdjustIds(new Set(
          restoreAllocations.filter(item => (item.adjustAmount || 0) > 0).map(item => item.billId)
        ));
        setRestoreAllocations(null);
      } else {
        setSelectedAdjustIds(new Set());
      }
      setQuickBillPick('');
    } catch (err: any) {
      setPendingBills([]);
      setPendingNoteCount(0);
      setSelectedAdjustIds(new Set());
      setQuickBillPick('');
      setError(err.message || 'Could not load pending bills and credit/debit notes.');
    } finally {
      setLoadingBills(false);
    }
  }, [restoreAllocations]);

  const applySeries = (seriesValue: string, keepParty = false) => {
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
      partyType: keepParty ? f.partyType : partyType,
      partyName: keepParty ? f.partyName : '',
      bankName: paymentMode === 'cash' ? cashAccount : f.bankName,
      slipNumber: slipNumberFromDate(f.entryDate)
    }));
  };

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
    void loadPendingBills(form.partyName, form.partyType, form.billTypeFilter || undefined);
  }, [form.bankName, form.partyName, form.partyType, form.billTypeFilter, refreshBalances, loadPendingBills]);

  useEffect(() => {
    setForm(f => {
      const nextSlip = slipNumberFromDate(f.entryDate);
      if (f.slipNumber === nextSlip) return f;
      return { ...f, slipNumber: nextSlip };
    });
  }, [form.entryDate]);

  const summary = useMemo(() => {
    const selected = pendingBills.filter(bill => selectedAdjustIds.has(bill.billId) && bill.adjustAmount > 0);
    const grossAmount = selected
      .filter(bill => bill.billType !== 'credit_debit_note')
      .reduce((sum, bill) => sum + bill.billAmount, 0);
    const adjustPending = selected.reduce((sum, bill) => {
      const sign = bill.adjustDirection === 'deduct' ? -1 : 1;
      return sum + sign * bill.pendingAmount;
    }, 0);
    const adjustAdd = selected.reduce((sum, bill) => sum + effectiveAdjust(bill), 0);
    const creditNoteAdjust = selected
      .filter(bill => bill.adjustDirection === 'deduct')
      .reduce((sum, bill) => sum + bill.adjustAmount, 0);
    const debitNoteAdjust = selected
      .filter(bill => bill.adjustDirection === 'add')
      .reduce((sum, bill) => sum + bill.adjustAmount, 0);
    const taxableValuePaidBills = selected
      .filter(bill => bill.adjustDirection !== 'deduct')
      .reduce((sum, bill) => {
        const ratio = bill.billAmount > 0 ? bill.adjustAmount / bill.billAmount : 0;
        return sum + (bill.taxableAmount || 0) * ratio;
      }, 0);
    const netBillAmount = adjustAdd;
    const breakdown = computeAdjustmentBreakdown(
      pendingBills,
      selectedAdjustIds,
      Number(form.amount) || 0
    );
    return {
      grossAmount,
      adjustPending,
      adjustAdd,
      netBillAmount,
      taxableValuePaidBills,
      creditNoteAdjust,
      debitNoteAdjust,
      breakdown
    };
  }, [pendingBills, selectedAdjustIds, form.amount]);

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

  const pendingBillRows = useMemo(
    () => pendingBills.filter(bill => bill.billType !== 'credit_debit_note'),
    [pendingBills]
  );

  const pendingNoteRows = useMemo(
    () => pendingBills.filter(bill => bill.billType === 'credit_debit_note'),
    [pendingBills]
  );

  const isAdjustSelected = (billId: string) => selectedAdjustIds.has(billId);

  const toggleBillSelection = (billId: string, includeLinkedNotes = true) => {
    setSelectedAdjustIds(prev => {
      const next = new Set(prev);
      if (next.has(billId)) {
        next.delete(billId);
        if (includeLinkedNotes) {
          getLinkedNoteIds(pendingBills, billId).forEach(id => next.delete(id));
        }
        setPendingBills(items => items.map(item => {
          if (item.billId !== billId && !getLinkedNoteIds(items, billId).includes(item.billId)) return item;
          return { ...item, adjustAmount: 0 };
        }));
      } else {
        next.add(billId);
        if (includeLinkedNotes) {
          getLinkedNoteIds(pendingBills, billId).forEach(id => next.add(id));
        }
      }
      return next;
    });
  };

  const toggleNoteSelection = (noteId: string) => {
    setSelectedAdjustIds(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
        setPendingBills(items => items.map(item =>
          item.billId === noteId ? { ...item, adjustAmount: 0 } : item
        ));
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  const selectBillByNumber = (billNumber: string) => {
    const bill = pendingBillRows.find(row => String(row.billNumber) === String(billNumber));
    if (!bill || selectedAdjustIds.has(bill.billId)) return;
    setSelectedAdjustIds(prev => {
      const next = new Set(prev);
      next.add(bill.billId);
      getLinkedNoteIds(pendingBills, bill.billId).forEach(id => next.add(id));
      return next;
    });
  };

  const clearBillSelection = () => {
    setSelectedAdjustIds(new Set());
    setPendingBills(prev => prev.map(item => ({ ...item, adjustAmount: 0 })));
    setQuickBillPick('');
  };

  const updateBillAdjust = (billId: string, value: string) => {
    if (!selectedAdjustIds.has(billId)) return;
    const adjustAmount = Math.max(0, Number(value) || 0);
    setPendingBills(prev => {
      const updated = prev.map(bill => {
        if (bill.billId !== billId) return bill;
        const capped = Math.min(adjustAmount, bill.pendingAmount);
        return { ...bill, adjustAmount: capped };
      });
      return applyLinkedNoteAdjustments(updated);
    });
  };

  const applyReceivedAmount = () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter received/paid amount first.');
      return;
    }
    const selectedBillRows = pendingBillRows.filter(bill => selectedAdjustIds.has(bill.billId));
    if (selectedBillRows.length === 0) {
      alert('Select at least one bill to adjust using the checkboxes.');
      return;
    }
    setPendingBills(prev => {
      let remaining = amount;
      let next = prev.map(item => ({ ...item, adjustAmount: 0 }));
      const billRows = next.filter(item =>
        item.billType !== 'credit_debit_note' && selectedAdjustIds.has(item.billId)
      );

      for (const bill of billRows) {
        const linkedCredit = bill.linkedCreditAmount || 0;
        const linkedDebit = bill.linkedDebitAmount || 0;
        const netCashNeeded = Math.max(bill.pendingAmount - linkedCredit + linkedDebit, 0);
        if (remaining <= 0) break;
        if (remaining >= netCashNeeded) {
          next = next.map(item => item.billId === bill.billId
            ? { ...item, adjustAmount: bill.pendingAmount }
            : item);
          remaining = roundMoneyLocal(remaining - netCashNeeded);
        } else {
          const billAdjust = roundMoneyLocal(remaining + linkedCredit - linkedDebit);
          next = next.map(item => item.billId === bill.billId
            ? { ...item, adjustAmount: Math.min(Math.max(billAdjust, 0), bill.pendingAmount) }
            : item);
          remaining = 0;
        }
      }

      next = applyLinkedNoteAdjustments(next);

      const unlinkedCredits = next.filter(item =>
        item.billType === 'credit_debit_note'
        && selectedAdjustIds.has(item.billId)
        && item.adjustDirection === 'deduct'
        && item.adjustAmount === 0
      );
      for (const note of unlinkedCredits) {
        if (remaining <= 0) break;
        const applyAmount = Math.min(note.pendingAmount, remaining);
        next = next.map(item => item.billId === note.billId ? { ...item, adjustAmount: applyAmount } : item);
        remaining = roundMoneyLocal(remaining - applyAmount);
      }

      return next;
    });
  };

  const applyAllCreditNotes = () => {
    setPendingBills(prev => {
      const next = prev.map(item => {
        if (item.billType !== 'credit_debit_note' || item.adjustDirection !== 'deduct') return item;
        if (!selectedAdjustIds.has(item.billId)) return item;
        return { ...item, adjustAmount: item.pendingAmount };
      });
      return applyLinkedNoteAdjustments(next);
    });
  };

  const applyAllLinkedNotes = () => {
    setPendingBills(prev => {
      const next = prev.map(item => {
        if (item.billType === 'credit_debit_note') return item;
        if (!selectedAdjustIds.has(item.billId)) return item;
        if ((item.linkedCreditAmount || 0) > 0 || (item.linkedDebitAmount || 0) > 0) {
          return { ...item, adjustAmount: item.pendingAmount };
        }
        return item;
      });
      return applyLinkedNoteAdjustments(next);
    });
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
      billTypeFilter: '',
      amount: String(entry.amount || ''),
      paymentMode: bankCashPaymentMode(series),
      chequeNumber: entry.chequeNumber || '',
      chequeDate: entry.chequeDate?.slice(0, 10) || entryDate,
      slipNumber: entry.slipNumber || slipNumberFromDate(entryDate),
      referenceNumber: entry.referenceNumber || '',
      billNumber: entry.billNumber || '',
      remarks: entry.remarks || ''
    });
    if (Array.isArray(entry.billAllocations) && entry.billAllocations.length > 0) {
      setRestoreAllocations(entry.billAllocations.map(item => ({
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
        adjustAmount: item.adjustAmount,
        adjustDirection: item.adjustDirection,
        noteKind: item.noteKind,
        noteSide: item.noteSide
      })));
    } else {
      setRestoreAllocations(null);
    }
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

  const resetForm = async () => {
    setEditingId(null);
    setPendingBills([]);
    setSelectedAdjustIds(new Set());
    setQuickBillPick('');
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
      .filter(bill => selectedAdjustIds.has(bill.billId) && bill.adjustAmount > 0)
      .map(bill => ({ ...bill }));

    if (billAllocations.length === 0) {
      alert('Select at least one bill or note and enter an adjustment amount.');
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
        billNumber: form.billNumber,
        remarks: form.remarks,
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
          <ErpFormShell onSave={saveEntry} saving={saving} className="space-y-4">
          <div className="space-y-4">
            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div>
                  <label className={labelClass}>Company</label>
                  <input className={inputClass} value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Type</label>
                  <select
                    className={inputClass}
                    value={form.series}
                    onChange={e => applySeries(e.target.value)}
                  >
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
                  <input className={inputClass} type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className={labelClass}>Bank / Cash (our account)</label>
                  <div className="flex gap-2">
                    <input
                      className={inputClass}
                      list="bank-account-options"
                      placeholder={form.paymentMode === 'cash' ? 'CASH A/C' : 'IDBI BANK'}
                      value={form.bankName}
                      onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                      disabled={form.paymentMode === 'cash'}
                    />
                    {form.paymentMode === 'bank' && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewBankName(form.bankName.trim());
                          setShowAddBank(true);
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100"
                        title="Add new bank account"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </button>
                    )}
                  </div>
                  <datalist id="bank-account-options">
                    {bankAccounts
                      .filter(account => form.paymentMode === 'cash'
                        ? String(account.accountType || account.name).toUpperCase().includes('CASH')
                        : !String(account.accountType || account.name).toUpperCase().includes('CASH') || account.name === 'Default Bank')
                      .map(account => (
                        <option key={account.name} value={account.name} />
                      ))}
                  </datalist>
                  <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-black text-sky-900">
                    Cur. Bal.: {formatBalance(bankBalance)}
                  </p>
                </div>

                <div>
                  <label className={labelClass}>A/C Name (party)</label>
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <select
                      className={inputClass}
                      value={form.partyType}
                      onChange={e => {
                        const partyType = e.target.value as 'customer' | 'supplier' | 'other';
                        setForm(f => ({ ...f, partyType, partyName: '' }));
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
                    Cur. Bal.: {formatBalance(partyBalance)}
                    {selectedPartySummary ? (
                      form.partyType === 'supplier'
                        ? ` · ${(selectedPartySummary as PurchaseBillParty).billCount} bill${(selectedPartySummary as PurchaseBillParty).billCount === 1 ? '' : 's'}`
                        : ` · ${(selectedPartySummary as CompletedOrderParty).orderCount} order${(selectedPartySummary as CompletedOrderParty).orderCount === 1 ? '' : 's'}`
                    ) : ''}
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Draw / Cheque (other party&apos;s bank)</label>
                  <input
                    className={inputClass}
                    placeholder="HDFC"
                    value={form.referenceNumber}
                    onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Chq. No.</label>
                      <input className={inputClass} value={form.chequeNumber} onChange={e => setForm(f => ({ ...f, chequeNumber: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelClass}>Chq. Date</label>
                      <input className={inputClass} type="date" value={form.chequeDate} onChange={e => setForm(f => ({ ...f, chequeDate: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className={labelClass}>Slip No.</label>
                  <input
                    className={inputClass}
                    value={form.slipNumber}
                    onChange={e => setForm(f => ({ ...f, slipNumber: e.target.value }))}
                    title="Auto from date (DDMM), e.g. 16/07 → 1607"
                  />
                </div>
                <div>
                  <label className={labelClass}>Bill type filter</label>
                  <select
                    className={inputClass}
                    value={form.billTypeFilter}
                    onChange={e => setForm(f => ({ ...f, billTypeFilter: e.target.value }))}
                  >
                    <option value="">All pending bills</option>
                    {ERP_TRANSACTION_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Remark</label>
                  <input className={inputClass} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={applyReceivedAmount}
                    className="w-full rounded-xl bg-indigo-50 px-4 py-2.5 text-sm font-black text-indigo-700 hover:bg-indigo-100"
                  >
                    Auto-adjust selected bills
                  </button>
                </div>
              </div>

              {summary.breakdown.received > 0 && (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs font-semibold text-indigo-950">
                  <div className="flex justify-between gap-3">
                    <span>Net adjustment needed</span>
                    <span className="font-black">{formatMoney(summary.breakdown.netCashRequired)}</span>
                  </div>
                  {summary.breakdown.shortfall > 0 ? (
                    <div className="mt-1 flex justify-between gap-3 text-red-700">
                      <span>Short by</span>
                      <span className="font-black">{formatMoney(summary.breakdown.shortfall)}</span>
                    </div>
                  ) : summary.breakdown.excess > 0 ? (
                    <div className="mt-1 flex justify-between gap-3 text-emerald-700">
                      <span>Unallocated (extra)</span>
                      <span className="font-black">{formatMoney(summary.breakdown.excess)}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Bill-wise adjustment</h2>
                    <p className="text-xs text-gray-500">
                      Pending bills for this party. Tick bill(s), enter Rec./Paid amount, then Auto-adjust (or type Adjust amount). Ledger will show BILL NOS. and PAID ON.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"
                      value={quickBillPick}
                      onChange={e => {
                        const value = e.target.value;
                        setQuickBillPick(value);
                        if (value) selectBillByNumber(value);
                      }}
                    >
                      <option value="">Pick bill no.</option>
                      {pendingBillRows.map(bill => (
                        <option key={bill.billId} value={bill.billNumber}>
                          Bill {bill.billNumber} · {formatMoney(bill.pendingAmount)} pending
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={clearBillSelection} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-700">
                      Clear selection
                    </button>
                  </div>
                </div>
                {selectedAdjustIds.size > 0 && (
                  <p className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900">
                    {summary.breakdown.selectedBillCount} bill{summary.breakdown.selectedBillCount === 1 ? '' : 's'} selected
                    {summary.breakdown.selectedNoteCount > 0 ? ` · ${summary.breakdown.selectedNoteCount} note adjustment(s)` : ''}
                  </p>
                )}
              </div>
              <div className="overflow-x-auto">
                {loadingBills ? (
                  <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading pending bills...
                  </div>
                ) : !form.partyName ? (
                  <div className="px-5 py-12 text-center text-sm text-gray-400">
                    {form.partyType === 'supplier' ? 'Choose a supplier to load pending bills.' : 'Choose a customer to load pending bills.'}
                  </div>
                ) : pendingBillRows.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-gray-400">No pending bills for this party and type.</div>
                ) : (
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Select</th>
                        <th className="px-4 py-3">Bill No.</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Bill Date</th>
                        <th className="px-4 py-3">Linked Cr/Dr</th>
                        <th className="px-4 py-3 text-right">Bill Amount</th>
                        <th className="px-4 py-3 text-right">Pend Amt</th>
                        <th className="px-4 py-3 text-right">Net Pend</th>
                        <th className="px-4 py-3 text-right">Adjust</th>
                        <th className="px-4 py-3 text-right">Balance Left</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBillRows.map(bill => {
                        const selected = isAdjustSelected(bill.billId);
                        const balanceLeft = Math.max(bill.pendingAmount - (bill.adjustAmount || 0), 0);
                        return (
                        <tr key={bill.billId} className={`border-t ${selected ? 'bg-indigo-50/40' : 'opacity-80'}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleBillSelection(bill.billId)}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                            />
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-900">{bill.billNumber}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-gray-600">{bill.transactionType || '-'}</td>
                          <td className="px-4 py-3">{formatDate(bill.billDate)}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-amber-800">
                            {(bill.linkedCreditAmount || 0) > 0 && `Cr −${formatMoney(bill.linkedCreditAmount || 0)}`}
                            {(bill.linkedCreditAmount || 0) > 0 && (bill.linkedDebitAmount || 0) > 0 && ' · '}
                            {(bill.linkedDebitAmount || 0) > 0 && `Dr +${formatMoney(bill.linkedDebitAmount || 0)}`}
                            {!bill.linkedCreditAmount && !bill.linkedDebitAmount && '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{formatMoney(bill.billAmount)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-amber-700">{formatMoney(bill.pendingAmount)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-indigo-700">{formatMoney(bill.netPendingAmount ?? bill.pendingAmount)}</td>
                          <td className="px-4 py-3 text-right">
                            <input
                              className={`w-28 rounded-lg border px-2 py-1.5 text-right text-sm font-bold ${selected ? 'bg-white' : 'bg-gray-100 cursor-not-allowed'}`}
                              type="number"
                              min="0"
                              step="0.01"
                              max={bill.pendingAmount}
                              disabled={!selected}
                              value={bill.adjustAmount || ''}
                              onChange={e => updateBillAdjust(bill.billId, e.target.value)}
                            />
                          </td>
                          <td className={`px-4 py-3 text-right font-bold ${balanceLeft > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                            {formatMoney(balanceLeft)}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="rounded-3xl border-2 border-amber-200 bg-amber-50/30 shadow-sm">
              <div className="border-b border-amber-200 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wide text-amber-950">Credit / Debit Notes — Adjust Here</h2>
                    <p className="mt-1 text-xs text-amber-900/80">
                      Credit notes (−) reduce receipt/payment. Debit notes (+) increase it. Linked notes auto-fill when you adjust the bill.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={applyAllLinkedNotes} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100">
                      Apply linked notes
                    </button>
                    <button type="button" onClick={applyAllCreditNotes} className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700">
                      Apply all credit notes
                    </button>
                  </div>
                </div>
                {form.partyName && pendingNoteCount > 0 && (
                  <p className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-950">
                    {pendingNoteCount} note{pendingNoteCount === 1 ? '' : 's'} found for {form.partyName}. Enter amount in the ADJUST column below.
                  </p>
                )}
              </div>
              <div className="overflow-x-auto bg-white">
                {loadingBills ? (
                  <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading notes...
                  </div>
                ) : !form.partyName ? (
                  <div className="px-5 py-12 text-center text-sm text-gray-400">Select a party to load credit/debit notes.</div>
                ) : pendingNoteRows.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-gray-500">
                    <p className="font-semibold text-gray-700">No pending credit/debit notes for this party.</p>
                    <p className="mt-2 text-xs">Create from ERP Home → Additional Features → Credit Note (Sales) or Debit Note (Sales).</p>
                  </div>
                ) : (
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-amber-50 text-[11px] uppercase tracking-wide text-amber-900">
                      <tr>
                        <th className="px-4 py-3">Select</th>
                        <th className="px-4 py-3">Entry</th>
                        <th className="px-4 py-3">Note No.</th>
                        <th className="px-4 py-3">+ / −</th>
                        <th className="px-4 py-3">Linked Bill</th>
                        <th className="px-4 py-3 text-right">Note Amount</th>
                        <th className="px-4 py-3 text-right">Adjust</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingNoteRows.map(note => {
                        const selected = isAdjustSelected(note.billId);
                        return (
                        <tr key={note.billId} className={`border-t ${selected ? 'bg-amber-50/50' : 'bg-white opacity-80'}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleNoteSelection(note.billId)}
                              className="h-4 w-4 rounded border-gray-300 text-amber-600"
                            />
                          </td>
                          <td className="px-4 py-3 text-xs font-black uppercase text-amber-900">{getEntryLabel(note)}</td>
                          <td className="px-4 py-3 font-bold text-gray-900">{note.billNumber}</td>
                          <td className="px-4 py-3 text-lg font-black text-amber-900">{note.adjustDirection === 'deduct' ? '−' : '+'}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-gray-600">{note.adjustBillNumber || note.refBillNumber || 'Open (any bill)'}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatMoney(note.pendingAmount)}</td>
                          <td className="px-4 py-3 text-right">
                            <input
                              className={`w-28 rounded-lg border-2 px-2 py-1.5 text-right text-sm font-bold ${selected ? 'border-amber-300 bg-white' : 'border-gray-200 bg-gray-100 cursor-not-allowed'}`}
                              type="number"
                              min="0"
                              step="0.01"
                              max={note.pendingAmount}
                              disabled={!selected}
                              value={note.adjustAmount || ''}
                              onChange={e => updateBillAdjust(note.billId, e.target.value)}
                            />
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="rounded-3xl border-2 border-indigo-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-wide text-indigo-950">Adjustment Summary</h2>
              <p className="mt-1 text-xs text-gray-500">Clear breakdown of bill total, note adjustments, received amount, and balance left.</p>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Bill & Note Breakdown</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Selected bills — pending total</span>
                      <span className="font-bold text-gray-900">{formatMoney(summary.breakdown.totalBillPending)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Bill amount adjusting</span>
                      <span className="font-bold text-gray-900">{formatMoney(summary.breakdown.billAdjustTotal)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-amber-800">
                      <span>Less: credit notes</span>
                      <span className="font-black">− {formatMoney(summary.breakdown.creditDeduct)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-emerald-800">
                      <span>Add: debit notes</span>
                      <span className="font-black">+ {formatMoney(summary.breakdown.debitAdd)}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between gap-4">
                      <span className="font-black text-indigo-950">Net cash for this entry</span>
                      <span className="text-lg font-black text-indigo-900">{formatMoney(summary.breakdown.netCashRequired)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-red-700">
                      <span>Balance still on selected bills</span>
                      <span className="font-black">{formatMoney(summary.breakdown.balanceLeftOnBills)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Received / Paid Amount</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">{form.entryType === 'receipt' ? 'Amount received' : 'Amount paid'}</span>
                      <span className="font-bold text-gray-900">{formatMoney(summary.breakdown.received)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Applied to bills & notes</span>
                      <span className="font-bold text-indigo-900">{formatMoney(summary.breakdown.applied)}</span>
                    </div>
                    {summary.breakdown.shortfall > 0 ? (
                      <div className="flex justify-between gap-4 rounded-xl bg-red-100 px-3 py-2 text-red-800">
                        <span className="font-bold">Shortfall (need more)</span>
                        <span className="font-black">{formatMoney(summary.breakdown.shortfall)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between gap-4 rounded-xl bg-emerald-100 px-3 py-2 text-emerald-800">
                        <span className="font-bold">Unallocated amount left</span>
                        <span className="font-black">{formatMoney(summary.breakdown.excess)}</span>
                      </div>
                    )}
                    <div className="border-t border-indigo-200 pt-2 flex justify-between gap-4">
                      <span className="font-black text-indigo-950">Still pending on selected bills</span>
                      <span className="text-lg font-black text-red-700">{formatMoney(summary.breakdown.balanceLeftOnBills)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-green-50 px-4 py-3">
                  <p className={labelClass}>Taxable Value (Paid Bills)</p>
                  <p className="text-lg font-black text-green-900">{formatMoney(summary.taxableValuePaidBills)}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ErpSaveButton
                  saving={saving}
                  label="Save Entry"
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                />
                <button type="button" onClick={() => void resetForm()} className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700">
                  Clear
                </button>
              </div>
            </section>
          </div>
          </ErpFormShell>
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
                  <input data-erp-skip-nav className="rounded-xl border bg-gray-50 py-2 pl-9 pr-3 text-sm" placeholder="Search entries" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void loadEntries(); }} />
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
                          <p className="text-xs text-gray-400">{entry.partyType || '-'}{entry.referenceNumber ? ` · Draw ${entry.referenceNumber}` : ''}</p>
                        </td>
                        <td>{entry.bankName || '-'}</td>
                        <td>{entry.chequeNumber || entry.slipNumber || '-'}</td>
                        <td className={`text-right font-black ${entry.entryType === 'payment' ? 'text-red-700' : 'text-green-700'}`}>
                          {formatMoney(entry.amount)}
                        </td>
                        <td className="text-right font-semibold">{formatMoney(entry.adjustAdd || 0)}</td>
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
