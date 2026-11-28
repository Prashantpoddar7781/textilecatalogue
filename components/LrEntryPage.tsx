import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { LrEntryRow, salesOrdersApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';
import {
  applyDateDigit,
  commitDatePending,
  DateSegment,
  displayLrDate
} from '../utils/lrDateEntry';

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

const FIELDS = [
  'lrNo',
  'lrDate',
  'weight',
  'freight',
  'transportName',
  'vehicleNo',
  'ewayBillNo',
  'station',
  'haste',
  'brokerName'
] as const;

type LrField = typeof FIELDS[number];

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

const isOfficeDelivery = (name: string) => {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return false;
  return /\boffice\b|\bself\b|hand\s*deliv|by\s*hand|godown\s*deliv/.test(value);
};

const inputClass = 'rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const labelText = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const thClass = 'border border-indigo-200 bg-indigo-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-indigo-950 whitespace-nowrap';
const tdClass = 'border border-slate-200 px-2 py-1 align-middle text-xs font-semibold text-slate-800 whitespace-nowrap';
const cellInput = 'rounded border border-slate-300 px-1 py-1 text-xs font-bold outline-none focus:border-indigo-500';

const segmentStart = [0, 3, 6];

function LrDateInput({
  rowId,
  iso,
  onChange,
  onFocusRow,
  onLeave
}: {
  rowId: string;
  iso: string;
  onChange: (iso: string) => void;
  onFocusRow: () => void;
  onLeave: (iso: string, rowDelta: number, fieldDelta: number) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const pending = useRef('');
  const segment = useRef<DateSegment>(0);
  const fromMouse = useRef(false);
  const [text, setText] = useState(() => displayLrDate(iso));

  useEffect(() => {
    if (pending.current) return;
    setText(displayLrDate(iso));
    const start = segmentStart[segment.current];
    window.requestAnimationFrame(() => {
      const el = ref.current;
      if (el && document.activeElement === el) el.setSelectionRange(start, start + 2);
    });
  }, [iso]);

  const selectSegment = (index: DateSegment) => {
    segment.current = index;
    const start = segmentStart[index];
    window.requestAnimationFrame(() => ref.current?.setSelectionRange(start, start + 2));
  };

  const commitAnd = (rowDelta: number, fieldDelta: number) => {
    const committed = commitDatePending(iso, segment.current, pending.current) || iso;
    pending.current = '';
    onLeave(committed, rowDelta, fieldDelta);
  };

  return (
    <input
      ref={ref}
      data-lr-row={rowId}
      data-lr-field="lrDate"
      className={`${cellInput} w-[5.6rem] font-mono tabular-nums`}
      value={text}
      onClick={event => event.stopPropagation()}
      onMouseDown={() => { fromMouse.current = true; }}
      onMouseUp={event => {
        const pos = event.currentTarget.selectionStart ?? 0;
        const index: DateSegment = pos >= 6 ? 2 : pos >= 3 ? 1 : 0;
        pending.current = '';
        setText(displayLrDate(iso));
        selectSegment(index);
      }}
      onFocus={() => {
        onFocusRow();
        if (fromMouse.current) {
          fromMouse.current = false;
          return;
        }
        pending.current = '';
        selectSegment(0);
      }}
      onChange={() => {}}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitAnd(0, 1);
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          commitAnd(1, 0);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          commitAnd(-1, 0);
          return;
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          const committed = commitDatePending(iso, segment.current, pending.current);
          pending.current = '';
          if (committed !== iso) onChange(committed);
          const step = event.key === 'ArrowRight' ? 1 : -1;
          selectSegment(Math.max(0, Math.min(2, segment.current + step)) as DateSegment);
          return;
        }
        if (event.key === 'Backspace') {
          event.preventDefault();
          pending.current = '';
          setText(displayLrDate(iso));
          selectSegment(segment.current);
          return;
        }
        if (!/^\d$/.test(event.key)) return;
        event.preventDefault();
        const result = applyDateDigit(iso, segment.current, pending.current, event.key);
        pending.current = result.pending;
        segment.current = result.segment;
        setText(result.text);
        if (result.iso !== iso) onChange(result.iso);
        else selectSegment(result.segment);
      }}
    />
  );
}

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
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const visibleRef = useRef<LrEntryRow[]>([]);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await salesOrdersApi.getLrEntry({ transactionType, fromDate, toDate });
      setCompanyName(result.companyName || '');
      setRows(result.rows || []);
      setOpenedWithoutLr(Object.fromEntries((result.rows || []).map(row => [row.id, !String(row.lrNo || '').trim()])));
      setDirty({});
      setDrafts({});
      setSelectedId(result.rows?.[0]?.id || '');
      setLoaded(true);
    } catch (err: any) {
      setError(err.message || 'Could not load sale bills.');
    } finally {
      setLoading(false);
    }
  }, [transactionType, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

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
  visibleRef.current = visible;

  const selected = rows.find(row => row.id === selectedId) || visible[0] || null;
  const withLr = visible.filter(row => String(row.lrNo || '').trim()).length;
  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  const patch = (id: string, change: Partial<LrEntryRow>) => {
    setRows(prev => prev.map(row => (row.id === id ? { ...row, ...change } : row)));
    setDirty(prev => ({ ...prev, [id]: true }));
    setNotice('');
  };

  const focusCell = (rowId: string, field: LrField) => {
    window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(
        `[data-lr-row="${CSS.escape(rowId)}"][data-lr-field="${field}"]`
      );
      if (!el) return;
      el.focus();
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, 0);
  };

  const move = (rowId: string, field: LrField, rowDelta: number, fieldDelta: number) => {
    const list = visibleRef.current;
    const rowIndex = list.findIndex(row => row.id === rowId);
    const fieldIndex = FIELDS.indexOf(field);
    if (rowIndex < 0 || fieldIndex < 0) return;
    let nextRow = rowIndex;
    let nextField = fieldIndex + fieldDelta;
    if (fieldDelta > 0 && nextField >= FIELDS.length) {
      nextField = 0;
      nextRow += 1;
    }
    if (fieldDelta < 0 && nextField < 0) {
      nextField = FIELDS.length - 1;
      nextRow -= 1;
    }
    nextRow += rowDelta;
    if (nextRow < 0 || nextRow >= list.length) return;
    const target = list[nextRow];
    const nextName = FIELDS[nextField];
    setSelectedId(target.id);
    focusCell(target.id, nextName);
  };

  const onTextKey = (event: React.KeyboardEvent<HTMLInputElement>, rowId: string, field: LrField) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      move(rowId, field, 0, 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(rowId, field, 1, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(rowId, field, -1, 0);
    }
  };

  const numberText = (row: LrEntryRow, field: 'weight' | 'freight') => {
    const draft = drafts[`${row.id}:${field}`];
    if (draft !== undefined) return draft;
    return String(row[field] ?? 0);
  };

  const onNumber = (row: LrEntryRow, field: 'weight' | 'freight', raw: string) => {
    if (!/^\d*\.?\d*$/.test(raw)) return;
    const key = `${row.id}:${field}`;
    draftsRef.current = { ...draftsRef.current, [key]: raw };
    setDrafts(draftsRef.current);
    if (raw === '' || raw === '.') return;
    const num = Number(raw);
    if (Number.isFinite(num)) patch(row.id, { [field]: num });
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
        lrDate: row.lrDate,
        weight: Number(row.weight) || 0,
        freight: Number(row.freight) || 0,
        transportName: row.transportName,
        vehicleNo: row.vehicleNo,
        ewayBillNo: row.ewayBillNo,
        station: row.station,
        haste: row.haste,
        brokerName: row.brokerName
      })));
      setDirty({});
      setNotice(`Saved LR details on ${result.updated} bill${result.updated === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setError(err.message || 'Could not save LR numbers.');
    } finally {
      setSaving(false);
    }
  };

  const textCell = (row: LrEntryRow, field: LrField, width: string) => (
    <input
      data-lr-row={row.id}
      data-lr-field={field}
      className={`${cellInput} ${width}`}
      value={String(row[field] ?? '')}
      onClick={event => event.stopPropagation()}
      onFocus={event => {
        setSelectedId(row.id);
        window.setTimeout(() => event.currentTarget.select(), 0);
      }}
      onChange={event => patch(row.id, { [field]: event.target.value })}
      onKeyDown={event => onTextKey(event, row.id, field)}
    />
  );

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
            <table className="min-w-[1480px] border-collapse">
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
                  <tr><td colSpan={14} className={`${tdClass} py-8 text-center text-slate-500`}>No {transactionType} bills between these dates.</td></tr>
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
                    <td className={tdClass}>{textCell(row, 'lrNo', 'w-28')}</td>
                    <td className={tdClass}>
                      <LrDateInput
                        rowId={row.id}
                        iso={row.lrDate || row.billDate}
                        onChange={next => patch(row.id, { lrDate: next })}
                        onFocusRow={() => setSelectedId(row.id)}
                        onLeave={(committed, rowDelta, fieldDelta) => {
                          const typed = committed !== (row.lrDate || row.billDate);
                          if (committed && committed !== row.lrDate && (fieldDelta !== 0 || typed)) {
                            patch(row.id, { lrDate: committed });
                          }
                          move(row.id, 'lrDate', rowDelta, fieldDelta);
                        }}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        data-lr-row={row.id}
                        data-lr-field="weight"
                        inputMode="decimal"
                        className={`${cellInput} w-20 text-right`}
                        value={numberText(row, 'weight')}
                        onClick={event => event.stopPropagation()}
                        onFocus={event => {
                          setSelectedId(row.id);
                          window.setTimeout(() => event.currentTarget.select(), 0);
                        }}
                        onChange={event => onNumber(row, 'weight', event.target.value)}
                        onKeyDown={event => onTextKey(event, row.id, 'weight')}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        data-lr-row={row.id}
                        data-lr-field="freight"
                        inputMode="decimal"
                        className={`${cellInput} w-20 text-right`}
                        value={numberText(row, 'freight')}
                        onClick={event => event.stopPropagation()}
                        onFocus={event => {
                          setSelectedId(row.id);
                          window.setTimeout(() => event.currentTarget.select(), 0);
                        }}
                        onChange={event => onNumber(row, 'freight', event.target.value)}
                        onKeyDown={event => onTextKey(event, row.id, 'freight')}
                      />
                    </td>
                    <td className={tdClass}>{textCell(row, 'transportName', 'w-36')}</td>
                    <td className={tdClass}>{textCell(row, 'vehicleNo', 'w-28')}</td>
                    <td className={tdClass}>{textCell(row, 'ewayBillNo', 'w-32')}</td>
                    <td className={tdClass}>{textCell(row, 'station', 'w-28')}</td>
                    <td className={tdClass}>{textCell(row, 'haste', 'w-28')}</td>
                    <td className={tdClass}>{textCell(row, 'brokerName', 'w-36')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid gap-3 text-xs font-bold text-slate-700 md:grid-cols-4">
            <p>Total parcels: {visible.length}{rows.length !== visible.length ? ` of ${rows.length}` : ''}</p>
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
