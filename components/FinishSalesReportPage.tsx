import React, { useEffect, useState } from 'react';
import { ArrowLeft, Filter, Loader2, RefreshCw, X } from 'lucide-react';
import { salesOrdersApi } from '../services/api';

interface Props { onBack: () => void; }
type Row = Record<string, any>;
const today = () => new Date().toISOString().slice(0, 10);
const firstDay = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
const n = (value: unknown) => Number(value) || 0;
const money = (value: unknown) => n(value).toFixed(2);

export const FinishSalesReportPage: React.FC<Props> = ({ onBack }) => {
  const [filters, setFilters] = useState({ fromDate: firstDay(), toDate: today(), partyName: '', brokerName: '', transportName: '' });
  const [quickFilterOpen, setQuickFilterOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await salesOrdersApi.getFinishReport(filters);
      setRows(result.rows || []);
      setTotals(result.totals || {});
    } catch (err: any) {
      setError(err.message || 'Could not load Finish Sales register.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);
  const set = (key: keyof typeof filters, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen bg-[#e8e8dc] text-slate-950">
      <header className="border-b border-slate-400 bg-[#deded2] px-3 py-2 shadow-sm">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold"><ArrowLeft className="h-4 w-4" /> ERP</button>
          <h1 className="font-mono text-lg font-black tracking-[0.35em] text-indigo-950">SALES REGISTER</h1>
          <button onClick={load} className="border border-slate-400 bg-[#eeeeE5] p-1.5"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] p-3">
        <section className="border border-slate-500 bg-[#f1f0e5] shadow">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-400 px-3 py-2 font-mono text-xs font-bold uppercase">
            <span className="text-indigo-900">Company: Finish Sales</span>
            <label>From Date <input className="legacy-filter" type="date" value={filters.fromDate} onChange={e => set('fromDate', e.target.value)} /></label>
            <label>To Date <input className="legacy-filter" type="date" value={filters.toDate} onChange={e => set('toDate', e.target.value)} /></label>
            <button onClick={load} className="border border-indigo-900 bg-indigo-900 px-4 py-1.5 text-white">Show</button>
            <button onClick={() => setQuickFilterOpen(open => !open)} className="flex items-center gap-1 border border-slate-500 bg-[#e4e3d7] px-3 py-1.5">
              <Filter className="h-3.5 w-3.5" /> F6 Quick Filter
            </button>
          </div>

          {quickFilterOpen && (
            <div className="flex flex-wrap items-end gap-3 border-b border-slate-400 bg-[#e4e3d7] px-3 py-2">
              <label className="text-[10px] font-black uppercase">Party <input className="legacy-filter" value={filters.partyName} onChange={e => set('partyName', e.target.value)} /></label>
              <label className="text-[10px] font-black uppercase">Broker <input className="legacy-filter" value={filters.brokerName} onChange={e => set('brokerName', e.target.value)} /></label>
              <label className="text-[10px] font-black uppercase">Transport <input className="legacy-filter" value={filters.transportName} onChange={e => set('transportName', e.target.value)} /></label>
              <button onClick={() => setFilters(prev => ({ ...prev, partyName: '', brokerName: '', transportName: '' }))} className="flex items-center gap-1 border border-slate-500 px-2 py-1 text-xs font-bold"><X className="h-3 w-3" /> Clear</button>
            </div>
          )}

          {error && <div className="border-b border-red-400 bg-red-50 p-2 text-xs font-bold text-red-700">{error}</div>}
          <div className="overflow-x-auto">
            <table className="min-w-[1550px] w-full border-collapse font-mono text-[11px]">
              <thead className="bg-[#d6d5c8]">
                <tr>
                  {['PARTY NAME', 'BILL DATE', 'V.NO.', 'BILL NO.', 'LR NO.', 'TRANSPORT', 'ORDER', 'PCS', 'MTS', 'GROSS ITEM', 'TAXABLE VAL.', 'LEDGER AMT.', 'INVOICE VAL.', 'BROKER'].map(head => (
                    <th key={head} className="legacy-head">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={14} className="p-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></td></tr>}
                {!loading && rows.length === 0 && <tr><td colSpan={14} className="p-12 text-center font-bold text-slate-500">NO FINISH SALES BILLS FOUND</td></tr>}
                {!loading && rows.map(row => (
                  <tr key={row.id} onClick={() => { window.location.href = `/erp/sales?edit=${row.id}&kind=bill`; }} className="cursor-pointer hover:bg-yellow-100">
                    <td className="legacy-cell font-bold">{row.partyName}</td>
                    <td className="legacy-cell">{new Date(row.date).toLocaleDateString('en-GB')}</td>
                    <td className="legacy-cell text-right">{row.voucherNo || ''}</td>
                    <td className="legacy-cell text-right">{row.billNo || ''}</td>
                    <td className="legacy-cell">{row.lrNo || ''}</td>
                    <td className="legacy-cell">{row.transportName || ''}</td>
                    <td className="legacy-cell text-right">{row.orderRef || 0}</td>
                    <td className="legacy-cell text-right">{money(row.pcs)}</td>
                    <td className="legacy-cell text-right">{money(row.mts)}</td>
                    <td className="legacy-cell text-right">{money(row.grossAmount)}</td>
                    <td className="legacy-cell text-right">{money(row.taxableAmount)}</td>
                    <td className="legacy-cell text-right">{money(row.ledgerAmount)}</td>
                    <td className="legacy-cell text-right font-bold">{money(row.invoiceValue)}</td>
                    <td className="legacy-cell">{row.brokerName || ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#bbb7a6] font-black">
                <tr>
                  <td colSpan={7} className="legacy-cell">GRAND TOTAL</td>
                  {['pcs', 'mts', 'grossAmount', 'taxableAmount', 'ledgerAmount', 'invoiceValue'].map(key => (
                    <td key={key} className="legacy-cell text-right">{money(totals[key])}</td>
                  ))}
                  <td className="legacy-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="border-t border-slate-400 px-3 py-1.5 font-mono text-[10px]">F3-VIEW ENTRY · UP ARROW-DETAIL ENTRY · F6-QUICK FILTER · Click any bill to edit</div>
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
