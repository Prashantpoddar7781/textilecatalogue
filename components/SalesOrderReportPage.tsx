import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Filter, Loader2, RefreshCw, X } from 'lucide-react';
import { salesOrdersApi } from '../services/api';

interface Props { onBack: () => void; }
type Row = Record<string, any>;
const today = () => new Date().toISOString().slice(0, 10);
const firstDay = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
const n = (value: unknown) => Number(value) || 0;
const qty = (value: unknown) => n(value).toFixed(2);
const amount = (value: unknown) => n(value).toFixed(2);
const total = (rows: Row[], key: string) => rows.reduce((sum, row) => sum + n(row[key]), 0);

export const SalesOrderReportPage: React.FC<Props> = ({ onBack }) => {
  const [filters, setFilters] = useState({
    fromDate: firstDay(), toDate: today(), partyName: '', mainScreen: '',
    itemName: '', brokerName: '', haste: '', status: 'pending'
  });
  const [quickFilterOpen, setQuickFilterOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await salesOrdersApi.getReport(filters);
      setRows(result.rows || []);
      setTotals(result.totals || {});
    } catch (err: any) {
      setError(err.message || 'Could not load Sales Order report.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const dates = new Map<string, Map<string, Row[]>>();
    rows.forEach(row => {
      const date = String(row.date || '').slice(0, 10);
      if (!dates.has(date)) dates.set(date, new Map());
      const parties = dates.get(date)!;
      if (!parties.has(row.partyName)) parties.set(row.partyName, []);
      parties.get(row.partyName)!.push(row);
    });
    return dates;
  }, [rows]);

  const set = (key: keyof typeof filters, value: string) => setFilters(prev => ({ ...prev, [key]: value }));
  const clearQuickFilters = () => setFilters(prev => ({ ...prev, partyName: '', mainScreen: '', itemName: '', brokerName: '', haste: '' }));

  const quantityCells = (source: Row[] | Record<string, number>) => {
    const read = (key: string) => Array.isArray(source) ? total(source, key) : n(source[key]);
    return ['orderPcs', 'soldPcs', 'pendingPcs', 'orderMts', 'soldMts', 'pendingMts'].map(key => (
      <td key={key} className="legacy-cell text-right">{qty(read(key))}</td>
    ));
  };

  return (
    <div className="min-h-screen bg-[#e8e8dc] text-slate-950">
      <header className="border-b border-slate-400 bg-[#deded2] px-3 py-2 shadow-sm">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold"><ArrowLeft className="h-4 w-4" /> ERP</button>
          <h1 className="font-mono text-lg font-black tracking-[0.35em] text-indigo-950">SALES ORDER REPORT</h1>
          <button onClick={load} className="border border-slate-400 bg-[#eeeeE5] p-1.5"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] p-3">
        <section className="border border-slate-500 bg-[#f1f0e5] shadow">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-400 px-3 py-2 font-mono text-xs font-bold uppercase">
            <span className="text-indigo-900">Day-wise, Party-wise</span>
            <label>From Date <input className="legacy-filter" type="date" value={filters.fromDate} onChange={e => set('fromDate', e.target.value)} /></label>
            <label>To Date <input className="legacy-filter" type="date" value={filters.toDate} onChange={e => set('toDate', e.target.value)} /></label>
            <label>View
              <select className="legacy-filter" value={filters.status} onChange={e => set('status', e.target.value)}>
                <option value="pending">Pending Items</option>
                <option value="all">All Orders</option>
                <option value="closed">Closed Orders</option>
              </select>
            </label>
            <button onClick={load} className="border border-indigo-900 bg-indigo-900 px-4 py-1.5 text-white">Show</button>
            <button onClick={() => setQuickFilterOpen(open => !open)} className="flex items-center gap-1 border border-slate-500 bg-[#e4e3d7] px-3 py-1.5">
              <Filter className="h-3.5 w-3.5" /> F6 Quick Filter
            </button>
          </div>

          {quickFilterOpen && (
            <div className="flex flex-wrap items-end gap-2 border-b border-slate-400 bg-[#e4e3d7] px-3 py-2">
              {[
                ['Party', 'partyName'], ['Main Screen', 'mainScreen'], ['Screen Name', 'itemName'],
                ['Broker', 'brokerName'], ['Haste', 'haste']
              ].map(([label, key]) => (
                <label key={key} className="text-[10px] font-black uppercase">{label}
                  <input className="legacy-filter ml-1" value={(filters as any)[key]} onChange={e => set(key as keyof typeof filters, e.target.value)} />
                </label>
              ))}
              <button onClick={clearQuickFilters} className="flex items-center gap-1 border border-slate-500 px-2 py-1 text-xs font-bold"><X className="h-3 w-3" /> Clear</button>
            </div>
          )}

          {error && <div className="border-b border-red-400 bg-red-50 p-2 text-xs font-bold text-red-700">{error}</div>}
          <div className="overflow-x-auto">
            <table className="min-w-[1500px] w-full border-collapse font-mono text-[11px]">
              <thead className="bg-[#d6d5c8] text-slate-950">
                <tr>
                  {['DATE', 'SR NO.', 'MAIN SCREEN', 'SCREEN NAME', 'PACKING', 'CUT', 'PCS', 'SALE PCS', 'PEND PCS', 'MTS', 'SALE MTS', 'PEND MTS', 'RATE', 'NET AMT.', 'HASTE', 'BROKER'].map(head => (
                    <th key={head} className="legacy-head">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={16} className="p-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></td></tr>}
                {!loading && rows.length === 0 && <tr><td colSpan={16} className="p-12 text-center font-bold text-slate-500">NO SALES ORDER ITEMS FOUND</td></tr>}
                {!loading && Array.from(grouped.entries()).map(([date, parties]) => (
                  <React.Fragment key={date}>
                    {Array.from(parties.entries()).map(([party, partyRows]) => (
                      <React.Fragment key={`${date}-${party}`}>
                        <tr className="bg-[#eeeade]"><td colSpan={16} className="legacy-cell font-black text-indigo-950">{party}</td></tr>
                        {partyRows.map(row => (
                          <tr key={row.id} onClick={() => { window.location.href = `/erp/sales?edit=${row.salesOrderId}&kind=order`; }} className="cursor-pointer hover:bg-yellow-100">
                            <td className="legacy-cell">{new Date(row.date).toLocaleDateString('en-GB')}</td>
                            <td className="legacy-cell text-right">{row.orderNo}</td>
                            <td className="legacy-cell">{row.mainScreen}</td>
                            <td className="legacy-cell font-bold">{row.itemName}</td>
                            <td className="legacy-cell">{row.packing}</td>
                            <td className="legacy-cell text-right">{qty(row.cut)}</td>
                            <td className="legacy-cell text-right">{qty(row.orderPcs)}</td>
                            <td className="legacy-cell text-right">{qty(row.soldPcs)}</td>
                            <td className="legacy-cell text-right font-bold">{qty(row.pendingPcs)}</td>
                            <td className="legacy-cell text-right">{qty(row.orderMts)}</td>
                            <td className="legacy-cell text-right">{qty(row.soldMts)}</td>
                            <td className="legacy-cell text-right font-bold">{qty(row.pendingMts)}</td>
                            <td className="legacy-cell text-right">{amount(row.rate)}</td>
                            <td className="legacy-cell text-right">{amount(row.netAmount)}</td>
                            <td className="legacy-cell">{row.haste || ''}</td>
                            <td className="legacy-cell">{row.brokerName || ''}</td>
                          </tr>
                        ))}
                        <tr className="bg-[#ddd9c9] font-black">
                          <td colSpan={6} className="legacy-cell">PARTY SUBTOTAL</td>
                          {quantityCells(partyRows)}
                          <td className="legacy-cell" />
                          <td className="legacy-cell text-right">{amount(total(partyRows, 'netAmount'))}</td>
                          <td colSpan={2} className="legacy-cell" />
                        </tr>
                      </React.Fragment>
                    ))}
                    <tr className="bg-[#cbc7b5] font-black text-indigo-950">
                      <td colSpan={6} className="legacy-cell">DATE SUBTOTAL {new Date(date).toLocaleDateString('en-GB')}</td>
                      {quantityCells(Array.from(parties.values()).flat())}
                      <td className="legacy-cell" />
                      <td className="legacy-cell text-right">{amount(total(Array.from(parties.values()).flat(), 'netAmount'))}</td>
                      <td colSpan={2} className="legacy-cell" />
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="bg-[#bbb7a6] font-black">
                <tr>
                  <td colSpan={6} className="legacy-cell">GRAND TOTAL</td>
                  {quantityCells(totals)}
                  <td className="legacy-cell text-right">{rows.length ? amount(rows.reduce((sum, row) => sum + n(row.rate), 0) / rows.length) : '0.00'}</td>
                  <td className="legacy-cell text-right">{amount(totals.netAmount)}</td>
                  <td colSpan={2} className="legacy-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="border-t border-slate-400 px-3 py-1.5 font-mono text-[10px]">F3-VIEW ENTRY · UP ARROW-DETAIL ENTRY · F6-QUICK FILTER · Click any line to edit</div>
        </section>
      </main>
      <style>{`
        .legacy-filter { margin-left:.3rem; border:1px solid #8b8b7f; background:#faf9ed; padding:.25rem .4rem; font-size:11px; font-weight:700; }
        .legacy-head { border:1px solid #9a998d; padding:.35rem .4rem; text-align:left; white-space:nowrap; }
        .legacy-cell { border:1px solid #a9a89b; padding:.3rem .4rem; white-space:nowrap; }
      `}</style>
    </div>
  );
};
