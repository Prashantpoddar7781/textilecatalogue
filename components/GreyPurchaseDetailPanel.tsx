import React, { useEffect, useState } from 'react';
import { Edit3, Loader2, X } from 'lucide-react';
import { greyPurchasesApi } from '../services/api';
import { GreyDispatch, GreyPurchase } from '../types';

interface Props {
  entryId: string;
  onClose: () => void;
  onEdit?: (id: string) => void;
}

interface StockSummary {
  recTaka: number;
  recMts: number;
  despatchTaka: number;
  despatchMts: number;
  stockTaka: number;
  stockMts: number;
}

const money = (v: number) =>
  (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const takaCount = (v: number) => String(Math.round(Number(v) || 0));

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

export const GreyPurchaseDetailPanel: React.FC<Props> = ({ entryId, onClose, onEdit }) => {
  const [entry, setEntry] = useState<GreyPurchase | null>(null);
  const [dispatches, setDispatches] = useState<GreyDispatch[]>([]);
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await greyPurchasesApi.getById(entryId);
        if (!cancelled) {
          setEntry(result.entry);
          setDispatches(result.dispatches || []);
          setStockSummary(result.stockSummary || null);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load entry.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [entryId]);

  const takaDetails = Array.isArray(entry?.takaDetails) ? entry!.takaDetails! : [];
  const summary = stockSummary || {
    recTaka: entry?.recTaka || 0,
    recMts: entry?.recMts || 0,
    despatchTaka: 0,
    despatchMts: entry?.despatchMts || 0,
    stockTaka: entry?.recTaka || 0,
    stockMts: Math.max(0, (entry?.recMts || 0) - (entry?.despatchMts || 0))
  };

  return (
    <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wide text-indigo-950">
            {loading ? 'Loading entry...' : `Grey Purchase Entry · View Mode`}
          </h3>
          {!loading && entry && (
            <p className="mt-1 text-xs font-semibold text-indigo-700">
              Sr. {entry.srNo ?? '-'} · {entry.partyName} · Bill {entry.billNo || '-'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entry && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(entry.id)}
              className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-indigo-200 bg-white p-1.5 text-indigo-700 hover:bg-indigo-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center text-sm text-indigo-700">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Fetching complete details...
        </div>
      ) : error ? (
        <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>
      ) : entry ? (
        <>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Company', value: entry.companyName || '-' },
              { label: 'Date', value: formatDate(entry.billDate) },
              { label: 'Quality', value: entry.quality || '-' },
              { label: 'Broker', value: entry.brokerName || '-' },
              { label: 'HSN', value: entry.hsnCode || '-' },
              { label: 'Party GSTIN', value: entry.partyGstin || '-' },
              { label: 'Rec. Taka', value: takaCount(summary.recTaka) },
              { label: 'Rec. Mts', value: money(summary.recMts) },
              { label: 'Pur Rate', value: money(entry.purRate) },
              { label: 'Gross Amt', value: money(entry.grossAmount) },
              { label: 'Net Amount', value: money(entry.netAmount) },
              { label: 'Paid', value: entry.paid ? `Y (${formatDate(entry.paidDate)})` : 'N' }
            ].map(field => (
              <p key={field.label} className="rounded-xl bg-white/80 px-3 py-2">
                <span className="font-bold text-gray-700">{field.label}:</span>{' '}
                <span className="text-gray-900">{field.value}</span>
              </p>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-violet-700">Despatch Taka</p>
              <p className="text-lg font-black text-violet-950">{takaCount(summary.despatchTaka)}</p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-violet-700">Despatch Mts</p>
              <p className="text-lg font-black text-violet-950">{money(summary.despatchMts)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-emerald-700">Stock Taka</p>
              <p className="text-lg font-black text-emerald-950">{takaCount(summary.stockTaka)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase text-emerald-700">Stock Mts</p>
              <p className="text-lg font-black text-emerald-950">{money(summary.stockMts)}</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-indigo-100 bg-white">
            <p className="border-b px-3 py-2 text-[10px] font-black uppercase text-gray-500">
              Mill Dispatch & Godown Stock
            </p>
            <table className="min-w-full text-left text-xs">
              <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="px-2 py-2">Ch</th>
                  <th className="px-2 py-2">Desp</th>
                  <th className="px-2 py-2">Mill</th>
                  <th className="px-2 py-2">Desp Date</th>
                  <th className="px-2 py-2 text-right">TA</th>
                  <th className="px-2 py-2 text-right">Mts</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2">Remark</th>
                  <th className="px-2 py-2">Vehicle</th>
                  <th className="px-2 py-2">E-Way</th>
                  <th className="px-2 py-2">Process</th>
                </tr>
              </thead>
              <tbody>
                {dispatches.map(dispatch => (
                  <tr key={dispatch.id} className="border-b">
                    <td className="px-2 py-2">{dispatch.challanNo || '-'}</td>
                    <td className="px-2 py-2">{dispatch.srNo ?? '-'}</td>
                    <td className="px-2 py-2 font-semibold">{dispatch.millName}</td>
                    <td className="px-2 py-2">{formatDate(dispatch.dispatchDate)}</td>
                    <td className="px-2 py-2 text-right">{takaCount(dispatch.despTaka)}</td>
                    <td className="px-2 py-2 text-right">{money(dispatch.despMts)}</td>
                    <td className="px-2 py-2 text-right">{money(dispatch.rate)}</td>
                    <td className="px-2 py-2">{dispatch.remark || '-'}</td>
                    <td className="px-2 py-2">{dispatch.vehicleNo || '-'}</td>
                    <td className="px-2 py-2">{dispatch.ewayBillNo || '-'}</td>
                    <td className="px-2 py-2">{dispatch.transactionType || 'PROCESS'}</td>
                  </tr>
                ))}
                {summary.stockTaka > 0 && (
                  <tr className="border-b bg-emerald-50/70 font-semibold text-emerald-900">
                    <td className="px-2 py-2">-</td>
                    <td className="px-2 py-2">-</td>
                    <td className="px-2 py-2">GODOWN STOCK</td>
                    <td className="px-2 py-2">-</td>
                    <td className="px-2 py-2 text-right">{takaCount(summary.stockTaka)}</td>
                    <td className="px-2 py-2 text-right">{money(summary.stockMts)}</td>
                    <td className="px-2 py-2 text-right">{money(entry.purRate)}</td>
                    <td className="px-2 py-2" colSpan={4}>Balance in godown</td>
                  </tr>
                )}
                {dispatches.length === 0 && summary.stockTaka <= 0 && (
                  <tr>
                    <td className="px-3 py-4 text-center text-gray-400" colSpan={11}>
                      No mill dispatch yet. Full stock is in godown.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {takaDetails.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-indigo-100 bg-white">
              <p className="border-b px-3 py-2 text-[10px] font-black uppercase text-gray-500">Received Taka Details</p>
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Sr. No.</th>
                    <th className="px-3 py-2 text-right">Mtrs</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {takaDetails.map((row, i) => {
                    const dispatched = dispatches.some(d =>
                      Array.isArray(d.takaDetails) && d.takaDetails!.some(t => t.srNo === row.srNo)
                    );
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2">{row.srNo}</td>
                        <td className="px-3 py-2 text-right">{money(row.mts)}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${dispatched ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {dispatched ? 'Dispatched' : 'In Godown'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
