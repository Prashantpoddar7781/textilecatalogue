import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, ListOrdered, Loader2 } from 'lucide-react';
import { GREY_QUALITY_OPTIONS } from '../constants/greyQualities';
import { getGstDefaultsForTransactionType } from '../constants/erpTransactionTypes';
import { greyPurchasesApi, purchasesApi } from '../services/api';
import { isWrongGstNumber, normalizeGstNumber } from '../services/gstValidation';
import { ErpSession, GreyPurchaseLine, GreyTakaDetailRow, Supplier } from '../types';
import { ErpTopMenu } from './ErpTopMenu';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';
import { TakaDetailsModal } from './TakaDetailsModal';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (v: string | number) => Number(v) || 0;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const money = (v: number) => round2(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const calcInputClass = 'w-full rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-sm font-bold outline-none focus:border-violet-400';

export const GreyPurchasePage: React.FC<Props> = ({ onBack, erpSession }) => {
  const editId = useMemo(() => new URLSearchParams(window.location.search).get('edit'), []);
  const isEditMode = Boolean(editId);

  const [companyName, setCompanyName] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [states, setStates] = useState<string[]>([]);
  const [stateCodes, setStateCodes] = useState<Array<{ code: string; name: string }>>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [partyMsme, setPartyMsme] = useState('');
  const [gstFromMaster, setGstFromMaster] = useState(false);
  const [quality, setQuality] = useState('');
  const [srNo, setSrNo] = useState('1');
  const [orderNo, setOrderNo] = useState('0');
  const [hsnCode, setHsnCode] = useState('');
  const [billNo, setBillNo] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [checkerName, setCheckerName] = useState('');
  const [recTaka, setRecTaka] = useState('');
  const [recMts, setRecMts] = useState('');
  const [purRate, setPurRate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [grossAmount, setGrossAmount] = useState(0);
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxableBeforeOther, setTaxableBeforeOther] = useState(0);
  const [otherAddBefore, setOtherAddBefore] = useState('');
  const [otherLessBefore, setOtherLessBefore] = useState('');
  const [taxableAmount, setTaxableAmount] = useState(0);
  const [stateCode, setStateCode] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [gstTypeLabel, setGstTypeLabel] = useState('');
  const [gstRate, setGstRate] = useState('5');
  const [cgstRate, setCgstRate] = useState('0');
  const [cgstAmount, setCgstAmount] = useState('0');
  const [sgstRate, setSgstRate] = useState('0');
  const [sgstAmount, setSgstAmount] = useState('0');
  const [igstRate, setIgstRate] = useState('0');
  const [igstAmount, setIgstAmount] = useState('0');
  const [payableAmount, setPayableAmount] = useState(0);
  const [otherAddAfter, setOtherAddAfter] = useState('');
  const [otherLessAfter, setOtherLessAfter] = useState('');
  const [netAmount, setNetAmount] = useState(0);
  const [paid, setPaid] = useState(false);
  const [paidDate, setPaidDate] = useState('');
  const [despatchMts, setDespatchMts] = useState('0');
  const [takaDetails, setTakaDetails] = useState<GreyTakaDetailRow[]>([]);
  const [takaModalOpen, setTakaModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const gstInvalid = isWrongGstNumber(partyGstin);
  const needsManualState = !normalizeGstNumber(partyGstin) && !placeOfSupply;

  // Gross = Rec. Mts × Pur Rate (taka is count of pieces making up those meters)
  useEffect(() => {
    setGrossAmount(round2(toNum(recMts) * toNum(purRate)));
  }, [recMts, purRate]);

  // Disc amt auto from disc %
  useEffect(() => {
    const pct = toNum(discountPercent);
    setDiscountAmount(round2(grossAmount * pct / 100));
  }, [discountPercent, grossAmount]);

  const itemLines: GreyPurchaseLine[] = useMemo(() => {
    const lineGross = grossAmount;
    const lineNet = netAmount;
    if (!quality && !toNum(recTaka) && !toNum(recMts) && !lineGross) {
      return [];
    }
    return [{
      quality: quality || '-',
      taka: toNum(recTaka),
      mts: toNum(recMts),
      rate: toNum(purRate),
      grossAmount: lineGross,
      netAmount: lineNet,
      remark: remarks || null
    }];
  }, [quality, recTaka, recMts, purRate, grossAmount, netAmount, remarks]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [meta, suppliersRes] = await Promise.all([
          greyPurchasesApi.getMeta(),
          purchasesApi.getSuppliers()
        ]);
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        setBusinessState(meta.businessState || '');
        setStates(meta.states || []);
        setStateCodes(meta.stateCodes || []);
        if (!isEditMode) setSrNo(String(meta.nextSrNo || 1));
        if (!isEditMode) {
          const d = getGstDefaultsForTransactionType(
            'GREY PURCHASE',
            meta.defaultGstRate ?? 5,
            meta.defaultHsnCode || '5407'
          );
          setHsnCode(d.hsnCode);
          setGstRate(String(d.gstRate));
        }
        setPlaceOfSupply(meta.businessState || '');
        setSuppliers(suppliersRes.suppliers || []);

        if (isEditMode && editId) {
          const { entry } = await greyPurchasesApi.getById(editId);
          if (cancelled) return;
          setCompanyName(entry.companyName || meta.companyName || '');
          setSupplierId(entry.supplierId || '');
          setPartyName(entry.partyName);
          setPartyGstin(entry.partyGstin || '');
          setPartyMsme(entry.partyMsme || '');
          setQuality(entry.quality || '');
          setSrNo(String(entry.srNo ?? ''));
          setOrderNo(entry.orderNo || '0');
          setHsnCode(entry.hsnCode || meta.defaultHsnCode || '');
          setBillNo(entry.billNo || '');
          setBrokerName(entry.brokerName || '');
          setBillDate(entry.billDate ? entry.billDate.slice(0, 10) : today());
          setCheckerName(entry.checkerName || '');
          setRecTaka(String(entry.recTaka || ''));
          setRecMts(String(entry.recMts || ''));
          setPurRate(String(entry.purRate || ''));
          setRemarks(entry.remarks || '');
          setDiscountPercent(String(entry.discountPercent || ''));
          setOtherAddBefore(String(entry.otherAddBefore || ''));
          setOtherLessBefore(String(entry.otherLessBefore || ''));
          setOtherAddAfter(String(entry.otherAddAfter || ''));
          setOtherLessAfter(String(entry.otherLessAfter || ''));
          setStateCode(entry.stateCode || '');
          setPlaceOfSupply(entry.placeOfSupply || meta.businessState || '');
          setGstRate(String(entry.gstRate ?? 5));
          setPaid(entry.paid);
          setPaidDate(entry.paidDate ? entry.paidDate.slice(0, 10) : '');
          setDespatchMts(String(entry.despatchMts || '0'));
          setTakaDetails(Array.isArray(entry.takaDetails) ? entry.takaDetails : []);
          if (entry.supplierId) {
            const match = (suppliersRes.suppliers || []).find(s => s.id === entry.supplierId);
            if (match?.gstNumber) setGstFromMaster(true);
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load grey purchase.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [editId, isEditMode]);

  const applyParty = (supplier: Supplier | null) => {
    if (!supplier) {
      setSupplierId('');
      setGstFromMaster(false);
      return;
    }
    setSupplierId(supplier.id);
    setPartyName(supplier.name);
    if (supplier.gstNumber) {
      setPartyGstin(supplier.gstNumber);
      setGstFromMaster(true);
      const code = supplier.gstNumber.replace(/[^0-9A-Za-z]/g, '').slice(0, 2);
      setStateCode(code);
      const matched = stateCodes.find(s => s.code === code);
      if (matched) setPlaceOfSupply(matched.name);
      else if (supplier.state) setPlaceOfSupply(supplier.state);
    } else {
      setGstFromMaster(false);
      if (supplier.state) {
        setPlaceOfSupply(supplier.state);
        const matched = stateCodes.find(s => s.name.toLowerCase() === supplier.state!.toLowerCase());
        if (matched) setStateCode(matched.code);
      }
    }
    if (supplier.msmeType) setPartyMsme(supplier.msmeType);
  };

  const recalculate = useCallback(async () => {
    try {
      const { totals } = await greyPurchasesApi.calculate({
        grossAmount,
        discountPercent: toNum(discountPercent),
        discountAmount,
        otherAddBefore: toNum(otherAddBefore),
        otherLessBefore: toNum(otherLessBefore),
        otherAddAfter: toNum(otherAddAfter),
        otherLessAfter: toNum(otherLessAfter),
        gstRate: toNum(gstRate),
        placeOfSupply,
        stateCode,
        partyGstin,
        supplierState: placeOfSupply
      });
      setTaxableBeforeOther(Number(totals.taxableBeforeOther ?? totals.taxableAmount ?? 0));
      setTaxableAmount(Number(totals.taxableAmount ?? 0));
      if (totals.stateCode) setStateCode(String(totals.stateCode));
      if (totals.placeOfSupply) setPlaceOfSupply(String(totals.placeOfSupply));
      setGstTypeLabel(String(totals.gstTypeLabel || totals.gstType || ''));
      setCgstRate(String(totals.cgstRate ?? 0));
      setCgstAmount(String(totals.cgstAmount ?? 0));
      setSgstRate(String(totals.sgstRate ?? 0));
      setSgstAmount(String(totals.sgstAmount ?? 0));
      setIgstRate(String(totals.igstRate ?? 0));
      setIgstAmount(String(totals.igstAmount ?? 0));
      setPayableAmount(Number(totals.payableAmount ?? 0));
      setNetAmount(Number(totals.netAmount ?? 0));
    } catch {
      // keep current values
    }
  }, [
    discountAmount, discountPercent, grossAmount, gstRate, otherAddAfter, otherAddBefore,
    otherLessAfter, otherLessBefore, partyGstin, placeOfSupply, stateCode
  ]);

  useEffect(() => {
    const timer = setTimeout(() => { void recalculate(); }, 250);
    return () => clearTimeout(timer);
  }, [recalculate]);

  const onStateCodeChange = (code: string) => {
    setStateCode(code);
    const matched = stateCodes.find(s => s.code === code);
    if (matched) setPlaceOfSupply(matched.name);
  };

  const onPlaceOfSupplyChange = (name: string) => {
    setPlaceOfSupply(name);
    const matched = stateCodes.find(s => s.name === name);
    if (matched) setStateCode(matched.code);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!partyName.trim()) {
        setError('Party A/C is required.');
        setSaving(false);
        return;
      }
      if (needsManualState) {
        setError('Select state / GST type source: party GSTIN or state.');
        setSaving(false);
        return;
      }
      const payload = {
        companyName,
        supplierId: supplierId || undefined,
        partyName: partyName.trim(),
        partyGstin: normalizeGstNumber(partyGstin) || undefined,
        partyMsme: partyMsme || undefined,
        quality,
        srNo: toNum(srNo),
        orderNo,
        hsnCode,
        billNo,
        brokerName,
        billDate,
        checkerName,
        recTaka: toNum(recTaka),
        recMts: toNum(recMts),
        purRate: toNum(purRate),
        takaDetails,
        lineItems: itemLines,
        grossAmount,
        discountPercent: toNum(discountPercent),
        discountAmount,
        otherAddBefore: toNum(otherAddBefore),
        otherLessBefore: toNum(otherLessBefore),
        otherAddAfter: toNum(otherAddAfter),
        otherLessAfter: toNum(otherLessAfter),
        placeOfSupply,
        stateCode,
        gstRate: toNum(gstRate),
        paid,
        paidDate: paidDate || undefined,
        despatchMts: toNum(despatchMts),
        remarks
      };

      if (isEditMode && editId) {
        await greyPurchasesApi.update(editId, payload);
        setSuccess('Grey purchase updated.');
      } else {
        await greyPurchasesApi.create(payload);
        setSuccess('Grey purchase saved and posted to godown inventory.');
        setBillNo('');
        setRecTaka('');
        setRecMts('');
        setPurRate('');
        setDiscountPercent('');
        setOtherAddBefore('');
        setOtherLessBefore('');
        setOtherAddAfter('');
        setOtherLessAfter('');
        setRemarks('');
        setQuality('');
        setTakaDetails([]);
        const meta = await greyPurchasesApi.getMeta();
        setSrNo(String(meta.nextSrNo || 1));
      }
    } catch (err: any) {
      setError(err.message || 'Could not save grey purchase.');
    } finally {
      setSaving(false);
    }
  };

  const isLocal = gstTypeLabel === 'Local Tax' || gstTypeLabel === 'CGST+SGST';

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu
        title="Grey Purchase Entry"
        erpSession={erpSession}
        onBackToCatalogue={() => { window.location.href = '/'; }}
      />

      <main className="mx-auto max-w-[1400px] px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            ERP
          </button>
          <p className="text-xs font-black uppercase tracking-wide text-violet-700">
            {isEditMode ? 'Edit Grey Purchase' : 'Grey Purchase'}
          </p>
        </div>

        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
        {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : (
          <>
          <ErpFormShell onSave={handleSave} saving={saving} className="space-y-4">
            <form onSubmit={e => e.preventDefault()} className="space-y-4">
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                <label className="xl:col-span-2">
                  <span className={labelClass}>Company</span>
                  <input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} />
                </label>
                <label className="xl:col-span-2">
                  <span className={labelClass}>Party A/C</span>
                  <input
                    list="grey-party-list"
                    className={inputClass}
                    value={partyName}
                    onChange={e => {
                      const name = e.target.value;
                      setPartyName(name);
                      const match = suppliers.find(s => s.name.toLowerCase() === name.toLowerCase());
                      applyParty(match || null);
                    }}
                    required
                  />
                  <datalist id="grey-party-list">
                    {suppliers.map(s => <option key={s.id} value={s.name} />)}
                  </datalist>
                </label>
                <label>
                  <span className={labelClass}>Quality</span>
                  <select className={inputClass} value={quality} onChange={e => setQuality(e.target.value)}>
                    <option value="">Select quality</option>
                    {quality && !GREY_QUALITY_OPTIONS.includes(quality as typeof GREY_QUALITY_OPTIONS[number]) && (
                      <option value={quality}>{quality}</option>
                    )}
                    {GREY_QUALITY_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={labelClass}>HSN Code</span>
                  <input className={inputClass} value={hsnCode} onChange={e => setHsnCode(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Sr. No.</span>
                  <input className={inputClass} value={srNo} onChange={e => setSrNo(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Order No.</span>
                  <input className={inputClass} value={orderNo} onChange={e => setOrderNo(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Bill No.</span>
                  <input className={inputClass} value={billNo} onChange={e => setBillNo(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Broker</span>
                  <input className={inputClass} value={brokerName} onChange={e => setBrokerName(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Date</span>
                  <input type="date" className={inputClass} value={billDate} onChange={e => setBillDate(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Checker</span>
                  <input className={inputClass} value={checkerName} onChange={e => setCheckerName(e.target.value)} />
                </label>
                <label className="xl:col-span-2">
                  <span className={labelClass}>Party GSTIN {gstFromMaster ? '(from master)' : ''}</span>
                  <input
                    className={`${inputClass} ${gstInvalid ? 'border-amber-400 bg-amber-50' : ''}`}
                    value={partyGstin}
                    onChange={e => {
                      setPartyGstin(e.target.value.toUpperCase());
                      setGstFromMaster(false);
                      const code = e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 2);
                      if (code.length === 2) {
                        setStateCode(code);
                        const matched = stateCodes.find(s => s.code === code);
                        if (matched) setPlaceOfSupply(matched.name);
                      }
                    }}
                    maxLength={15}
                  />
                  {gstInvalid && (
                    <span className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-700">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Wrong GST number
                    </span>
                  )}
                </label>
                <label>
                  <span className={labelClass}>Party MSME</span>
                  <input className={inputClass} value={partyMsme} onChange={e => setPartyMsme(e.target.value)} />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 shadow-sm">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-violet-700">Bill Amount · Calculation Series</p>
              <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                <label>
                  <span className={labelClass}>Rec. Taka</span>
                  <div className="flex gap-1">
                    <input className={calcInputClass} type="number" step="0.01" value={recTaka} onChange={e => setRecTaka(e.target.value)} />
                    <button
                      type="button"
                      onClick={() => setTakaModalOpen(true)}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-violet-300 bg-white px-2 text-[10px] font-black uppercase text-violet-700 hover:bg-violet-100"
                      title="Taka Details"
                    >
                      <ListOrdered className="h-3.5 w-3.5" />
                      Taka
                    </button>
                  </div>
                </label>
                <label>
                  <span className={labelClass}>Rec. Mts.</span>
                  <input className={calcInputClass} type="number" step="0.01" value={recMts} onChange={e => setRecMts(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Pur Rate</span>
                  <input className={calcInputClass} type="number" step="0.01" value={purRate} onChange={e => setPurRate(e.target.value)} />
                </label>
                <label className="md:col-span-2 xl:col-span-2">
                  <span className={labelClass}>Remark</span>
                  <input className={calcInputClass} value={remarks} onChange={e => setRemarks(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>1. Gross Amt</span>
                  <input className={`${calcInputClass} bg-violet-100`} readOnly value={money(grossAmount)} />
                </label>
                <label>
                  <span className={labelClass}>2. Disc %</span>
                  <input className={calcInputClass} type="number" step="0.01" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>2. Disc Amt</span>
                  <input className={`${calcInputClass} bg-violet-100`} readOnly value={money(discountAmount)} />
                </label>
                <label>
                  <span className={labelClass}>3. Taxable Value</span>
                  <input className={calcInputClass} readOnly value={money(taxableBeforeOther)} />
                </label>
                <label>
                  <span className={labelClass}>4. Other Add</span>
                  <input className={calcInputClass} type="number" step="0.01" value={otherAddBefore} onChange={e => setOtherAddBefore(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>4. Other Less</span>
                  <input className={calcInputClass} type="number" step="0.01" value={otherLessBefore} onChange={e => setOtherLessBefore(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Taxable (after add/less)</span>
                  <input className={calcInputClass} readOnly value={money(taxableAmount)} />
                </label>
                <label>
                  <span className={labelClass}>5. State Code</span>
                  <select
                    className={calcInputClass}
                    value={stateCode}
                    onChange={e => onStateCodeChange(e.target.value)}
                    disabled={Boolean(normalizeGstNumber(partyGstin))}
                  >
                    <option value="">Select</option>
                    {stateCodes.map(s => (
                      <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={labelClass}>5. State / Place</span>
                  <select
                    className={calcInputClass}
                    value={placeOfSupply}
                    onChange={e => onPlaceOfSupplyChange(e.target.value)}
                    disabled={Boolean(normalizeGstNumber(partyGstin))}
                  >
                    <option value="">Select state</option>
                    {states.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={labelClass}>5. GST Type</span>
                  <input className={calcInputClass} readOnly value={gstTypeLabel || '-'} />
                </label>
                <label>
                  <span className={labelClass}>GST %</span>
                  <input className={calcInputClass} type="number" step="0.01" value={gstRate} onChange={e => setGstRate(e.target.value)} />
                </label>
                {isLocal || !gstTypeLabel || gstTypeLabel === 'none' ? (
                  <>
                    <label>
                      <span className={labelClass}>6. CGST % / Amt</span>
                      <div className="grid grid-cols-2 gap-1">
                        <input className={calcInputClass} readOnly value={cgstRate} />
                        <input className={calcInputClass} readOnly value={money(toNum(cgstAmount))} />
                      </div>
                    </label>
                    <label>
                      <span className={labelClass}>6. SGST % / Amt</span>
                      <div className="grid grid-cols-2 gap-1">
                        <input className={calcInputClass} readOnly value={sgstRate} />
                        <input className={calcInputClass} readOnly value={money(toNum(sgstAmount))} />
                      </div>
                    </label>
                  </>
                ) : (
                  <label>
                    <span className={labelClass}>6. IGST % / Amt</span>
                    <div className="grid grid-cols-2 gap-1">
                      <input className={calcInputClass} readOnly value={igstRate} />
                      <input className={calcInputClass} readOnly value={money(toNum(igstAmount))} />
                    </div>
                  </label>
                )}
                <label>
                  <span className={labelClass}>7. Payable Amount</span>
                  <input className={calcInputClass} readOnly value={money(payableAmount)} />
                </label>
                <label>
                  <span className={labelClass}>8. Other Add</span>
                  <input className={calcInputClass} type="number" step="0.01" value={otherAddAfter} onChange={e => setOtherAddAfter(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>8. Other Less</span>
                  <input className={calcInputClass} type="number" step="0.01" value={otherLessAfter} onChange={e => setOtherLessAfter(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>9. Net Amount</span>
                  <input className={`${calcInputClass} bg-violet-100`} readOnly value={money(netAmount)} />
                </label>
              </div>
              {needsManualState && (
                <p className="mt-2 text-xs font-bold text-amber-700">No party GSTIN — select state to apply CGST/SGST or IGST.</p>
              )}
              {businessState && placeOfSupply && (
                <p className="mt-2 text-xs text-violet-700">
                  Company state: {businessState} · Party state: {placeOfSupply} → {gstTypeLabel || '—'}
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-gray-900">Items (auto from Rec. details)</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                    <tr>
                      <th className="p-2">Quality</th>
                      <th className="p-2 text-right">Taka</th>
                      <th className="p-2 text-right">Mtrs</th>
                      <th className="p-2 text-right">Gross Amount</th>
                      <th className="p-2 text-right">Net Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemLines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-sm text-gray-400">
                          Enter Rec. Taka, Rec. Mts, Pur Rate and Quality to fill items.
                        </td>
                      </tr>
                    ) : itemLines.map((line, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 font-semibold">{line.quality}</td>
                        <td className="p-2 text-right">{line.taka}</td>
                        <td className="p-2 text-right">{line.mts}</td>
                        <td className="p-2 text-right font-bold">{money(Number(line.grossAmount) || 0)}</td>
                        <td className="p-2 text-right font-bold text-violet-800">{money(Number(line.netAmount) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <label>
                <span className={labelClass}>Paid</span>
                <select className={inputClass} value={paid ? 'Y' : 'N'} onChange={e => setPaid(e.target.value === 'Y')}>
                  <option value="N">N</option>
                  <option value="Y">Y</option>
                </select>
              </label>
              <label>
                <span className={labelClass}>Paid Date</span>
                <input type="date" className={inputClass} value={paidDate} onChange={e => setPaidDate(e.target.value)} />
              </label>
              <label>
                <span className={labelClass}>Despatch Mts.</span>
                <input className={inputClass} value={despatchMts} onChange={e => setDespatchMts(e.target.value)} />
              </label>
              <ErpSaveButton
                saving={saving}
                label={isEditMode ? 'Update Entry' : 'Save to Godown'}
                className="ml-auto flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-black text-white disabled:opacity-60"
              />
            </section>

            </form>
          </ErpFormShell>

          <TakaDetailsModal
            open={takaModalOpen}
            rows={takaDetails}
            onClose={() => setTakaModalOpen(false)}
            onApply={(rows) => {
              setTakaDetails(rows);
              setRecTaka(String(rows.length));
              setRecMts(String(round2(rows.reduce((sum, row) => sum + (Number(row.mts) || 0), 0))));
            }}
          />
          </>
        )}
      </main>
    </div>
  );
};
