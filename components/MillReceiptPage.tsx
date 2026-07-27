import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ListOrdered, Loader2 } from 'lucide-react';
import { millReceiptsApi } from '../services/api';
import { ErpSession, MillPendingDispatch, MillReceiptTakaRow } from '../types';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';
import { ErpTopMenu } from './ErpTopMenu';
import { MillReceiptTakaModal } from './MillReceiptTakaModal';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (v: string | number) => Number(v) || 0;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-teal-400';
const readonlyClass = 'w-full rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-2 text-sm font-semibold';
const calcInputClass = 'w-full rounded-lg border border-teal-200 bg-white px-2.5 py-2 text-sm font-bold outline-none focus:border-teal-500';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

export const MillReceiptPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [companyName, setCompanyName] = useState('');
  const [millName, setMillName] = useState('');
  const [mills, setMills] = useState<string[]>([]);
  const [millParties, setMillParties] = useState<Array<{
    name: string;
    gstNumber?: string | null;
    panNumber?: string | null;
    suggestedTdsPercent?: number | null;
  }>>([]);
  const [tdsPercentTouched, setTdsPercentTouched] = useState(false);
  const [entryType, setEntryType] = useState('JOB WORK');
  const [hsnCode, setHsnCode] = useState('9988');
  const [stateCode, setStateCode] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [gstTypeLabel, setGstTypeLabel] = useState('');
  const [millGstin, setMillGstin] = useState('');
  const [partyMsme, setPartyMsme] = useState('');
  const [voucherNo, setVoucherNo] = useState('1');
  const [receiptDate, setReceiptDate] = useState(today());
  const [billNo, setBillNo] = useState('');
  const [remarks, setRemarks] = useState('');

  const [lotNo, setLotNo] = useState('');
  const [greyDispatchId, setGreyDispatchId] = useState('');
  const [despNo, setDespNo] = useState('');
  const [recChallan, setRecChallan] = useState('');
  const [marka, setMarka] = useState('');
  const [quality, setQuality] = useState('');
  const [printStyle, setPrintStyle] = useState('');
  const [recTaka, setRecTaka] = useState('');
  const [recMts, setRecMts] = useState('');
  const [greyMts, setGreyMts] = useState('');
  const [shortMts, setShortMts] = useState('0');
  const [shortPct, setShortPct] = useState('0');
  const [jobRate, setJobRate] = useState('');
  const [jobAmount, setJobAmount] = useState(0);

  const [rdPerMtr, setRdPerMtr] = useState('');
  const [rdLessAddAmt, setRdLessAddAmt] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [otherLess, setOtherLess] = useState('');
  const [otherAdd, setOtherAdd] = useState('');
  const [gstRate, setGstRate] = useState('5');
  const [cgstRate, setCgstRate] = useState('0');
  const [cgstAmount, setCgstAmount] = useState('0');
  const [sgstRate, setSgstRate] = useState('0');
  const [sgstAmount, setSgstAmount] = useState('0');
  const [igstRate, setIgstRate] = useState('0');
  const [igstAmount, setIgstAmount] = useState('0');
  const [grossAmount, setGrossAmount] = useState(0);
  const [invoiceValue, setInvoiceValue] = useState(0);
  const [taxableAmount, setTaxableAmount] = useState(0);
  const [tdsOnAmt, setTdsOnAmt] = useState('');
  const [tdsPercent, setTdsPercent] = useState('');
  const [tdsAmount, setTdsAmount] = useState('0');
  const [netAfterTds, setNetAfterTds] = useState(0);
  const [tdsOnAmtTouched, setTdsOnAmtTouched] = useState(false);

  const [pendingDispatches, setPendingDispatches] = useState<MillPendingDispatch[]>([]);
  const [availableTakas, setAvailableTakas] = useState<MillReceiptTakaRow[]>([]);
  const [selectedTakaDetails, setSelectedTakaDetails] = useState<MillReceiptTakaRow[]>([]);
  const [despPickerOpen, setDespPickerOpen] = useState(false);
  const [lotPromptOpen, setLotPromptOpen] = useState(false);
  const [lotDraft, setLotDraft] = useState('');
  const [takaModalOpen, setTakaModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dispatchesLoading, setDispatchesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const amt = round2(toNum(recMts) * toNum(jobRate));
    setJobAmount(amt);
    setGrossAmount(round2(amt + toNum(rdLessAddAmt)));
  }, [recMts, jobRate, rdLessAddAmt]);

  useEffect(() => {
    const grey = toNum(greyMts);
    const rec = toNum(recMts);
    const short = round2(Math.max(0, grey - rec));
    setShortMts(String(short));
    setShortPct(String(grey > 0 ? round2((short / grey) * 100) : 0));
  }, [greyMts, recMts]);

  // TDS Amt = TDS On Amt × TDS % (always local, instant)
  useEffect(() => {
    const base = toNum(tdsOnAmt) || taxableAmount;
    const pct = toNum(tdsPercent);
    const amt = round2(base * pct / 100);
    setTdsAmount(String(amt));
    setNetAfterTds(round2(invoiceValue - amt));
  }, [tdsOnAmt, tdsPercent, taxableAmount, invoiceValue]);

  const recalcGst = useCallback(async () => {
    if (!toNum(recMts) && !jobAmount) return;
    try {
      const { totals } = await millReceiptsApi.calculate({
        recMts: toNum(recMts),
        jobRate: toNum(jobRate),
        jobAmount,
        rdLessAddAmt: toNum(rdLessAddAmt),
        grossAmount,
        discountPercent: discountPercent || undefined,
        otherLess: toNum(otherLess),
        otherAdd: toNum(otherAdd),
        gstRate: toNum(gstRate),
        millGstin,
        placeOfSupply,
        stateCode,
        tdsOnAmt: tdsOnAmt || undefined,
        tdsPercent: tdsPercent || undefined
      });
      setDiscountAmount(Number(totals.discountAmount) || 0);
      setGstTypeLabel(String(totals.gstTypeLabel || totals.gstType || ''));
      setCgstRate(String(totals.cgstRate ?? 0));
      setCgstAmount(String(totals.cgstAmount ?? 0));
      setSgstRate(String(totals.sgstRate ?? 0));
      setSgstAmount(String(totals.sgstAmount ?? 0));
      setIgstRate(String(totals.igstRate ?? 0));
      setIgstAmount(String(totals.igstAmount ?? 0));
      setInvoiceValue(Number(totals.invoiceValue) || 0);
      setTaxableAmount(Number(totals.taxableAmount) || 0);
      if (!tdsOnAmtTouched) {
        setTdsOnAmt(String(totals.tdsOnAmt ?? totals.taxableAmount ?? ''));
      }
      if (totals.placeOfSupply) setPlaceOfSupply(String(totals.placeOfSupply));
      if (totals.stateCode) setStateCode(String(totals.stateCode));
    } catch {
      // keep local values
    }
  }, [recMts, jobRate, jobAmount, rdLessAddAmt, grossAmount, discountPercent, otherLess, otherAdd, gstRate, millGstin, placeOfSupply, stateCode, tdsOnAmt, tdsPercent, tdsOnAmtTouched]);

  useEffect(() => {
    const timer = setTimeout(() => { void recalcGst(); }, 300);
    return () => clearTimeout(timer);
  }, [recalcGst]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await millReceiptsApi.getMeta();
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        setVoucherNo(String(meta.nextVoucherNo || 1));
        setHsnCode(meta.defaultHsnCode || '9988');
        setGstRate(String(meta.defaultGstRate ?? 5));
        setMills(meta.mills || []);
        setMillParties((meta as any).millParties || []);
        if (meta.entryTypes?.[0]) setEntryType(meta.entryTypes[0]);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load mill receipt.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const applyMillPartyDefaults = (name: string) => {
    const match = millParties.find(m => m.name.toLowerCase() === name.trim().toLowerCase());
    if (!match) return;
    if (match.gstNumber && !millGstin) setMillGstin(match.gstNumber);
    if (!tdsPercentTouched && match.suggestedTdsPercent != null) {
      setTdsPercent(String(match.suggestedTdsPercent));
    }
  };

  const resetLine = () => {
    setGreyDispatchId('');
    setDespNo('');
    setRecChallan('');
    setMarka('');
    setQuality('');
    setPrintStyle('');
    setRecTaka('');
    setRecMts('');
    setGreyMts('');
    setShortMts('0');
    setShortPct('0');
    setJobRate('');
    setSelectedTakaDetails([]);
    setAvailableTakas([]);
  };

  const loadPendingDispatches = async (lotOverride?: string) => {
    if (!millName.trim()) {
      setError('Select Mill A/C first.');
      return;
    }
    const effectiveLot = (lotOverride ?? lotNo).trim();
    if (!effectiveLot) {
      setLotDraft('');
      setLotPromptOpen(true);
      return;
    }
    if (lotOverride) setLotNo(effectiveLot);
    setDispatchesLoading(true);
    setError('');
    try {
      const { entries } = await millReceiptsApi.getPendingDispatches(millName.trim());
      setPendingDispatches(entries || []);
      setDespPickerOpen(true);
      if (!entries?.length) setError('No pending grey dispatches for this mill.');
    } catch (err: any) {
      setError(err.message || 'Could not load pending dispatches.');
    } finally {
      setDispatchesLoading(false);
    }
  };

  const applyDispatch = async (dispatch: MillPendingDispatch) => {
    setGreyDispatchId(dispatch.id);
    setDespNo(String(dispatch.srNo ?? dispatch.challanNo ?? ''));
    setQuality(dispatch.quality || '');
    setMarka(dispatch.ourMarka || '');
    setGreyMts(String(dispatch.pendingMts || dispatch.despMts || ''));
    if (dispatch.millLotNo && !lotNo) setLotNo(dispatch.millLotNo);
    setDespPickerOpen(false);
    setError('');
    try {
      const { availableRows } = await millReceiptsApi.getAvailableTakas(dispatch.id);
      setAvailableTakas(availableRows || []);
      if (availableRows?.length) setTakaModalOpen(true);
      else setError('No taka left to receive on this dispatch.');
    } catch (err: any) {
      setError(err.message || 'Could not load taka details.');
    }
  };

  const applyTakas = (rows: MillReceiptTakaRow[]) => {
    setSelectedTakaDetails(rows);
    setRecTaka(String(rows.length));
    setGreyMts(String(round2(rows.reduce((s, r) => s + r.greyMts, 0))));
    setRecMts(String(round2(rows.reduce((s, r) => s + r.recMts, 0))));
  };

  const openTakaSelector = async () => {
    if (!greyDispatchId) {
      setError('Select a grey dispatch first.');
      return;
    }
    try {
      const { availableRows } = await millReceiptsApi.getAvailableTakas(greyDispatchId);
      setAvailableTakas(availableRows || []);
      if (!availableRows?.length) {
        setError('No taka left to receive for this dispatch.');
        return;
      }
      setTakaModalOpen(true);
    } catch (err: any) {
      setError(err.message || 'Could not load taka details.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!millName.trim()) throw new Error('Mill A/C is required.');
      if (!lotNo.trim()) throw new Error('Lot number is required.');
      if (!greyDispatchId) throw new Error('Select a grey dispatch.');
      if (!toNum(recMts)) throw new Error('Select received takas or enter Rec. Mts.');

      await millReceiptsApi.create({
        greyDispatchId,
        companyName,
        millName: millName.trim(),
        millGstin: millGstin || undefined,
        partyMsme: partyMsme || undefined,
        entryType,
        hsnCode,
        voucherNo: toNum(voucherNo),
        receiptDate,
        billNo: billNo || undefined,
        placeOfSupply: placeOfSupply || undefined,
        stateCode: stateCode || undefined,
        lotNo: lotNo.trim(),
        despNo: despNo || undefined,
        recChallan: recChallan || undefined,
        marka: marka || undefined,
        quality: quality || undefined,
        printStyle: printStyle || undefined,
        recTaka: toNum(recTaka),
        recMts: toNum(recMts),
        greyMts: toNum(greyMts),
        shortMts: toNum(shortMts),
        shortPct: toNum(shortPct),
        jobRate: toNum(jobRate),
        jobAmount,
        rdPerMtr: toNum(rdPerMtr),
        rdLessAddAmt: toNum(rdLessAddAmt),
        discountPercent: toNum(discountPercent),
        otherLess: toNum(otherLess),
        otherAdd: toNum(otherAdd),
        gstRate: toNum(gstRate),
        tdsOnAmt: toNum(tdsOnAmt),
        tdsPercent: toNum(tdsPercent),
        remarks: remarks || undefined,
        takaDetails: selectedTakaDetails
      });

      setSuccess(`Mill receipt saved for lot ${lotNo}.`);
      const meta = await millReceiptsApi.getMeta();
      setVoucherNo(String(meta.nextVoucherNo || 1));
      setLotNo('');
      setBillNo('');
      setRemarks('');
      setTdsPercent('');
      setTdsOnAmtTouched(false);
      setTdsPercentTouched(false);
      resetLine();
      setSelectedTakaDetails([]);
    } catch (err: any) {
      setError(err.message || 'Could not save mill receipt.');
    } finally {
      setSaving(false);
    }
  };

  const linePreview = useMemo(() => ({
    lotNo: lotNo || '-',
    despNo: despNo || '-',
    recChallan: recChallan || '-',
    marka: marka || '-',
    quality: quality || '-',
    printStyle: printStyle || '-',
    recTaka: recTaka || '0',
    recMts: recMts || '0',
    greyMts: greyMts || '0',
    shortMts,
    jobRate: jobRate || '0',
    jobAmount
  }), [lotNo, despNo, recChallan, marka, quality, printStyle, recTaka, recMts, greyMts, shortMts, jobRate, jobAmount]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Mill Receipt Entry" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { window.location.href = '/erp/reports/mill-receipt'; }}
              className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-teal-800"
            >
              Mill Receipt Report
            </button>
            <button
              type="button"
              onClick={() => void loadPendingDispatches()}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-xs font-black uppercase tracking-wide text-white"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              Open Despatch
            </button>
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}

        <ErpFormShell onSave={() => void handleSave()} saving={saving}>
          <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-lg font-black uppercase tracking-wide text-gray-900">Mill Receipt Entry</h1>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-teal-800">Add Mode</span>
            </div>

            <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-6">
              <div className="md:col-span-2">
                <label className={labelClass}>Company</label>
                <input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Mill A/C</label>
                <input
                  list="mill-receipt-mills"
                  className={inputClass}
                  value={millName}
                  onChange={e => {
                    setMillName(e.target.value);
                    resetLine();
                  }}
                  onBlur={() => applyMillPartyDefaults(millName)}
                  placeholder="Select mill"
                />
                <datalist id="mill-receipt-mills">
                  {mills.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <input className={readonlyClass} value={entryType} readOnly />
              </div>
              <div>
                <label className={labelClass}>HSN (Jobwork)</label>
                <input className={inputClass} value={hsnCode} onChange={e => setHsnCode(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input className={inputClass} value={stateCode} onChange={e => setStateCode(e.target.value)} placeholder="24" />
              </div>
              <div>
                <label className={labelClass}>GST Type</label>
                <input className={readonlyClass} value={gstTypeLabel || '-'} readOnly />
              </div>
              <div>
                <label className={labelClass}>Voucher</label>
                <input className={readonlyClass} value={voucherNo} readOnly />
              </div>
              <div>
                <label className={labelClass}>Date</label>
                <input type="date" className={inputClass} value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Bill No. (G.P.)</label>
                <input className={inputClass} value={billNo} onChange={e => setBillNo(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Party MSME</label>
                <input className={inputClass} value={partyMsme} onChange={e => setPartyMsme(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Mill GSTIN</label>
                <input className={inputClass} value={millGstin} onChange={e => setMillGstin(e.target.value)} />
              </div>
              <div className="md:col-span-2 lg:col-span-4">
                <label className={labelClass}>Remark</label>
                <input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b bg-teal-50 px-4 py-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[140px]">
                  <label className={labelClass}>Lot No. (manual)</label>
                  <input
                    className={inputClass}
                    value={lotNo}
                    onChange={e => setLotNo(e.target.value)}
                    onBlur={() => {
                      if (lotNo.trim() && millName.trim() && !greyDispatchId) void loadPendingDispatches();
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void loadPendingDispatches();
                      }
                    }}
                    placeholder="Enter lot no."
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void loadPendingDispatches()}
                  disabled={dispatchesLoading}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-60"
                >
                  {dispatchesLoading ? 'Loading…' : 'Choose Despatch'}
                </button>
                <button
                  type="button"
                  onClick={() => void openTakaSelector()}
                  className="rounded-xl border border-teal-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-teal-800"
                >
                  Taka Details
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Lot No</th>
                    <th className="px-2 py-2">Desp. N</th>
                    <th className="px-2 py-2">Rec Cal</th>
                    <th className="px-2 py-2">Marka</th>
                    <th className="px-2 py-2">Grey Qual</th>
                    <th className="px-2 py-2">Print Style</th>
                    <th className="px-2 py-2 text-right">Tak</th>
                    <th className="px-2 py-2 text-right">Rec Mts</th>
                    <th className="px-2 py-2 text-right">Grey</th>
                    <th className="px-2 py-2 text-right">Short</th>
                    <th className="px-2 py-2 text-right">Job Ra</th>
                    <th className="px-2 py-2 text-right">Job Amt</th>
                    <th className="px-2 py-2">Disp</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-2 py-2 font-semibold">{linePreview.lotNo}</td>
                    <td className="px-2 py-2 font-bold text-teal-800">{linePreview.despNo}</td>
                    <td className="px-2 py-2">
                      <input className={inputClass} value={recChallan} onChange={e => setRecChallan(e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputClass} value={marka} onChange={e => setMarka(e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputClass} value={quality} onChange={e => setQuality(e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputClass} value={printStyle} onChange={e => setPrintStyle(e.target.value)} />
                    </td>
                    <td className="px-2 py-2 text-right font-bold">{linePreview.recTaka}</td>
                    <td className="px-2 py-2 text-right font-bold">{toNum(linePreview.recMts).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-2 py-2 text-right">{toNum(linePreview.greyMts).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-2 py-2 text-right text-rose-700">{toNum(linePreview.shortMts).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-2 py-2">
                      <input className={calcInputClass} type="number" step="0.01" value={jobRate} onChange={e => setJobRate(e.target.value)} />
                    </td>
                    <td className="px-2 py-2 text-right font-black">{jobAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-2 py-2 font-bold">N</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-4 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-4 lg:grid-cols-6">
            <div>
              <label className={labelClass}>Rec. Taka</label>
              <input className={readonlyClass} value={recTaka || '0'} readOnly />
            </div>
            <div>
              <label className={labelClass}>Rec. Grey</label>
              <input className={readonlyClass} value={toNum(greyMts).toFixed(2)} readOnly />
            </div>
            <div>
              <label className={labelClass}>Rec. Mts</label>
              <input className={readonlyClass} value={toNum(recMts).toFixed(2)} readOnly />
            </div>
            <div>
              <label className={labelClass}>RD Per Mtr</label>
              <input className={inputClass} type="number" step="0.01" value={rdPerMtr} onChange={e => setRdPerMtr(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>RD Less/Add Amt</label>
              <input className={inputClass} type="number" step="0.01" value={rdLessAddAmt} onChange={e => setRdLessAddAmt(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Gross Amt</label>
              <input className={readonlyClass} value={grossAmount.toFixed(2)} readOnly />
            </div>
            <div>
              <label className={labelClass}>Disc %</label>
              <input className={inputClass} type="number" step="0.01" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Disc Amt</label>
              <input className={readonlyClass} value={discountAmount.toFixed(2)} readOnly />
            </div>
            <div>
              <label className={labelClass}>Oth Less</label>
              <input className={inputClass} type="number" step="0.01" value={otherLess} onChange={e => setOtherLess(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Oth Add</label>
              <input className={inputClass} type="number" step="0.01" value={otherAdd} onChange={e => setOtherAdd(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>CGST %</label>
              <input className={readonlyClass} value={cgstRate} readOnly />
            </div>
            <div>
              <label className={labelClass}>CGST Amt</label>
              <input className={readonlyClass} value={cgstAmount} readOnly />
            </div>
            <div>
              <label className={labelClass}>SGST %</label>
              <input className={readonlyClass} value={sgstRate} readOnly />
            </div>
            <div>
              <label className={labelClass}>SGST Amt</label>
              <input className={readonlyClass} value={sgstAmount} readOnly />
            </div>
            <div>
              <label className={labelClass}>IGST %</label>
              <input className={readonlyClass} value={igstRate} readOnly />
            </div>
            <div>
              <label className={labelClass}>IGST Amt</label>
              <input className={readonlyClass} value={igstAmount} readOnly />
            </div>
            <div>
              <label className={labelClass}>GST Rate</label>
              <input className={inputClass} type="number" step="0.01" value={gstRate} onChange={e => setGstRate(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Invoice Value</label>
              <input className={readonlyClass} value={invoiceValue.toFixed(2)} readOnly />
            </div>
            <div>
              <label className={labelClass}>TDS On Amt</label>
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
            <div>
              <label className={labelClass}>TDS %</label>
              <input
                className={calcInputClass}
                type="number"
                step="0.01"
                value={tdsPercent}
                onChange={e => {
                  setTdsPercentTouched(true);
                  setTdsPercent(e.target.value);
                }}
                placeholder="1 or 2 (auto from PAN)"
              />
              {!tdsPercentTouched && millParties.find(m => m.name.toLowerCase() === millName.trim().toLowerCase())?.suggestedTdsPercent != null && (
                <p className="mt-1 text-[10px] font-semibold text-teal-700">
                  Auto from PAN → {millParties.find(m => m.name.toLowerCase() === millName.trim().toLowerCase())?.suggestedTdsPercent}%
                </p>
              )}
              {!tdsPercentTouched && millName.trim() && millParties.find(m => m.name.toLowerCase() === millName.trim().toLowerCase())?.suggestedTdsPercent == null && (
                <p className="mt-1 text-[10px] font-semibold text-amber-700">No PAN in master — enter TDS % manually</p>
              )}
            </div>
            <div>
              <label className={labelClass}>TDS Amt</label>
              <input className={readonlyClass} value={toNum(tdsAmount).toFixed(2)} readOnly />
            </div>
            <div>
              <label className={labelClass}>Net After TDS</label>
              <input className={readonlyClass} value={netAfterTds.toFixed(2)} readOnly />
            </div>
          </section>

          <div className="mt-4 flex justify-end">
            <ErpSaveButton saving={saving} label="Save Mill Receipt" />
          </div>
        </ErpFormShell>
      </main>

      {lotPromptOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Lot No. is blank</h3>
            <p className="mt-2 text-sm text-gray-600">Please enter Lot No.:</p>
            <input
              autoFocus
              className={`${inputClass} mt-3`}
              value={lotDraft}
              onChange={e => setLotDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && lotDraft.trim()) {
                  setLotPromptOpen(false);
                  void loadPendingDispatches(lotDraft.trim());
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setLotPromptOpen(false)} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  if (!lotDraft.trim()) return;
                  setLotPromptOpen(false);
                  void loadPendingDispatches(lotDraft.trim());
                }}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-black text-white"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {despPickerOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase">Pending Grey Dispatches</h3>
                <p className="text-xs text-gray-500">{millName} · Lot {lotNo || '-'}</p>
              </div>
              <button type="button" onClick={() => setDespPickerOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-bold hover:bg-gray-100">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Desp</th>
                    <th className="px-3 py-2">Challan</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Quality</th>
                    <th className="px-3 py-2 text-right">Desp Mts</th>
                    <th className="px-3 py-2 text-right">Pending</th>
                    <th className="px-3 py-2">Pur Sr</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingDispatches.map(d => (
                    <tr
                      key={d.id}
                      className="cursor-pointer border-b hover:bg-teal-50"
                      onClick={() => void applyDispatch(d)}
                    >
                      <td className="px-3 py-2 font-bold">{d.srNo ?? '-'}</td>
                      <td className="px-3 py-2">{d.challanNo || '-'}</td>
                      <td className="px-3 py-2">{formatDate(d.dispatchDate)}</td>
                      <td className="px-3 py-2">{d.quality || '-'}</td>
                      <td className="px-3 py-2 text-right">{d.despMts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-right font-bold text-teal-800">{d.pendingMts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2">{d.purSr ?? '-'}</td>
                    </tr>
                  ))}
                  {!pendingDispatches.length && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">No pending dispatches for this mill.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <MillReceiptTakaModal
        open={takaModalOpen}
        rows={availableTakas}
        onClose={() => setTakaModalOpen(false)}
        onApply={applyTakas}
      />
    </div>
  );
};
