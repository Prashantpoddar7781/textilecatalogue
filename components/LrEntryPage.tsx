import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { LrEntryRow, salesOrdersApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const SALE_TYPES = [
  'FINISH SALES (GST)',
  'FINISH SALES',
  'GREY SALES',
  'CASH SALES',
  'FENT SALES',
  'SALES CHALLAN',
  'SALES GOODS RETURN'
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
const weightText = (value: number) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const isOfficeDelivery = (name: string) => {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return false;
  return /\boffice\b|\bself\b|hand\s*deliv|by\s*hand|godown\s*deliv/.test(value);
};

const inputClass = 'rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const labelText = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const thClass = 'border border-indigo-200 bg-indigo-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-indigo-950 whitespace-nowrap';
const tdClass = 'border border-slate-200 px-2 py-1 align-middle text-xs font-semibold text-slate-800 whitespace-nowrap';

export const LrEntryPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [transactionType, setTransactionType] = useState('FINISH SALES (GST)');
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [stampDate, setStampDate] = useState(today);
  const [withoutLr, setWithoutLr] = useState(true);
  const [showOffice, setShowOffice] = useState(false);
  const [search, setSearch] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [rows, setRows] = useState<LrEntryRow[]>([]);
  const [openedWithoutLr, setOpenedWithoutLr] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await salesOrdersApi.getLrEntry({ transactionType, fromDate, toDate });
      setCompanyName(result.companyName || '');
      setRows(result.rows || []);
      setOpenedWithoutLr(Object.fromEntries((result.rows || []).map(row => [row.id, !String(row.lrNo || '').trim()])));
      setDirty({});
      setSelectedId(result.rows?.[0]?.id || '');
      setLoaded(true);
    } catch (err: any) {
      setError(err.message || 'Could not load sale bills.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Open the current month of Finish Sales (GST) the first time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => {
      if (withoutLr && !openedWithoutLr[row.id]) return false;
      if (!showOffice && isOfficeDelivery(row.transportName)) return false;
      if (!query) return true;
      return [row.partyName, row.billNo, row.lrNo, row.station, row.transportName, row.haste]
        .some(value => String(value || '').toLowerCase().includes(query));
    });
  }, [rows, withoutLr, openedWithoutLr, showOffice, search]);

  const selected = rows.find(row => row.id === selectedId) || visible[0] || null;
  const withLr = visible.filter(row => String(row.lrNo || '').trim()).length;
  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  const patch = (id: string, change: Partial<LrEntryRow>) => {
    setRows(prev => prev.map(row => (row.id === id ? { ...row, ...change } : row)));
    setDirty(prev => ({ ...prev, [id]: true }));
    setNotice('');
  };

  const fillEmptyDates = () => {
    if (!stampDate) return;
    const ids = rows.filter(row => String(row.lrNo || '').trim() && !row.lrDate).map(row => row.id);
    if (!ids.length) return;
    const idSet = new Set(ids);
    setRows(prev => prev.map(row => (idSet.has(row.id) ? { ...row, lrDate: stampDate } : row)));
    setDirty(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = true; });
      return next;
    });
  };

  const save = async () => {
    const changed = rows.filter(row => dirty[row.id]);
    if (!changed.length) {
      setNotice('Nothing new to save.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await salesOrdersApi.saveLrEntry(changed.map(row => ({
        id: row.id,
        lrNo: row.lrNo,
        lrDate: row.lrDate
      })));
      setDirty({});
      setNotice(`Saved LR details on ${result.updated} bill${result.updated === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setError(err.message || 'Could not save LR numbers.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <ErpTopMenu title="Enter LR No. / Date" onBackToCatalogue={onBack} erpSession={erpSession} showSessionActions />
      <div className="mx-auto max-w-[1400px] px-3 py-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-indigo-600">Accounts</p>
              <h1 className="text-lg font-black text-slate-900">LR No. / Date</h1>
              {companyName && <p className="text-xs font-semibold text-slate-500">{companyName}</p>}
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirtyCount}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Save${dirtyCount ? ` (${dirtyCount})` : ''}`}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-6">
            <label>
              <span className={labelText}>Type</span>
              <select className={`${inputClass} w-full`} value={transactionType} onChange={e => setTransactionType(e.target.value)}>
                {SALE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label>
              <span className={labelText}>From</span>
              <input type="date" className={`${inputClass} w-full`} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label>
              <span className={labelText}>To</span>
              <input type="date" className={`${inputClass} w-full`} value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
            <label>
              <span className={labelText}>LR rec. date</span>
              <input type="date" className={`${inputClass} w-full`} value={stampDate} onChange={e => setStampDate(e.target.value)} />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => void load()} disabled={loading} className={`${inputClass} w-full bg-slate-900 text-white`}>
                {loading ? 'Loading…' : 'View'}
              </button>
            </div>
            <div className="flex items-end">
              <button type="button" onClick={fillEmptyDates} className={`${inputClass} w-full`}>
                Fill empty LR dates
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={withoutLr} onChange={e => setWithoutLr(e.target.checked)} />
              Show bills without LR
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showOffice} onChange={e => setShowOffice(e.target.checked)} />
              Show office delivery also
            </label>
            <input
              className={`${inputClass} min-w-[220px]`}
              placeholder="Search party, bill, station"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
          {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{notice}</p>}

          <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-[1280px] border-collapse">
              <thead>
                <tr>
                  {['Party', 'Bill No.', 'Date', 'Case No.', 'LR No.', 'LR Date', 'Weight', 'Freight', 'Transport', 'Vehicle No.', 'E-way Bill', 'Station', 'Haste', 'Broker'].map(heading => (
                    <th key={heading} className={thClass}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={14} className={`${tdClass} py-8 text-center`}><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                )}
                {!loading && loaded && visible.length === 0 && (
                  <tr><td colSpan={14} className={`${tdClass} py-8 text-center text-slate-500`}>No bills in this list.</td></tr>
                )}
                {!loading && visible.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={row.id === selected?.id ? 'bg-amber-50' : 'bg-white hover:bg-slate-50'}
                  >
                    <td className={tdClass}>{row.partyName}</td>
                    <td className={tdClass}>
                      <a
                        href={`/erp/sales?edit=${row.id}&kind=bill`}
                        className="font-black text-indigo-700 underline"
                        onClick={event => event.stopPropagation()}
                      >
                        {row.billNo}
                      </a>
                    </td>
                    <td className={tdClass}>{showDate(row.billDate)}</td>
                    <td className={tdClass}>{row.caseNo}</td>
                    <td className={tdClass}>
                      <input
                        className="w-28 rounded border border-slate-300 px-2 py-1 text-xs font-bold"
                        value={row.lrNo}
                        onClick={event => event.stopPropagation()}
                        onChange={event => patch(row.id, { lrNo: event.target.value })}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        type="date"
                        className="rounded border border-slate-300 px-1 py-1 text-xs font-bold"
                        value={row.lrDate || ''}
                        onClick={event => event.stopPropagation()}
                        onChange={event => patch(row.id, { lrDate: event.target.value })}
                      />
                    </td>
                    <td className={`${tdClass} text-right`}>{weightText(row.weight)}</td>
                    <td className={`${tdClass} text-right`}>{money(row.freight)}</td>
                    <td className={tdClass}>{row.transportName}</td>
                    <td className={tdClass}>{row.vehicleNo}</td>
                    <td className={tdClass}>{row.ewayBillNo}</td>
                    <td className={tdClass}>{row.station}</td>
                    <td className={tdClass}>{row.haste}</td>
                    <td className={tdClass}>{row.brokerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid gap-3 text-xs font-bold text-slate-700 md:grid-cols-4">
            <p>Total parcels: {visible.length}</p>
            <p>Parcels with LR: {withLr}</p>
            <p>Amount of this bill: {selected ? money(selected.amount) : '—'}</p>
            <p>Company of this bill: {companyName || '—'}</p>
            <p>LR rec. date of this bill: {selected?.lrDate ? showDate(selected.lrDate) : '—'}</p>
            <p className="md:col-span-3">Remark: {selected?.remarks || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
