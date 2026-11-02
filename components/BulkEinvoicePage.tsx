import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { EinvoiceListRow, einvoicesApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const TYPES = [
  'FINISH SALES (GST)',
  'FINISH SALES',
  'GREY SALES',
  'CASH SALES',
  'FENT SALES',
  'CREDIT NOTE (ON SALES)',
  'DEBIT NOTE (ON SALES)'
];

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};
const showDate = (value?: string) => {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year.slice(2)}` : '';
};
const money = (value: number) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const labelText = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const thClass = 'border border-indigo-200 bg-indigo-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-indigo-950 whitespace-nowrap';
const tdClass = 'border border-slate-200 px-2 py-1.5 align-middle text-xs font-semibold text-slate-800 whitespace-nowrap';

export const BulkEinvoicePage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [transactionType, setTransactionType] = useState('FINISH SALES (GST)');
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<EinvoiceListRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pickedId, setPickedId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [gstDocumentType, setGstDocumentType] = useState('');
  const [mode, setMode] = useState('');
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [missing, setMissing] = useState<Array<{ billNo: string; details: string[] }>>([]);

  const notes = transactionType.includes('NOTE');

  const load = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    setMissing([]);
    try {
      const result = notes
        ? await einvoicesApi.listNotes({ fromDate, toDate, transactionType })
        : await einvoicesApi.listSales({ fromDate, toDate, transactionType });
      setRows(result.rows || []);
      setCompanyName(result.companyName || '');
      setGstDocumentType(result.gstDocumentType || '');
      setMode(result.mode || '');
      setSelected({});
      setPickedId(result.rows?.[0]?.id || '');
    } catch (err: any) {
      setError(err.message || 'Could not load documents.');
    } finally {
      setLoading(false);
    }
  };

  const visible = useMemo(() => rows.filter(row => {
    if (status === 'pending') return !row.irn && !row.notNeeded;
    if (status === 'generated') return row.status === 'generated';
    if (status === 'not-needed') return row.notNeeded;
    return true;
  }), [rows, status]);

  const picked = rows.find(row => row.id === pickedId) || visible[0] || null;
  const selectedIds = visible.filter(row => selected[row.id]).map(row => row.id);

  const toggleAll = (on: boolean) => {
    setSelected(on
      ? Object.fromEntries(visible.filter(row => row.eligible && row.status !== 'generated').map(row => [row.id, true]))
      : {});
  };

  const generate = async (dummy: boolean) => {
    if (!selectedIds.length) {
      setNotice('Select the bills to generate.');
      return;
    }
    setWorking(true);
    setError('');
    setNotice('');
    setMissing([]);
    try {
      const result = dummy
        ? (notes ? await einvoicesApi.generateNotesBulk(selectedIds, true) : await einvoicesApi.generateSalesBulk(selectedIds, true))
        : (notes ? await einvoicesApi.generateNotesBulk(selectedIds, false) : await einvoicesApi.generateSalesBulk(selectedIds, false));
      setMissing((result.missing || []).map(row => ({ billNo: row.billNo, details: row.details })));
      setNotice(`${dummy ? 'Dummy' : 'E-invoice'} finished for ${result.generated.length} document${result.generated.length === 1 ? '' : 's'}.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'E-invoice was not generated.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <ErpTopMenu title="E-Invoice" onBackToCatalogue={onBack} erpSession={erpSession} showSessionActions />
      <div className="mx-auto max-w-[1400px] px-3 py-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-indigo-600">Accounts</p>
              <h1 className="text-lg font-black text-slate-900">E-Invoice bulk</h1>
              <p className="text-xs font-semibold text-slate-500">
                {companyName}{gstDocumentType ? ` · ${gstDocumentType}` : ''}{mode ? ` · ${mode}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={working || !selectedIds.length} onClick={() => void generate(false)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                {working ? 'Working…' : `Generate (${selectedIds.length})`}
              </button>
              <button type="button" disabled={working || !selectedIds.length} onClick={() => void generate(true)} className="rounded-xl border border-indigo-200 px-4 py-2 text-sm font-black text-indigo-800 disabled:opacity-50">
                Dummy test
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <label>
              <span className={labelText}>From</span>
              <input type="date" className={inputClass} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label>
              <span className={labelText}>To</span>
              <input type="date" className={inputClass} value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
            <label>
              <span className={labelText}>Type</span>
              <select className={inputClass} value={transactionType} onChange={e => setTransactionType(e.target.value)}>
                {TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label>
              <span className={labelText}>E-invoice status</span>
              <select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}>
                <option value="pending">Pending</option>
                <option value="generated">Generated</option>
                <option value="not-needed">Not needed</option>
                <option value="all">All</option>
              </select>
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => void load()} disabled={loading} className={`${inputClass} bg-slate-900 text-white`}>
                {loading ? 'Loading…' : 'View'}
              </button>
            </div>
          </div>

          {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
          {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{notice}</p>}

          <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-[1200px] border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>
                    <input type="checkbox" checked={visible.length > 0 && selectedIds.length === visible.filter(row => row.eligible && row.status !== 'generated').length && selectedIds.length > 0} onChange={e => toggleAll(e.target.checked)} />
                  </th>
                  {['Party', 'Bill No.', 'Date', 'Case No.', 'LR No.', 'LR Date', 'Transport', 'E-Invoice IRN', 'E-Way Bill', 'Station', 'Haste', 'Weight', 'Amount'].map(heading => (
                    <th key={heading} className={thClass}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={14} className={`${tdClass} py-8 text-center`}><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
                {!loading && visible.length === 0 && <tr><td colSpan={14} className={`${tdClass} py-8 text-center text-slate-500`}>No documents in this list. Press View.</td></tr>}
                {!loading && visible.map(row => (
                  <tr key={row.id} onClick={() => setPickedId(row.id)} className={row.id === picked?.id ? 'bg-amber-50' : 'bg-white'}>
                    <td className={tdClass}>
                      <input
                        type="checkbox"
                        disabled={!row.eligible || row.status === 'generated'}
                        checked={Boolean(selected[row.id])}
                        onChange={e => setSelected(prev => ({ ...prev, [row.id]: e.target.checked }))}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className={tdClass}>{row.partyName}</td>
                    <td className={tdClass}>
                      <a href={row.editPath} className="font-black text-indigo-700 underline" onClick={e => e.stopPropagation()}>{row.billNo}</a>
                    </td>
                    <td className={tdClass}>{showDate(row.date)}</td>
                    <td className={tdClass}>{row.caseNo}</td>
                    <td className={tdClass}>{row.lrNo}</td>
                    <td className={tdClass}>{showDate(row.lrDate)}</td>
                    <td className={tdClass}>{row.transportName}</td>
                    <td className={`${tdClass} max-w-[180px] truncate font-mono`} title={row.irn}>{row.notNeeded ? '—' : (row.irn || '')}</td>
                    <td className={tdClass}>{row.ewayBillNo}</td>
                    <td className={tdClass}>{row.station}</td>
                    <td className={tdClass}>{row.haste}</td>
                    <td className={`${tdClass} text-right`}>{Number(row.weight || 0).toFixed(3)}</td>
                    <td className={`${tdClass} text-right`}>{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid gap-2 text-xs font-bold text-slate-700 md:grid-cols-4">
            <p>Selected: {selectedIds.length}</p>
            <p>Showing: {visible.length}</p>
            <p>Amount of this bill: {picked ? money(picked.amount) : '—'}</p>
            <p>Company: {companyName || '—'}</p>
            {picked && picked.missing.length > 0 && (
              <p className="md:col-span-4 text-rose-700">{picked.billNo}: {picked.missing.join(' ')}</p>
            )}
            {missing.map(row => (
              <p key={row.billNo} className="md:col-span-4 text-rose-700">{row.billNo}: {row.details.join(' ')}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
