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

const PendingRowCells: React.FC<{
  quality: string;
  taka: number;
  mts: number;
  balTaka: number;
  balMts: number;
  rate: number;
  balAmount: number;
  qualityClassName?: string;
}> = ({ quality, taka, mts, balTaka, balMts, rate, balAmount, qualityClassName = '' }) => (
  <>
    <td className={`px-2 py-2 font-semibold ${qualityClassName}`}>{quality}</td>
    <td className="px-2 py-2 text-right">{takaCount(taka)}</td>
    <td className="px-2 py-2 text-right">{money(mts)}</td>
    <td className="px-2 py-2 text-right">{takaCount(balTaka)}</td>
    <td className="px-2 py-2 text-right">{money(balMts)}</td>
    <td className="px-2 py-2 text-right">{money(rate)}</td>
    <td className="px-2 py-2 text-right font-bold">{money(balAmount)}</td>
  </>
);

const PendingTableHead: React.FC = () => (
  <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
    <tr>
      <th className="px-2 py-2">Quality</th>
      <th className="px-2 py-2 text-right">W. Pcs</th>
      <th className="px-2 py-2 text-right">W. Mts.</th>
      <th className="px-2 py-2 text-right">Bal P</th>
      <th className="px-2 py-2 text-right">Bal Mts.</th>
      <th className="px-2 py-2 text-right">O Ra</th>
      <th className="px-2 py-2 text-right">Bal Amount</th>
    </tr>
  </thead>
);

const DispatchListTable: React.FC<{
  rows: MillDispatchRow[];
  onOpen: (id: string) => void;
  showGrand?: boolean;
  grand?: Partial<MillDispatchGroup['totals'] & { rate: number }>;
}> = ({ rows, onOpen, showGrand, grand }) => (
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
          role="button"
          tabIndex={0}
          className="cursor-pointer border-b transition-colors hover:bg-orange-50"
          onClick={() => onOpen(row.id)}
          onKeyDown={event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            onOpen(row.id);
          }}
          title="Open this dispatch"
        >
          <td className="px-2 py-2 font-semibold">{row.srNo ?? '-'}</td>
          <td className="px-2 py-2">{row.challanNo || '-'}</td>
          <td className="px-2 py-2">{formatDate(row.date)}</td>
          <td className="px-2 py-2 font-semibold">{row.millName}</td>
          <td className="px-2 py-2">{row.weaverName || '-'}</td>
          <td className="px-2 py-2">{row.quality || '-'}</td>
          <td className="px-2 py-2 text-right">{takaCount(row.taka)}</td>
          <td className="px-2 py-2 text-right">{money(row.mts)}</td>
          <td className="px-2 py-2 text-right">{takaCount(row.balTaka)}</td>
          <td className="px-2 py-2 text-right">{money(row.balMts)}</td>
          <td className="px-2 py-2 text-right">{money(row.rate)}</td>
          <td className="px-2 py-2 text-right font-bold">{money(row.balAmount)}</td>
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

const openDispatch = (id: string) => {
  window.location.href = `/erp/grey-dispatch?edit=${id}`;
};

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
  const [expandedQuality, setExpandedQuality] = useState<string | null>(null);

  const load = async (activeFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      const result = await greyDispatchesApi.getMillDispatchReport(activeFilter);
      setCompanyName(result.companyName || '');
      setRows(result.rows || []);
      setGroups(result.groups || []);
      setMillSegments(result.millSegments || []);
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

  const dispatchesForQuality = (millName: string, quality: string) =>
    rows.filter(row => row.millName === millName && (row.quality || 'Unspecified') === quality);

  const openQualityLine = (millName: string, quality: string) => {
    const matches = dispatchesForQuality(millName, quality);
    if (matches.length === 1) {
      openDispatch(matches[0].id);
      return;
    }
    if (matches.length < 2) return;
    const key = `${millName}::${quality}`;
    setExpandedQuality(current => current === key ? null : key);
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
                      {summary.map(row => (
                        <tr key={row.mill} className="border-b">
                          <td className="py-3 font-semibold">{row.mill}</td>
                          <td className="text-right">{row.entries}</td>
                          <td className="text-right">{takaCount(row.taka)}</td>
                          <td className="text-right">{money(row.mts)}</td>
                          <td className="text-right font-bold">{money(row.balAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Mill Dispatch Report</h3>
              <p className="mt-1 text-xs text-gray-500">
                Click a dispatch to open that entry. A quality with more than one dispatch opens the list first.
              </p>

              {filter === 'mill_quality_wise' ? (
                millSegments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No mill dispatch entries yet.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <PendingTableHead />
                      <tbody>
                        {millSegments.map(segment => (
                          <React.Fragment key={segment.millName}>
                            <tr className="bg-fuchsia-100/80">
                              <td className="px-2 py-2 font-black uppercase text-fuchsia-900" colSpan={7}>
                                {segment.millName}
                              </td>
                            </tr>
                            {segment.qualities.map(quality => {
                              const qualityKey = `${segment.millName}::${quality.quality}`;
                              const matches = dispatchesForQuality(segment.millName, quality.quality);
                              const open = expandedQuality === qualityKey;
                              return (
                                <React.Fragment key={qualityKey}>
                                  <tr
                                    role="button"
                                    tabIndex={0}
                                    className="cursor-pointer border-b text-blue-900 hover:bg-orange-50"
                                    onClick={() => openQualityLine(segment.millName, quality.quality)}
                                    onKeyDown={event => {
                                      if (event.key !== 'Enter') return;
                                      event.preventDefault();
                                      openQualityLine(segment.millName, quality.quality);
                                    }}
                                    title={matches.length > 1 ? 'Show these dispatches' : 'Open this dispatch'}
                                  >
                                    <PendingRowCells
                                      quality={quality.quality}
                                      taka={quality.taka}
                                      mts={quality.mts}
                                      balTaka={quality.balTaka}
                                      balMts={quality.balMts}
                                      rate={quality.rate}
                                      balAmount={quality.balAmount}
                                    />
                                  </tr>
                                  {open && matches.length > 1 && (
                                    <tr className="border-b bg-orange-50/40">
                                      <td colSpan={7} className="px-2 py-2">
                                        <DispatchListTable rows={matches} onOpen={openDispatch} />
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <tr className="border-b bg-blue-50 font-bold text-blue-950">
                              <PendingRowCells
                                quality="MILL-SUBTOTAL"
                                taka={segment.subtotal.taka}
                                mts={segment.subtotal.mts}
                                balTaka={segment.subtotal.balTaka}
                                balMts={segment.subtotal.balMts}
                                rate={segment.subtotal.rate}
                                balAmount={segment.subtotal.balAmount}
                              />
                            </tr>
                          </React.Fragment>
                        ))}
                        <tr className="border-t-2 bg-slate-900 text-[11px] font-black uppercase text-white">
                          <PendingRowCells
                            quality="GRAND TOTAL"
                            taka={totals.taka}
                            mts={totals.mts}
                            balTaka={totals.balTaka}
                            balMts={totals.balMts}
                            rate={totals.rate}
                            balAmount={totals.balAmount}
                          />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )
              ) : filter === 'all' ? (
                rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No mill dispatch entries yet.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <DispatchListTable
                      rows={rows}
                      onOpen={openDispatch}
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
                        onOpen={openDispatch}
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
