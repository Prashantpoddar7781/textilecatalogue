import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { salesOrdersApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const money = (v: number) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '-');
const emptyTotals = () => ({
  orderPcs: 0, soldPcs: 0, pendingPcs: 0, orderMts: 0, soldMts: 0, pendingMts: 0, netAmount: 0
});

export const SalesOrderReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [partyName, setPartyName] = useState('');
  const [mainScreen, setMainScreen] = useState('');
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [totals, setTotals] = useState(emptyTotals());

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await salesOrdersApi.getReport({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        partyName: partyName || undefined,
        mainScreen: mainScreen || undefined,
        status: status || undefined
      });
      setRows(result.rows || []);
      setTotals({ ...emptyTotals(), ...(result.totals || {}) });
    } catch (err: any) {
      setError(err.message || 'Could not load Sales Order report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { party: string; rows: Array<Record<string, any>>; sub: ReturnType<typeof emptyTotals> }>();
    for (const row of rows) {
      const key = row.partyName || 'Unknown';
      const cur = map.get(key) || { party: key, rows: [], sub: emptyTotals() };
      cur.rows.push(row);
      cur.sub.orderPcs += Number(row.orderPcs) || 0;
      cur.sub.soldPcs += Number(row.soldPcs) || 0;
      cur.sub.pendingPcs += Number(row.pendingPcs) || 0;
      cur.sub.orderMts += Number(row.orderMts) || 0;
      cur.sub.soldMts += Number(row.soldMts) || 0;
      cur.sub.pendingMts += Number(row.pendingMts) || 0;
      cur.sub.netAmount += Number(row.netAmount) || 0;
      map.set(key, cur);
    }
    return Array.from(map.values());
  }, [rows]);

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Sales Order Report" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <button type="button" onClick={() => { window.location.href = '/erp/sales-order'; }} className="rounded-xl bg-indigo-700 px-3 py-2 text-xs font-black uppercase text-white">
            New Sales Order
          </button>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">From</span><input type="date" className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">To</span><input type="date" className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Party</span><input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={partyName} onChange={e => setPartyName(e.target.value)} /></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Main Screen</span><input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={mainScreen} onChange={e => setMainScreen(e.target.value)} /></label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Status</span>
              <select className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="pending">Pending Items</option>
                <option value="all">All</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => void load()} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black uppercase text-white">Show</button>
            </div>
          </div>
        </section>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-indigo-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-indigo-800">
            Day-wise · Party-wise · Click any row to edit · Ordered / Sold / Pending
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1400px] w-full text-left text-xs">
              <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr>
                  {['Date', 'Sr No.', 'Main Screen', 'Screen Name', 'Packing', 'Cut', 'PCS', 'Sale P.', 'Pend P.', 'MTS', 'Sale M.', 'Pend M.', 'Rate', 'Net Amt.', 'Haste', 'Broker'].map(head => (
                    <th key={head} className="px-2 py-2 font-black">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={16} className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" /></td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={16} className="p-10 text-center font-bold text-gray-400">No Sales Orders found.</td></tr>
                )}
                {!loading && grouped.map(group => (
                  <React.Fragment key={group.party}>
                    <tr className="bg-indigo-50/70">
                      <td colSpan={16} className="px-2 py-2 text-sm font-black text-indigo-900">{group.party}</td>
                    </tr>
                    {group.rows.map(row => (
                      <tr
                        key={row.id}
                        onClick={() => { window.location.href = `/erp/sales-order?edit=${row.salesOrderId}`; }}
                        className="cursor-pointer border-b hover:bg-indigo-50"
                      >
                        <td className="px-2 py-2">{formatDate(row.date)}</td>
                        <td className="px-2 py-2 font-bold">{row.orderNo}</td>
                        <td className="px-2 py-2">{row.mainScreen}</td>
                        <td className="px-2 py-2 font-semibold">{row.itemName}</td>
                        <td className="px-2 py-2">{row.packing}</td>
                        <td className="px-2 py-2 text-right">{money(row.cut)}</td>
                        <td className="px-2 py-2 text-right">{money(row.orderPcs)}</td>
                        <td className="px-2 py-2 text-right">{money(row.soldPcs)}</td>
                        <td className="px-2 py-2 text-right font-black">{money(row.pendingPcs)}</td>
                        <td className="px-2 py-2 text-right">{money(row.orderMts)}</td>
                        <td className="px-2 py-2 text-right">{money(row.soldMts)}</td>
                        <td className="px-2 py-2 text-right font-black">{money(row.pendingMts)}</td>
                        <td className="px-2 py-2 text-right">{money(row.rate)}</td>
                        <td className="px-2 py-2 text-right">{money(row.netAmount)}</td>
                        <td className="px-2 py-2">{row.haste || '-'}</td>
                        <td className="px-2 py-2">{row.brokerName || '-'}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-black">
                      <td colSpan={6} className="px-2 py-2 text-right">Party Subtotal</td>
                      <td className="px-2 py-2 text-right">{money(group.sub.orderPcs)}</td>
                      <td className="px-2 py-2 text-right">{money(group.sub.soldPcs)}</td>
                      <td className="px-2 py-2 text-right">{money(group.sub.pendingPcs)}</td>
                      <td className="px-2 py-2 text-right">{money(group.sub.orderMts)}</td>
                      <td className="px-2 py-2 text-right">{money(group.sub.soldMts)}</td>
                      <td className="px-2 py-2 text-right">{money(group.sub.pendingMts)}</td>
                      <td />
                      <td className="px-2 py-2 text-right">{money(group.sub.netAmount)}</td>
                      <td colSpan={2} />
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="bg-indigo-900 font-black text-white">
                <tr>
                  <td colSpan={6} className="px-2 py-2 text-right">Grand Total</td>
                  <td className="px-2 py-2 text-right">{money(totals.orderPcs)}</td>
                  <td className="px-2 py-2 text-right">{money(totals.soldPcs)}</td>
                  <td className="px-2 py-2 text-right">{money(totals.pendingPcs)}</td>
                  <td className="px-2 py-2 text-right">{money(totals.orderMts)}</td>
                  <td className="px-2 py-2 text-right">{money(totals.soldMts)}</td>
                  <td className="px-2 py-2 text-right">{money(totals.pendingMts)}</td>
                  <td />
                  <td className="px-2 py-2 text-right">{money(totals.netAmount)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};
