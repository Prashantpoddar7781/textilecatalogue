import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, Truck } from 'lucide-react';
import { greyDispatchesApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

interface MillDispatchRow {
  id: string;
  greyPurchaseId: string;
  date: string;
  srNo?: number | null;
  challanNo?: string | null;
  purSr?: number | null;
  millName: string;
  weaverName?: string | null;
  brokerName?: string | null;
  quality?: string | null;
  taka: number;
  mts: number;
  balTaka: number;
  balMts: number;
  rate: number;
  balAmount: number;
  dispatchAmount: number;
  remark?: string | null;
  vehicleNo?: string | null;
  ewayBillNo?: string | null;
  transactionType?: string | null;
}

interface MillDispatchGroup {
  key: string;
  label: string;
  rows: MillDispatchRow[];
  totals: {
    taka: number;
    mts: number;
    balTaka: number;
    balMts: number;
    balAmount: number;
    entries: number;
  };
}

interface MillQualitySegment {
  millName: string;
  qualities: Array<{
    quality: string;
    taka: number;
    mts: number;
    balTaka: number;
    balMts: number;
    balAmount: number;
    rate: number;
    entries: number;
    dispatches?: MillDispatchRow[];
  }>;
  subtotal: {
    taka: number;
    mts: number;
    balTaka: number;
    balMts: number;
    balAmount: number;
    rate: number;
    entries: number;
  };
}

const MILL_DISPATCH_FILTERS = [
  { id: 'all', label: 'All Options' },
  { id: 'agent_wise', label: 'Agent-wise' },
  { id: 'mill_wise', label: 'Mill-wise' },
  { id: 'quality_wise', label: 'Quality-wise' },
  { id: 'date_wise', label: 'Date-wise' },
  { id: 'mill_quality_wise', label: 'Mill / Quality wise' },
  { id: 'sr_no_wise', label: 'Sr. No.-wise' },
  { id: 'purchase_rate_wise', label: 'Purchase rate wise' }
] as const;

const money = (v: number) =>
  (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const takaCount = (v: number) => String(Math.round(Number(v) || 0));

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

const dispatchHref = (id: string) => `/erp/grey-dispatch?edit=${encodeURIComponent(id)}`;

const DispatchLink: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <a href={dispatchHref(id)} className="block text-inherit no-underline hover:text-orange-800">
    {children}
  </a>
);

const DispatchListTable: React.FC<{
  rows: MillDispatchRow[];
  showGrand?: boolean;
  grand?: Partial<MillDispatchGroup['totals'] & { rate: number }>;
}> = ({ rows, showGrand, grand }) => (
  <table className="min-w-full text-left text-xs">
    <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
      <tr>
        <th className="px-2 py-2">Desp</th>
        <th className="px-2 py-2">Ch</th>
        <th className="px-2 py-2">Date</th>
        <th className="px-2 py-2">Mill</th>
        <th className="px-2 py-2">Weaver</th>
        <th className="px-2 py-2">Quality</th>
        <th className="px-2 py-2 text-right">W. Pcs</th>
        <th className="px-2 py-2 text-right">W. Mts.</th>
        <th className="px-2 py-2 text-right">Bal P</th>
        <th className="px-2 py-2 text-right">Bal Mts.</th>
        <th className="px-2 py-2 text-right">O Ra</th>
        <th className="px-2 py-2 text-right">Bal Amount</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(row => (
        <tr
          key={row.id}
          className="cursor-pointer border-b transition-colors hover:bg-orange-50"
          title="Open this dispatch"
          onClick={() => { window.location.href = dispatchHref(row.id); }}
        >
          <td className="px-2 py-2 font-semibold"><DispatchLink id={row.id}>{row.srNo ?? '-'}</DispatchLink></td>
          <td className="px-2 py-2"><DispatchLink id={row.id}>{row.challanNo || '-'}</DispatchLink></td>
          <td className="px-2 py-2"><DispatchLink id={row.id}>{formatDate(row.date)}</DispatchLink></td>
          <td className="px-2 py-2 font-semibold"><DispatchLink id={row.id}>{row.millName}</DispatchLink></td>
          <td className="px-2 py-2"><DispatchLink id={row.id}>{row.weaverName || '-'}</DispatchLink></td>
          <td className="px-2 py-2"><DispatchLink id={row.id}>{row.quality || '-'}</DispatchLink></td>
          <td className="px-2 py-2 text-right"><DispatchLink id={row.id}>{takaCount(row.taka)}</DispatchLink></td>
          <td className="px-2 py-2 text-right"><DispatchLink id={row.id}>{money(row.mts)}</DispatchLink></td>
          <td className="px-2 py-2 text-right"><DispatchLink id={row.id}>{takaCount(row.balTaka)}</DispatchLink></td>
          <td className="px-2 py-2 text-right"><DispatchLink id={row.id}>{money(row.balMts)}</DispatchLink></td>
          <td className="px-2 py-2 text-right"><DispatchLink id={row.id}>{money(row.rate)}</DispatchLink></td>
          <td className="px-2 py-2 text-right font-bold"><DispatchLink id={row.id}>{money(row.balAmount)}</DispatchLink></td>
        </tr>
      ))}
      {showGrand && grand && (
        <tr className="border-t-2 bg-slate-900 text-[11px] font-black uppercase text-white">
          <td className="px-2 py-2" colSpan={6}>Grand Total</td>
          <td className="px-2 py-2 text-right">{takaCount(grand.taka || 0)}</td>
          <td className="px-2 py-2 text-right">{money(grand.mts || 0)}</td>
          <td className="px-2 py-2 text-right">{takaCount(grand.balTaka || 0)}</td>
          <td className="px-2 py-2 text-right">{money(grand.balMts || 0)}</td>
          <td className="px-2 py-2 text-right">{money(grand.rate || 0)}</td>
          <td className="px-2 py-2 text-right">{money(grand.balAmount || 0)}</td>
        </tr>
      )}
    </tbody>
  </table>
);

export const MillDispatchReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [filter, setFilter] = useState<string>('mill_quality_wise');
  const [companyName, setCompanyName] = useState('');
  const [rows, setRows] = useState<MillDispatchRow[]>([]);
  const [groups, setGroups] = useState<MillDispatchGroup[]>([]);
  const [millSegments, setMillSegments] = useState<MillQualitySegment[]>([]);
  const [summary, setSummary] = useState<Array<{ mill: string; taka: number; mts: number; balAmount: number; entries: number }>>([]);
  const [totals, setTotals] = useState({ taka: 0, mts: 0, balTaka: 0, balMts: 0, balAmount: 0, rate: 0, entries: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (activeFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      const result = await greyDispatchesApi.getMillDispatchReport(activeFilter);
      const segments = (result.millSegments || []) as MillQualitySegment[];
      let detailRows = (result.rows || []) as MillDispatchRow[];
      const attached = segments.flatMap(segment =>
        segment.qualities.flatMap(quality => quality.dispatches || [])
      );
      if (!detailRows.length && attached.length) detailRows = attached;
      if (!detailRows.length && activeFilter !== 'all') {
        const allReport = await greyDispatchesApi.getMillDispatchReport('all');
        detailRows = (allReport.rows || []) as MillDispatchRow[];
      }
      setCompanyName(result.companyName || '');
      setRows(detailRows);
      setGroups(result.groups || []);
      setMillSegments(segments);
      setSummary(result.summary || []);
      setTotals(result.totals || { taka: 0, mts: 0, balTaka: 0, balMts: 0, balAmount: 0, rate: 0, entries: 0 });
    } catch (err: any) {
      setError(err.message || 'Could not load mill dispatch report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(filter);
  }, [filter]);

  const reportDate = new Date().toLocaleDateString('en-IN');

  const sameName = (left?: string | null, right?: string | null) =>
    String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();

  const dispatchesForQuality = (millName: string, quality: string, attached?: MillDispatchRow[]) => {
    const fromRows = rows.filter(row =>
      sameName(row.millName, millName) && sameName(row.quality || 'Unspecified', quality)
    );
    if (fromRows.length) return fromRows;
    return attached || [];
  };

  const dispatchesForMill = (millName: string) => {
    const fromRows = rows.filter(row => row.millName === millName);
    if (fromRows.length) return fromRows;
    const segment = millSegments.find(item => item.millName === millName);
    return segment?.qualities.flatMap(quality => quality.dispatches || []) || [];
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu
        title="Mill Dispatch Report"
        erpSession={erpSession}
        onBackToCatalogue={() => { window.location.href = '/'; }}
      />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            ERP
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <section className="mb-6 rounded-[2rem] bg-gradient-to-br from-slate-900 to-orange-950 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-200">Reports</p>
                <h2 className="mt-1 text-2xl font-black">Mill Pending / Dispatch</h2>
                <p className="mt-1 text-sm text-orange-100">
                  {companyName || 'Company'} · Mill-wise, Quality-wise · To date: {reportDate}
                </p>
              </div>
            </div>
            <label className="min-w-[220px]">
              <span className="mb-1 block text-[10px] font-black uppercase text-orange-200">Select Report Type</span>
              <select
                className="w-full rounded-xl border-0 bg-white/15 px-3 py-2 text-sm font-bold text-white outline-none"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              >
                {MILL_DISPATCH_FILTERS.map(opt => (
                  <option key={opt.id} value={opt.id} className="text-gray-900">{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-orange-200">Dispatches</p>
              <p className="text-lg font-black">{totals.entries}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-orange-200">Total Pcs</p>
              <p className="text-lg font-black">{takaCount(totals.taka)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-orange-200">Bal Mtrs</p>
              <p className="text-lg font-black">{money(totals.balMts)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-orange-200">Avg Rate</p>
              <p className="text-lg font-black">{money(totals.rate)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-orange-200">Bal Amount</p>
              <p className="text-lg font-black">{money(totals.balAmount)}</p>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading mill dispatch report...
          </div>
        ) : (
          <>
            <section className="mb-6 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Pending by Mill</h3>
              {summary.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No grey dispatch entries yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase text-gray-500">
                      <tr>
                        <th className="py-2">Mill</th>
                        <th className="text-right">Entries</th>
                        <th className="text-right">Pcs</th>
                        <th className="text-right">Mtrs</th>
                        <th className="text-right">Bal Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map(row => {
                        const matches = dispatchesForMill(row.mill);
                        const only = matches.length === 1 ? matches[0] : null;
                        return (
                          <React.Fragment key={row.mill}>
                            <tr className={`border-b ${only ? 'cursor-pointer hover:bg-orange-50' : 'bg-gray-50'}`}>
                              <td className="py-3 font-semibold">
                                {only ? (
                                  <a href={dispatchHref(only.id)} className="block text-inherit no-underline">{row.mill}</a>
                                ) : row.mill}
                              </td>
                              <td className="text-right">{only ? <a href={dispatchHref(only.id)} className="block text-inherit no-underline">{row.entries}</a> : row.entries}</td>
                              <td className="text-right">{only ? <a href={dispatchHref(only.id)} className="block text-inherit no-underline">{takaCount(row.taka)}</a> : takaCount(row.taka)}</td>
                              <td className="text-right">{only ? <a href={dispatchHref(only.id)} className="block text-inherit no-underline">{money(row.mts)}</a> : money(row.mts)}</td>
                              <td className="text-right font-bold">{only ? <a href={dispatchHref(only.id)} className="block text-inherit no-underline">{money(row.balAmount)}</a> : money(row.balAmount)}</td>
                            </tr>
                            {!only && matches.map(entry => (
                              <tr key={entry.id} className="border-b hover:bg-orange-50">
                                <td colSpan={5} className="px-2 py-2">
                                  <a href={dispatchHref(entry.id)} className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-orange-900 no-underline">
                                    <span>Sr {entry.srNo ?? '-'}</span>
                                    <span>Ch {entry.challanNo || '-'}</span>
                                    <span>{formatDate(entry.date)}</span>
                                    <span>{entry.quality || '-'}</span>
                                    <span>{entry.weaverName || '-'}</span>
                                    <span>{takaCount(entry.taka)} pcs</span>
                                    <span>{money(entry.mts)} mtrs</span>
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Mill Dispatch Report</h3>
              <p className="mt-1 text-xs text-gray-500">
                Click a row to open that mill dispatch.
              </p>

              {filter === 'mill_quality_wise' ? (
                millSegments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No mill dispatch entries yet.</p>
                ) : (
                  <div className="mt-3 space-y-6">
                    {millSegments.map(segment => (
                      <div key={segment.millName} className="overflow-hidden rounded-2xl border border-gray-100">
                        <div id={`mill-dispatch-${segment.millName}`} className="border-b bg-fuchsia-100 px-3 py-2 text-xs font-black uppercase text-fuchsia-900">
                          {segment.millName}
                        </div>
                        {segment.qualities.map(quality => {
                          const matches = dispatchesForQuality(segment.millName, quality.quality, quality.dispatches);
                          if (!matches.length) return null;
                          return (
                            <div key={`${segment.millName}::${quality.quality}`}>
                              <DispatchListTable rows={matches} />
                            </div>
                          );
                        })}
                        <div className="border-t bg-blue-50 px-3 py-2 text-[11px] font-black uppercase text-blue-950">
                          Mill subtotal · {takaCount(segment.subtotal.taka)} pcs · {money(segment.subtotal.mts)} mts · {money(segment.subtotal.balAmount)}
                        </div>
                      </div>
                    ))}
                    <div className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-black uppercase text-white">
                      Grand total · {takaCount(totals.taka)} pcs · {money(totals.mts)} mts · {money(totals.balAmount)}
                    </div>
                  </div>
                )
              ) : filter === 'all' ? (
                rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No mill dispatch entries yet.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <DispatchListTable
                      rows={rows}
                      showGrand
                      grand={totals}
                    />
                  </div>
                )
              ) : groups.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No entries for this filter.</p>
              ) : (
                <div className="mt-3 space-y-6">
                  {groups.map(group => (
                    <div key={group.key} className="overflow-x-auto rounded-2xl border border-gray-100">
                      <div className="border-b bg-orange-50 px-3 py-2">
                        <p className="text-xs font-black uppercase text-orange-900">{group.label}</p>
                        <p className="text-[10px] font-bold text-orange-700">
                          {group.totals.entries} entries · {money(group.totals.balAmount)} bal amount
                        </p>
                      </div>
                      <DispatchListTable
                        rows={group.rows}
                      />
                    </div>
                  ))}
                </div>
              )}

            </section>
          </>
        )}
      </main>
    </div>
  );
};
