import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { workReceiptsApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const money = (v: number) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '-');

export const WorkReceiptReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [partyName, setPartyName] = useState('');
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [totals, setTotals] = useState({
    recPcs: 0, recMts: 0, plain: 0, sec: 0, lost: 0, lace: 0, fresh: 0, amount: 0, taxableAmount: 0, invoiceValue: 0
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await workReceiptsApi.getReport({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        partyName: partyName || undefined
      });
      setCompanyName(result.companyName || '');
      setRows(result.rows || []);
      setTotals({
        recPcs: 0, recMts: 0, plain: 0, sec: 0, lost: 0, lace: 0, fresh: 0, amount: 0, taxableAmount: 0, invoiceValue: 0,
        ...(result.totals || {})
      });
    } catch (err: any) {
      setError(err.message || 'Could not load report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { party: string; rows: Array<Record<string, any>>; sub: typeof totals }>();
    for (const row of rows) {
      const key = row.partyName || 'Unknown';
      const cur = map.get(key) || {
        party: key,
        rows: [],
        sub: { recPcs: 0, recMts: 0, plain: 0, sec: 0, lost: 0, lace: 0, fresh: 0, amount: 0, taxableAmount: 0, invoiceValue: 0 }
      };
      cur.rows.push(row);
      cur.sub.recPcs += Number(row.recPcs) || 0;
      cur.sub.recMts += Number(row.recMts) || 0;
      cur.sub.plain += Number(row.plain) || 0;
      cur.sub.sec += Number(row.sec) || 0;
      cur.sub.lost += Number(row.lost) || 0;
      cur.sub.lace += Number(row.lace) || 0;
      cur.sub.fresh += Number(row.fresh) || 0;
      cur.sub.amount += Number(row.amount) || 0;
      map.set(key, cur);
    }
    return Array.from(map.values());
  }, [rows]);

  const openEntry = (row: Record<string, any>) => {
    const id = row.receiptId;
    if (!id) return;
    window.location.href = `/erp/work-receipt?edit=${id}`;
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Work Receipt Report" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <button type="button" onClick={() => { window.location.href = '/erp/work-receipt'; }} className="rounded-xl bg-fuchsia-700 px-3 py-2 text-xs font-black uppercase text-white">
            New Work Receipt
          </button>
        </div>

        <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <h1 className="text-lg font-black uppercase text-gray-900">Work Rec. Bill Detailed Report with Sec/Lost</h1>
          <p className="text-xs font-semibold text-fuchsia-800">Company: {companyName || '-'} · Click any row to edit</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="text-xs font-bold">From<input type="date" className="mt-1 w-full rounded-lg border px-2 py-2" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
            <label className="text-xs font-bold">To<input type="date" className="mt-1 w-full rounded-lg border px-2 py-2" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
            <label className="text-xs font-bold">Party<input className="mt-1 w-full rounded-lg border px-2 py-2" value={partyName} onChange={e => setPartyName(e.target.value)} /></label>
            <div className="flex items-end"><button type="button" onClick={() => void load()} className="w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-black uppercase text-white">Refresh</button></div>
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-700" /></div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-fuchsia-50 text-[10px] uppercase text-fuchsia-900">
                  <tr>
                    <th className="px-3 py-2">Bill Date / Party</th>
                    <th className="px-3 py-2">Bill No.</th>
                    <th className="px-3 py-2">Desp Ch.</th>
                    <th className="px-3 py-2">Item Name</th>
                    <th className="px-3 py-2">Job Type</th>
                    <th className="px-3 py-2 text-right">Pcs</th>
                    <th className="px-3 py-2 text-right">Mts</th>
                    <th className="px-3 py-2 text-right">Plain</th>
                    <th className="px-3 py-2 text-right">Sec</th>
                    <th className="px-3 py-2 text-right">Lost</th>
                    <th className="px-3 py-2 text-right">Lace</th>
                    <th className="px-3 py-2 text-right">Fresh</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Gross Am</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(group => (
                    <React.Fragment key={group.party}>
                      <tr className="bg-rose-50/80">
                        <td colSpan={14} className="px-3 py-2 text-sm font-black uppercase text-rose-800">{group.party}</td>
                      </tr>
                      {group.rows.map(row => (
                        <tr
                          key={row.id}
                          className="cursor-pointer border-b hover:bg-fuchsia-50/70"
                          onClick={() => openEntry(row)}
                          title="Open entry to edit"
                        >
                          <td className="px-3 py-2">{formatDate(row.date)}</td>
                          <td className="px-3 py-2 font-bold text-fuchsia-800">{row.billNo}</td>
                          <td className="px-3 py-2">{row.despChallan}</td>
                          <td className="px-3 py-2">{row.itemName}</td>
                          <td className="px-3 py-2">{row.jobType}</td>
                          <td className="px-3 py-2 text-right">{row.recPcs}</td>
                          <td className="px-3 py-2 text-right">{money(row.recMts)}</td>
                          <td className="px-3 py-2 text-right">{money(row.plain)}</td>
                          <td className="px-3 py-2 text-right">{money(row.sec)}</td>
                          <td className="px-3 py-2 text-right">{money(row.lost)}</td>
                          <td className="px-3 py-2 text-right">{money(row.lace)}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-800">{money(row.fresh)}</td>
                          <td className="px-3 py-2 text-right">{money(row.rate)}</td>
                          <td className="px-3 py-2 text-right font-bold">{money(row.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-sky-50 text-[11px] font-black uppercase">
                        <td className="px-3 py-2" colSpan={5}>Party Subtotal</td>
                        <td className="px-3 py-2 text-right">{group.sub.recPcs}</td>
                        <td className="px-3 py-2 text-right">{money(group.sub.recMts)}</td>
                        <td className="px-3 py-2 text-right">{money(group.sub.plain)}</td>
                        <td className="px-3 py-2 text-right">{money(group.sub.sec)}</td>
                        <td className="px-3 py-2 text-right">{money(group.sub.lost)}</td>
                        <td className="px-3 py-2 text-right">{money(group.sub.lace)}</td>
                        <td className="px-3 py-2 text-right">{money(group.sub.fresh)}</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right">{money(group.sub.amount)}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={14} className="px-3 py-10 text-center text-sm text-gray-500">No work receipt entries.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-[11px] font-black uppercase text-white">
                    <td className="px-3 py-2" colSpan={5}>Grand Total · Invoice {money(totals.invoiceValue)}</td>
                    <td className="px-3 py-2 text-right">{totals.recPcs}</td>
                    <td className="px-3 py-2 text-right">{money(totals.recMts)}</td>
                    <td className="px-3 py-2 text-right">{money(totals.plain || 0)}</td>
                    <td className="px-3 py-2 text-right">{money(totals.sec || 0)}</td>
                    <td className="px-3 py-2 text-right">{money(totals.lost || 0)}</td>
                    <td className="px-3 py-2 text-right">{money(totals.lace || 0)}</td>
                    <td className="px-3 py-2 text-right">{money(totals.fresh || 0)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right">{money(totals.amount || totals.taxableAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
