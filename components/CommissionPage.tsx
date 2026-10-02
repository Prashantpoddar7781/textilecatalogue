import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CommissionBill, CommissionSourceRow, commissionsApi, invoicesApi, partiesApi } from '../services/api';
import { AccountParty, ErpSession } from '../types';
import { postingSaleOrPurchaseAccount } from '../constants/erpTransactionPostingRules';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const SERIES = 'PURCHASE (COMM)';
const today = () => new Date().toISOString().slice(0, 10);
const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const roundRupee = (value: number) => {
  const n = Number(value) || 0;
  return Math.round(n + Math.sign(n) * Number.EPSILON);
};
const money = (value: number) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-IN') : '-');

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const labelText = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

const isBroker = (accountType?: string | null) => /broker|brok/i.test(String(accountType || ''));

export const CommissionPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const editId = useMemo(() => new URLSearchParams(window.location.search).get('edit'), []);
  const [parties, setParties] = useState<AccountParty[]>([]);
  const [companyState, setCompanyState] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [partyName, setPartyName] = useState('');
  const [purchaseAccount, setPurchaseAccount] = useState(postingSaleOrPurchaseAccount(SERIES) || 'COMMISSION PAYABLE A/C');
  const [gross, setGross] = useState('');
  const [tdsPercent, setTdsPercent] = useState('5');
  const [remarks, setRemarks] = useState('');
  const [sources, setSources] = useState<CommissionSourceRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState<CommissionSourceRow[]>([]);
  const [pickedKeys, setPickedKeys] = useState<string[]>([]);
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNo, setSavedNo] = useState('');

  useEffect(() => {
    partiesApi.list().then(result => setParties(result.parties || [])).catch(() => setParties([]));
    invoicesApi.getProfile().then(result => setCompanyState(result?.profile?.state || '')).catch(() => setCompanyState(''));
  }, []);

  useEffect(() => {
    if (!editId) return;
    commissionsApi.get(editId).then(result => {
      const bill = result.bill;
      setBillDate(bill.billDate ? bill.billDate.slice(0, 10) : today());
      setPartyName(bill.partyName || '');
      setPurchaseAccount(bill.purchaseAccount || 'COMMISSION PAYABLE A/C');
      setGross(String(bill.taxableAmount || ''));
      setTdsPercent(bill.tdsPercent != null ? String(bill.tdsPercent) : '5');
      setRemarks(bill.remarks || '');
      setSources(bill.sources || []);
      setSavedNo(bill.billNumber || '');
    }).catch((err: any) => setError(err?.message || 'Could not open this commission bill'));
  }, [editId]);

  const party = parties.find(row => row.name.trim().toLowerCase() === partyName.trim().toLowerCase());
  const interstate = Boolean(
    party?.state && companyState && party.state.trim().toLowerCase() !== companyState.trim().toLowerCase()
  );
  const grossAmount = roundMoney(Number(gross) || 0);
  const gstRate = 5;
  const cgst = interstate ? 0 : roundMoney(grossAmount * 2.5 / 100);
  const sgst = interstate ? 0 : roundMoney(grossAmount * 2.5 / 100);
  const igst = interstate ? roundMoney(grossAmount * gstRate / 100) : 0;
  const invoiceValue = roundRupee(grossAmount + (interstate ? igst : cgst + sgst));
  const tdsAmount = roundRupee(grossAmount * (Number(tdsPercent) || 0) / 100);
  const netPayable = invoiceValue - tdsAmount;

  const brokerOptions = parties
    .filter(row => isBroker(row.accountType) || row.role === 'supplier')
    .map(row => row.name);

  const openPicker = async () => {
    if (!partyName.trim()) {
      setError('Enter the broker name first.');
      return;
    }
    setError('');
    setPickerOpen(true);
    setLoadingPicker(true);
    try {
      const result = await commissionsApi.sources(partyName.trim(), editId || undefined);
      const rows = result.rows || [];
      const selectedIds = new Set(sources.map(row => row.key));
      const merged = [
        ...sources.map(row => ({ ...row, commissionAmount: roundMoney(row.taxableAmount * (Number(row.commissionPercent) || 0) / 100) })),
        ...rows.filter(row => !selectedIds.has(row.key))
      ];
      setPickerRows(merged);
      setPickedKeys(sources.map(row => row.key));
    } catch (err: any) {
      setError(err?.message || 'Could not load commission bills');
    } finally {
      setLoadingPicker(false);
    }
  };

  const applyPicker = () => {
    const chosen = pickerRows.filter(row => pickedKeys.includes(row.key));
    const nextGross = roundMoney(chosen.reduce((sum, row) => sum + (Number(row.commissionAmount) || 0), 0));
    setSources(chosen);
    if (nextGross > 0) setGross(String(nextGross));
    setPickerOpen(false);
  };

  const save = async () => {
    if (!partyName.trim()) {
      setError('Party name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        partyName: partyName.trim(),
        billDate,
        purchaseAccount,
        grossAmount: grossAmount,
        tdsPercent: Number(tdsPercent) || 0,
        remarks,
        sources
      };
      const result = editId
        ? await commissionsApi.update(editId, body)
        : await commissionsApi.create(body);
      const bill: CommissionBill = result.bill;
      setSavedNo(bill.billNumber || '');
      if (!editId && bill.id) {
        window.history.replaceState(null, '', `/erp/commission?edit=${bill.id}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not save the commission bill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <ErpTopMenu title="Commission" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <div className="mx-auto max-w-5xl px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-sm font-bold text-indigo-700">Back</button>
          <h1 className="text-lg font-black text-slate-900">Commission · {SERIES}</h1>
          <span className="text-sm font-black text-slate-600">{savedNo ? `Bill ${savedNo}` : 'New'}</span>
        </div>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
        <div className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-3">
          <label>
            <span className={labelText}>Date</span>
            <input className={inputClass} type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
          </label>
          <label className="md:col-span-2">
            <span className={labelText}>Party name</span>
            <input className={inputClass} list="commission-parties" value={partyName} onChange={e => setPartyName(e.target.value)} placeholder="Broker" />
            <datalist id="commission-parties">
              {brokerOptions.map(name => <option key={name} value={name} />)}
            </datalist>
          </label>
          <label className="md:col-span-2">
            <span className={labelText}>Pur A/C</span>
            <input className={inputClass} value={purchaseAccount} onChange={e => setPurchaseAccount(e.target.value)} />
          </label>
          <label>
            <span className={labelText}>Gross amount (F4 bills)</span>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={gross}
              onChange={e => setGross(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'F4') {
                  e.preventDefault();
                  void openPicker();
                }
              }}
            />
          </label>
          <div className="md:col-span-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void openPicker()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black uppercase text-white">F4 · Pick bills</button>
            <span className="text-xs font-semibold text-slate-500">Press F4 in gross amount to pick the broker&apos;s received bills.</span>
          </div>
          <div className="md:col-span-3 grid grid-cols-2 gap-2 text-sm font-semibold text-slate-800 md:grid-cols-4">
            <p>CGST {money(cgst)}</p>
            <p>SGST {money(sgst)}</p>
            <p>IGST {money(igst)}</p>
            <p>Invoice {money(invoiceValue)}</p>
          </div>
          <label>
            <span className={labelText}>TDS %</span>
            <input className={inputClass} type="number" min="0" step="0.01" value={tdsPercent} onChange={e => setTdsPercent(e.target.value)} />
          </label>
          <p className="self-end text-sm font-black text-slate-800">TDS {money(tdsAmount)}</p>
          <p className="self-end text-sm font-black text-emerald-800">Net payable {money(netPayable)}</p>
          <label className="md:col-span-3">
            <span className={labelText}>Remark</span>
            <input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} />
          </label>
          {sources.length > 0 && (
            <p className="md:col-span-3 text-xs font-semibold text-slate-600">
              Bills: {sources.map(row => row.billNumber).filter(Boolean).join(', ')}
            </p>
          )}
          <div className="md:col-span-3">
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
              {saving ? 'Saving…' : editId ? 'Update commission bill' : 'Save commission bill'}
            </button>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-black">Commission bills · {partyName}</h2>
              <button type="button" onClick={() => setPickerOpen(false)} className="text-sm font-bold text-slate-500">Close</button>
            </div>
            {loadingPicker ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
            ) : pickerRows.length === 0 ? (
              <p className="text-sm font-semibold text-slate-600">No received bills for this broker. Enter the commission % on the bank receipt first.</p>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-indigo-50 text-left">
                    <th className="p-2" />
                    <th className="p-2">Date</th>
                    <th className="p-2">Bill</th>
                    <th className="p-2">Party</th>
                    <th className="p-2 text-right">Taxable</th>
                    <th className="p-2 text-right">Comm %</th>
                    <th className="p-2 text-right">Comm amt</th>
                  </tr>
                </thead>
                <tbody>
                  {pickerRows.map(row => (
                    <tr key={row.key} className="border-t">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={pickedKeys.includes(row.key)}
                          onChange={e => {
                            setPickedKeys(prev => e.target.checked ? [...prev, row.key] : prev.filter(key => key !== row.key));
                          }}
                        />
                      </td>
                      <td className="p-2">{formatDate(row.billDate)}</td>
                      <td className="p-2 font-bold">{row.billNumber}</td>
                      <td className="p-2">{row.partyName}</td>
                      <td className="p-2 text-right">{money(row.taxableAmount)}</td>
                      <td className="p-2 text-right">
                        <input
                          className="w-16 rounded border px-1 py-1 text-right font-bold"
                          type="number"
                          value={row.commissionPercent}
                          onChange={e => {
                            const percent = Number(e.target.value) || 0;
                            setPickerRows(prev => prev.map(item => item.key === row.key
                              ? { ...item, commissionPercent: percent, commissionAmount: roundMoney(item.taxableAmount * percent / 100) }
                              : item));
                          }}
                        />
                      </td>
                      <td className="p-2 text-right font-bold">{money(row.commissionAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={applyPicker} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-black text-white">Fill gross amount</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
