import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { workDespatchesApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const money = (v: number) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '-');

export const WorkDespatchReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [partyName, setPartyName] = useState('');
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [totals, setTotals] = useState({ desPcs: 0, desMts: 0, pendingPcs: 0, pendingMts: 0 });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await workDespatchesApi.getReport({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        partyName: partyName || undefined
      });
      setCompanyName(result.companyName || '');
      setRows(result.rows || []);
      setTotals(result.totals || { desPcs: 0, desMts: 0, pendingPcs: 0, pendingMts: 0 });
    } catch (err: any) {
      setError(err.message || 'Could not load report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Work Despatch Report" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <button type="button" onClick={() => { window.location.href = '/erp/work-despatch'; }} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-black uppercase text-white">
            New Work Despatch
          </button>
        </div>

        <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <h1 className="text-lg font-black uppercase text-gray-900">Work Desp All Status Report</h1>
          <p className="text-xs font-semibold text-violet-800">Company: {companyName || '-'} · Click any row to edit</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="text-xs font-bold">From<input type="date" className="mt-1 w-full rounded-lg border px-2 py-2" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
            <label className="text-xs font-bold">To<input type="date" className="mt-1 w-full rounded-lg border px-2 py-2" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
            <label className="text-xs font-bold">Party<input className="mt-1 w-full rounded-lg border px-2 py-2" value={partyName} onChange={e => setPartyName(e.target.value)} /></label>
            <div className="flex items-end"><button type="button" onClick={() => void load()} className="w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-black uppercase text-white">Refresh</button></div>
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-violet-700" /></div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b bg-violet-50 text-[10px] uppercase text-violet-900">
                <tr>
                  <th className="px-3 py-2">Party Name</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Chal.</th>
                  <th className="px-3 py-2">Item Name</th>
                  <th className="px-3 py-2">Job Type</th>
                  <th className="px-3 py-2 text-right">Des.</th>
                  <th className="px-3 py-2 text-right">Mts.</th>
                  <th className="px-3 py-2 text-right">Pen.</th>
                  <th className="px-3 py-2 text-right">Pend.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b hover:bg-violet-50/50"
                    onClick={() => {
                      const id = row.despatchId || row.id;
                      if (id) window.location.href = `/erp/work-despatch?edit=${id}`;
                    }}
                    title="Open entry to edit"
                  >
                    <td className="px-3 py-2 font-semibold">{row.partyName}</td>
                    <td className="px-3 py-2">{formatDate(row.date)}</td>
                    <td className="px-3 py-2 font-bold text-violet-800">{row.challanNo}</td>
                    <td className="px-3 py-2">{row.itemName}</td>
                    <td className="px-3 py-2">{row.jobType}</td>
                    <td className="px-3 py-2 text-right">{row.desPcs}</td>
                    <td className="px-3 py-2 text-right">{money(row.desMts)}</td>
                    <td className="px-3 py-2 text-right text-amber-800">{row.pendingPcs}</td>
                    <td className="px-3 py-2 text-right text-amber-800">{money(row.pendingMts)}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-gray-500">No work despatch entries.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-[11px] font-black uppercase text-white">
                  <td className="px-3 py-2" colSpan={5}>Grand Total</td>
                  <td className="px-3 py-2 text-right">{totals.desPcs}</td>
                  <td className="px-3 py-2 text-right">{money(totals.desMts)}</td>
                  <td className="px-3 py-2 text-right">{totals.pendingPcs}</td>
                  <td className="px-3 py-2 text-right">{money(totals.pendingMts)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};
