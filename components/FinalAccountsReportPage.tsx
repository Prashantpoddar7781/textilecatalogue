import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { ledgerApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const VIEW_OPTIONS = [
  { value: 'all', label: 'All Final Accounts' },
  { value: 'trading', label: 'Trading Account' },
  { value: 'pl', label: 'Profit & Loss' },
  { value: 'balance', label: 'Balance Sheet' },
  { value: 'trial', label: 'Trial Balance' }
];

const money = (v: number) => Number(v || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const todayIso = () => new Date().toISOString().slice(0, 10);
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '-');

const inputClass = 'w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold';
const labelText = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const thClass = 'border border-slate-300 bg-slate-100 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-slate-900';
const tdClass = 'border border-slate-200 px-2 py-1.5 align-middle';
const tdNum = `${tdClass} text-right tabular-nums`;
const clickRow = 'cursor-pointer hover:bg-indigo-50';

type StatementBlock = {
  rows?: Array<Record<string, any>>;
  assets?: Array<Record<string, any>>;
  liabilities?: Array<Record<string, any>>;
  totals?: Record<string, number>;
};

type DrillState = {
  drillKey: string;
  level: 'parties' | 'bills';
  partyName?: string;
  account?: string;
  title: string;
};

export const FinalAccountsReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const params = new URLSearchParams(window.location.search);
  const [loading, setLoading] = useState(true);
  const [drillLoading, setDrillLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState(params.get('view') || 'all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [asOnDate, setAsOnDate] = useState(params.get('asOnDate') || todayIso());
  const [period, setPeriod] = useState<Record<string, string | null | undefined>>({});
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [assets, setAssets] = useState<Array<Record<string, any>>>([]);
  const [liabilities, setLiabilities] = useState<Array<Record<string, any>>>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [trading, setTrading] = useState<StatementBlock | null>(null);
  const [pl, setPl] = useState<StatementBlock | null>(null);
  const [balance, setBalance] = useState<StatementBlock | null>(null);

  const [drill, setDrill] = useState<DrillState | null>(null);
  const [drillRows, setDrillRows] = useState<Array<Record<string, any>>>([]);
  const [drillTotals, setDrillTotals] = useState<Record<string, number>>({});
  const [drillTitle, setDrillTitle] = useState('');

  const dateParams = () => ({
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    asOnDate: asOnDate || undefined
  });

  const load = async () => {
    setLoading(true);
    setError('');
    setDrill(null);
    setDrillRows([]);
    try {
      const result = await ledgerApi.getFinalAccounts({
        view,
        ...dateParams()
      });
      setPeriod(result.period || {});
      setSummary(result.summary || {});
      setRows(result.rows || (result as any).trading?.rows || []);
      setAssets(result.assets || (result as any).balance?.assets || []);
      setLiabilities(result.liabilities || (result as any).balance?.liabilities || []);
      setTotals(result.totals || {});
      setTrading((result as any).trading || (view === 'trading' ? result : null));
      setPl((result as any).pl || (view === 'pl' ? result : null));
      setBalance((result as any).balance || (view === 'balance' ? result : null));
    } catch (err: any) {
      setError(err.message || 'Could not load final accounts.');
    } finally {
      setLoading(false);
    }
  };

  const loadDrill = async (next: DrillState) => {
    setDrillLoading(true);
    setError('');
    try {
      const result = await ledgerApi.getFinalAccountsDrill({
        drillKey: next.drillKey,
        level: next.level,
        partyName: next.partyName,
        account: next.account,
        ...dateParams()
      });
      setDrill(next);
      setDrillTitle(result.title || next.title);
      setDrillRows(result.rows || []);
      setDrillTotals(result.totals || {});
    } catch (err: any) {
      setError(err.message || 'Could not load drill-down.');
    } finally {
      setDrillLoading(false);
    }
  };

  useEffect(() => { void load(); }, [view]);

  const openStatementLine = (row: Record<string, any>) => {
    if (!row.clickable || !row.drillKey) return;
    if (row.drillKey === 'sundry_creditors' || row.drillKey === 'sundry_debtors') {
      void loadDrill({
        drillKey: row.drillKey,
        level: 'parties',
        title: row.particular
      });
      return;
    }
    // Fixed asset / P&L expense / trading → bills directly
    void loadDrill({
      drillKey: row.drillKey,
      level: 'bills',
      account: row.account || undefined,
      title: row.particular
    });
  };

  const openParty = (partyName: string) => {
    if (!drill) return;
    void loadDrill({
      drillKey: drill.drillKey,
      level: 'bills',
      partyName,
      title: partyName
    });
  };

  const openBill = (row: Record<string, any>) => {
    if (row.editPath) {
      window.location.href = row.editPath;
    }
  };

  const drillBack = () => {
    if (!drill) return;
    if (drill.level === 'bills' && (drill.drillKey === 'sundry_creditors' || drill.drillKey === 'sundry_debtors') && drill.partyName) {
      void loadDrill({
        drillKey: drill.drillKey,
        level: 'parties',
        title: drill.drillKey === 'sundry_creditors' ? 'Sundry Creditors' : 'Sundry Debtors'
      });
      return;
    }
    setDrill(null);
    setDrillRows([]);
  };

  const renderDrCrTable = (title: string, statementRows: Array<Record<string, any>>, statementTotals?: Record<string, number>, hint?: string) => (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="border-b bg-slate-100 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">{title}</p>
        {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr>
              <th className={thClass}>Particulars</th>
              <th className={thClass}>Debit</th>
              <th className={thClass}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {statementRows.length === 0 && (
              <tr><td colSpan={3} className={`${tdClass} p-8 text-center font-bold text-gray-400`}>No rows.</td></tr>
            )}
            {statementRows.map(row => (
              <tr
                key={`${title}-${row.side}-${row.particular}`}
                className={row.clickable ? clickRow : undefined}
                onClick={() => openStatementLine(row)}
              >
                <td className={`${tdClass} font-bold`}>
                  <span className="inline-flex items-center gap-1">
                    {row.particular}
                    {row.clickable && <ChevronRight className="h-3.5 w-3.5 text-indigo-500" />}
                  </span>
                  {row.note && <span className="ml-2 text-[10px] font-semibold uppercase text-gray-400">{row.note}</span>}
                </td>
                <td className={tdNum}>{row.side === 'debit' ? money(row.amount) : ''}</td>
                <td className={tdNum}>{row.side === 'credit' ? money(row.amount) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-white">
              <td className={`${tdClass} border-slate-800 font-black`}>Total</td>
              <td className={`${tdNum} border-slate-800 font-black`}>{money(statementTotals?.debit)}</td>
              <td className={`${tdNum} border-slate-800 font-black`}>{money(statementTotals?.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );

  const renderBalanceSheet = (assetRows: Array<Record<string, any>>, liabilityRows: Array<Record<string, any>>, sheetTotals?: Record<string, number>) => (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="border-b bg-slate-100 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">Balance Sheet</p>
        <p className="mt-1 text-xs text-gray-500">
          Click Sundry Creditors / Debtors or Fixed Assets to drill into parties and bills.
        </p>
      </div>
      <div className="grid gap-0 lg:grid-cols-2">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr><th className={thClass} colSpan={2}>Liabilities</th></tr>
            <tr>
              <th className={thClass}>Particulars</th>
              <th className={thClass}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {liabilityRows.length === 0 && (
              <tr><td colSpan={2} className={`${tdClass} p-8 text-center font-bold text-gray-400`}>No liability rows.</td></tr>
            )}
            {liabilityRows.map(row => (
              <tr
                key={`liab-${row.particular}`}
                className={row.clickable ? clickRow : undefined}
                onClick={() => openStatementLine(row)}
              >
                <td className={tdClass}>
                  <span className="inline-flex items-center gap-1 font-bold">
                    {row.particular}
                    {row.clickable && <ChevronRight className="h-3.5 w-3.5 text-indigo-500" />}
                  </span>
                </td>
                <td className={tdNum}>{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-white">
              <td className={`${tdClass} border-slate-800 font-black`}>Total</td>
              <td className={`${tdNum} border-slate-800 font-black`}>{money(sheetTotals?.liabilities)}</td>
            </tr>
          </tfoot>
        </table>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr><th className={thClass} colSpan={2}>Assets</th></tr>
            <tr>
              <th className={thClass}>Particulars</th>
              <th className={thClass}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {assetRows.length === 0 && (
              <tr><td colSpan={2} className={`${tdClass} p-8 text-center font-bold text-gray-400`}>No asset rows.</td></tr>
            )}
            {assetRows.map(row => (
              <tr
                key={`asset-${row.particular}`}
                className={row.clickable ? clickRow : undefined}
                onClick={() => openStatementLine(row)}
              >
                <td className={tdClass}>
                  <span className="inline-flex items-center gap-1 font-bold">
                    {row.particular}
                    {row.clickable && <ChevronRight className="h-3.5 w-3.5 text-indigo-500" />}
                  </span>
                  {row.note && <span className="ml-2 text-[10px] font-semibold uppercase text-gray-400">{row.note}</span>}
                </td>
                <td className={tdNum}>{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-white">
              <td className={`${tdClass} border-slate-800 font-black`}>Total</td>
              <td className={`${tdNum} border-slate-800 font-black`}>{money(sheetTotals?.assets)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );

  const renderDrillPanel = () => {
    if (!drill) return null;
    const isParties = drill.level === 'parties';
    return (
      <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-indigo-50 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
              Drill-down · {drillTitle}
            </p>
            <p className="mt-1 text-xs text-indigo-700/80">
              {isParties
                ? 'Click a party to see their bills.'
                : 'Click a bill to open the entry in edit mode.'}
            </p>
          </div>
          <button
            type="button"
            onClick={drillBack}
            className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-black uppercase text-indigo-800"
          >
            Back
          </button>
        </div>
        {drillLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-700" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr>
                  {isParties ? (
                    <>
                      <th className={thClass}>Party</th>
                      <th className={thClass}>Bills</th>
                      <th className={thClass}>Amount</th>
                    </>
                  ) : (
                    <>
                      <th className={thClass}>Date</th>
                      <th className={thClass}>Bill / Voucher</th>
                      <th className={thClass}>Type</th>
                      <th className={thClass}>Party</th>
                      <th className={thClass}>Pur A/C</th>
                      <th className={thClass}>Amount</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {drillRows.length === 0 && (
                  <tr>
                    <td colSpan={isParties ? 3 : 6} className={`${tdClass} p-10 text-center font-bold text-gray-400`}>
                      No records found.
                    </td>
                  </tr>
                )}
                {isParties
                  ? drillRows.map(row => (
                    <tr
                      key={row.partyName}
                      className={clickRow}
                      onClick={() => openParty(row.partyName)}
                    >
                      <td className={`${tdClass} font-bold`}>
                        <span className="inline-flex items-center gap-1">
                          {row.partyName}
                          <ChevronRight className="h-3.5 w-3.5 text-indigo-500" />
                        </span>
                      </td>
                      <td className={tdNum}>{row.billCount || '-'}</td>
                      <td className={`${tdNum} font-black`}>{money(row.amount)}</td>
                    </tr>
                  ))
                  : drillRows.map(row => (
                    <tr
                      key={`${row.id}-${row.billNo}`}
                      className={row.clickable && row.editPath ? clickRow : undefined}
                      onClick={() => openBill(row)}
                    >
                      <td className={tdClass}>{formatDate(row.date)}</td>
                      <td className={`${tdClass} font-bold`}>
                        <span className="inline-flex items-center gap-1">
                          {row.billNo || '-'}
                          {row.editPath && <ChevronRight className="h-3.5 w-3.5 text-indigo-500" />}
                        </span>
                      </td>
                      <td className={tdClass}>{row.transactionType || '-'}</td>
                      <td className={tdClass}>{row.partyName || '-'}</td>
                      <td className={tdClass}>{row.purchaseAccount || '-'}</td>
                      <td className={`${tdNum} font-black`}>{money(row.amount)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-900 text-white">
                  <td colSpan={isParties ? 2 : 5} className={`${tdClass} border-indigo-800 text-right font-black`}>Total</td>
                  <td className={`${tdNum} border-indigo-800 font-black`}>{money(drillTotals.amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Final Accounts Report" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <button type="button" onClick={() => { window.location.href = '/erp/ledger'; }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase text-slate-800">
            Account Ledger
          </button>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Final Accounts</p>
            <p className="mt-1 text-xs text-gray-500">
              Click statement lines to drill: Creditors/Debtors → party list → bills → open entry.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block">
              <span className={labelText}>View</span>
              <select className={inputClass} value={view} onChange={e => setView(e.target.value)}>
                {VIEW_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
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
              <span className={labelText}>As On (B/S)</span>
              <input type="date" className={inputClass} value={asOnDate} onChange={e => setAsOnDate(e.target.value)} />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => void load()} className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-black uppercase text-white">
                Show Report
              </button>
            </div>
          </div>
        </section>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            { label: 'Net Sales', value: summary.sales },
            { label: 'Net Purchases', value: summary.purchases },
            { label: 'Gross Profit', value: summary.grossProfit },
            { label: 'P&L Expenses', value: summary.expenses },
            { label: 'Fixed Assets', value: summary.fixedAssets },
            { label: 'Net Profit', value: summary.netProfit }
          ].map(card => (
            <div key={card.label} className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{card.label}</p>
              <p className={`mt-1 text-lg font-black tabular-nums ${(card.value || 0) < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                {money(card.value || 0)}
              </p>
            </div>
          ))}
        </section>

        <div className="mb-3 text-[10px] font-bold uppercase tracking-wide text-gray-500">
          Period {formatDate(period.fromDate)} – {formatDate(period.toDate)} · B/S as on {formatDate(period.asOnDate)}
        </div>

        {drill && <div className="mb-4">{renderDrillPanel()}</div>}

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border bg-white p-16 shadow-sm">
            <Loader2 className="h-7 w-7 animate-spin text-slate-700" />
          </div>
        ) : (
          <div className="space-y-4">
            {(view === 'all' || view === 'trading') && renderDrCrTable(
              'Trading Account',
              (trading?.rows || (view === 'trading' ? rows : [])) as Array<Record<string, any>>,
              trading?.totals || (view === 'trading' ? totals : undefined),
              'Click a line to open related bills.'
            )}

            {(view === 'all' || view === 'pl') && renderDrCrTable(
              'Profit & Loss Account',
              (pl?.rows || (view === 'pl' ? rows : [])) as Array<Record<string, any>>,
              pl?.totals || (view === 'pl' ? totals : undefined),
              'Click an expense Pur A/C to see its bills.'
            )}

            {(view === 'all' || view === 'balance') && renderBalanceSheet(
              (balance?.assets || (view === 'balance' ? assets : [])) as Array<Record<string, any>>,
              (balance?.liabilities || (view === 'balance' ? liabilities : [])) as Array<Record<string, any>>,
              balance?.totals || (view === 'balance' ? totals : undefined)
            )}

            {view === 'trial' && (
              <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="border-b bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-800">
                  Trial Balance
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className={thClass}>Account</th>
                        <th className={thClass}>Debit</th>
                        <th className={thClass}>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr><td colSpan={3} className={`${tdClass} p-10 text-center font-bold text-gray-400`}>No postings in this period.</td></tr>
                      )}
                      {rows.map(row => (
                        <tr key={row.account}>
                          <td className={`${tdClass} font-bold`}>{row.account}</td>
                          <td className={tdNum}>{row.debit ? money(row.debit) : ''}</td>
                          <td className={tdNum}>{row.credit ? money(row.credit) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900 text-white">
                        <td className={`${tdClass} border-slate-800 font-black`}>Total</td>
                        <td className={`${tdNum} border-slate-800 font-black`}>{money(totals.debit)}</td>
                        <td className={`${tdNum} border-slate-800 font-black`}>{money(totals.credit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
