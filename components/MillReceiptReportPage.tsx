import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, PackageCheck, RefreshCw } from 'lucide-react';
import { millReceiptsApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

interface MillReceiptRow {
  id: string;
  despNo: string;
  lotNo: string;
  billNo: string;
  receiptDate: string;
  despMts: number;
  recTaka: number;
  recMts: number;
  jobRate: number;
  shortMts: number;
  shortPct: number;
  quality: string;
  jobAmount: number;
  millName: string;
  voucherNo?: number | null;
}

interface MillReceiptGroup {
  key: string;
  label: string;
  rows: MillReceiptRow[];
  totals: {
    despMts: number;
    recTaka: number;
    recMts: number;
    shortMts: number;
    shortPct: number;
    jobRate: number;
    jobAmount: number;
    entries: number;
  };
}

const FILTERS = [
  { id: 'all', label: 'All Options' },
  { id: 'mill_wise', label: 'Mill-wise' },
  { id: 'quality_wise', label: 'Quality-wise' },
  { id: 'date_wise', label: 'Date-wise' },
  { id: 'lot_wise', label: 'Lot-wise' },
  { id: 'desp_wise', label: 'Desp. No.-wise' }
] as const;

const money = (v: number) =>
  (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const takaCount = (v: number) => String(Math.round(Number(v) || 0));

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

const today = () => new Date().toISOString().slice(0, 10);
const fyStart = () => {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
};

export const MillReceiptReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [filter, setFilter] = useState<string>('all');
  const [millName, setMillName] = useState('');
  const [fromDate, setFromDate] = useState(fyStart());
  const [toDate, setToDate] = useState(today());
  const [companyName, setCompanyName] = useState('');
  const [rows, setRows] = useState<MillReceiptRow[]>([]);
  const [groups, setGroups] = useState<MillReceiptGroup[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await millReceiptsApi.getReport({
        filter,
        millName: millName.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined
      });
      setCompanyName(result.companyName || '');
      setRows((result.rows || []) as MillReceiptRow[]);
      setGroups((result.groups || []) as MillReceiptGroup[]);
      setTotals(result.totals || {});
    } catch (err: any) {
      setError(err.message || 'Could not load mill receipt report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filter]);

  const ReportTable: React.FC<{ data: MillReceiptRow[]; showGrand?: boolean }> = ({ data, showGrand }) => (
    <table className="min-w-full text-left text-xs">
      <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
        <tr>
          <th className="px-2 py-2">Desp. No.</th>
          <th className="px-2 py-2">Lot No.</th>
          <th className="px-2 py-2">G.P. No.</th>
          <th className="px-2 py-2">Rec. Date</th>
          <th className="px-2 py-2 text-right">Des Mts.</th>
          <th className="px-2 py-2 text-right">Rec P.</th>
          <th className="px-2 py-2 text-right">Rec Mts.</th>
          <th className="px-2 py-2 text-right">Job Ra.</th>
          <th className="px-2 py-2 text-right">Short Mt.</th>
          <th className="px-2 py-2 text-right">Shortage %</th>
          <th className="px-2 py-2">Quality</th>
          <th className="px-2 py-2 text-right">Job Amt.</th>
          {filter === 'all' && <th className="px-2 py-2">Mill</th>}
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={row.id} className="border-b hover:bg-teal-50">
            <td className="px-2 py-2 font-semibold">{row.despNo}</td>
            <td className="px-2 py-2 font-bold text-teal-800">{row.lotNo}</td>
            <td className="px-2 py-2">{row.billNo}</td>
            <td className="px-2 py-2">{formatDate(row.receiptDate)}</td>
            <td className="px-2 py-2 text-right">{money(row.despMts)}</td>
            <td className="px-2 py-2 text-right">{takaCount(row.recTaka)}</td>
            <td className="px-2 py-2 text-right font-semibold">{money(row.recMts)}</td>
            <td className="px-2 py-2 text-right">{money(row.jobRate)}</td>
            <td className="px-2 py-2 text-right text-rose-700">{money(row.shortMts)}</td>
            <td className="px-2 py-2 text-right">{money(row.shortPct)}</td>
            <td className="px-2 py-2">{row.quality}</td>
            <td className="px-2 py-2 text-right font-bold">{money(row.jobAmount)}</td>
            {filter === 'all' && <td className="px-2 py-2">{row.millName}</td>}
          </tr>
        ))}
        {showGrand && (
          <tr className="border-t-2 bg-slate-900 text-[11px] font-black uppercase text-white">
            <td className="px-2 py-2" colSpan={4}>Grand Total</td>
            <td className="px-2 py-2 text-right">{money(totals.despMts || 0)}</td>
            <td className="px-2 py-2 text-right">{takaCount(totals.recTaka || 0)}</td>
            <td className="px-2 py-2 text-right">{money(totals.recMts || 0)}</td>
            <td className="px-2 py-2 text-right">{money(totals.jobRate || 0)}</td>
            <td className="px-2 py-2 text-right">{money(totals.shortMts || 0)}</td>
            <td className="px-2 py-2 text-right">{money(totals.shortPct || 0)}</td>
            <td className="px-2 py-2" />
            <td className="px-2 py-2 text-right">{money(totals.jobAmount || 0)}</td>
            {filter === 'all' && <td className="px-2 py-2" />}
          </tr>
        )}
      </tbody>
    </table>
  );

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Mill Receipt Report" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = '/erp/mill-receipt'; }}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-xs font-black uppercase tracking-wide text-white"
          >
            <PackageCheck className="h-3.5 w-3.5" />
            Mill Receipt Entry
          </button>
        </div>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700">{companyName || 'ThreadX ERP'}</p>
              <h1 className="mt-1 text-xl font-black uppercase tracking-wide text-gray-900">Mill Receipt Details</h1>
              <p className="mt-1 text-xs text-gray-500">
                From {formatDate(fromDate)} to {formatDate(toDate)}
                {millName.trim() ? ` · Mill: ${millName.trim()}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-wide disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500">Filter</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm font-semibold outline-none focus:border-teal-400"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              >
                {FILTERS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500">Mill</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm font-semibold outline-none focus:border-teal-400"
                value={millName}
                onChange={e => setMillName(e.target.value)}
                placeholder="All mills"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500">From Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm font-semibold outline-none focus:border-teal-400"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500">To Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm font-semibold outline-none focus:border-teal-400"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white"
            >
              Apply Filters
            </button>
          </div>
        </section>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>
        )}

        <section className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-teal-700" />
            </div>
          ) : filter === 'all' ? (
            <div className="overflow-x-auto">
              <ReportTable data={rows} showGrand />
              {!rows.length && (
                <p className="px-4 py-10 text-center text-sm text-gray-500">No mill receipts in this range.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {groups.map(group => (
                <div key={group.key} className="overflow-hidden rounded-xl border">
                  <div className="border-b bg-teal-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-teal-900">
                    {group.label}
                    <span className="ml-2 font-semibold text-teal-700">
                      · Job Amt {money(group.totals.jobAmount)} · Short {money(group.totals.shortPct)}%
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <ReportTable data={group.rows} />
                  </div>
                </div>
              ))}
              {!groups.length && (
                <p className="py-10 text-center text-sm text-gray-500">No mill receipts in this range.</p>
              )}
              {!!groups.length && (
                <div className="rounded-xl bg-slate-900 px-3 py-3 text-xs font-black uppercase text-white">
                  Grand Total · Des Mts {money(totals.despMts || 0)} · Rec P {takaCount(totals.recTaka || 0)} · Rec Mts {money(totals.recMts || 0)} · Short {money(totals.shortMts || 0)} ({money(totals.shortPct || 0)}%) · Job Amt {money(totals.jobAmount || 0)}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
