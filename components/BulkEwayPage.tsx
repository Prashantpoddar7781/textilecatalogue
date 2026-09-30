import React, { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { BulkEwayRow, ewayBillsApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const SALE_BILL_TYPES = [
  { value: 'FINISH SALES', label: 'Finish Sales' },
  { value: 'FINISH SALES (GST)', label: 'Finish Sales (GST)' },
  { value: 'GREY SALES', label: 'Grey Sales' },
  { value: 'CASH SALES', label: 'Cash Sales' },
  { value: 'FENT SALES', label: 'Fent Sales' }
];

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-IN') : '');

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const labelText = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const thClass = 'border border-indigo-200 bg-indigo-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-indigo-950 whitespace-nowrap';
const tdClass = 'border border-slate-200 px-2 py-1.5 align-middle text-xs font-semibold text-slate-800';

export const BulkEwayPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [documentType] = useState('Sale Bill');
  const [transactionType, setTransactionType] = useState('FINISH SALES');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [rows, setRows] = useState<BulkEwayRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState<Array<{ id: string; billNo: string; details: string[] }>>([]);

  const selectableIds = useMemo(
    () => rows.filter(row => !row.ewayBillNo).map(row => row.id),
    [rows]
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.includes(id));

  const load = async () => {
    setLoading(true);
    setError('');
    setMissing([]);
    try {
      const result = await ewayBillsApi.listSales({ fromDate, toDate, transactionType });
      setRows(result.rows || []);
      setSelected([]);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message || 'Could not load sale bills.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    setSelected(allSelected ? [] : selectableIds);
  };

  const generate = async () => {
    if (!selected.length) return;
    setGenerating(true);
    setError('');
    try {
      const result = await ewayBillsApi.generateBulk(selected);
      const byId = new Map((result.generated || []).map(item => [item.id, item]));
      setRows(prev => prev.map(row => {
        const made = byId.get(row.id);
        if (!made?.ewayBillNo) return row;
        return { ...row, ewayBillNo: made.ewayBillNo, ewayBillDate: made.ewayBillDate || row.ewayBillDate, missing: [] };
      }));
      setSelected([]);
      setMissing(result.missing || []);
    } catch (err: any) {
      setError(err.message || 'Could not generate the e-way bills.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Bulk E-Way" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-6">
            <label>
              <span className={labelText}>Document type</span>
              <select className={inputClass} value={documentType} onChange={() => undefined}>
                <option>Sale Bill</option>
              </select>
            </label>
            <label>
              <span className={labelText}>Type</span>
              <select className={inputClass} value={transactionType} onChange={e => setTransactionType(e.target.value)}>
                {SALE_BILL_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelText}>From date</span>
              <input className={inputClass} type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label>
              <span className={labelText}>To date</span>
              <input className={inputClass} type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="w-full rounded-xl bg-slate-800 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50"
              >
                {loading ? 'Loading…' : 'View'}
              </button>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void generate()}
                disabled={generating || selected.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40"
              >
                {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Generate E-Way
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[1100px] w-full border-collapse">
            <thead>
              <tr>
                <th className={thClass}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!selectableIds.length} aria-label="Select all bills" />
                </th>
                <th className={thClass}>Party</th>
                <th className={thClass}>Bill No.</th>
                <th className={thClass}>Date</th>
                <th className={thClass}>LR No.</th>
                <th className={thClass}>Transporter</th>
                <th className={thClass}>Vehicle No.</th>
                <th className={thClass}>E-Way Bill No.</th>
                <th className={thClass}>E-Way Date</th>
                <th className={thClass}>Delivery At</th>
                <th className={thClass}>GST %</th>
                <th className={thClass}>HSN</th>
                <th className={thClass}>Meters</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Tax</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-indigo-50/40">
                  <td className={`${tdClass} text-center`}>
                    <input
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      disabled={Boolean(row.ewayBillNo)}
                      onChange={() => toggle(row.id)}
                      aria-label={`Select ${row.billNo}`}
                    />
                  </td>
                  <td className={tdClass}>{row.partyName}</td>
                  <td className={`${tdClass} text-center`}>
                    <button
                      type="button"
                      className="font-black text-indigo-700 underline"
                      onClick={() => { window.location.href = `/erp/sales?edit=${row.id}&kind=bill`; }}
                    >
                      {row.billNo}
                    </button>
                  </td>
                  <td className={`${tdClass} text-center whitespace-nowrap`}>{formatDate(row.date)}</td>
                  <td className={tdClass}>{row.lrNo}</td>
                  <td className={tdClass}>{row.transporter}</td>
                  <td className={`${tdClass} text-center`}>{row.vehicleNo}</td>
                  <td className={`${tdClass} text-center font-black text-emerald-800`}>{row.ewayBillNo}</td>
                  <td className={`${tdClass} text-center whitespace-nowrap`}>{formatDate(row.ewayBillDate)}</td>
                  <td className={tdClass}>{row.deliveryAt}</td>
                  <td className={`${tdClass} text-center`}>{row.gstRate === '' || row.gstRate == null ? '' : row.gstRate}</td>
                  <td className={`${tdClass} text-center`}>{row.hsn}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{row.totalMeters || ''}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{money(row.totalAmount)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{money(row.totalTax)}</td>
                </tr>
              ))}
              {!loading && loaded && rows.length === 0 && (
                <tr>
                  <td className={`${tdClass} py-8 text-center text-slate-500`} colSpan={15}>
                    No sale bills on these dates.
                  </td>
                </tr>
              )}
              {!loaded && !loading && (
                <tr>
                  <td className={`${tdClass} py-8 text-center text-slate-500`} colSpan={15}>
                    Choose the dates and click View.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {missing.length > 0 && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-black uppercase tracking-wide">Details missing for e-way</h3>
              <button type="button" onClick={() => setMissing([])} className="rounded-lg border p-1.5 text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
              {missing.map(item => (
                <div key={item.id} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <p className="text-sm font-black text-rose-900">Bill {item.billNo}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-rose-800">
                    {item.details.map(detail => <li key={detail}>{detail}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
