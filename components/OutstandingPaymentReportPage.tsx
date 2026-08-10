import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { bankEntriesApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const AGING_BUCKETS = ['0-15', '16-30', '31-45', '46-60', 'Above 60'] as const;

const VIEW_OPTIONS = [
  { value: 'party-ageing', label: 'Party - Wise Ageing (Bill detail)' },
  { value: 'bill-wise', label: 'Bill - Wise Outstanding' },
  { value: 'broker-wise', label: 'Broker - Wise Party - Wise' },
  { value: 'station-wise', label: 'Station - Wise Outstanding' },
  { value: 'summary', label: 'Party Summary (Ageing totals)' }
];

const money = (v: number) => Number(v || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '-');
const todayIso = () => new Date().toISOString().slice(0, 10);

export const OutstandingPaymentReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const params = new URLSearchParams(window.location.search);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState(params.get('view') || 'party-ageing');
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>(
    params.get('partyType') === 'supplier' ? 'supplier' : 'customer'
  );
  const [asOnDate, setAsOnDate] = useState(params.get('asOnDate') || todayIso());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [partyName, setPartyName] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [station, setStation] = useState('');
  const [haste, setHaste] = useState('');
  const [transportName, setTransportName] = useState('');
  const [agingBucket, setAgingBucket] = useState('');
  const [includeSettled, setIncludeSettled] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [parties, setParties] = useState<Array<Record<string, any>>>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await bankEntriesApi.getOutstandingReport({
        view,
        partyType,
        asOnDate: asOnDate || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        partyName: partyName || undefined,
        brokerName: brokerName || undefined,
        station: station || undefined,
        haste: haste || undefined,
        transportName: transportName || undefined,
        agingBucket: agingBucket || undefined,
        includeSettled: includeSettled ? 'true' : undefined
      });
      setRows(result.rows || []);
      setParties(result.parties || []);
      setTotals(result.totals || {});
    } catch (err: any) {
      setError(err.message || 'Could not load Outstanding / Payment report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [view, partyType]);

  const openBill = (row: Record<string, any>) => {
    if (!row?.editPath) return;
    window.location.href = row.editPath;
  };

  const grouped = useMemo(() => {
    if (view === 'summary') return [];
    const keyFn = (row: Record<string, any>) => {
      if (view === 'broker-wise') return row.brokerName || 'No Broker';
      if (view === 'station-wise') return row.station || 'No Station';
      return row.partyName || 'Unknown';
    };
    const map = new Map<string, Array<Record<string, any>>>();
    rows.forEach(row => {
      const key = keyFn(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries());
  }, [rows, view]);

  const bucketHeaders = AGING_BUCKETS;

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Outstanding / Payment Reports" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1500px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { window.location.href = '/erp/bank'; }}
              className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black uppercase text-white"
            >
              Payment / Receipt Entry
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/erp/sales?type=FINISH%20SALES'; }}
              className="rounded-xl bg-fuchsia-700 px-3 py-2 text-xs font-black uppercase text-white"
            >
              New Finish Sales
            </button>
          </div>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Report View Options</p>
            <p className="mt-1 text-xs text-gray-500">
              Ageing buckets show unpaid balance. Click any bill row to open that entry.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <label className="md:col-span-2">
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">View</span>
              <select className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={view} onChange={e => setView(e.target.value)}>
                {VIEW_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Receivable / Payable</span>
              <select
                className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold"
                value={partyType}
                onChange={e => setPartyType(e.target.value as 'customer' | 'supplier')}
              >
                <option value="customer">Customer Outstanding (Receivable)</option>
                <option value="supplier">Supplier Outstanding (Payable)</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">As On Date</span>
              <input type="date" className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={asOnDate} onChange={e => setAsOnDate(e.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Bill From</span>
              <input type="date" className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Bill To</span>
              <input type="date" className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Party</span>
              <input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={partyName} onChange={e => setPartyName(e.target.value)} placeholder="e.g. JK FASHION" />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Broker</span>
              <input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={brokerName} onChange={e => setBrokerName(e.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Station</span>
              <input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={station} onChange={e => setStation(e.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Haste</span>
              <input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={haste} onChange={e => setHaste(e.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Transport</span>
              <input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={transportName} onChange={e => setTransportName(e.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Ageing Bucket</span>
              <select className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={agingBucket} onChange={e => setAgingBucket(e.target.value)}>
                <option value="">All buckets</option>
                {AGING_BUCKETS.map(bucket => <option key={bucket} value={bucket}>{bucket} Days</option>)}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2">
              <input type="checkbox" checked={includeSettled} onChange={e => setIncludeSettled(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
              <span className="text-xs font-bold text-gray-600">Include fully paid bills</span>
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => void load()} className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black uppercase text-white">
                Show Report
              </button>
            </div>
          </div>
        </section>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-amber-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-amber-900">
            {VIEW_OPTIONS.find(option => option.value === view)?.label || 'Outstanding Report'}
            {' · '}As on {formatDate(asOnDate)}
            {' · '}Click any bill to open entry
          </div>
          <div className="overflow-x-auto">
            {view === 'summary' ? (
              <table className="min-w-[1200px] w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    {['Party', 'Bills', 'Bill Amt', 'Received', 'Balance', ...bucketHeaders].map(head => (
                      <th key={head} className="px-2 py-2 font-black">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={10} className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-amber-600" /></td></tr>}
                  {!loading && parties.length === 0 && (
                    <tr><td colSpan={10} className="p-10 text-center font-bold text-gray-400">No outstanding bills found.</td></tr>
                  )}
                  {!loading && parties.map(party => (
                    <React.Fragment key={party.partyName}>
                      <tr className="border-b bg-amber-50/60">
                        <td className="px-2 py-2 font-black text-amber-950">{party.partyName}</td>
                        <td className="px-2 py-2 text-right">{party.billCount}</td>
                        <td className="px-2 py-2 text-right">{money(party.billAmount)}</td>
                        <td className="px-2 py-2 text-right">{money(party.paidAmount)}</td>
                        <td className="px-2 py-2 text-right font-black text-rose-700">{money(party.pendingAmount)}</td>
                        {bucketHeaders.map(bucket => (
                          <td key={bucket} className="px-2 py-2 text-right font-semibold">{money(party[bucket])}</td>
                        ))}
                      </tr>
                      {(party.rows || []).map((row: Record<string, any>) => (
                        <tr
                          key={row.id}
                          onClick={() => openBill(row)}
                          className={`border-b ${row.editPath ? 'cursor-pointer hover:bg-amber-50' : ''}`}
                          title={row.editPath ? 'Open bill' : undefined}
                        >
                          <td className="px-2 py-1.5 pl-6 text-gray-700">
                            Bill {row.billNumber} · {formatDate(row.billDate)} · {row.days}d ({row.agingBucket})
                          </td>
                          <td className="px-2 py-1.5 text-right">1</td>
                          <td className="px-2 py-1.5 text-right">{money(row.billAmount)}</td>
                          <td className="px-2 py-1.5 text-right">{money(row.paidAmount)}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-rose-700">{money(row.pendingAmount)}</td>
                          {bucketHeaders.map(bucket => (
                            <td key={bucket} className="px-2 py-1.5 text-right">{money(row.buckets?.[bucket])}</td>
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-amber-900 font-black text-white">
                  <tr>
                    <td className="px-2 py-2 text-right">Grand Total</td>
                    <td className="px-2 py-2 text-right">{rows.length}</td>
                    <td className="px-2 py-2 text-right">{money(totals.billAmount)}</td>
                    <td className="px-2 py-2 text-right">{money(totals.paidAmount)}</td>
                    <td className="px-2 py-2 text-right">{money(totals.pendingAmount)}</td>
                    {bucketHeaders.map(bucket => (
                      <td key={bucket} className="px-2 py-2 text-right">{money(totals[bucket])}</td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className="min-w-[1400px] w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    {[
                      'Party', 'Bill Date', 'Bill No.', 'Days', 'Bucket',
                      'Bill Amt', 'Received', 'Balance',
                      ...bucketHeaders, 'Broker', 'Station'
                    ].map(head => (
                      <th key={head} className="px-2 py-2 font-black">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={15} className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-amber-600" /></td></tr>}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={15} className="p-10 text-center font-bold text-gray-400">No outstanding bills found.</td></tr>
                  )}
                  {!loading && grouped.map(([group, groupRows]) => (
                    <React.Fragment key={group}>
                      {(view === 'party-ageing' || view === 'broker-wise' || view === 'station-wise') && (
                        <tr className="bg-amber-50/80">
                          <td colSpan={15} className="px-2 py-2 text-sm font-black text-amber-950">
                            {group}
                            <span className="ml-3 text-xs font-bold text-amber-800">
                              {groupRows.length} bill{groupRows.length === 1 ? '' : 's'} · Balance {money(groupRows.reduce((s, r) => s + (Number(r.pendingAmount) || 0), 0))}
                            </span>
                          </td>
                        </tr>
                      )}
                      {groupRows.map(row => (
                        <tr
                          key={row.id}
                          onClick={() => openBill(row)}
                          className={`border-b ${row.editPath ? 'cursor-pointer hover:bg-amber-50' : ''}`}
                          title={row.editPath ? 'Open bill' : undefined}
                        >
                          <td className="px-2 py-2 font-bold">{row.partyName}</td>
                          <td className="px-2 py-2">{formatDate(row.billDate)}</td>
                          <td className="px-2 py-2 font-black text-indigo-800">{row.billNumber}</td>
                          <td className="px-2 py-2 text-right">{row.days}</td>
                          <td className="px-2 py-2 font-semibold text-amber-800">{row.agingBucket}</td>
                          <td className="px-2 py-2 text-right">{money(row.billAmount)}</td>
                          <td className="px-2 py-2 text-right">{money(row.paidAmount)}</td>
                          <td className="px-2 py-2 text-right font-black text-rose-700">{money(row.pendingAmount)}</td>
                          {bucketHeaders.map(bucket => (
                            <td key={bucket} className={`px-2 py-2 text-right ${row.agingBucket === bucket ? 'font-black text-amber-900' : 'text-gray-400'}`}>
                              {money(row.buckets?.[bucket])}
                            </td>
                          ))}
                          <td className="px-2 py-2">{row.brokerName || '-'}</td>
                          <td className="px-2 py-2">{row.station || '-'}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-amber-900 font-black text-white">
                  <tr>
                    <td colSpan={5} className="px-2 py-2 text-right">Grand Total</td>
                    <td className="px-2 py-2 text-right">{money(totals.billAmount)}</td>
                    <td className="px-2 py-2 text-right">{money(totals.paidAmount)}</td>
                    <td className="px-2 py-2 text-right">{money(totals.pendingAmount)}</td>
                    {bucketHeaders.map(bucket => (
                      <td key={bucket} className="px-2 py-2 text-right">{money(totals[bucket])}</td>
                    ))}
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
