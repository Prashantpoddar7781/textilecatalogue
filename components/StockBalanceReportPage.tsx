import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { stockApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

type StockMovement = {
  id: string;
  source: string;
  date: string;
  stockType: string;
  inferred: boolean;
  direction: 'IN' | 'OUT';
  transactionType: string;
  voucherNo: string;
  billNo: string;
  partyName: string;
  itemName: string;
  pcs: number;
  mts: number;
  runningPcs: number;
  runningMts: number;
  editPath: string;
};

type StockBalance = {
  stockType: string;
  item: string;
  inPcs: number;
  inMts: number;
  outPcs: number;
  outMts: number;
  closingPcs: number;
  closingMts: number;
  entries: number;
};

const STOCK_FILTERS = [
  { value: 'ALL', label: 'All stock types' },
  { value: 'GREY', label: 'GREY' },
  { value: 'FINISH', label: 'FINISH' },
  { value: 'WORK', label: 'WORK' },
  { value: 'BOX', label: 'BOX' }
];

const money = (v: number) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '-');
const inputClass = 'w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold';
const labelText = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const thClass = 'border border-emerald-200 bg-emerald-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-emerald-950';
const tdClass = 'border border-slate-200 px-2 py-1.5 align-middle';
const tdNum = `${tdClass} text-right tabular-nums`;
const tdCenter = `${tdClass} text-center`;

export const StockBalanceReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const params = new URLSearchParams(window.location.search);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stockType, setStockType] = useState((params.get('type') || 'ALL').toUpperCase());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [totalsByType, setTotalsByType] = useState<Array<StockBalance & { stockType: string }>>([]);
  const [totals, setTotals] = useState({ inPcs: 0, inMts: 0, outPcs: 0, outMts: 0, closingPcs: 0, closingMts: 0, entries: 0 });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await stockApi.getReport({
        stockType,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined
      });
      setMovements(result.movements || []);
      setBalances(result.balances || []);
      setTotalsByType(result.totalsByType || []);
      setTotals(result.totals || { inPcs: 0, inMts: 0, outPcs: 0, outMts: 0, closingPcs: 0, closingMts: 0, entries: 0 });
    } catch (err: any) {
      setError(err.message || 'Could not load stock report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [stockType]);

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Stock Balances / Stock Report" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Stock type from Transaction Types</p>
          <p className="mt-1 text-xs text-gray-500">
            IN / OUT follows STOCK TYPE and STOCK EFFECT on the voucher series. Click any movement to edit that entry.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className={labelText}>Stock Type</span>
              <select className={inputClass} value={stockType} onChange={e => setStockType(e.target.value)}>
                {STOCK_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelText}>From</span>
              <input type="date" className={inputClass} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelText}>To</span>
              <input type="date" className={inputClass} value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => void load()} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase text-white">
                Show Report
              </button>
            </div>
          </div>
        </section>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        <section className="mb-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-800">
            Closing balances by type
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr>
                  {['Stock Type', 'In Pcs', 'In Mts', 'Out Pcs', 'Out Mts', 'Closing Pcs', 'Closing Mts', 'Entries'].map(head => (
                    <th key={head} className={thClass}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className={`${tdClass} p-10 text-center`}>
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                    </td>
                  </tr>
                )}
                {!loading && totalsByType.map(row => (
                  <tr key={row.stockType}>
                    <td className={`${tdClass} font-black`}>{row.stockType}</td>
                    <td className={tdNum}>{money(row.inPcs)}</td>
                    <td className={tdNum}>{money(row.inMts)}</td>
                    <td className={tdNum}>{money(row.outPcs)}</td>
                    <td className={tdNum}>{money(row.outMts)}</td>
                    <td className={`${tdNum} font-black`}>{money(row.closingPcs)}</td>
                    <td className={`${tdNum} font-black text-emerald-800`}>{money(row.closingMts)}</td>
                    <td className={tdCenter}>{row.entries}</td>
                  </tr>
                ))}
              </tbody>
              {!loading && (
                <tfoot>
                  <tr className="bg-emerald-900 text-white">
                    <td className={`${tdClass} border-emerald-800 font-black`}>Grand</td>
                    {['inPcs', 'inMts', 'outPcs', 'outMts', 'closingPcs', 'closingMts'].map(key => (
                      <td key={key} className={`${tdNum} border-emerald-800 font-black`}>{money((totals as any)[key])}</td>
                    ))}
                    <td className={`${tdCenter} border-emerald-800 font-black`}>{totals.entries}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <section className="mb-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-800">
            Item / quality balances
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-xs">
              <thead>
                <tr>
                  {['Stock Type', 'Item / Quality', 'In Pcs', 'In Mts', 'Out Pcs', 'Out Mts', 'Closing Pcs', 'Closing Mts', 'Entries'].map(head => (
                    <th key={head} className={thClass}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!loading && balances.length === 0 && (
                  <tr>
                    <td colSpan={9} className={`${tdClass} p-10 text-center font-bold text-gray-400`}>No stock movements in this period.</td>
                  </tr>
                )}
                {!loading && balances.map(row => (
                  <tr key={`${row.stockType}-${row.item}`}>
                    <td className={`${tdClass} font-black`}>{row.stockType}</td>
                    <td className={`${tdClass} font-bold`}>{row.item}</td>
                    <td className={tdNum}>{money(row.inPcs)}</td>
                    <td className={tdNum}>{money(row.inMts)}</td>
                    <td className={tdNum}>{money(row.outPcs)}</td>
                    <td className={tdNum}>{money(row.outMts)}</td>
                    <td className={`${tdNum} font-black`}>{money(row.closingPcs)}</td>
                    <td className={`${tdNum} font-black text-emerald-800`}>{money(row.closingMts)}</td>
                    <td className={tdCenter}>{row.entries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-800">
            Stock register · click any row to edit
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-xs">
              <thead>
                <tr>
                  {['Date', 'Type', 'Series', 'Voucher', 'Party', 'Item / Quality', 'In Pcs', 'In Mts', 'Out Pcs', 'Out Mts', 'Bal Pcs', 'Bal Mts'].map(head => (
                    <th key={head} className={thClass}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={12} className={`${tdClass} p-10 text-center`}>
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                    </td>
                  </tr>
                )}
                {!loading && movements.length === 0 && (
                  <tr>
                    <td colSpan={12} className={`${tdClass} p-10 text-center font-bold text-gray-400`}>No movements found.</td>
                  </tr>
                )}
                {!loading && movements.map(row => (
                  <tr
                    key={`${row.source}-${row.id}`}
                    onClick={() => { window.location.href = row.editPath; }}
                    className="cursor-pointer hover:bg-emerald-50"
                  >
                    <td className={tdCenter}>{formatDate(row.date)}</td>
                    <td className={`${tdCenter} font-black`}>{row.stockType}</td>
                    <td className={tdClass}>
                      {row.transactionType}
                      {row.inferred ? <span className="ml-1 text-[9px] font-bold uppercase text-amber-700">inferred</span> : null}
                    </td>
                    <td className={`${tdNum} font-bold`}>{row.voucherNo || row.billNo || '-'}</td>
                    <td className={`${tdClass} font-bold`}>{row.partyName || '-'}</td>
                    <td className={tdClass}>{row.itemName || '-'}</td>
                    <td className={tdNum}>{row.direction === 'IN' ? money(row.pcs) : ''}</td>
                    <td className={tdNum}>{row.direction === 'IN' ? money(row.mts) : ''}</td>
                    <td className={tdNum}>{row.direction === 'OUT' ? money(row.pcs) : ''}</td>
                    <td className={tdNum}>{row.direction === 'OUT' ? money(row.mts) : ''}</td>
                    <td className={`${tdNum} font-black`}>{money(row.runningPcs)}</td>
                    <td className={`${tdNum} font-black text-emerald-800`}>{money(row.runningMts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};
