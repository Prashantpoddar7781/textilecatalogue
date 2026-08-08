import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { salesOrdersApi } from '../services/api';

interface Props { onBack: () => void; }
type Row = Record<string, any>;
const today = () => new Date().toISOString().slice(0, 10);
const firstDay = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
const money = (value: unknown) => (Number(value) || 0).toFixed(2);
const sum = (rows: Row[], key: string) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

export const FinishSalesReportPage: React.FC<Props> = ({ onBack }) => {
  const [filters, setFilters] = useState({ fromDate: firstDay(), toDate: today(), partyName: '', brokerName: '', transportName: '' });
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

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    rows.forEach(row => {
      const key = row.partyName || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return map;
  }, [rows]);

  const set = (key: keyof typeof filters, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" /> ERP</button>
          <div className="text-center"><h1 className="text-lg font-black">Finish Sales Register</h1><p className="text-[10px] font-bold uppercase text-rose-600">Accounting sales bills</p></div>
          <button onClick={load} className="rounded-lg bg-rose-50 p-2 text-rose-700"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </header>
      <main className="mx-auto max-w-[1700px] p-4">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Filter label="From"><input type="date" value={filters.fromDate} onChange={e => set('fromDate', e.target.value)} /></Filter>
            <Filter label="To"><input type="date" value={filters.toDate} onChange={e => set('toDate', e.target.value)} /></Filter>
            <Filter label="Party"><input value={filters.partyName} onChange={e => set('partyName', e.target.value)} /></Filter>
            <Filter label="Broker"><input value={filters.brokerName} onChange={e => set('brokerName', e.target.value)} /></Filter>
            <Filter label="Transport"><input value={filters.transportName} onChange={e => set('transportName', e.target.value)} /></Filter>
          </div>
          <button onClick={load} className="mt-3 rounded-lg bg-rose-600 px-6 py-2 text-xs font-black uppercase text-white">Apply filters</button>
        </section>
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
        <section className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1450px] w-full border-collapse text-xs">
              <thead className="bg-slate-900 text-white"><tr>
                {['Bill Date', 'Bill No', 'Voucher', 'Party', 'LR', 'Transport', 'Order Ref', 'PCS', 'MTS', 'Gross', 'Taxable', 'Ledger Amount', 'Invoice Value', 'Broker'].map(head => <th key={head} className="border border-slate-700 px-2 py-2 text-left uppercase">{head}</th>)}
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={14} className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-rose-600" /></td></tr>}
                {!loading && rows.length === 0 && <tr><td colSpan={14} className="p-10 text-center font-bold text-slate-400">No Finish Sales bills found.</td></tr>}
                {!loading && Array.from(groups.entries()).map(([party, partyRows]) => (
                  <React.Fragment key={party}>
                    {partyRows.map(row => (
                      <tr key={row.id} onClick={() => { window.location.href = `/erp/sales?edit=${row.id}&kind=bill`; }} className="cursor-pointer odd:bg-white even:bg-slate-50 hover:bg-rose-50">
                        <Cell>{new Date(row.date).toLocaleDateString('en-IN')}</Cell><Cell strong>{row.billNo}</Cell><Cell>{row.voucherNo}</Cell><Cell strong>{row.partyName}</Cell>
                        <Cell>{row.lrNo || '-'}</Cell><Cell>{row.transportName || '-'}</Cell><Cell>{row.orderRef || '-'}</Cell>
                        <Cell>{row.pcs}</Cell><Cell>{row.mts}</Cell><Cell>{money(row.grossAmount)}</Cell><Cell>{money(row.taxableAmount)}</Cell>
                        <Cell>{money(row.ledgerAmount)}</Cell><Cell strong>{money(row.invoiceValue)}</Cell><Cell>{row.brokerName || '-'}</Cell>
                      </tr>
                    ))}
                    <tr className="bg-rose-50 font-black text-rose-900">
                      <td colSpan={7} className="border p-2 text-right">{party} subtotal</td>
                      {['pcs', 'mts', 'grossAmount', 'taxableAmount', 'ledgerAmount', 'invoiceValue'].map(key => <td key={key} className="border p-2 text-right">{money(sum(partyRows, key))}</td>)}
                      <td className="border" />
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 font-black text-white"><tr>
                <td colSpan={7} className="border border-slate-700 p-2 text-right">GRAND TOTAL</td>
                {['pcs', 'mts', 'grossAmount', 'taxableAmount', 'ledgerAmount', 'invoiceValue'].map(key => <td key={key} className="border border-slate-700 p-2 text-right">{money(totals[key])}</td>)}
                <td className="border border-slate-700" />
              </tr></tfoot>
            </table>
          </div>
          <p className="border-t p-3 text-xs font-bold text-slate-500">Click any saved row to open the Finish Sales bill in edit mode.</p>
        </section>
      </main>
    </div>
  );
};

const Filter: React.FC<{ label: string; children: React.ReactElement<any> }> = ({ label, children }) => (
  <label><span className="mb-1 block text-[10px] font-black uppercase text-slate-500">{label}</span>{React.cloneElement(children, { className: 'w-full rounded-lg border px-2 py-2 text-xs font-semibold' })}</label>
);
const Cell: React.FC<{ children: React.ReactNode; strong?: boolean }> = ({ children, strong }) => <td className={`border px-2 py-2 ${strong ? 'font-black' : ''}`}>{children}</td>;
