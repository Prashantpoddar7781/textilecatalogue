import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Package, RefreshCw } from 'lucide-react';
import { greyPurchasesApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';
import { GreyPurchaseDetailPanel } from './GreyPurchaseDetailPanel';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

interface GodownRow {
  id: string;
  date: string;
  srNo?: number | null;
  billNo?: string | null;
  partyName: string;
  brokerName?: string | null;
  quality?: string | null;
  taka: number;
  mts: number;
  despatchTaka: number;
  despatchMts: number;
  stockTaka: number;
  rate: number;
  grossAmount: number;
  payableAmount: number;
  netAmount: number;
  stockMts: number;
  sourceLabel: string;
  godown: string;
}

interface GodownGroup {
  key: string;
  label: string;
  rows: GodownRow[];
  totals: {
    taka: number;
    mts: number;
    grossAmount: number;
    payableAmount: number;
    netAmount: number;
    stockMts: number;
    stockTaka: number;
    entries: number;
  };
}

const GODOWN_FILTERS = [
  { id: 'all', label: 'All Options' },
  { id: 'agent_wise', label: 'Agent-wise' },
  { id: 'weaver_wise', label: 'Weaver-wise' },
  { id: 'quality_wise', label: 'Quality-wise' },
  { id: 'date_wise', label: 'Date-wise' },
  { id: 'weaver_quality_wise', label: 'Weaver / Quality wise' },
  { id: 'sr_no_wise', label: 'Sr. No.-wise' },
  { id: 'purchase_rate_wise', label: 'Purchase rate wise' }
] as const;

const money = (v: number) =>
  (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const takaCount = (v: number) => String(Math.round(Number(v) || 0));

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

const GodownTable: React.FC<{
  rows: GodownRow[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  showGrand?: boolean;
  grand?: Partial<GodownGroup['totals']>;
}> = ({ rows, selectedId, onSelect, showGrand, grand }) => (
  <table className="min-w-full text-left text-xs">
    <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
      <tr>
        <th className="px-2 py-2">Pur</th>
        <th className="px-2 py-2">Bill</th>
        <th className="px-2 py-2">Dated</th>
        <th className="px-2 py-2">Weaver</th>
        <th className="px-2 py-2">Quality</th>
        <th className="px-2 py-2 text-right">W.</th>
        <th className="px-2 py-2 text-right">W. Mts.</th>
        <th className="px-2 py-2 text-right">DE</th>
        <th className="px-2 py-2 text-right">Desp Mts</th>
        <th className="px-2 py-2 text-right">Amount</th>
        <th className="px-2 py-2 text-right">Gross Amt.</th>
        <th className="px-2 py-2 text-right">Stock Taka</th>
        <th className="px-2 py-2 text-right">Stock Mt</th>
        <th className="px-2 py-2 text-right">N Rate</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(row => (
        <tr
          key={row.id}
          className={`cursor-pointer border-b transition-colors hover:bg-emerald-50 ${selectedId === row.id ? 'bg-emerald-50' : ''}`}
          onClick={() => onSelect(row.id)}
        >
          <td className="px-2 py-2 font-semibold">{row.srNo ?? '-'}</td>
          <td className="px-2 py-2">{row.billNo || '-'}</td>
          <td className="px-2 py-2">{formatDate(row.date)}</td>
          <td className="px-2 py-2 font-semibold">{row.partyName}</td>
          <td className="px-2 py-2">{row.quality || '-'}</td>
          <td className="px-2 py-2 text-right">{takaCount(row.taka)}</td>
          <td className="px-2 py-2 text-right">{money(row.mts)}</td>
          <td className="px-2 py-2 text-right">{takaCount(row.despatchTaka)}</td>
          <td className="px-2 py-2 text-right">{money(row.despatchMts)}</td>
          <td className="px-2 py-2 text-right font-bold">{money(row.payableAmount)}</td>
          <td className="px-2 py-2 text-right">{money(row.grossAmount)}</td>
          <td className="px-2 py-2 text-right font-bold text-indigo-800">{takaCount(row.stockTaka)}</td>
          <td className="px-2 py-2 text-right font-bold text-emerald-800">{money(row.stockMts)}</td>
          <td className="px-2 py-2 text-right">{money(row.rate)}</td>
        </tr>
      ))}
      {showGrand && grand && (
        <tr className="border-t-2 bg-slate-900 text-[11px] font-black uppercase text-white">
          <td className="px-2 py-2" colSpan={5}>Grand</td>
          <td className="px-2 py-2 text-right">{takaCount(grand.taka || 0)}</td>
          <td className="px-2 py-2 text-right">{money(grand.mts || 0)}</td>
          <td className="px-2 py-2 text-right">{takaCount(grand.despatchTaka || 0)}</td>
          <td className="px-2 py-2 text-right">-</td>
          <td className="px-2 py-2 text-right">{money(grand.payableAmount || 0)}</td>
          <td className="px-2 py-2 text-right">{money(grand.grossAmount || 0)}</td>
          <td className="px-2 py-2 text-right">{takaCount(grand.stockTaka || 0)}</td>
          <td className="px-2 py-2 text-right">{money(grand.stockMts || 0)}</td>
          <td className="px-2 py-2 text-right">-</td>
        </tr>
      )}
    </tbody>
  </table>
);

export const GodownInventoryReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [filter, setFilter] = useState<string>('all');
  const [rows, setRows] = useState<GodownRow[]>([]);
  const [groups, setGroups] = useState<GodownGroup[]>([]);
  const [summary, setSummary] = useState<Array<{ quality: string; taka: number; mts: number; grossAmount: number; netAmount: number; entries: number }>>([]);
  const [totals, setTotals] = useState({ taka: 0, mts: 0, despatchTaka: 0, stockTaka: 0, grossAmount: 0, payableAmount: 0, netAmount: 0, stockMts: 0, entries: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const load = async (activeFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      const result = await greyPurchasesApi.getGodownInventory(activeFilter);
      setRows(result.rows || []);
      setGroups(result.groups || []);
      setSummary(result.summary || []);
      setTotals(result.totals || { taka: 0, mts: 0, despatchTaka: 0, stockTaka: 0, grossAmount: 0, payableAmount: 0, netAmount: 0, stockMts: 0, entries: 0 });
    } catch (err: any) {
      setError(err.message || 'Could not load godown inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(filter);
  }, [filter]);

  const handleEdit = (id: string) => {
    window.location.href = `/erp/grey-purchase?edit=${id}`;
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu
        title="Godown Inventory"
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

        <section className="mb-6 rounded-[2rem] bg-gradient-to-br from-slate-900 to-emerald-950 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-200">Reports</p>
                <h2 className="mt-1 text-2xl font-black">Grey Stock in Godown</h2>
                <p className="mt-1 text-sm text-emerald-100">Grey purchase receipts stocked in Main Godown.</p>
              </div>
            </div>
            <label className="min-w-[220px]">
              <span className="mb-1 block text-[10px] font-black uppercase text-emerald-200">Select Report Type</span>
              <select
                className="w-full rounded-xl border-0 bg-white/15 px-3 py-2 text-sm font-bold text-white outline-none"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              >
                {GODOWN_FILTERS.map(opt => (
                  <option key={opt.id} value={opt.id} className="text-gray-900">{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-emerald-200">Entries</p>
              <p className="text-lg font-black">{totals.entries}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-emerald-200">Total Taka</p>
              <p className="text-lg font-black">{money(totals.taka)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-emerald-200">Stock Taka</p>
              <p className="text-lg font-black">{Math.round(totals.stockTaka)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-emerald-200">Stock Mtrs</p>
              <p className="text-lg font-black">{money(totals.stockMts)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-emerald-200">Net Value</p>
              <p className="text-lg font-black">{money(totals.netAmount)}</p>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading inventory...
          </div>
        ) : (
          <>
            <section className="mb-6 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Stock by Quality</h3>
              {summary.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No grey stock yet. Save a grey purchase first.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase text-gray-500">
                      <tr>
                        <th className="py-2">Quality</th>
                        <th className="text-right">Entries</th>
                        <th className="text-right">Taka</th>
                        <th className="text-right">Mtrs</th>
                        <th className="text-right">Gross</th>
                        <th className="text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map(row => (
                        <tr key={row.quality} className="border-b">
                          <td className="py-3 font-semibold">{row.quality}</td>
                          <td className="text-right">{row.entries}</td>
                          <td className="text-right">{money(row.taka)}</td>
                          <td className="text-right">{money(row.mts)}</td>
                          <td className="text-right">{money(row.grossAmount)}</td>
                          <td className="text-right font-bold">{money(row.netAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Godown Stock Report</h3>
              <p className="mt-1 text-xs text-gray-500">Click any row to view complete entry and edit.</p>

              {filter === 'all' ? (
                rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No inventory movements yet.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <GodownTable
                      rows={rows}
                      selectedId={selectedEntryId}
                      onSelect={setSelectedEntryId}
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
                      <div className="border-b bg-emerald-50 px-3 py-2">
                        <p className="text-xs font-black uppercase text-emerald-900">{group.label}</p>
                        <p className="text-[10px] font-bold text-emerald-700">
                          {group.totals.entries} entries · {money(group.totals.stockMts)} stock mtrs
                        </p>
                      </div>
                      <GodownTable
                        rows={group.rows}
                        selectedId={selectedEntryId}
                        onSelect={setSelectedEntryId}
                      />
                    </div>
                  ))}
                </div>
              )}

              {selectedEntryId && (
                <div className="mt-4">
                  <GreyPurchaseDetailPanel
                    entryId={selectedEntryId}
                    onClose={() => setSelectedEntryId(null)}
                    onEdit={handleEdit}
                  />
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};
