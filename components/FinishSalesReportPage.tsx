import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { salesOrdersApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const money = (v: number) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '-');

const VIEW_OPTIONS = [
  { value: 'register', label: 'Sales Register (Bill-wise)' },
  { value: 'detailed', label: 'Detailed Report (Item-wise)' },
  { value: 'party', label: 'Customer / Party - Wise' },
  { value: 'date', label: 'Date - Wise' },
  { value: 'broker', label: 'Broker - Wise Party - Wise' },
  { value: 'station', label: 'Station - Wise Sales Summary' }
];

const DOC_TYPE_OPTIONS = [
  { value: 'finish', label: 'Finish Sales only' },
  { value: 'return', label: 'Sales Goods Return only' },
  { value: 'both', label: 'Finish Sales + Goods Return' }
];

export const FinishSalesReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const params = new URLSearchParams(window.location.search);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState(params.get('view') || 'register');
  const [docType, setDocType] = useState(
    params.get('docType') || (params.get('type') === 'return' ? 'return' : 'both')
  );
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [partyName, setPartyName] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [transportName, setTransportName] = useState('');
  const [station, setStation] = useState('');
  const [haste, setHaste] = useState('');
  const [mainScreen, setMainScreen] = useState('');
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});

  const apiView = view === 'detailed' ? 'detailed' : 'register';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await salesOrdersApi.getFinishReport({
        view: apiView,
        docType,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        partyName: partyName || undefined,
        brokerName: brokerName || undefined,
        transportName: transportName || undefined,
        station: station || undefined,
        haste: haste || undefined,
        mainScreen: mainScreen || undefined
      });
      setRows(result.rows || []);
      setTotals(result.totals || {});
    } catch (err: any) {
      setError(err.message || 'Could not load sales report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [view, docType]);

  const grouped = useMemo(() => {
    const keyFn = (row: Record<string, any>) => {
      if (view === 'date') return formatDate(row.date);
      if (view === 'broker') return row.brokerName || 'No Broker';
      if (view === 'station') return row.station || 'No Station';
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

  const isDetailed = apiView === 'detailed';
  const showTypeCol = docType === 'both';
  const detailedCols = showTypeCol ? 12 : 11;
  const registerCols = showTypeCol ? 15 : 14;

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Finish Sales / Goods Return Report" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { window.location.href = '/erp/sales?type=SALES%20GOODS%20RETURN'; }} className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-black uppercase text-white">
              New Goods Return
            </button>
            <button type="button" onClick={() => { window.location.href = '/erp/sales?type=FINISH%20SALES'; }} className="rounded-xl bg-fuchsia-700 px-3 py-2 text-xs font-black uppercase text-white">
              New Finish Sales
            </button>
          </div>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-fuchsia-700">Report View Options</p>
            <p className="mt-1 text-xs text-gray-500">
              Finish Sales and Sales Goods Return in one report — filter by Type and View. Click any row to edit.
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
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Document Type</span>
              <select className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={docType} onChange={e => setDocType(e.target.value)}>
                {DOC_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">From</span><input type="date" className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">To</span><input type="date" className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Party</span><input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={partyName} onChange={e => setPartyName(e.target.value)} /></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Broker</span><input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={brokerName} onChange={e => setBrokerName(e.target.value)} /></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Transport</span><input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={transportName} onChange={e => setTransportName(e.target.value)} /></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Station</span><input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={station} onChange={e => setStation(e.target.value)} /></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Haste</span><input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={haste} onChange={e => setHaste(e.target.value)} /></label>
            {isDetailed && (
              <label><span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Main Screen / Item</span><input className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={mainScreen} onChange={e => setMainScreen(e.target.value)} /></label>
            )}
            <div className="flex items-end">
              <button type="button" onClick={() => void load()} className="w-full rounded-xl bg-fuchsia-600 px-4 py-2.5 text-xs font-black uppercase text-white">Show Report</button>
            </div>
          </div>
        </section>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-fuchsia-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-fuchsia-800">
            {VIEW_OPTIONS.find(option => option.value === view)?.label || 'Sales Report'}
            {' · '}
            {DOC_TYPE_OPTIONS.find(option => option.value === docType)?.label}
            {' · '}Click any row to edit
          </div>
          <div className="overflow-x-auto">
            {isDetailed ? (
              <table className="min-w-[1300px] w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    {[
                      'Customer', 'Date', ...(showTypeCol ? ['Type'] : []), 'Bill No.',
                      'Main Screen', 'Screen Name', 'PCS', 'Cut', 'Rate', 'Gross Amt.', 'Haste', 'Broker'
                    ].map(head => (
                      <th key={head} className="px-2 py-2 font-black">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={detailedCols} className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-fuchsia-600" /></td></tr>}
                  {!loading && rows.length === 0 && <tr><td colSpan={detailedCols} className="p-10 text-center font-bold text-gray-400">No bills found.</td></tr>}
                  {!loading && grouped.map(([group, groupRows]) => (
                    <React.Fragment key={group}>
                      {(view === 'party' || view === 'date' || view === 'broker' || view === 'station') && (
                        <tr className="bg-fuchsia-50/70"><td colSpan={detailedCols} className="px-2 py-2 text-sm font-black text-fuchsia-900">{group}</td></tr>
                      )}
                      {groupRows.map(row => (
                        <tr key={row.id} onClick={() => { window.location.href = `/erp/sales?edit=${row.billId}&kind=bill`; }} className="cursor-pointer border-b hover:bg-fuchsia-50">
                          <td className="px-2 py-2 font-bold">{row.partyName}</td>
                          <td className="px-2 py-2">{formatDate(row.date)}</td>
                          {showTypeCol && (
                            <td className={`px-2 py-2 text-[10px] font-black uppercase ${String(row.transactionType || '').includes('RETURN') ? 'text-amber-800' : 'text-fuchsia-800'}`}>
                              {String(row.transactionType || '').includes('RETURN') ? 'Return' : 'Sales'}
                            </td>
                          )}
                          <td className="px-2 py-2">{row.billNo}</td>
                          <td className="px-2 py-2">{row.mainScreen}</td>
                          <td className="px-2 py-2">{row.itemName}</td>
                          <td className="px-2 py-2 text-right">{money(row.pcs)}</td>
                          <td className="px-2 py-2 text-right">{money(row.cut)}</td>
                          <td className="px-2 py-2 text-right">{money(row.rate)}</td>
                          <td className="px-2 py-2 text-right font-black">{money(row.grossAmount)}</td>
                          <td className="px-2 py-2">{row.haste || '-'}</td>
                          <td className="px-2 py-2">{row.brokerName || '-'}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-fuchsia-900 font-black text-white">
                  <tr>
                    <td colSpan={showTypeCol ? 6 : 5} className="px-2 py-2 text-right">Grand Total</td>
                    <td className="px-2 py-2 text-right">{money(totals.pcs)}</td>
                    <td colSpan={2} />
                    <td className="px-2 py-2 text-right">{money(totals.grossAmount)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className="min-w-[1450px] w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    {[
                      'Party Name', 'Bill Date', ...(showTypeCol ? ['Type'] : []), 'V.No.', 'Bill No.',
                      'LR No.', 'Transport', 'Order', 'PCS', 'MTS', 'Gross Item', 'Taxable Val.', 'Ledger Amt.', 'Invoice Val.', 'Broker'
                    ].map(head => (
                      <th key={head} className="px-2 py-2 font-black">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={registerCols} className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-fuchsia-600" /></td></tr>}
                  {!loading && rows.length === 0 && <tr><td colSpan={registerCols} className="p-10 text-center font-bold text-gray-400">No bills found.</td></tr>}
                  {!loading && grouped.map(([group, groupRows]) => (
                    <React.Fragment key={group}>
                      {(view === 'party' || view === 'date' || view === 'broker' || view === 'station') && (
                        <tr className="bg-fuchsia-50/70"><td colSpan={registerCols} className="px-2 py-2 text-sm font-black text-fuchsia-900">{group}</td></tr>
                      )}
                      {groupRows.map(row => (
                        <tr key={row.id} onClick={() => { window.location.href = `/erp/sales?edit=${row.billId || row.id}&kind=bill`; }} className="cursor-pointer border-b hover:bg-fuchsia-50">
                          <td className="px-2 py-2 font-bold">{row.partyName}</td>
                          <td className="px-2 py-2">{formatDate(row.date)}</td>
                          {showTypeCol && (
                            <td className={`px-2 py-2 text-[10px] font-black uppercase ${String(row.transactionType || '').includes('RETURN') ? 'text-amber-800' : 'text-fuchsia-800'}`}>
                              {String(row.transactionType || '').includes('RETURN') ? 'Return' : 'Sales'}
                            </td>
                          )}
                          <td className="px-2 py-2 text-right">{row.voucherNo || ''}</td>
                          <td className="px-2 py-2 text-right">{row.billNo || ''}</td>
                          <td className="px-2 py-2">{row.lrNo || '-'}</td>
                          <td className="px-2 py-2">{row.transportName || '-'}</td>
                          <td className="px-2 py-2 text-right">{row.orderRef || 0}</td>
                          <td className="px-2 py-2 text-right">{money(row.pcs)}</td>
                          <td className="px-2 py-2 text-right">{money(row.mts)}</td>
                          <td className="px-2 py-2 text-right">{money(row.grossAmount)}</td>
                          <td className="px-2 py-2 text-right">{money(row.taxableAmount)}</td>
                          <td className="px-2 py-2 text-right">{money(row.ledgerAmount)}</td>
                          <td className="px-2 py-2 text-right font-black">{money(row.invoiceValue)}</td>
                          <td className="px-2 py-2">{row.brokerName || '-'}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-fuchsia-900 font-black text-white">
                  <tr>
                    <td colSpan={showTypeCol ? 8 : 7} className="px-2 py-2 text-right">Grand Total</td>
                    {['pcs', 'mts', 'grossAmount', 'taxableAmount', 'ledgerAmount', 'invoiceValue'].map(key => (
                      <td key={key} className="px-2 py-2 text-right">{money(totals[key])}</td>
                    ))}
                    <td />
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
