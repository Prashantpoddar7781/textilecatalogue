import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ListOrdered, Loader2 } from 'lucide-react';
import { getGstDocumentType, getItcEligibility, gstReturnSection, postingTdsAccount, postingTdsPercent, resolveDefaultTdsPercent, postingPartyAccountType, postingDiscountAccount } from '../constants/erpTransactionPostingRules';
import { workReceiptsApi } from '../services/api';
import { resolvePartyPan, suggestTdsPercentFromPan } from '../utils/tds';
import { AccountParty, ErpSession, LinkedSourceDocument, WorkLineItem } from '../types';
import { AccountsInformationDialog, AddPartyConfirmDialog } from './AccountsInformationDialog';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (v: string | number) => Number(v) || 0;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const DEFAULT_CUT = 6.3;
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-fuchsia-400';
const readonlyClass = 'w-full rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-2 text-sm font-semibold';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

const calcFresh = (pcs: number, plain: number, sec: number, lost: number, lace: number) =>
  round2(Math.max(0, pcs - plain - sec - lost - lace));

export const WorkReceiptPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const editId = useMemo(() => new URLSearchParams(window.location.search).get('edit'), []);
  const isEditMode = Boolean(editId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingNewParty, setPendingNewParty] = useState('');
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [showAccountsDialog, setShowAccountsDialog] = useState(false);
  const [allowUnknownParty, setAllowUnknownParty] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [transactionTypes, setTransactionTypes] = useState<string[]>([]);
  const [parties, setParties] = useState<Array<{ name: string; gstNumber?: string | null; state?: string | null; brokerName?: string | null; suggestedTdsPercent?: number | null }>>([]);
  const [transactionType, setTransactionType] = useState('WORK REC. BILL');
  const gstDocumentType = getGstDocumentType(transactionType);
  const gstReturn = gstReturnSection(transactionType);
  const itcEligibility = getItcEligibility(transactionType);
  const tdsAccount = postingTdsAccount(transactionType);
  const masterTdsPercent = postingTdsPercent(transactionType);
  const discountAccount = postingDiscountAccount(transactionType);
  const [voucherNo, setVoucherNo] = useState('1');
  const [gstRate, setGstRate] = useState('5');
  const [partyName, setPartyName] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [gstType, setGstType] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [receiptDate, setReceiptDate] = useState(today());
  const [brokerName, setBrokerName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [workType, setWorkType] = useState('');
  const [hsnCode, setHsnCode] = useState('9988');
  const [remarks, setRemarks] = useState('');
  const [billNo, setBillNo] = useState('');
  // One bill may cover several despatch challans.
  const [selectedSources, setSelectedSources] = useState<LinkedSourceDocument[]>([]);
  const [pending, setPending] = useState<LinkedSourceDocument[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [lines, setLines] = useState<WorkLineItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [otherLess, setOtherLess] = useState('');
  const [otherAdd, setOtherAdd] = useState('');
  const [tdsPercent, setTdsPercent] = useState('');
  const [tdsPercentTouched, setTdsPercentTouched] = useState(false);
  const [tdsOnAmt, setTdsOnAmt] = useState('');
  const [tdsAmount, setTdsAmount] = useState('0');
  const [tdsOnAmtTouched, setTdsOnAmtTouched] = useState(false);
  const [grossAmount, setGrossAmount] = useState(0);
  const [invoiceValue, setInvoiceValue] = useState(0);
  const [taxableAmount, setTaxableAmount] = useState(0);
  const [netAfterTds, setNetAfterTds] = useState(0);
  const [cgstAmount, setCgstAmount] = useState('0');
  const [sgstAmount, setSgstAmount] = useState('0');
  const [igstAmount, setIgstAmount] = useState('0');
  const [cgstRate, setCgstRate] = useState('0');
  const [sgstRate, setSgstRate] = useState('0');
  const [igstRate, setIgstRate] = useState('0');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await workReceiptsApi.getMeta();
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        if (!isEditMode) setVoucherNo(String(meta.nextVoucherNo || 1));
        setTransactionTypes(meta.transactionTypes || []);
        if (!isEditMode && meta.transactionTypes?.[0]) setTransactionType(meta.transactionTypes[0]);
        setGstRate(String(meta.defaultGstRate ?? 5));
        setHsnCode(meta.defaultHsnCode || '9988');
        setParties(meta.parties || []);

        if (isEditMode && editId) {
          const { entry, sources } = await workReceiptsApi.getById(editId);
          if (cancelled) return;
          setSelectedSources(sources || []);
          setCompanyName(entry.companyName || meta.companyName || '');
          setTransactionType(entry.transactionType || 'WORK REC. BILL');
          setVoucherNo(String(entry.voucherNo ?? ''));
          setGstRate(String(entry.gstRate ?? 5));
          setPartyName(entry.partyName || '');
          setPartyGstin(entry.partyGstin || '');
          setPlaceOfSupply(entry.placeOfSupply || '');
          setStateCode(entry.stateCode || '');
          setGstType(entry.gstType || '');
          setChallanNo(entry.challanNo || entry.workDespatch?.challanNo || '');
          setReceiptDate(entry.receiptDate ? entry.receiptDate.slice(0, 10) : today());
          setBrokerName(entry.brokerName || '');
          setWorkType(entry.workType || '');
          setHsnCode(entry.hsnCode || '9988');
          setRemarks(entry.remarks || '');
          setBillNo(entry.billNo || '');
          setLines((entry.lineItems || []).map(row => {
            const pcs = toNum(row.pcs);
            const plain = toNum(row.plain);
            const sec = toNum(row.sec);
            const lost = toNum(row.lost);
            const lace = toNum(row.lace);
            const fresh = row.fresh != null ? toNum(row.fresh) : calcFresh(pcs, plain, sec, lost, lace);
            const rate = toNum(row.rate);
            const amount = round2(fresh * rate);
            return {
              ...row,
              pcs,
              cut: toNum(row.cut) || DEFAULT_CUT,
              mtsQty: toNum(row.mtsQty),
              plain,
              sec,
              lost,
              lace,
              fresh,
              rate,
              amount,
              taxableValue: amount,
              fabricRate: toNum(row.fabricRate)
            };
          }));
          setDiscountPercent(String(entry.discountPercent || ''));
          setDiscountAmount(Number(entry.discountAmount) || 0);
          setOtherLess(String(entry.otherLess || ''));
          setOtherAdd(String(entry.otherAdd || ''));
          setGrossAmount(Number(entry.grossAmount) || 0);
          setTaxableAmount(Number(entry.taxableAmount) || 0);
          setInvoiceValue(Number(entry.invoiceValue) || 0);
          setCgstAmount(String(entry.cgstAmount ?? 0));
          setSgstAmount(String(entry.sgstAmount ?? 0));
          setIgstAmount(String(entry.igstAmount ?? 0));
          setCgstRate(String(entry.cgstRate ?? 0));
          setSgstRate(String(entry.sgstRate ?? 0));
          setIgstRate(String(entry.igstRate ?? 0));
          setTdsPercent(entry.tdsPercent ? String(entry.tdsPercent) : '');
          setTdsPercentTouched(Boolean(Number(entry.tdsPercent) > 0));
          const taxable = Number(entry.taxableAmount) || 0;
          const pct = Number(entry.tdsPercent) || 0;
          // Default On Amt = taxable (same as mill). Manual override only after user edits the field.
          setTdsOnAmt(taxable > 0 ? String(taxable) : '');
          setTdsOnAmtTouched(false);
          const tdsAmt = round2(taxable * pct / 100);
          setTdsAmount(String(tdsAmt));
          setNetAfterTds(round2((Number(entry.invoiceValue) || 0) - tdsAmt));
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load work receipt.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [editId, isEditMode]);

  const applyTdsDefaults = (
    type: string,
    opts?: { party?: string; gstin?: string | null; panNumber?: string | null }
  ) => {
    if (tdsPercentTouched) return;
    const name = (opts?.party || partyName).trim().toLowerCase();
    const match = parties.find(p => p.name.toLowerCase() === name);
    const pan = resolvePartyPan({
      panNumber: opts?.panNumber,
      gstNumber: opts?.gstin || match?.gstNumber || partyGstin
    });
    const fromPan = match?.suggestedTdsPercent != null
      ? match.suggestedTdsPercent
      : suggestTdsPercentFromPan(pan);
    const pct = resolveDefaultTdsPercent(type, fromPan);
    setTdsPercent(pct != null ? String(pct) : '');
  };

  const applyPartyDefaults = (name: string) => {
    const match = parties.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
    if (!match) return;
    if (match.gstNumber) setPartyGstin(match.gstNumber);
    if (match.brokerName) setBrokerName(match.brokerName);
    if (match.state) setPlaceOfSupply(match.state);
    applyTdsDefaults(transactionType, { party: name, gstin: match.gstNumber });
  };

  const promptIfNewParty = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (parties.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) return;
    setPendingNewParty(trimmed);
    setShowAddConfirm(true);
  };

  const onPartySaved = (party: AccountParty) => {
    setPartyName(party.name);
    if (party.gstNumber) setPartyGstin(party.gstNumber);
    if (party.brokerName) setBrokerName(party.brokerName);
    if (party.state) setPlaceOfSupply(party.state);
    setAllowUnknownParty(false);
    const pan = resolvePartyPan({ panNumber: party.panNumber, gstNumber: party.gstNumber });
    const suggested = suggestTdsPercentFromPan(pan);
    setParties(prev => {
      if (prev.some(row => row.name.toLowerCase() === party.name.toLowerCase())) return prev;
      return [...prev, {
        name: party.name,
        gstNumber: party.gstNumber,
        state: party.state,
        brokerName: party.brokerName,
        suggestedTdsPercent: suggested
      }];
    });
    applyTdsDefaults(transactionType, {
      party: party.name,
      gstin: party.gstNumber,
      panNumber: party.panNumber
    });
  };

  const loadPending = async () => {
    if (!partyName.trim()) {
      setError('Select / enter party name first, then pick work desp challan.');
      return;
    }
    setPendingLoading(true);
    setError('');
    try {
      const { sources } = await workReceiptsApi.getPendingSources({
        transactionType,
        partyName: partyName.trim(),
        excludeId: editId || undefined
      });
      setPending(sources || []);
      // Pre-tick whatever this bill already covers so editing is additive.
      setChecked(Object.fromEntries(selectedSources.map(source => [source.sourceId, true])));
      setPickerOpen(true);
      if (!sources?.length) setError(`No pending work desp challans for ${partyName.trim()}.`);
    } catch (err: any) {
      setError(err.message || 'Could not load pending despatches.');
    } finally {
      setPendingLoading(false);
    }
  };

  const toggleChecked = (sourceId: string) => {
    setChecked(prev => ({ ...prev, [sourceId]: !prev[sourceId] }));
  };

  const checkedCount = useMemo(() => Object.values(checked).filter(Boolean).length, [checked]);

  /** Pulls the pending lines of every ticked challan into one bill. */
  const applySelectedSources = async () => {
    const ids = Object.entries(checked).filter(([, on]) => on).map(([id]) => id);
    if (!ids.length) {
      setError('Tick at least one challan.');
      return;
    }
    setPendingLoading(true);
    try {
      const { sources, lineItems } = await workReceiptsApi.seedFromSources({
        transactionType,
        sourceDespatchIds: ids,
        excludeId: editId || undefined
      });
      const primary = sources[0];
      setSelectedSources(sources);
      if (primary) {
        setPartyName(primary.partyName || '');
        setPartyGstin(primary.partyGstin || '');
        setBrokerName(primary.brokerName || '');
        setWorkType(primary.workType || '');
        applyTdsDefaults(transactionType, {
          party: primary.partyName || '',
          gstin: primary.partyGstin || null
        });
      }
      setChallanNo(sources.map(source => source.documentNo).filter(Boolean).join(', '));
      setLines(lineItems.map(row => {
        const pcs = toNum(row.pcs);
        const cut = toNum(row.cut) || DEFAULT_CUT;
        const mtsQty = toNum(row.mtsQty) || round2(pcs * cut);
        const rate = toNum(row.rate);
        const fresh = pcs;
        const amount = round2(fresh * rate);
        return {
          lineNo: row.lineNo,
          sourceDespatchId: row.sourceDespatchId,
          sourceChallanNo: row.sourceChallanNo,
          sourceLineNo: row.sourceLineNo,
          itemName: row.itemName,
          bundles: row.bundles || 0,
          jobType: row.jobType || 'HAND WORK',
          unit: row.unit || 'PCS',
          pcs,
          cut,
          mtsQty,
          plain: 0,
          sec: 0,
          lost: 0,
          lace: 0,
          fresh,
          rate,
          amount,
          fabricRate: row.fabricRate || 0,
          taxableValue: amount
        };
      }));
      setPickerOpen(false);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not load the picked challans.');
    } finally {
      setPendingLoading(false);
    }
  };

  const updateLine = (index: number, patch: Partial<WorkLineItem>) => {
    setLines(prev => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      const pcs = toNum(next.pcs);
      const cut = toNum(next.cut) || DEFAULT_CUT;
      const mtsQty = patch.mtsQty != null ? toNum(patch.mtsQty) : round2(pcs * cut);
      const plain = toNum(next.plain);
      const sec = toNum(next.sec);
      const lost = toNum(next.lost);
      const lace = toNum(next.lace);
      const fresh = calcFresh(pcs, plain, sec, lost, lace);
      const rate = toNum(next.rate);
      const amount = round2(fresh * rate);
      return {
        ...next,
        pcs,
        cut,
        mtsQty,
        plain,
        sec,
        lost,
        lace,
        fresh,
        rate,
        amount,
        taxableValue: amount,
        fabricRate: toNum(next.fabricRate)
      };
    }));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        if (!lines.length) {
          setGrossAmount(0);
          setTaxableAmount(0);
          setInvoiceValue(0);
          setNetAfterTds(0);
          setTdsAmount('0');
          return;
        }
        try {
          const { totals } = await workReceiptsApi.calculate({
            lineItems: lines,
            gstRate: toNum(gstRate),
            partyGstin,
            placeOfSupply,
            stateCode,
            discountPercent: discountPercent || undefined,
            otherLess: toNum(otherLess),
            otherAdd: toNum(otherAdd),
            tdsPercent: toNum(tdsPercent),
            // Only send On Amt when user manually overrode; else backend uses taxable
            tdsOnAmt: tdsOnAmtTouched && toNum(tdsOnAmt) > 0 ? toNum(tdsOnAmt) : undefined
          });
          setGrossAmount(Number(totals.grossAmount) || 0);
          setDiscountAmount(Number(totals.discountAmount) || 0);
          setTaxableAmount(Number(totals.taxableAmount) || 0);
          setInvoiceValue(Number(totals.invoiceValue) || 0);
          setNetAfterTds(Number(totals.netAfterTds) || Number(totals.invoiceValue) || 0);
          setCgstAmount(String(totals.cgstAmount ?? 0));
          setSgstAmount(String(totals.sgstAmount ?? 0));
          setIgstAmount(String(totals.igstAmount ?? 0));
          setCgstRate(String(totals.cgstRate ?? 0));
          setSgstRate(String(totals.sgstRate ?? 0));
          setIgstRate(String(totals.igstRate ?? 0));
          setTdsAmount(String(totals.tdsAmount ?? 0));
          if (!tdsOnAmtTouched && Number(totals.taxableAmount) > 0) {
            setTdsOnAmt(String(totals.tdsOnAmt ?? totals.taxableAmount));
          }
          setGstType(String(totals.gstTypeLabel || totals.gstType || ''));
          if (totals.placeOfSupply) setPlaceOfSupply(String(totals.placeOfSupply));
          if (totals.stateCode) setStateCode(String(totals.stateCode));
        } catch {
          const gross = round2(lines.reduce((s, r) => s + toNum(r.amount), 0));
          setGrossAmount(gross);
          setTaxableAmount(gross);
          setInvoiceValue(gross);
          setNetAfterTds(gross);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [lines, gstRate, partyGstin, placeOfSupply, stateCode, discountPercent, otherLess, otherAdd, tdsPercent, tdsOnAmt, tdsOnAmtTouched]);

  // Instant TDS when On Amt / % / bill change (same as mill receipt)
  useEffect(() => {
    const base = tdsOnAmtTouched && toNum(tdsOnAmt) > 0
      ? toNum(tdsOnAmt)
      : taxableAmount;
    const pct = toNum(tdsPercent);
    const amt = round2(base * pct / 100);
    setTdsAmount(String(amt));
    setNetAfterTds(round2(invoiceValue - amt));
    if (pct > 0 && !tdsOnAmtTouched && taxableAmount > 0) {
      setTdsOnAmt(String(taxableAmount));
    }
  }, [tdsOnAmt, tdsPercent, taxableAmount, invoiceValue, tdsOnAmtTouched]);

  const totals = useMemo(() => ({
    pcs: round2(lines.reduce((s, r) => s + toNum(r.pcs), 0)),
    mts: round2(lines.reduce((s, r) => s + toNum(r.mtsQty), 0)),
    fresh: round2(lines.reduce((s, r) => s + toNum(r.fresh), 0)),
    amount: round2(lines.reduce((s, r) => s + toNum(r.amount), 0))
  }), [lines]);

  const buildPayload = () => ({
    sourceDespatchIds: selectedSources.map(source => source.sourceId),
    companyName,
    transactionType,
    partyName: partyName.trim(),
    partyGstin: partyGstin || undefined,
    placeOfSupply: placeOfSupply || undefined,
    stateCode: stateCode || undefined,
    challanNo: challanNo || undefined,
    voucherNo: toNum(voucherNo),
    receiptDate,
    brokerName: brokerName || undefined,
    vehicleNo: vehicleNo || undefined,
    workType: workType || undefined,
    hsnCode,
    remarks: remarks || undefined,
    billNo: billNo || undefined,
    gstRate: toNum(gstRate),
    discountPercent: toNum(discountPercent),
    otherLess: toNum(otherLess),
    otherAdd: toNum(otherAdd),
    tdsPercent: toNum(tdsPercent),
    tdsOnAmt: tdsOnAmtTouched && toNum(tdsOnAmt) > 0
      ? toNum(tdsOnAmt)
      : (taxableAmount || undefined),
    lineItems: lines,
    grossAmount,
    taxableAmount
  });

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!selectedSources.length) throw new Error('Pick at least one work desp challan for this party.');
      if (!partyName.trim()) throw new Error('Party is required.');
      if (!parties.some(p => p.name.toLowerCase() === partyName.trim().toLowerCase()) && !allowUnknownParty) {
        promptIfNewParty(partyName);
        return;
      }
      if (!lines.length) throw new Error('Add received lines.');
      if (isEditMode && editId) {
        await workReceiptsApi.update(editId, buildPayload());
        setSuccess('Work receipt updated. Ledger reflects EMB JOB CHARGES.');
      } else {
        await workReceiptsApi.create(buildPayload());
        setSuccess('Work receipt saved. Ledger posted as EMB JOB CHARGES.');
        const meta = await workReceiptsApi.getMeta();
        setVoucherNo(String(meta.nextVoucherNo || 1));
        setSelectedSources([]);
        setChecked({});
        setChallanNo('');
        setLines([]);
        setRemarks('');
        setBillNo('');
        setDiscountPercent('');
        setOtherLess('');
        setOtherAdd('');
        setTdsPercent('');
        setTdsOnAmt('');
        setTdsOnAmtTouched(false);
        setGrossAmount(0);
        setInvoiceValue(0);
        setTaxableAmount(0);
        setNetAfterTds(0);
      }
    } catch (err: any) {
      setError(err.message || 'Could not save work receipt.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB]">
        <Loader2 className="h-8 w-8 animate-spin text-fuchsia-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Work Receipt" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => { window.location.href = '/erp/reports/work-receipt'; }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase text-fuchsia-800">
              Work Recpt Report
            </button>
            <button type="button" onClick={() => void loadPending()} className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-700 px-3 py-2 text-xs font-black uppercase text-white">
              <ListOrdered className="h-3.5 w-3.5" /> Pick Desp Challan
            </button>
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}

        <ErpFormShell onSave={() => void handleSave()} saving={saving}>
          <section className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/40 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-lg font-black uppercase tracking-wide text-gray-900">
                Work Rec. Bill {isEditMode ? '· Edit' : '· Add Mode'}
              </h1>
              <span className="rounded-full bg-fuchsia-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-fuchsia-800">
                Posts EMB JOB CHARGES
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
              <label><span className={labelClass}>Company</span><input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} /></label>
              <label>
                <span className={labelClass}>Type</span>
                <select
                  className={inputClass}
                  value={transactionType}
                  onChange={e => {
                    const next = e.target.value;
                    setTransactionType(next);
                    applyTdsDefaults(next, { party: partyName, gstin: partyGstin });
                  }}
                >
                  {transactionTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label><span className={labelClass}>Voucher</span><input className={readonlyClass} value={voucherNo} readOnly /></label>
              <label><span className={labelClass}>Date</span><input type="date" className={inputClass} value={receiptDate} onChange={e => setReceiptDate(e.target.value)} /></label>
              <label className="md:col-span-2">
                <span className={labelClass}>Party</span>
                <input
                  className={inputClass}
                  list="work-rec-parties"
                  value={partyName}
                  onChange={e => {
                    setPartyName(e.target.value);
                    setAllowUnknownParty(false);
                    applyPartyDefaults(e.target.value);
                  }}
                  onBlur={e => promptIfNewParty(e.target.value)}
                />
                <datalist id="work-rec-parties">
                  {parties.map(p => <option key={p.name} value={p.name} />)}
                </datalist>
              </label>
              <label>
                <span className={labelClass}>
                  Pick (Desp Challan){selectedSources.length > 1 ? ` · ${selectedSources.length}` : ''}
                </span>
                <button type="button" onClick={() => void loadPending()} className={`${inputClass} truncate text-left text-fuchsia-800`}>
                  {challanNo || 'Select work desp challan…'}
                </button>
              </label>
              <label><span className={labelClass}>Bill No.</span><input className={inputClass} value={billNo} onChange={e => setBillNo(e.target.value)} /></label>
              <label><span className={labelClass}>Work Type</span><input className={inputClass} value={workType} onChange={e => setWorkType(e.target.value)} /></label>
              <label><span className={labelClass}>Broker</span><input className={inputClass} value={brokerName} onChange={e => setBrokerName(e.target.value)} /></label>
              <label><span className={labelClass}>Vehicle No.</span><input className={inputClass} value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} /></label>
              <label><span className={labelClass}>Party GSTIN</span><input className={inputClass} value={partyGstin} onChange={e => setPartyGstin(e.target.value)} /></label>
              <label><span className={labelClass}>GST Type</span><input className={readonlyClass} value={gstType || '-'} readOnly /></label>
              <label className="md:col-span-2">
                <span className={labelClass}>GST Document{gstReturn !== 'NONE' ? ` · ${gstReturn}` : ''}{itcEligibility ? ` · ITC ${itcEligibility}` : ''}</span>
                <input className={readonlyClass} value={gstDocumentType || '—'} readOnly />
              </label>
              <label><span className={labelClass}>GST %</span><input className={inputClass} type="number" value={gstRate} onChange={e => setGstRate(e.target.value)} /></label>
              <label><span className={labelClass}>HSN</span><input className={inputClass} value={hsnCode} onChange={e => setHsnCode(e.target.value)} /></label>
              <label className="md:col-span-2"><span className={labelClass}>Remark</span><input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
            </div>

            {selectedSources.length > 1 && (
              <div className="mt-3 rounded-xl border border-fuchsia-200 bg-white p-3">
                <p className={labelClass}>This bill covers {selectedSources.length} desp challans</p>
                <div className="flex flex-wrap gap-2">
                  {selectedSources.map(source => {
                    const billed = lines
                      .filter(line => line.sourceDespatchId === source.sourceId)
                      .reduce((sum, line) => sum + toNum(line.pcs), 0);
                    return (
                      <span
                        key={source.sourceId}
                        className="rounded-lg bg-fuchsia-50 px-2.5 py-1 text-[11px] font-bold text-fuchsia-900"
                        title={`${source.pendingPcs} pcs pending on this challan`}
                      >
                        {source.documentNo || source.sourceId} · {round2(billed)} pcs
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b bg-fuchsia-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-fuchsia-800">
              Particulars · Fresh = Pcs − (plain + sec + lost + lace) · Amount = Fresh × Rate
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Challan</th>
                    <th className="px-2 py-2">Ref / Item</th>
                    <th className="px-2 py-2">Job Type</th>
                    <th className="px-2 py-2 text-right">Pcs</th>
                    <th className="px-2 py-2 text-right">Cut</th>
                    <th className="px-2 py-2 text-right">Mts</th>
                    <th className="px-2 py-2 text-right">Plain</th>
                    <th className="px-2 py-2 text-right">Sec</th>
                    <th className="px-2 py-2 text-right">Lost</th>
                    <th className="px-2 py-2 text-right">Lace</th>
                    <th className="px-2 py-2 text-right">Fresh</th>
                    <th className="px-2 py-2 text-right">Rate</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {!lines.length && (
                    <tr><td colSpan={13} className="px-4 py-8 text-center text-sm text-gray-500">Select party, then pick one or more work desp challans to load pcs / rate / cut / mts.</td></tr>
                  )}
                  {lines.map((line, index) => (
                    <tr key={index} className="border-b">
                      <td className="px-2 py-2 text-[11px] font-bold text-fuchsia-800">{line.sourceChallanNo || '-'}</td>
                      <td className="px-2 py-2 font-semibold">{line.itemName}</td>
                      <td className="px-2 py-2">{line.jobType}</td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" value={line.pcs || ''} onChange={e => updateLine(index, { pcs: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.cut} onChange={e => updateLine(index, { cut: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.mtsQty || ''} onChange={e => updateLine(index, { mtsQty: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.plain || ''} onChange={e => updateLine(index, { plain: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.sec || ''} onChange={e => updateLine(index, { sec: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.lost || ''} onChange={e => updateLine(index, { lost: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.lace || ''} onChange={e => updateLine(index, { lace: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2 text-right font-black text-emerald-800">{toNum(line.fresh).toFixed(2)}</td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.rate || ''} onChange={e => updateLine(index, { rate: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2 text-right font-black">{toNum(line.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 border-t px-4 py-3 md:grid-cols-4 xl:grid-cols-8">
              <div><span className={labelClass}>Pcs</span><input className={readonlyClass} value={totals.pcs} readOnly /></div>
              <div><span className={labelClass}>Mts</span><input className={readonlyClass} value={totals.mts.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>Fresh</span><input className={readonlyClass} value={totals.fresh.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>Gross</span><input className={readonlyClass} value={grossAmount.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>Disc %</span><input className={inputClass} type="number" step="0.01" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} /></div>
              <div><span className={labelClass}>Disc Amt</span><input className={readonlyClass} value={discountAmount.toFixed(2)} readOnly /></div>
              {discountAccount && (
                <div><span className={labelClass}>Disc A/C</span><input className={readonlyClass} value={discountAccount} readOnly /></div>
              )}
              <div><span className={labelClass}>Other Less</span><input className={inputClass} type="number" step="0.01" value={otherLess} onChange={e => setOtherLess(e.target.value)} /></div>
              <div><span className={labelClass}>Other Add</span><input className={inputClass} type="number" step="0.01" value={otherAdd} onChange={e => setOtherAdd(e.target.value)} /></div>
            </div>
            <div className="grid gap-3 border-t bg-slate-50 px-4 py-3 md:grid-cols-4 xl:grid-cols-8">
              <div><span className={labelClass}>Taxable</span><input className={readonlyClass} value={taxableAmount.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>CGST {cgstRate}%</span><input className={readonlyClass} value={cgstAmount} readOnly /></div>
              <div><span className={labelClass}>SGST {sgstRate}%</span><input className={readonlyClass} value={sgstAmount} readOnly /></div>
              <div><span className={labelClass}>IGST {igstRate}%</span><input className={readonlyClass} value={igstAmount} readOnly /></div>
              <div>
                <span className={labelClass}>TDS A/C</span>
                <input className={readonlyClass} value={tdsAccount || '—'} readOnly />
              </div>
              <div>
                <span className={labelClass}>TDS %</span>
                <input
                  className={inputClass}
                  type="number"
                  step="0.001"
                  value={tdsPercent}
                  onChange={e => {
                    setTdsPercentTouched(true);
                    setTdsPercent(e.target.value);
                  }}
                  placeholder={tdsAccount ? 'Auto from master / PAN' : '—'}
                />
                {!tdsPercentTouched && masterTdsPercent != null && (
                  <p className="mt-1 text-[10px] font-semibold text-fuchsia-700">
                    Auto from Transaction Types → {masterTdsPercent}%
                  </p>
                )}
                {!tdsPercentTouched && masterTdsPercent == null && (() => {
                  const match = parties.find(p => p.name.toLowerCase() === partyName.trim().toLowerCase());
                  const panRate = match?.suggestedTdsPercent != null
                    ? match.suggestedTdsPercent
                    : suggestTdsPercentFromPan(resolvePartyPan({ gstNumber: partyGstin || match?.gstNumber }));
                  if (panRate != null) {
                    return (
                      <p className="mt-1 text-[10px] font-semibold text-fuchsia-700">
                        Auto from PAN → {panRate}%
                      </p>
                    );
                  }
                  if (tdsAccount && partyName.trim()) {
                    return (
                      <p className="mt-1 text-[10px] font-semibold text-amber-700">
                        TDS A/C from master — enter TDS % (no PAN)
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <span className={labelClass}>TDS On Amt</span>
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  value={tdsOnAmt}
                  onChange={e => {
                    setTdsOnAmtTouched(true);
                    setTdsOnAmt(e.target.value);
                  }}
                />
              </div>
              <div><span className={labelClass}>TDS Amt</span><input className={readonlyClass} value={tdsAmount} readOnly /></div>
              <div><span className={labelClass}>Net Amt</span><input className={`${readonlyClass} font-black text-fuchsia-900`} value={netAfterTds.toFixed(2)} readOnly /></div>
            </div>
            <div className="border-t px-4 py-2 text-right text-xs font-bold text-gray-600">
              Bill Amt (before TDS): {invoiceValue.toFixed(2)}
            </div>
          </section>

          <div className="mt-4 flex justify-end">
            <ErpSaveButton saving={saving} label={isEditMode ? 'Update Work Receipt' : 'Save Work Receipt'} />
          </div>
        </ErpFormShell>
      </main>

      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase">Work Desp Challans · {partyName || 'All'}</h3>
                <p className="text-[11px] font-semibold text-gray-500">
                  Tick every challan this bill covers — one bill can cover several challans.
                </p>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-lg border px-3 py-1 text-xs font-bold">Close</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {pendingLoading ? (
                <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b text-[10px] uppercase text-gray-500">
                    <tr>
                      <th className="p-2">
                        <input
                          type="checkbox"
                          checked={pending.length > 0 && checkedCount === pending.length}
                          onChange={e => setChecked(
                            e.target.checked
                              ? Object.fromEntries(pending.map(row => [row.sourceId, true]))
                              : {}
                          )}
                        />
                      </th>
                      <th className="p-2">Chal</th>
                      <th className="p-2">Date</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Work</th>
                      <th className="p-2 text-right">Pend Pcs</th>
                      <th className="p-2 text-right">Pend Mts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map(row => (
                      <tr
                        key={row.sourceId}
                        className={`cursor-pointer border-b hover:bg-fuchsia-50 ${checked[row.sourceId] ? 'bg-fuchsia-50' : ''}`}
                        onClick={() => toggleChecked(row.sourceId)}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={Boolean(checked[row.sourceId])}
                            onChange={() => toggleChecked(row.sourceId)}
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                        <td className="p-2 font-bold">{row.documentNo}</td>
                        <td className="p-2 text-xs">{row.documentDate ? String(row.documentDate).slice(0, 10) : '-'}</td>
                        <td className="p-2 text-xs">{row.sourceSeries || 'WORK DESP CHALLAN'}</td>
                        <td className="p-2">{row.workType || '-'}</td>
                        <td className="p-2 text-right font-bold text-fuchsia-800">{row.pendingPcs}</td>
                        <td className="p-2 text-right font-bold text-fuchsia-800">{row.pendingMts.toFixed(2)}</td>
                      </tr>
                    ))}
                    {!pending.length && (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-500">No pending despatches for this party.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3">
              <span className="text-xs font-bold text-gray-600">
                {checkedCount} challan{checkedCount === 1 ? '' : 's'} ticked ·{' '}
                {round2(pending.filter(row => checked[row.sourceId]).reduce((sum, row) => sum + toNum(row.pendingPcs), 0))} pcs pending
              </span>
              <button
                type="button"
                disabled={!checkedCount || pendingLoading}
                onClick={() => void applySelectedSources()}
                className="rounded-xl bg-fuchsia-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40"
              >
                Add to bill
              </button>
            </div>
          </div>
        </div>
      )}

      <AddPartyConfirmDialog
        open={showAddConfirm}
        partyName={pendingNewParty}
        onNo={() => {
          setShowAddConfirm(false);
          setAllowUnknownParty(true);
        }}
        onYes={() => {
          setShowAddConfirm(false);
          setShowAccountsDialog(true);
        }}
      />
      <AccountsInformationDialog
        open={showAccountsDialog}
        initialName={pendingNewParty}
        context="work"
        suggestedAccountType={postingPartyAccountType(transactionType) || undefined}
        onClose={() => setShowAccountsDialog(false)}
        onSaved={onPartySaved}
      />
    </div>
  );
};
