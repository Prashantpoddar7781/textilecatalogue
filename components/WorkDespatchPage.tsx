import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { workDespatchesApi } from '../services/api';
import { ErpSession, WorkLineItem } from '../types';
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
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-violet-400';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

const emptyLine = (): WorkLineItem => ({
  itemName: '',
  bundles: 0,
  jobType: 'HAND WORK',
  unit: 'PCS',
  pcs: 0,
  cut: DEFAULT_CUT,
  mtsQty: 0,
  rate: 0,
  amount: 0,
  fabricRate: 0,
  taxableValue: 0
});

export const WorkDespatchPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const editId = useMemo(() => new URLSearchParams(window.location.search).get('edit'), []);
  const isEditMode = Boolean(editId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [transactionTypes, setTransactionTypes] = useState<string[]>([]);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>(['PCS', 'MTS']);
  const [parties, setParties] = useState<Array<{ name: string; gstNumber?: string | null; state?: string | null; brokerName?: string | null }>>([]);
  const [transactionType, setTransactionType] = useState('WORK DESP CHALLAN');
  const [partyName, setPartyName] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [gstType, setGstType] = useState('');
  const [challanNo, setChallanNo] = useState('1');
  const [despatchDate, setDespatchDate] = useState(today());
  const [brokerName, setBrokerName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [workType, setWorkType] = useState('EMB WORK');
  const [hsnCode, setHsnCode] = useState('5407');
  const [remarks, setRemarks] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('0');
  const [deliveryDueDate, setDeliveryDueDate] = useState(today());
  const [lrNo, setLrNo] = useState('');
  const [ewayBillNo, setEwayBillNo] = useState('');
  const [rateInChallan, setRateInChallan] = useState(false);
  const [lines, setLines] = useState<WorkLineItem[]>([emptyLine()]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await workDespatchesApi.getMeta();
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        if (!isEditMode) setChallanNo(String(meta.nextChallanNo || 1));
        setTransactionTypes(meta.transactionTypes || []);
        if (!isEditMode && meta.transactionTypes?.[0]) setTransactionType(meta.transactionTypes[0]);
        setWorkTypes(meta.workTypes || []);
        if (!isEditMode && meta.workTypes?.[0]) setWorkType(meta.workTypes[0]);
        setUnits(meta.units || ['PCS']);
        setParties(meta.parties || []);

        if (isEditMode && editId) {
          const { entry } = await workDespatchesApi.getById(editId);
          if (cancelled) return;
          setCompanyName(entry.companyName || meta.companyName || '');
          setTransactionType(entry.transactionType || 'WORK DESP CHALLAN');
          setPartyName(entry.partyName || '');
          setPartyGstin(entry.partyGstin || '');
          setStateCode(entry.stateCode || '');
          setPlaceOfSupply(entry.placeOfSupply || '');
          setGstType(entry.gstType || '');
          setChallanNo(entry.challanNo || '');
          setDespatchDate(entry.despatchDate ? entry.despatchDate.slice(0, 10) : today());
          setBrokerName(entry.brokerName || '');
          setVehicleNo(entry.vehicleNo || '');
          setWorkType(entry.workType || 'EMB WORK');
          setHsnCode(entry.hsnCode || '5407');
          setRemarks(entry.remarks || '');
          setReceivedBy(entry.receivedBy || '');
          setDeliveryDays(String(entry.deliveryDays ?? 0));
          setDeliveryDueDate(entry.deliveryDueDate ? entry.deliveryDueDate.slice(0, 10) : today());
          setLrNo(entry.lrNo || '');
          setEwayBillNo(entry.ewayBillNo || '');
          setRateInChallan(Boolean(entry.rateInChallan));
          setLines((entry.lineItems || []).length ? entry.lineItems : [emptyLine()]);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load work despatch.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [editId, isEditMode]);

  const applyParty = (name: string) => {
    setPartyName(name);
    const match = parties.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
    if (!match) return;
    if (match.gstNumber) setPartyGstin(match.gstNumber);
    if (match.state) {
      setPlaceOfSupply(match.state);
      setStateCode(match.state);
    }
    if (match.brokerName) setBrokerName(match.brokerName);
  };

  const updateLine = (index: number, patch: Partial<WorkLineItem>) => {
    setLines(prev => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      const pcs = toNum(next.pcs);
      const cut = toNum(next.cut) || DEFAULT_CUT;
      const mtsQty = patch.mtsQty != null ? toNum(patch.mtsQty) : round2(pcs * cut);
      const rate = toNum(next.rate);
      const amount = patch.amount != null ? toNum(patch.amount) : round2(mtsQty * rate);
      return {
        ...next,
        pcs,
        cut,
        mtsQty,
        rate,
        amount,
        fabricRate: toNum(next.fabricRate),
        taxableValue: amount,
        bundles: toNum(next.bundles)
      };
    }));
  };

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
      if (!partyName.trim()) throw new Error('Party is required.');
      const validLines = lines.filter(l => l.itemName.trim() && (toNum(l.pcs) > 0 || toNum(l.mtsQty) > 0));
      if (!validLines.length) throw new Error('Add at least one item line.');
      const payload = {
        companyName,
        transactionType,
        partyName: partyName.trim(),
        partyGstin: partyGstin || undefined,
        placeOfSupply: placeOfSupply || undefined,
        stateCode: stateCode || undefined,
        gstType: gstType || undefined,
        challanNo,
        despatchDate,
        brokerName: brokerName || undefined,
        vehicleNo: vehicleNo || undefined,
        workType: workType || undefined,
        hsnCode,
        remarks: remarks || undefined,
        receivedBy: receivedBy || undefined,
        deliveryDays: toNum(deliveryDays),
        deliveryDueDate,
        lrNo: lrNo || undefined,
        ewayBillNo: ewayBillNo || undefined,
        rateInChallan,
        lineItems: validLines
      };
      if (isEditMode && editId) {
        await workDespatchesApi.update(editId, payload);
        setSuccess('Work despatch updated.');
      } else {
        await workDespatchesApi.create(payload);
        setSuccess('Work despatch saved. No ledger posting (despatch only).');
        const meta = await workDespatchesApi.getMeta();
        setChallanNo(String(meta.nextChallanNo || 1));
        setLines([emptyLine()]);
        setRemarks('');
        setVehicleNo('');
      }
    } catch (err: any) {
      setError(err.message || 'Could not save work despatch.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Work Despatch" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = '/erp/reports/work-despatch'; }}
            className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-violet-800"
          >
            Work Desp Report
          </button>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}

        <ErpFormShell onSave={() => void handleSave()} saving={saving}>
          <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-lg font-black uppercase tracking-wide text-gray-900">Work Despatch Entry</h1>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-violet-800">
                {isEditMode ? 'Edit Mode' : 'Add Mode'}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
              <label><span className={labelClass}>Company</span><input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} /></label>
              <label>
                <span className={labelClass}>Type</span>
                <select className={inputClass} value={transactionType} onChange={e => setTransactionType(e.target.value)}>
                  {transactionTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label><span className={labelClass}>Challan No.</span><input className={inputClass} value={challanNo} onChange={e => setChallanNo(e.target.value)} /></label>
              <label><span className={labelClass}>Date</span><input type="date" className={inputClass} value={despatchDate} onChange={e => setDespatchDate(e.target.value)} /></label>
              <label className="md:col-span-2">
                <span className={labelClass}>Party</span>
                <input list="work-desp-parties" className={inputClass} value={partyName} onChange={e => applyParty(e.target.value)} placeholder="Select party / khataval" />
                <datalist id="work-desp-parties">{parties.map(p => <option key={p.name} value={p.name} />)}</datalist>
              </label>
              <label><span className={labelClass}>State</span><input className={inputClass} value={stateCode} onChange={e => setStateCode(e.target.value)} /></label>
              <label><span className={labelClass}>GST Type</span><input className={inputClass} value={gstType} onChange={e => setGstType(e.target.value)} /></label>
              <label><span className={labelClass}>Broker</span><input className={inputClass} value={brokerName} onChange={e => setBrokerName(e.target.value)} /></label>
              <label><span className={labelClass}>Vehicle No.</span><input className={inputClass} value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} /></label>
              <label>
                <span className={labelClass}>Work Type</span>
                <select className={inputClass} value={workType} onChange={e => setWorkType(e.target.value)}>
                  {workTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label><span className={labelClass}>Party GSTIN</span><input className={inputClass} value={partyGstin} onChange={e => setPartyGstin(e.target.value)} /></label>
              <label><span className={labelClass}>HSN</span><input className={inputClass} value={hsnCode} onChange={e => setHsnCode(e.target.value)} /></label>
              <label><span className={labelClass}>LR / AWB</span><input className={inputClass} value={lrNo} onChange={e => setLrNo(e.target.value)} /></label>
              <label><span className={labelClass}>E-Way Bill</span><input className={inputClass} value={ewayBillNo} onChange={e => setEwayBillNo(e.target.value)} /></label>
              <label><span className={labelClass}>Delivery Days</span><input className={inputClass} type="number" value={deliveryDays} onChange={e => setDeliveryDays(e.target.value)} /></label>
              <label><span className={labelClass}>Delivery Due</span><input type="date" className={inputClass} value={deliveryDueDate} onChange={e => setDeliveryDueDate(e.target.value)} /></label>
              <label><span className={labelClass}>Received By</span><input className={inputClass} value={receivedBy} onChange={e => setReceivedBy(e.target.value)} /></label>
              <label className="md:col-span-2"><span className={labelClass}>Remark</span><input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-violet-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-800">Item Particulars · Cut default 6.30</p>
              <button type="button" onClick={() => setLines(prev => [...prev, emptyLine()])} className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-black uppercase text-white">
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Item Name</th>
                    <th className="px-2 py-2 text-right">Bundles</th>
                    <th className="px-2 py-2">Job Type</th>
                    <th className="px-2 py-2">Unit</th>
                    <th className="px-2 py-2 text-right">Pcs</th>
                    <th className="px-2 py-2 text-right">Cut</th>
                    <th className="px-2 py-2 text-right">Mts/Qty</th>
                    <th className="px-2 py-2 text-right">Rate</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-right">Fabric Rate</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index} className="border-b">
                      <td className="px-2 py-2"><input className={inputClass} value={line.itemName} onChange={e => updateLine(index, { itemName: e.target.value })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" value={line.bundles || ''} onChange={e => updateLine(index, { bundles: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} value={line.jobType || ''} onChange={e => updateLine(index, { jobType: e.target.value })} /></td>
                      <td className="px-2 py-2">
                        <select className={inputClass} value={line.unit || 'PCS'} onChange={e => updateLine(index, { unit: e.target.value })}>
                          {units.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" value={line.pcs || ''} onChange={e => updateLine(index, { pcs: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.cut} onChange={e => updateLine(index, { cut: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.mtsQty || ''} onChange={e => updateLine(index, { mtsQty: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.rate || ''} onChange={e => updateLine(index, { rate: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2 text-right font-black">{toNum(line.amount).toFixed(2)}</td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.fabricRate || ''} onChange={e => updateLine(index, { fabricRate: toNum(e.target.value) })} title="For loss verification" /></td>
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => setLines(prev => prev.length === 1 ? [emptyLine()] : prev.filter((_, i) => i !== index))} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white">
                    <td className="px-2 py-2 font-black uppercase" colSpan={4}>Grand Totals</td>
                    <td className="px-2 py-2 text-right font-black">{totals.pcs}</td>
                    <td />
                    <td className="px-2 py-2 text-right font-black">{totals.mts.toFixed(2)}</td>
                    <td />
                    <td className="px-2 py-2 text-right font-black">{totals.amount.toFixed(2)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs">
              <label className="inline-flex items-center gap-2 font-bold text-gray-700">
                <input type="checkbox" checked={rateInChallan} onChange={e => setRateInChallan(e.target.checked)} />
                Rate in Challan
              </label>
              <p className="font-semibold text-violet-800">Net Amt: {totals.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} · No ledger effect</p>
            </div>
          </section>

          <div className="mt-4 flex justify-end">
            <ErpSaveButton saving={saving} label={isEditMode ? 'Update Work Despatch' : 'Save Work Despatch'} />
          </div>
        </ErpFormShell>
      </main>
    </div>
  );
};
