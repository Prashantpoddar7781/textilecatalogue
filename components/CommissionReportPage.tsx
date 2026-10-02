import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CommissionBill, commissionsApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const money = (value: number) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-IN') : '-');
const inputClass = 'w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold';
const thClass = 'border border-violet-200 bg-violet-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-violet-950';
const tdClass = 'border border-slate-200 px-2 py-1.5 text-xs font-semibold';

export const CommissionReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [broker, setBroker] = useState('');
  const [rows, setRows] = useState<CommissionBill[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await commissionsApi.report({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        broker: broker || undefined
      });
      setRows(result.rows || []);
      setTotals(result.totals || {});
    } catch (err: any) {
      setError(err?.message || 'Could not load the commission report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <ErpTopMenu title="Commission Payable" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-sm font-bold text-indigo-700">Back</button>
          <h1 className="text-lg font-black text-slate-900">Commission Payable</h1>
        </div>
        <div className="mb-3 grid gap-2 rounded-2xl bg-white p-3 shadow-sm md:grid-cols-4">
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">From</span>
            <input className={inputClass} type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">To</span>
            <input className={inputClass} type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Broker</span>
            <input className={inputClass} value={broker} onChange={e => setBroker(e.target.value)} placeholder="All brokers" />
          </label>
          <div className="flex items-end">
            <button type="button" onClick={() => void load()} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-black text-white">Show</button>
          </div>
        </div>
        {error && <p className="mb-3 text-sm font-semibold text-rose-700">{error}</p>}
        {loading ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
        ) : (
          <div className="overflow-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Date', 'V. No.', 'Party', 'Bill nos', 'Rec amt', 'Taxable', 'Comm %', 'Comm amt', 'TDS', 'Net', 'Remark'].map(label => (
                    <th key={label} className={thClass}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-indigo-50"
                    onClick={() => { window.location.href = `/erp/commission?edit=${row.id}`; }}
                  >
                    <td className={tdClass}>{formatDate(row.billDate)}</td>
                    <td className={`${tdClass} text-center font-black text-indigo-700`}>{row.billNumber || '-'}</td>
                    <td className={tdClass}>{row.partyName}</td>
                    <td className={tdClass}>{row.billNos || '-'}</td>
                    <td className={`${tdClass} text-right`}>{money(row.receivedAmount || 0)}</td>
                    <td className={`${tdClass} text-right`}>{money(row.taxableAmount)}</td>
                    <td className={`${tdClass} text-center`}>{row.commissionPercent != null ? row.commissionPercent : '-'}</td>
                    <td className={`${tdClass} text-right`}>{money(row.commissionAmount || row.taxableAmount)}</td>
                    <td className={`${tdClass} text-right`}>{money(row.tdsAmount || 0)}</td>
                    <td className={`${tdClass} text-right`}>{money(row.netPayable || row.grandTotal)}</td>
                    <td className={tdClass}>{row.remarks || ''}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td className={tdClass} colSpan={11}>No commission bills in this period.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-black">
                  <td className={tdClass} colSpan={4}>Total</td>
                  <td className={`${tdClass} text-right`}>{money(totals.receivedAmount || 0)}</td>
                  <td className={`${tdClass} text-right`}>{money(totals.taxableAmount || 0)}</td>
                  <td className={tdClass} />
                  <td className={`${tdClass} text-right`}>{money(totals.taxableAmount || 0)}</td>
                  <td className={`${tdClass} text-right`}>{money(totals.tdsAmount || 0)}</td>
                  <td className={`${tdClass} text-right`}>{money(totals.netPayable || 0)}</td>
                  <td className={tdClass} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
