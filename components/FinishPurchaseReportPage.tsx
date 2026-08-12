import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { purchasesApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const money = (v: number) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '-');

const VIEW_OPTIONS = [
  { value: 'register', label: 'Purchase Register (Bill-wise)' },
  { value: 'detailed', label: 'Detailed Report (Item-wise)' },
  { value: 'party', label: 'Supplier / Party - Wise' },
  { value: 'date', label: 'Date - Wise' },
  { value: 'broker', label: 'Broker - Wise Party - Wise' },
  { value: 'station', label: 'Station - Wise Purchase Summary' }
];

const DOC_TYPE_OPTIONS = [
  { value: 'finish', label: 'Finish Purchase only' },
  { value: 'return', label: 'Purchase Return only' },
  { value: 'both', label: 'Finish Purchase + Purchase Return' }
];

const inputClass = 'w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold';
const labelText = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const thClass = 'border border-emerald-200 bg-emerald-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-emerald-950';
const tdClass = 'border border-slate-200 px-2 py-1.5 align-middle';
const tdNum = `${tdClass} text-right tabular-nums`;
const tdCenter = `${tdClass} text-center`;

export const FinishPurchaseReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
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
      const result = await purchasesApi.getFinishReport({
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
      setError(err.message || 'Could not load purchase report.');
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
  const showGroup = view === 'party' || view === 'date' || view === 'broker' || view === 'station';
  const detailedCols = showTypeCol ? 12 : 11;
  const registerCols = showTypeCol ? 15 : 14;
  const isReturnType = (transactionType?: string) => String(transactionType || '').toUpperCase().includes('PURCHASE RETURN');

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Finish Purchase / Purchase Return Report" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { window.location.href = '/erp/purchase?type=FINISH%20PURCHASE%20RETURN'; }} className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-black uppercase text-white">
              New Purchase Return
            </button>
            <button type="button" onClick={() => { window.location.href = '/erp/purchase?type=FINISH%20PURCHASE'; }} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black uppercase text-white">
              New Finish Purchase
            </button>
          </div>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Report View Options</p>
            <p className="mt-1 text-xs text-gray-500">
              Finish Purchase and Purchase Return clubbed — filter Document Type (Purchase / Return / Both). Click any row to edit.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className={labelText}>View</span>
              <select className={inputClass} value={view} onChange={e => setView(e.target.value)}>
                {VIEW_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelText}>Document Type</span>
              <select className={inputClass} value={docType} onChange={e => setDocType(e.target.value)}>
                {DOC_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
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
            <label className="block">
              <span className={labelText}>Party</span>
              <input className={inputClass} value={partyName} onChange={e => setPartyName(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelText}>Broker</span>
              <input className={inputClass} value={brokerName} onChange={e => setBrokerName(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelText}>Transport</span>
              <input className={inputClass} value={transportName} onChange={e => setTransportName(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelText}>Station</span>
              <input className={inputClass} value={station} onChange={e => setStation(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelText}>Haste</span>
              <input className={inputClass} value={haste} onChange={e => setHaste(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelText}>Main Screen / Item</span>
              <input className={inputClass} value={mainScreen} onChange={e => setMainScreen(e.target.value)} placeholder="Filter by screen or item" />
            </label>
            <div className="hidden lg:block" />
            <div className="flex items-end">
              <button type="button" onClick={() => void load()} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase text-white">
                Show Report
              </button>
            </div>
          </div>
        </section>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-800">
            {VIEW_OPTIONS.find(option => option.value === view)?.label || 'Purchase Report'}
            {' · '}
            {DOC_TYPE_OPTIONS.find(option => option.value === docType)?.label}
            {' · '}Click any row to edit
          </div>
          <div className="overflow-x-auto">
            {isDetailed ? (
              <table className="w-full min-w-[1100px] border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: showTypeCol ? '12%' : '14%' }} />
                  <col style={{ width: '9%' }} />
                  {showTypeCol && <col style={{ width: '7%' }} />}
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '8%' }} />
                </colgroup>
                <thead>
                  <tr>
                    {[
                      'Supplier', 'Date', ...(showTypeCol ? ['Type'] : []), 'Bill No.',
                      'Main Screen', 'Item Name', 'PCS', 'Cut', 'Rate', 'Gross Amt.', 'Haste', 'Broker'
                    ].map(head => (
                      <th key={head} className={thClass}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={detailedCols} className={`${tdClass} p-10 text-center`}>
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                      </td>
                    </tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={detailedCols} className={`${tdClass} p-10 text-center font-bold text-gray-400`}>No bills found.</td>
                    </tr>
                  )}
                  {!loading && grouped.map(([group, groupRows]) => (
                    <React.Fragment key={group}>
                      {showGroup && (
                        <tr className="bg-emerald-100">
                          <td colSpan={detailedCols} className={`${tdClass} border-emerald-200 bg-emerald-100 text-sm font-black text-emerald-950`}>
                            {group}
                          </td>
                        </tr>
                      )}
                      {groupRows.map(row => (
                        <tr
                          key={row.id}
                          onClick={() => { window.location.href = `/erp/purchase?edit=${row.billId}`; }}
                          className="cursor-pointer hover:bg-emerald-50"
                        >
                          <td className={`${tdClass} font-bold`}>{row.partyName}</td>
                          <td className={tdCenter}>{formatDate(row.date)}</td>
                          {showTypeCol && (
                            <td className={`${tdCenter} text-[10px] font-black uppercase ${isReturnType(row.transactionType) ? 'text-amber-800' : 'text-emerald-800'}`}>
                              {isReturnType(row.transactionType) ? 'Return' : 'Purchase'}
                            </td>
                          )}
                          <td className={tdCenter}>{row.billNo}</td>
                          <td className={tdClass}>{row.mainScreen}</td>
                          <td className={tdClass}>{row.itemName}</td>
                          <td className={tdNum}>{money(row.pcs)}</td>
                          <td className={tdNum}>{money(row.cut)}</td>
                          <td className={tdNum}>{money(row.rate)}</td>
                          <td className={`${tdNum} font-black`}>{money(row.grossAmount)}</td>
                          <td className={tdCenter}>{row.haste || '-'}</td>
                          <td className={tdCenter}>{row.brokerName || '-'}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-900 text-white">
                    <td colSpan={showTypeCol ? 6 : 5} className={`${tdClass} border-emerald-800 text-right font-black`}>Grand Total</td>
                    <td className={`${tdNum} border-emerald-800 font-black`}>{money(totals.pcs)}</td>
                    <td className={`${tdClass} border-emerald-800`} />
                    <td className={`${tdClass} border-emerald-800`} />
                    <td className={`${tdNum} border-emerald-800 font-black`}>{money(totals.grossAmount)}</td>
                    <td className={`${tdClass} border-emerald-800`} />
                    <td className={`${tdClass} border-emerald-800`} />
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className="w-full min-w-[1280px] border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: showTypeCol ? '11%' : '12%' }} />
                  <col style={{ width: '8%' }} />
                  {showTypeCol && <col style={{ width: '6%' }} />}
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                </colgroup>
                <thead>
                  <tr>
                    {[
                      'Party Name', 'Bill Date', ...(showTypeCol ? ['Type'] : []), 'V.No.', 'Bill No.',
                      'LR No.', 'Transport', 'Order', 'PCS', 'MTS', 'Gross Item', 'Taxable Val.', 'Ledger Amt.', 'Invoice Val.', 'Broker'
                    ].map(head => (
                      <th key={head} className={thClass}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={registerCols} className={`${tdClass} p-10 text-center`}>
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                      </td>
                    </tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={registerCols} className={`${tdClass} p-10 text-center font-bold text-gray-400`}>No bills found.</td>
                    </tr>
                  )}
                  {!loading && grouped.map(([group, groupRows]) => (
                    <React.Fragment key={group}>
                      {showGroup && (
                        <tr className="bg-emerald-100">
                          <td colSpan={registerCols} className={`${tdClass} border-emerald-200 bg-emerald-100 text-sm font-black text-emerald-950`}>
                            {group}
                          </td>
                        </tr>
                      )}
                      {groupRows.map(row => (
                        <tr
                          key={row.id}
                          onClick={() => { window.location.href = `/erp/purchase?edit=${row.billId || row.id}`; }}
                          className="cursor-pointer hover:bg-emerald-50"
                        >
                          <td className={`${tdClass} font-bold`}>{row.partyName}</td>
                          <td className={tdCenter}>{formatDate(row.date)}</td>
                          {showTypeCol && (
                            <td className={`${tdCenter} text-[10px] font-black uppercase ${isReturnType(row.transactionType) ? 'text-amber-800' : 'text-emerald-800'}`}>
                              {isReturnType(row.transactionType) ? 'Return' : 'Purchase'}
                            </td>
                          )}
                          <td className={tdNum}>{row.voucherNo || ''}</td>
                          <td className={tdNum}>{row.billNo || ''}</td>
                          <td className={tdCenter}>{row.lrNo || '-'}</td>
                          <td className={tdClass}>{row.transportName || '-'}</td>
                          <td className={tdCenter}>{row.orderRef || '-'}</td>
                          <td className={tdNum}>{money(row.pcs)}</td>
                          <td className={tdNum}>{money(row.mts)}</td>
                          <td className={tdNum}>{money(row.grossAmount)}</td>
                          <td className={tdNum}>{money(row.taxableAmount)}</td>
                          <td className={tdNum}>{money(row.ledgerAmount)}</td>
                          <td className={`${tdNum} font-black`}>{money(row.invoiceValue)}</td>
                          <td className={tdCenter}>{row.brokerName || '-'}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-900 text-white">
                    <td colSpan={showTypeCol ? 8 : 7} className={`${tdClass} border-emerald-800 text-right font-black`}>Grand Total</td>
                    {['pcs', 'mts', 'grossAmount', 'taxableAmount', 'ledgerAmount', 'invoiceValue'].map(key => (
                      <td key={key} className={`${tdNum} border-emerald-800 font-black`}>{money(totals[key])}</td>
                    ))}
                    <td className={`${tdClass} border-emerald-800`} />
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
