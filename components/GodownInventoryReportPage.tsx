import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Package, RefreshCw } from 'lucide-react';
import { greyPurchasesApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

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
  quality?: string | null;
  taka: number;
  mts: number;
  rate: number;
  grossAmount: number;
  netAmount: number;
  sourceLabel: string;
  godown: string;
}

interface QualitySummary {
  quality: string;
  taka: number;
  mts: number;
  grossAmount: number;
  netAmount: number;
  entries: number;
}

const money = (v: number) =>
  (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

export const GodownInventoryReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [rows, setRows] = useState<GodownRow[]>([]);
  const [summary, setSummary] = useState<QualitySummary[]>([]);
  const [totals, setTotals] = useState({ taka: 0, mts: 0, grossAmount: 0, netAmount: 0, entries: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await greyPurchasesApi.getGodownInventory();
      setRows(result.rows || []);
      setSummary(result.summary || []);
      setTotals(result.totals || { taka: 0, mts: 0, grossAmount: 0, netAmount: 0, entries: 0 });
    } catch (err: any) {
      setError(err.message || 'Could not load godown inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-200">Reports</p>
              <h2 className="mt-1 text-2xl font-black">Godown Inventory</h2>
              <p className="mt-1 text-sm text-emerald-100">Grey purchase receipts stocked in Main Godown.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-emerald-200">Entries</p>
              <p className="text-lg font-black">{totals.entries}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-emerald-200">Total Taka</p>
              <p className="text-lg font-black">{money(totals.taka)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-emerald-200">Total Mtrs</p>
              <p className="text-lg font-black">{money(totals.mts)}</p>
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
              <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Godown Entries</h3>
              {rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No inventory movements yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase text-gray-500">
                      <tr>
                        <th className="py-2">Date</th>
                        <th>Source</th>
                        <th>Bill / Sr</th>
                        <th>Party</th>
                        <th>Quality</th>
                        <th className="text-right">Taka</th>
                        <th className="text-right">Mtrs</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">Gross</th>
                        <th className="text-right">Net</th>
                        <th>Godown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.id} className="border-b">
                          <td className="py-3">{formatDate(row.date)}</td>
                          <td className="text-xs font-bold text-emerald-700">{row.sourceLabel}</td>
                          <td>{row.billNo || row.srNo || '-'}</td>
                          <td className="font-semibold">{row.partyName}</td>
                          <td>{row.quality || '-'}</td>
                          <td className="text-right">{money(row.taka)}</td>
                          <td className="text-right">{money(row.mts)}</td>
                          <td className="text-right">{money(row.rate)}</td>
                          <td className="text-right">{money(row.grossAmount)}</td>
                          <td className="text-right font-bold">{money(row.netAmount)}</td>
                          <td className="text-xs">{row.godown}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};
