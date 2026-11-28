import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { bankEntriesApi, creditDebitNotesApi, customersApi, EinvoiceInfo, purchasesApi } from '../services/api';
import {
  CREDIT_DEBIT_NOTE_TYPES,
  CreditDebitNoteType,
  formatNoteNumber,
  printedNoteVoucher,
  INDIAN_STATES,
  noteTypeFromKindSide,
  parseNoteType
} from '../constants/creditDebitNoteTypes';
import {
  getGstDocumentType,
  getItcEligibility,
  getPostingRule,
  postingGstRate,
  postingSaleOrPurchaseAccount,
  postingSummary,
  warnsOnManualEntry
} from '../constants/erpTransactionPostingRules';
import { BankPendingBill, CreditDebitNote, Customer, ErpSession, Supplier } from '../types';
import { DeleteEntryButton } from './DeleteEntryButton';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';
import { EinvoiceDialog } from './EinvoiceDialog';
import { ErpTopMenu } from './ErpTopMenu';
import { PhotoEntryButton } from './PhotoEntryButton';
import { PhotoExtraction } from '../services/api';
import { matchPhotoParty, photoPartyState } from '../utils/photoEntry';
import { rememberEntryType, rememberedEntryType } from '../utils/continueEntry';
import { GST_STATE_CODES, getStateCodeFromName, isInterStateSupply } from '../utils/gstState';
import { gstTypeFromGstin, isNonGstType, stateNameFromGstin } from '../utils/partyGst';
import { GstTypeSelect, useMissingGstPrompt } from './GstTypeField';
import { partyDhara } from '../utils/partyBillingTerms';
import { roundRupee } from '../utils/rupeeRound';
import { useVoucherJump } from '../hooks/useVoucherJump';

interface Props {
  noteType?: CreditDebitNoteType;
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (v: string | number) => Number(v) || 0;
const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/** Taxable and net from the gross just typed. GST is CGST+SGST or IGST from the party type. */
function noteFigures(input: {
  gross: number;
  discountPercent: number;
  discountAmount: number | null;
  otherLess: number;
  addAmount: number;
  returnGoods: number;
  taxable: number | null;
  gstRate: number;
  gstType: string;
  placeOfSupply: string;
  businessState: string;
  tcsRate: number;
}) {
  const discount = money(input.discountAmount != null ? input.discountAmount : input.gross * input.discountPercent / 100);
  const taxable = money(input.taxable != null
    ? input.taxable
    : input.gross - discount - input.otherLess + input.addAmount - input.returnGoods);
  const non = isNonGstType(input.gstType);
  const rate = non ? 0 : input.gstRate;
  const typed = String(input.gstType || '').toLowerCase();
  const inter = !non && (typed.includes('inter') || (!typed && isInterStateSupply(input.placeOfSupply, input.businessState)));
  const tax = money(taxable * rate / 100);
  const half = money(tax / 2);
  const tcs = money(taxable * input.tcsRate / 100);
  const exact = money(taxable + tax + tcs);
  const net = roundRupee(exact);
  return {
    taxable,
    cgstRate: inter ? 0 : rate / 2,
    cgst: inter ? 0 : half,
    sgstRate: inter ? 0 : rate / 2,
    sgst: inter ? 0 : half,
    igstRate: inter ? rate : 0,
    igst: inter ? tax : 0,
    tcs,
    roundOff: money(net - exact),
    net
  };
}
const isoDate = (value?: string | Date | null) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500';

const initialTypeFromUrl = (fallback?: CreditDebitNoteType) => {
  const params = new URLSearchParams(window.location.search);
  return parseNoteType(params.get('type') || '')
    || parseNoteType(rememberedEntryType('note'))
    || parseNoteType(fallback?.value)
    || CREDIT_DEBIT_NOTE_TYPES[0];
};

export const CreditDebitNotePage: React.FC<Props> = ({ noteType: initialNoteType, onBack, erpSession }) => {
  const [noteType, setNoteType] = useState<CreditDebitNoteType>(() => initialTypeFromUrl(initialNoteType));
  const [editingId, setEditingId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('edit'));
  const [einvoice, setEinvoice] = useState<EinvoiceInfo | null>(null);
  const [einvoiceOpen, setEinvoiceOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [allocatedVoucher, setAllocatedVoucher] = useState('');
  const [noteNumber, setNoteNumber] = useState('');
  const [noteDate, setNoteDate] = useState(today());
  const [partyName, setPartyName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [gstType, setGstType] = useState('');
  const [gstTouched, setGstTouched] = useState(false);
  const { askIfMissing, dialog: missingGstDialog } = useMissingGstPrompt();
  const [refBillNumber, setRefBillNumber] = useState('');
  const [refBillDate, setRefBillDate] = useState('');
  const [refBillQuery, setRefBillQuery] = useState('');
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [challanNumber, setChallanNumber] = useState('');
  const [saleAccount, setSaleAccount] = useState('');
  const [purchaseType, setPurchaseType] = useState('');
  const [pieces, setPieces] = useState('');
  const [quantity, setQuantity] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [otherLess, setOtherLess] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [returnGoods, setReturnGoods] = useState('');
  const [hsnSac, setHsnSac] = useState('');
  const [taxableAmount, setTaxableAmount] = useState('');
  const taxableEdited = useRef(false);
  const [gstRate, setGstRate] = useState('');
  const [cgstRate, setCgstRate] = useState('');
  const [cgstAmount, setCgstAmount] = useState('');
  const [sgstRate, setSgstRate] = useState('');
  const [sgstAmount, setSgstAmount] = useState('');
  const [igstRate, setIgstRate] = useState('');
  const [igstAmount, setIgstAmount] = useState('');
  const [tcsRate, setTcsRate] = useState('');
  const [tcsAmount, setTcsAmount] = useState('');
  const [netAmount, setNetAmount] = useState('');
  const [roundOff, setRoundOff] = useState('');
  const [netAmountAfterTds, setNetAmountAfterTds] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [adjustBillNumber, setAdjustBillNumber] = useState('');
  const [adjustBillId, setAdjustBillId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isTally, setIsTally] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pendingBills, setPendingBills] = useState<BankPendingBill[]>([]);
  const [notes, setNotes] = useState<CreditDebitNote[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [nextBlank, setNextBlank] = useState<number | null>(null);
  const openBlankRef = useRef<(voucher: number, message: string) => void>(() => {});
  const noteVoucherJump = useVoucherJump({
    module: 'note',
    transactionType: noteType.value,
    currentId: editingId,
    shownNumber: voucherNumber,
    nextBlank,
    onMissing: (voucher, info) => openBlankRef.current(voucher, info.message),
    onNotice: message => { if (message) setSuccess(message); },
    onError: setError
  });

  const rule = getPostingRule(noteType.series);
  const saleOrPurAccount = postingSaleOrPurchaseAccount(noteType.series) || '';
  const tcsAccount = rule?.tcsAccount || null;
  const gstDoc = getGstDocumentType(noteType.series);
  const itc = getItcEligibility(noteType.series);

  const applySeriesDefaults = useCallback((type: CreditDebitNoteType) => {
    const nextRule = getPostingRule(type.series);
    const rate = postingGstRate(type.series);
    setSaleAccount(postingSaleOrPurchaseAccount(type.series) || '');
    setPurchaseType('');
    setGstRate(rate != null ? String(rate) : '');
    setHsnSac(nextRule?.defaultHsnCode || '');
  }, []);

  const resetAmounts = () => {
    taxableEdited.current = false;
    setPieces('');
    setQuantity('');
    setGrossAmount('');
    setDiscountPercent('');
    setDiscountAmount('');
    setOtherLess('');
    setAddAmount('');
    setReturnGoods('');
    setTaxableAmount('');
    setTcsRate('');
    setPaidAmount('');
    setIsPaid(false);
    setIsTally(false);
    setRemarks('');
    setRefBillNumber('');
    setRefBillDate('');
    setRefBillQuery('');
    setChallanNumber('');
    setAdjustBillNumber('');
    setAdjustBillId('');
  };

  const loadMaster = useCallback(async (type: CreditDebitNoteType) => {
    try {
      const result = await creditDebitNotesApi.getNextVoucher(type.value);
      setCompanyName(result.companyName);
      setBusinessState(result.businessState || '');
      const next = String(result.voucherNumber);
      setNextBlank(Number(result.voucherNumber) || null);
      setVoucherNumber(next);
      setAllocatedVoucher(next);
      setNoteNumber(formatNoteNumber(type.series, result.voucherNumber));
      setPlaceOfSupply(prev => prev || result.businessState || '');
    } catch {
      setVoucherNumber('1');
      setAllocatedVoucher('1');
      setNoteNumber(formatNoteNumber(type.series, 1));
      setError('Could not load note voucher. If this says "Route not found", redeploy the Railway backend and refresh.');
    }
  }, []);

  const loadNotes = useCallback(async (type: CreditDebitNoteType) => {
    try {
      const { notes: rows } = await creditDebitNotesApi.getAll(type.value);
      setNotes(rows || []);
    } catch {
      setNotes([]);
    }
  }, []);

  const applyNote = (note: CreditDebitNote, type: CreditDebitNoteType) => {
    setEditingId(note.id);
    setCompanyName(note.companyName || '');
    const shownVoucher = printedNoteVoucher(note.voucherNumber);
    setVoucherNumber(shownVoucher ? String(shownVoucher) : '');
    setAllocatedVoucher(shownVoucher ? String(shownVoucher) : '');
    setNoteNumber(note.noteNumber || formatNoteNumber(type.series, note.voucherNumber));
    setNoteDate(isoDate(note.noteDate) || today());
    setPartyName(note.partyName || '');
    setCustomerId(note.customerId || '');
    setSupplierId(note.supplierId || '');
    setPlaceOfSupply(note.placeOfSupply || '');
    setGstType(note.gstType || '');
    setRefBillNumber(note.refBillNumber || '');
    setRefBillQuery(note.refBillNumber || '');
    setRefBillDate(isoDate(note.refBillDate));
    setChallanNumber(note.challanNumber || '');
    setSaleAccount(note.saleAccount || postingSaleOrPurchaseAccount(type.series) || '');
    setPurchaseType(note.purchaseType || '');
    setPieces(note.pieces ? String(note.pieces) : '');
    setQuantity(note.quantity ? String(note.quantity) : '');
    setGrossAmount(note.grossAmount ? String(note.grossAmount) : '');
    setDiscountPercent(note.discountPercent ? String(note.discountPercent) : '');
    setDiscountAmount(note.discountAmount ? String(note.discountAmount) : '');
    setOtherLess(note.otherLess ? String(note.otherLess) : '');
    setAddAmount(note.addAmount ? String(note.addAmount) : '');
    setReturnGoods(note.returnGoods ? String(note.returnGoods) : '');
    setHsnSac(note.hsnSac || getPostingRule(type.series)?.defaultHsnCode || '');
    taxableEdited.current = Boolean(note.taxableAmount);
    setTaxableAmount(note.taxableAmount ? String(note.taxableAmount) : '');
    setGstRate(note.gstRate ? String(note.gstRate) : String(postingGstRate(type.series) || ''));
    setTcsRate(note.tcsRate ? String(note.tcsRate) : '');
    const shownNet = note.netAmount ? roundRupee(note.netAmount) : '';
    const shownAfter = note.netAmountAfterTds
      ? roundRupee(note.netAmountAfterTds)
      : shownNet;
    setNetAmount(shownNet === '' ? '' : String(shownNet));
    setNetAmountAfterTds(shownAfter === '' ? '' : String(shownAfter));
    setPaidAmount(note.paidAmount ? String(note.paidAmount) : '');
    setIsPaid(Boolean(note.isPaid));
    setAdjustBillNumber(note.adjustBillNumber || note.refBillNumber || '');
    setAdjustBillId(note.adjustBillId || '');
    setRemarks(note.remarks || '');
    setIsTally(Boolean(note.isTally));
    setEinvoice(note.einvoiceIrn ? {
      irn: note.einvoiceIrn,
      ackNo: note.einvoiceAckNo,
      ackDate: note.einvoiceAckDate,
      signedQr: note.einvoiceSignedQr,
      status: note.einvoiceStatus,
      mode: note.einvoiceMode,
      cancelReason: note.einvoiceCancelReason
    } : null);
  };

  useEffect(() => {
    rememberEntryType('note', noteType.value);
    void creditDebitNotesApi.getNextVoucher(noteType.value)
      .then(result => setNextBlank(Number(result.voucherNumber) || null))
      .catch(() => undefined);
    applySeriesDefaults(noteType);
    if (!editingId) void loadMaster(noteType);
    void loadNotes(noteType);
    if (noteType.partyType === 'customer') {
      void customersApi.getAll().then(r => setCustomers(r.customers || [])).catch(() => setCustomers([]));
    } else {
      void purchasesApi.getSuppliers().then(r => setSuppliers(r.suppliers || [])).catch(() => setSuppliers([]));
    }
  }, [applySeriesDefaults, editingId, loadMaster, loadNotes, noteType]);

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (!editId) return;
    setLoadingEdit(true);
    void creditDebitNotesApi.getById(editId).then(({ note }) => {
      const type = noteTypeFromKindSide(note.noteKind, note.noteSide);
      setNoteType(type);
      applyNote(note, type);
    }).catch(() => setError('Could not load this note.')).finally(() => setLoadingEdit(false));
  }, []);

  useEffect(() => {
    const hasGross = String(grossAmount).trim() !== '';
    const figures = noteFigures({
      gross: toNum(grossAmount),
      discountPercent: toNum(discountPercent),
      discountAmount: String(discountAmount).trim() ? toNum(discountAmount) : null,
      otherLess: toNum(otherLess),
      addAmount: toNum(addAmount),
      returnGoods: toNum(returnGoods),
      taxable: taxableEdited.current ? toNum(taxableAmount) : null,
      gstRate: toNum(gstRate),
      gstType,
      placeOfSupply,
      businessState,
      tcsRate: toNum(tcsRate)
    });
    const show = hasGross || taxableEdited.current;
    if (!taxableEdited.current) setTaxableAmount(show ? String(figures.taxable) : '');
    setCgstRate(show ? String(figures.cgstRate) : '');
    setCgstAmount(show ? String(figures.cgst) : '');
    setSgstRate(show ? String(figures.sgstRate) : '');
    setSgstAmount(show ? String(figures.sgst) : '');
    setIgstRate(show ? String(figures.igstRate) : '');
    setIgstAmount(show ? String(figures.igst) : '');
    setTcsAmount(show ? String(figures.tcs) : '');
    setRoundOff(show ? String(figures.roundOff) : '');
    setNetAmount(show ? String(figures.net) : '');
    setNetAmountAfterTds(show ? String(figures.net) : '');
  }, [addAmount, businessState, discountAmount, discountPercent, grossAmount, gstRate, gstType, otherLess, placeOfSupply, returnGoods, taxableAmount, tcsRate]);

  useEffect(() => {
    if (!partyName.trim()) {
      setPendingBills([]);
      return;
    }
    void bankEntriesApi.getPendingBills({
      partyName,
      partyType: noteType.partyType
    }).then(result => {
      setPendingBills(
        (result.bills || []).filter(b => b.billType !== 'credit_debit_note' && b.billType !== 'unadj_payment')
      );
    }).catch(() => setPendingBills([]));
  }, [partyName, noteType.partyType]);

  const billMatches = useMemo(() => {
    const q = refBillQuery.trim().toLowerCase();
    const rank = (bill: BankPendingBill) => {
      if (!q) return 1;
      const number = String(bill.billNumber || '').toLowerCase();
      const voucher = String(bill.voucherNumber || '').toLowerCase();
      if (number === q || number.startsWith(q) || voucher === q || voucher.startsWith(q)) return 0;
      if (number.includes(q) || voucher.includes(q)) return 1;
      return 2;
    };
    return [...pendingBills].sort((a, b) => {
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      const dateA = new Date(a.billDate || 0).getTime() || 0;
      const dateB = new Date(b.billDate || 0).getTime() || 0;
      if (dateA !== dateB) return dateA - dateB;
      return String(a.billNumber || '').localeCompare(String(b.billNumber || ''), undefined, { numeric: true });
    }).slice(0, 40);
  }, [pendingBills, refBillQuery]);

  const pickBill = (bill: BankPendingBill) => {
    setRefBillNumber(bill.billNumber);
    setRefBillQuery(bill.billNumber);
    setRefBillDate(isoDate(bill.billDate));
    setAdjustBillNumber(bill.billNumber);
    setAdjustBillId(bill.billId);
    setRefPickerOpen(false);
  };

  const supplyStateOf = (gstin?: string | null, state?: string | null) => {
    const fromGstin = stateNameFromGstin(gstin);
    if (fromGstin) return fromGstin;
    const code = getStateCodeFromName(state || '');
    return code ? (GST_STATE_CODES[code] || '') : '';
  };

  const applyPartyGst = (
    party: { name: string; gstNumber?: string | null; state?: string | null },
    assign: () => void
  ) => {
    askIfMissing(party, () => {
      assign();
      const gstin = String(party.gstNumber || '').trim();
      setPartyGstin(gstin);
      const supply = supplyStateOf(gstin, party.state);
      if (supply) setPlaceOfSupply(supply);
      const auto = gstTypeFromGstin(gstin, businessState);
      setGstTouched(false);
      setGstType(auto);
      if (!editingId || isNonGstType(auto)) {
        const seriesRate = postingGstRate(noteType.series);
        setGstRate(isNonGstType(auto) ? '0' : (seriesRate != null ? String(seriesRate) : ''));
      }
    }, () => {
      setCustomerId('');
      setSupplierId('');
      setPartyName('');
      setPartyGstin('');
    });
  };

  useEffect(() => {
    if (gstTouched || !partyGstin) return;
    const auto = gstTypeFromGstin(partyGstin, businessState);
    if (auto) setGstType(auto);
  }, [businessState, gstTouched, partyGstin]);

  const gstHint = useMemo(() => {
    if (isNonGstType(gstType)) return 'Non GST — tax is 0.';
    const typed = String(gstType || '').toLowerCase();
    if (typed.includes('inter')) return 'Different state → IGST from the series.';
    if (typed.includes('local') || typed.includes('cgst')) return 'Same state → CGST + SGST from the series.';
    if (!placeOfSupply || !businessState) return 'Select place of supply to apply GST.';
    if (!isInterStateSupply(placeOfSupply, businessState)) return 'Same state → CGST + SGST from the series.';
    return 'Different state → IGST from the series.';
  }, [businessState, gstType, placeOfSupply]);

  const changeType = (value: string) => {
    const next = parseNoteType(value);
    if (!next) return;
    setNoteType(next);
    setEditingId(null);
    setEinvoice(null);
    setError('');
    setSuccess('');
    setPartyGstin('');
    setGstTouched(false);
    setGstType('');
    resetAmounts();
    applySeriesDefaults(next);
    const url = new URL(window.location.href);
    url.pathname = '/erp/notes';
    url.searchParams.set('type', next.value);
    url.searchParams.delete('edit');
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
    void loadMaster(next);
  };

  openBlankRef.current = (voucher: number, message: string) => {
    if (!editingId && Number(nextBlank) === voucher) {
      setVoucherNumber(String(voucher));
      if (message) setSuccess(message);
      return;
    }
    setEditingId(null);
    setEinvoice(null);
    setError('');
    resetAmounts();
    const url = new URL(window.location.href);
    url.pathname = '/erp/notes';
    url.searchParams.set('type', noteType.value);
    url.searchParams.delete('edit');
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
    void loadMaster(noteType);
    if (message) setSuccess(message);
  };

  const openNote = (note: CreditDebitNote) => {
    const type = noteTypeFromKindSide(note.noteKind, note.noteSide);
    setNoteType(type);
    applyNote(note, type);
    const url = new URL(window.location.href);
    url.pathname = '/erp/notes';
    url.searchParams.set('type', type.value);
    url.searchParams.set('edit', note.id);
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
  };

  const startNew = () => {
    setEditingId(null);
    setEinvoice(null);
    setPartyGstin('');
    setGstTouched(false);
    setGstType('');
    resetAmounts();
    applySeriesDefaults(noteType);
    const url = new URL(window.location.href);
    url.pathname = '/erp/notes';
    url.searchParams.set('type', noteType.value);
    url.searchParams.delete('edit');
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
    void loadMaster(noteType);
  };

  const saveNote = async () => {
    if (!partyName.trim()) {
      alert(`${noteType.partyType === 'customer' ? 'Customer' : 'Supplier'} name is required.`);
      return;
    }
    if (
      !editingId
      && warnsOnManualEntry(noteType.series)
      && allocatedVoucher
      && voucherNumber.trim()
      && voucherNumber.trim() !== allocatedVoucher
    ) {
      if (!confirm(`Voucher no. was changed from ${allocatedVoucher} to ${voucherNumber}. Continue?`)) return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    const payload = {
      noteType: noteType.value,
      companyName,
      noteNumber: noteNumber || formatNoteNumber(noteType.series, voucherNumber),
      noteDate,
      partyName,
      customerId: customerId || undefined,
      supplierId: supplierId || undefined,
      placeOfSupply,
      partyGstin: partyGstin || undefined,
      gstType: gstType || undefined,
      refBillNumber: refBillNumber || undefined,
      refBillDate: refBillDate || undefined,
      challanNumber: challanNumber || undefined,
      saleAccount: saleOrPurAccount || saleAccount || undefined,
      purchaseType: purchaseType || undefined,
      pieces: toNum(pieces),
      quantity: toNum(quantity),
      grossAmount: toNum(grossAmount),
      discountPercent: toNum(discountPercent),
      discountAmount: toNum(discountAmount),
      otherLess: toNum(otherLess),
      addAmount: toNum(addAmount),
      returnGoods: toNum(returnGoods),
      hsnSac: hsnSac || undefined,
      taxableAmount: toNum(taxableAmount),
      gstRate: toNum(gstRate),
      tcsRate: toNum(tcsRate),
      netAmountAfterTds: toNum(netAmountAfterTds || netAmount),
      paidAmount: toNum(paidAmount),
      isPaid,
      adjustBillNumber: adjustBillNumber || refBillNumber || undefined,
      adjustBillId: adjustBillId
        || pendingBills.find(b => String(b.billNumber) === String(adjustBillNumber || refBillNumber))?.billId,
      remarks: remarks || undefined,
      isTally
    };
    try {
      const { note } = editingId
        ? await creditDebitNotesApi.update(editingId, payload)
        : await creditDebitNotesApi.create(payload);
      setSuccess(`Saved ${noteType.label} voucher #${printedNoteVoucher(note.voucherNumber) || note.voucherNumber} for ${note.partyName}.`);
      startNew();
      void loadNotes(noteType);
    } catch (err: any) {
      setError(err.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
  };

  const deleteDocument = async () => {
    if (!editingId) return;
    try {
      await creditDebitNotesApi.delete(editingId);
      window.location.href = '/erp/notes';
    } catch (err: any) {
      setError(err.message || 'Could not delete this entry.');
    }
  };

  const applyPhoto = (x: PhotoExtraction) => {
    const out: string[] = [];
    const isCustomer = noteType.partyType === 'customer';
    const customerPool: Array<Customer & { name: string }> = customers.map(c => ({ ...c, name: c.organizationName }));
    const match: (Customer & { name: string }) | Supplier | null = isCustomer
      ? matchPhotoParty(customerPool, x)
      : matchPhotoParty(suppliers, x);
    if (match) {
      if (isCustomer) setCustomerId(match.id);
      else setSupplierId(match.id);
      setPartyName(match.name);
      const supply = supplyStateOf(match.gstNumber, match.state || photoPartyState(x));
      if (supply) setPlaceOfSupply(supply);
      const auto = gstTypeFromGstin(match.gstNumber, businessState);
      if (auto) {
        setGstTouched(false);
        setGstType(auto);
        setPartyGstin(String(match.gstNumber || '').trim());
      }
      if (!editingId) setDiscountPercent(String(partyDhara(match) || ''));
    } else if (x.party.name) {
      setPartyName(x.party.name);
      out.push(`"${x.party.name}" is not in your ${isCustomer ? 'customer' : 'supplier'} list — pick or add the party before saving.`);
    }
    const pos = supplyStateOf(match?.gstNumber, match?.state || photoPartyState(x));
    if (pos) setPlaceOfSupply(pos);
    if (x.docNo) setNoteNumber(x.docNo);
    if (x.docDate) setNoteDate(x.docDate);
    if (x.refDocNo) {
      setRefBillNumber(x.refDocNo);
      setRefBillQuery(x.refDocNo);
    }
    if (x.refDocDate) setRefBillDate(x.refDocDate);
    if (x.challanNo) setChallanNumber(x.challanNo);
    const hsn = x.hsn || x.lines.find(line => line.hsn)?.hsn;
    if (hsn) setHsnSac(hsn);
    const rate = x.gstRate || x.lines.find(line => line.gstRate)?.gstRate;
    if (rate) setGstRate(String(rate));
    const pcs = x.totalPcs || x.lines.reduce((s, line) => s + line.pcs, 0);
    const qty = x.totalMts || x.lines.reduce((s, line) => s + (line.mts || line.qty), 0);
    if (pcs) setPieces(String(pcs));
    if (qty) setQuantity(String(Math.round(qty * 100) / 100));
    const gross = x.grossAmount || x.lines.reduce((s, line) => s + line.amount, 0) || x.taxableAmount;
    if (gross) {
      taxableEdited.current = false;
      setGrossAmount(String(gross));
    }
    if (x.discountPercent) setDiscountPercent(String(x.discountPercent));
    else if (x.discountAmount) setDiscountAmount(String(x.discountAmount));
    if (x.otherLess) setOtherLess(String(x.otherLess));
    if (x.otherAdd) setAddAmount(String(x.otherAdd));
    if (x.remarks) setRemarks(x.remarks);
    if (!x.refDocNo) out.push('No original bill number was read — pick the Ref Bill No.');
    return out;
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Credit / Debit Note" erpSession={erpSession} onBackToCatalogue={onBack} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-fuchsia-700">{noteType.label}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {editingId ? 'EDIT MODE' : 'ADD MODE'} — {gstDoc || 'BILLSDIR'} · {gstHint}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-indigo-700">{postingSummary(noteType.series)}</p>
            </div>
            <div className="flex items-center gap-2">
              {editingId && <DeleteEntryButton onDelete={deleteDocument} disabled={saving} />}
              <PhotoEntryButton kind="note" onApply={applyPhoto} disabled={loadingEdit} />
              <button
                type="button"
                onClick={startNew}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black uppercase text-gray-700"
              >
                New
              </button>
            </div>
          </div>

          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
          {success && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{success}</div>}
          {loadingEdit && <div className="mt-4 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading note…</div>}

          <ErpFormShell onSave={saveNote} saving={saving}>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div><label className={labelClass}>Company</label><input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} /></div>
            <div>
              <label className={labelClass}>Type</label>
              <select className={inputClass} value={noteType.value} onChange={e => changeType(e.target.value)}>
                {CREDIT_DEBIT_NOTE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Voucher No.</label>
              <input
                className={inputClass}
                value={voucherNumber}
                onChange={e => setVoucherNumber(e.target.value)}
                {...noteVoucherJump.voucherFieldProps}
              />
            </div>
            <div><label className={labelClass}>Note No.</label><input className={inputClass} value={noteNumber} onChange={e => setNoteNumber(e.target.value)} /></div>
            <div><label className={labelClass}>Date</label><input className={inputClass} type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} /></div>
            <div>
              <label className={labelClass}>Party</label>
              {noteType.partyType === 'customer' ? (
                <select className={inputClass} value={customerId} onChange={e => {
                  const c = customers.find(x => x.id === e.target.value);
                  if (!c) {
                    setCustomerId('');
                    return;
                  }
                  applyPartyGst(
                    { name: c.organizationName, gstNumber: c.gstNumber, state: c.state },
                    () => {
                      setCustomerId(c.id);
                      setPartyName(c.organizationName);
                      if (!editingId) setDiscountPercent(String(partyDhara(c) || ''));
                    }
                  );
                }}>
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.organizationName}</option>)}
                </select>
              ) : (
                <select className={inputClass} value={supplierId} onChange={e => {
                  const s = suppliers.find(x => x.id === e.target.value);
                  if (!s) {
                    setSupplierId('');
                    return;
                  }
                  applyPartyGst(
                    { name: s.name, gstNumber: s.gstNumber, state: s.state },
                    () => {
                      setSupplierId(s.id);
                      setPartyName(s.name);
                      if (!editingId) setDiscountPercent(String(partyDhara(s) || ''));
                    }
                  );
                }}>
                  <option value="">Select supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
            <div><label className={labelClass}>Party name</label><input className={inputClass} value={partyName} onChange={e => setPartyName(e.target.value)} /></div>
            <div>
              <label className={labelClass}>Place of Supply</label>
              <select className={inputClass} value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}>
                <option value="">Select state</option>
                {INDIAN_STATES.map(state => <option key={state} value={state}>{state}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>GST Type</label>
              <GstTypeSelect
                className={inputClass}
                value={gstType}
                onChange={value => {
                  setGstTouched(true);
                  setGstType(value);
                  if (isNonGstType(value)) setGstRate('0');
                  else if (!toNum(gstRate)) {
                    const seriesRate = postingGstRate(noteType.series);
                    if (seriesRate != null) setGstRate(String(seriesRate));
                  }
                }}
              />
            </div>
            <div className="relative">
              <label className={labelClass}>Ref Bill No.</label>
              <input
                className={inputClass}
                placeholder={partyName.trim() ? 'Type to pick bill…' : 'Select party first'}
                value={refBillQuery}
                disabled={!partyName.trim()}
                onFocus={() => setRefPickerOpen(true)}
                onBlur={() => window.setTimeout(() => setRefPickerOpen(false), 150)}
                onChange={e => {
                  setRefBillQuery(e.target.value);
                  setRefBillNumber(e.target.value);
                  setRefPickerOpen(true);
                }}
              />
              {refPickerOpen && partyName.trim() && (
                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-white shadow-lg">
                  {billMatches.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-gray-500">No matching bills for this party.</div>
                  ) : billMatches.map(bill => (
                    <button
                      key={`${bill.billType}-${bill.billId}`}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-indigo-50"
                      onMouseDown={ev => {
                        ev.preventDefault();
                        pickBill(bill);
                      }}
                    >
                      <span className="font-black">{bill.billNumber}</span>
                      <span>{bill.billDate ? new Date(bill.billDate).toLocaleDateString('en-IN') : ''} · {bill.transactionType || 'Bill'} · {(bill.pendingAmount || 0).toLocaleString('en-IN')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div><label className={labelClass}>Ref Bill Date</label><input className={inputClass} type="date" value={refBillDate} onChange={e => setRefBillDate(e.target.value)} /></div>
            <div><label className={labelClass}>Challan No.</label><input className={inputClass} value={challanNumber} onChange={e => setChallanNumber(e.target.value)} /></div>
            <div>
              <label className={labelClass}>{noteType.noteSide === 'sales' ? 'Sale A/C' : 'Pur A/C'}</label>
              <input className={inputClass} readOnly value={saleOrPurAccount || saleAccount} />
            </div>
            <div><label className={labelClass}>Pur Type</label><input className={inputClass} value={purchaseType} onChange={e => setPurchaseType(e.target.value)} /></div>
            <div>
              <label className={labelClass}>Adjust Bill No.</label>
              <select
                className={inputClass}
                value={adjustBillNumber}
                onChange={e => {
                  const bill = pendingBills.find(b => String(b.billNumber) === e.target.value);
                  setAdjustBillNumber(e.target.value);
                  setAdjustBillId(bill?.billId || '');
                  if (bill && !refBillNumber) {
                    setRefBillNumber(bill.billNumber);
                    setRefBillQuery(bill.billNumber);
                    setRefBillDate(isoDate(bill.billDate));
                  }
                }}
              >
                <option value="">Select bill</option>
                {pendingBills.map(b => (
                  <option key={`${b.billType}-${b.billId}`} value={b.billNumber}>
                    {b.billNumber} · {b.transactionType || 'Bill'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Amount Details</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div><label className={labelClass}>Pcs.</label><input className={inputClass} type="number" value={pieces} onChange={e => setPieces(e.target.value)} /></div>
            <div><label className={labelClass}>Mts. / Qty.</label><input className={inputClass} type="number" value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
            <div><label className={labelClass}>Gross Amt.</label><input className={inputClass} type="number" value={grossAmount} onChange={e => { taxableEdited.current = false; setGrossAmount(e.target.value); }} /></div>
            <div><label className={labelClass}>Disc. %</label><input className={inputClass} type="number" value={discountPercent} onChange={e => { taxableEdited.current = false; setDiscountPercent(e.target.value); }} /></div>
            <div><label className={labelClass}>Disc. Amt.</label><input className={inputClass} type="number" value={discountAmount} onChange={e => { taxableEdited.current = false; setDiscountAmount(e.target.value); }} /></div>
            <div><label className={labelClass}>Oth. Less</label><input className={inputClass} type="number" value={otherLess} onChange={e => { taxableEdited.current = false; setOtherLess(e.target.value); }} /></div>
            <div><label className={labelClass}>Add</label><input className={inputClass} type="number" value={addAmount} onChange={e => { taxableEdited.current = false; setAddAmount(e.target.value); }} /></div>
            <div><label className={labelClass}>Ret. Goods</label><input className={inputClass} type="number" value={returnGoods} onChange={e => { taxableEdited.current = false; setReturnGoods(e.target.value); }} /></div>
            <div><label className={labelClass}>HSN / SAC</label><input className={inputClass} value={hsnSac} onChange={e => setHsnSac(e.target.value)} /></div>
            <div><label className={labelClass}>Taxable</label><input className={inputClass} type="number" value={taxableAmount} onChange={e => { taxableEdited.current = true; setTaxableAmount(e.target.value); }} /></div>
            <div><label className={labelClass}>GST %</label><input className={`${inputClass} ${rule?.singleGstRateForBill ? '' : ''}`} type="number" value={gstRate} onChange={e => setGstRate(e.target.value)} /></div>
            <div><label className={labelClass}>CGST % / Amt</label><div className="grid grid-cols-2 gap-1"><input className={inputClass} readOnly value={cgstRate} /><input className={inputClass} readOnly value={cgstAmount} /></div></div>
            <div><label className={labelClass}>SGST % / Amt</label><div className="grid grid-cols-2 gap-1"><input className={inputClass} readOnly value={sgstRate} /><input className={inputClass} readOnly value={sgstAmount} /></div></div>
            <div><label className={labelClass}>IGST % / Amt</label><div className="grid grid-cols-2 gap-1"><input className={inputClass} readOnly value={igstRate} /><input className={inputClass} readOnly value={igstAmount} /></div></div>
            {tcsAccount ? (
              <div>
                <label className={labelClass}>TCS % / Amt ({tcsAccount})</label>
                <div className="grid grid-cols-2 gap-1">
                  <input className={inputClass} type="number" value={tcsRate} onChange={e => setTcsRate(e.target.value)} />
                  <input className={inputClass} readOnly value={tcsAmount} />
                </div>
              </div>
            ) : null}
            <div><label className={labelClass}>Round Off</label><input className={inputClass} readOnly value={roundOff} /></div>
            <div><label className={labelClass}>Net Amt.</label><input className={inputClass} readOnly value={netAmount} /></div>
            <div><label className={labelClass}>Net Amt. After TDS</label><input className={inputClass} type="number" value={netAmountAfterTds} onChange={e => setNetAmountAfterTds(e.target.value)} /></div>
            <div><label className={labelClass}>Paid Amt.</label><input className={inputClass} type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} /> Paid (Y/N)</label></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={isTally} onChange={e => setIsTally(e.target.checked)} /> Tally</label></div>
          </div>
          {itc ? <p className="mt-3 text-xs font-semibold text-emerald-800">ITC: {itc}</p> : null}
          <div className="mt-4"><label className={labelClass}>Remark</label><textarea className={`${inputClass} min-h-[80px]`} value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
          {editingId && noteType.noteSide === 'sales' && (
            <section className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wide text-indigo-950">E-Invoice</h2>
                  <p className="mt-0.5 text-[11px] font-semibold text-indigo-900">
                    {einvoice && einvoice.status !== 'cancelled'
                      ? `IRN on voucher ${voucherNumber || editingId}. Ack ${einvoice.ackNo || '—'}.`
                      : 'Generate the e-invoice for this sales note. The master class is Credit Note or Debit Note.'}
                  </p>
                  {einvoice?.irn && <p className="mt-1 break-all font-mono text-[10px] font-bold">{einvoice.irn}</p>}
                </div>
                <button type="button" onClick={() => setEinvoiceOpen(true)} className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black uppercase text-white">
                  {einvoice && einvoice.status !== 'cancelled' ? 'View E-Invoice' : 'Generate E-Invoice'}
                </button>
              </div>
            </section>
          )}
          <ErpSaveButton
            saving={saving}
            label={editingId ? `Update ${noteType.label}` : `Save ${noteType.label}`}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
          />
          </div>
          </ErpFormShell>
          {missingGstDialog}
          {einvoiceOpen && editingId && (
            <EinvoiceDialog
              source="note"
              id={editingId}
              docNo={voucherNumber || noteNumber || 'Note'}
              existing={einvoice}
              onClose={() => setEinvoiceOpen(false)}
              onChanged={setEinvoice}
            />
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Saved {noteType.label}</h3>
          <p className="mt-1 text-xs text-gray-500">Click a row to edit.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">V No.</th>
                  <th className="px-3 py-2">Note No.</th>
                  <th className="px-3 py-2">Party</th>
                  <th className="px-3 py-2">Ref Bill</th>
                  <th className="px-3 py-2 text-right">Net Amt.</th>
                </tr>
              </thead>
              <tbody>
                {notes.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No notes yet.</td></tr>
                ) : notes.map(note => (
                  <tr
                    key={note.id}
                    className="cursor-pointer border-t border-gray-100 hover:bg-indigo-50"
                    onClick={() => openNote(note)}
                  >
                    <td className="px-3 py-2.5">{isoDate(note.noteDate)}</td>
                    <td className="px-3 py-2.5 font-bold">{printedNoteVoucher(note.voucherNumber) || note.voucherNumber}</td>
                    <td className="px-3 py-2.5">{note.noteNumber}</td>
                    <td className="px-3 py-2.5">{note.partyName}</td>
                    <td className="px-3 py-2.5">{note.refBillNumber || note.adjustBillNumber || '-'}</td>
                    <td className="px-3 py-2.5 text-right font-bold">{(note.netAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};
