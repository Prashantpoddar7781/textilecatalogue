import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ListOrdered, Loader2 } from 'lucide-react';
import { workDespatchesApi, workReceiptsApi } from '../services/api';
import { ErpSession, WorkLineItem, WorkPendingDespatch } from '../types';
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
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-fuchsia-400';
const readonlyClass = 'w-full rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-2 text-sm font-semibold';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

export const WorkReceiptPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [transactionTypes, setTransactionTypes] = useState<string[]>([]);
  const [transactionType, setTransactionType] = useState('WORK REC. CHALLAN');
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
  const [workType, setWorkType] = useState('');
  const [hsnCode, setHsnCode] = useState('5407');
  const [remarks, setRemarks] = useState('');
  const [billNo, setBillNo] = useState('');
  const [workDespatchId, setWorkDespatchId] = useState('');
  const [pending, setPending] = useState<WorkPendingDespatch[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [lines, setLines] = useState<WorkLineItem[]>([]);
  const [invoiceValue, setInvoiceValue] = useState(0);
  const [taxableAmount, setTaxableAmount] = useState(0);
  const [cgstAmount, setCgstAmount] = useState('0');
  const [sgstAmount, setSgstAmount] = useState('0');
  const [igstAmount, setIgstAmount] = useState('0');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await workReceiptsApi.getMeta();
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        setVoucherNo(String(meta.nextVoucherNo || 1));
        setTransactionTypes(meta.transactionTypes || []);
        if (meta.transactionTypes?.[0]) setTransactionType(meta.transactionTypes[0]);
        setGstRate(String(meta.defaultGstRate ?? 5));
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load work receipt.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const loadPending = async () => {
    setPendingLoading(true);
    setError('');
    try {
      const { entries } = await workDespatchesApi.getPending(partyName.trim() || undefined);
      setPending(entries || []);
      setPickerOpen(true);
      if (!entries?.length) setError('No pending work despatches found.');
    } catch (err: any) {
      setError(err.message || 'Could not load pending despatches.');
    } finally {
      setPendingLoading(false);
    }
  };

  const applyDespatch = (entry: WorkPendingDespatch) => {
    setWorkDespatchId(entry.id);
    setPartyName(entry.partyName || '');
    setPartyGstin(entry.partyGstin || '');
    setBrokerName(entry.brokerName || '');
    setWorkType(entry.workType || '');
    setChallanNo(entry.challanNo || '');
    setLines((entry.pendingLines || []).map(row => ({
      lineNo: row.lineNo,
      itemName: row.itemName,
      bundles: row.bundles || 0,
      jobType: row.jobType || 'HAND WORK',
      unit: row.unit || 'PCS',
      pcs: row.pendingPcs,
      cut: row.cut || 6.3,
      mtsQty: row.pendingMts,
      rate: row.rate || 0,
      amount: round2((row.pendingMts || 0) * (row.rate || 0)),
      fabricRate: row.fabricRate || 0,
      taxableValue: round2((row.pendingMts || 0) * (row.rate || 0))
    })));
    setPickerOpen(false);
  };

  const updateLine = (index: number, patch: Partial<WorkLineItem>) => {
    setLines(prev => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      const pcs = toNum(next.pcs);
      const cut = toNum(next.cut) || 6.3;
      const mtsQty = patch.mtsQty != null ? toNum(patch.mtsQty) : round2(pcs * cut);
      const rate = toNum(next.rate);
      const amount = round2(mtsQty * rate);
      return { ...next, pcs, cut, mtsQty, rate, amount, taxableValue: amount, fabricRate: toNum(next.fabricRate) };
    }));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        if (!lines.length) return;
        try {
          const { totals } = await workReceiptsApi.calculate({
            lineItems: lines,
            gstRate: toNum(gstRate),
            partyGstin,
            placeOfSupply,
            stateCode
          });
          setTaxableAmount(Number(totals.taxableAmount) || 0);
          setInvoiceValue(Number(totals.invoiceValue) || 0);
          setCgstAmount(String(totals.cgstAmount ?? 0));
          setSgstAmount(String(totals.sgstAmount ?? 0));
          setIgstAmount(String(totals.igstAmount ?? 0));
          setGstType(String(totals.gstTypeLabel || totals.gstType || ''));
          if (totals.placeOfSupply) setPlaceOfSupply(String(totals.placeOfSupply));
        } catch {
          const taxable = round2(lines.reduce((s, r) => s + toNum(r.amount), 0));
          setTaxableAmount(taxable);
          setInvoiceValue(taxable);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [lines, gstRate, partyGstin, placeOfSupply, stateCode]);

  const totals = useMemo(() => ({
    pcs: round2(lines.reduce((s, r) => s + toNum(r.pcs), 0)),
    mts: round2(lines.reduce((s, r) => s + toNum(r.mtsQty), 0)),
    amount: round2(lines.reduce((s, r) => s + toNum(r.amount), 0))
  }), [lines]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!workDespatchId) throw new Error('Select a pending work despatch.');
      if (!partyName.trim()) throw new Error('Party is required.');
      if (!lines.length) throw new Error('Add received lines.');
      await workReceiptsApi.create({
        workDespatchId,
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
        workType: workType || undefined,
        hsnCode,
        remarks: remarks || undefined,
        billNo: billNo || undefined,
        gstRate: toNum(gstRate),
        lineItems: lines,
        taxableAmount
      });
      setSuccess('Work receipt saved and posted to ledger as WORK CHARGES.');
      const meta = await workReceiptsApi.getMeta();
      setVoucherNo(String(meta.nextVoucherNo || 1));
      setWorkDespatchId('');
      setLines([]);
      setRemarks('');
      setBillNo('');
      setInvoiceValue(0);
      setTaxableAmount(0);
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
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => { window.location.href = '/erp/reports/work-receipt'; }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase text-fuchsia-800">
              Work Recpt Report
            </button>
            <button type="button" onClick={() => void loadPending()} className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-700 px-3 py-2 text-xs font-black uppercase text-white">
              <ListOrdered className="h-3.5 w-3.5" /> Open Pending Desp
            </button>
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}

        <ErpFormShell onSave={() => void handleSave()} saving={saving}>
          <section className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/40 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-lg font-black uppercase tracking-wide text-gray-900">Work Receipt Entry</h1>
              <span className="rounded-full bg-fuchsia-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-fuchsia-800">Posts to Ledger</span>
            </div>
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
              <label><span className={labelClass}>Company</span><input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} /></label>
              <label>
                <span className={labelClass}>Type</span>
                <select className={inputClass} value={transactionType} onChange={e => setTransactionType(e.target.value)}>
                  {transactionTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label><span className={labelClass}>Voucher</span><input className={readonlyClass} value={voucherNo} readOnly /></label>
              <label><span className={labelClass}>Date</span><input type="date" className={inputClass} value={receiptDate} onChange={e => setReceiptDate(e.target.value)} /></label>
              <label className="md:col-span-2"><span className={labelClass}>Party</span><input className={inputClass} value={partyName} onChange={e => setPartyName(e.target.value)} /></label>
              <label><span className={labelClass}>Desp Challan</span><input className={readonlyClass} value={challanNo || '-'} readOnly /></label>
              <label><span className={labelClass}>Bill No.</span><input className={inputClass} value={billNo} onChange={e => setBillNo(e.target.value)} /></label>
              <label><span className={labelClass}>Work Type</span><input className={inputClass} value={workType} onChange={e => setWorkType(e.target.value)} /></label>
              <label><span className={labelClass}>Broker</span><input className={inputClass} value={brokerName} onChange={e => setBrokerName(e.target.value)} /></label>
              <label><span className={labelClass}>Party GSTIN</span><input className={inputClass} value={partyGstin} onChange={e => setPartyGstin(e.target.value)} /></label>
              <label><span className={labelClass}>GST Type</span><input className={readonlyClass} value={gstType || '-'} readOnly /></label>
              <label><span className={labelClass}>GST %</span><input className={inputClass} type="number" value={gstRate} onChange={e => setGstRate(e.target.value)} /></label>
              <label><span className={labelClass}>HSN</span><input className={inputClass} value={hsnCode} onChange={e => setHsnCode(e.target.value)} /></label>
              <label className="md:col-span-2"><span className={labelClass}>Remark</span><input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b bg-fuchsia-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-fuchsia-800">
              Received Items · Job rate posts to ledger
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2">Job Type</th>
                    <th className="px-2 py-2 text-right">Pcs</th>
                    <th className="px-2 py-2 text-right">Cut</th>
                    <th className="px-2 py-2 text-right">Mts</th>
                    <th className="px-2 py-2 text-right">Rate</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-right">Fabric Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {!lines.length && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">Open pending despatch to load lines.</td></tr>
                  )}
                  {lines.map((line, index) => (
                    <tr key={index} className="border-b">
                      <td className="px-2 py-2 font-semibold">{line.itemName}</td>
                      <td className="px-2 py-2">{line.jobType}</td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" value={line.pcs || ''} onChange={e => updateLine(index, { pcs: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.cut} onChange={e => updateLine(index, { cut: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.mtsQty || ''} onChange={e => updateLine(index, { mtsQty: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.rate || ''} onChange={e => updateLine(index, { rate: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2 text-right font-black">{toNum(line.amount).toFixed(2)}</td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.fabricRate || ''} onChange={e => updateLine(index, { fabricRate: toNum(e.target.value) })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 border-t px-4 py-3 md:grid-cols-6">
              <div><span className={labelClass}>Rec Pcs</span><input className={readonlyClass} value={totals.pcs} readOnly /></div>
              <div><span className={labelClass}>Rec Mts</span><input className={readonlyClass} value={totals.mts.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>Taxable</span><input className={readonlyClass} value={taxableAmount.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>CGST</span><input className={readonlyClass} value={cgstAmount} readOnly /></div>
              <div><span className={labelClass}>SGST / IGST</span><input className={readonlyClass} value={`${sgstAmount} / ${igstAmount}`} readOnly /></div>
              <div><span className={labelClass}>Invoice Value</span><input className={readonlyClass} value={invoiceValue.toFixed(2)} readOnly /></div>
            </div>
          </section>

          <div className="mt-4 flex justify-end">
            <ErpSaveButton saving={saving} label="Save Work Receipt" />
          </div>
        </ErpFormShell>
      </main>

      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-black uppercase">Pending Work Despatches</h3>
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-lg border px-3 py-1 text-xs font-bold">Close</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              {pendingLoading ? (
                <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b text-[10px] uppercase text-gray-500">
                    <tr>
                      <th className="p-2">Chal</th>
                      <th className="p-2">Party</th>
                      <th className="p-2">Work</th>
                      <th className="p-2 text-right">Pend Pcs</th>
                      <th className="p-2 text-right">Pend Mts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map(row => (
                      <tr key={row.id} className="cursor-pointer border-b hover:bg-fuchsia-50" onClick={() => applyDespatch(row)}>
                        <td className="p-2 font-bold">{row.challanNo}</td>
                        <td className="p-2">{row.partyName}</td>
                        <td className="p-2">{row.workType || '-'}</td>
                        <td className="p-2 text-right font-bold text-fuchsia-800">{row.pendingPcs}</td>
                        <td className="p-2 text-right font-bold text-fuchsia-800">{row.pendingMts.toFixed(2)}</td>
                      </tr>
                    ))}
                    {!pending.length && (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-500">No pending despatches.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
