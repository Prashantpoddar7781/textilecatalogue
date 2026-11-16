import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { bankEntriesApi } from '../services/api';
import { ErpSession } from '../types';
import { partyNameMatches } from '../utils/partyNameMatch';
import { ErpTopMenu } from './ErpTopMenu';
import { PartyNameField } from './PartyNameField';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const money = (value: number) => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-IN') : '');
const todayIso = () => new Date().toISOString().slice(0, 10);

const thClass = 'border border-sky-200 bg-sky-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-sky-950';
const tdClass = 'border border-slate-200 px-2 py-1.5 align-middle';
const tdNum = `${tdClass} text-right tabular-nums`;

type BillRow = Record<string, any>;

function lineAmounts(row: BillRow) {
  const pending = Number(row.pendingAmount) || 0;
  const kind = String(row.rowKind || '');
  if (kind === 'return' || /return/i.test(String(row.transactionType || ''))) {
    const goodsReturn = Number(row.goodsReturnAmount) || Number(row.billAmount) || pending;
    return { net: 0, goodsReturn, paid: 0, pending };
  }
  if (kind === 'unadj' || kind === 'credit' || pending < 0) {
    const paid = Math.abs(pending) || Math.abs(Number(row.paidAmount) || 0);
    return { net: 0, goodsReturn: 0, paid, pending: -paid };
  }
  return {
    net: Number(row.billAmount) || 0,
    goodsReturn: 0,
    paid: Number(row.paidAmount) || 0,
    pending
  };
}

export const BillWiseOutstandingPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer');
  const [asOnDate, setAsOnDate] = useState(todayIso());
  const [partyName, setPartyName] = useState('');
  const [rows, setRows] = useState<BillRow[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await bankEntriesApi.getOutstandingReport({
        view: 'bill-wise',
        partyType,
        asOnDate: asOnDate || undefined
      });
      setRows(result.rows || []);
    } catch (err: any) {
      setError(err.message || 'Could not load bill-wise outstanding.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [partyType, asOnDate]);

  const partyIndex = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; address: string; bills: number; pending: number }>();
    for (const row of rows) {
      const name = String(row.partyName || '').trim() || 'Unknown';
      const current = map.get(name) || {
        name,
        phone: String(row.partyPhone || ''),
        address: String(row.partyAddress || ''),
        bills: 0,
        pending: 0
      };
      current.bills += 1;
      current.pending += Number(row.pendingAmount) || 0;
      if (!current.phone && row.partyPhone) current.phone = String(row.partyPhone);
      if (!current.address && row.partyAddress) current.address = String(row.partyAddress);
      map.set(name, current);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const names = useMemo(() => partyIndex.map(party => party.name), [partyIndex]);
  const query = partyName.trim();
  const matchedParties = useMemo(
    () => (query ? partyIndex.filter(party => partyNameMatches(query, party.name)) : partyIndex),
    [partyIndex, query]
  );
  const selected = query
    ? (matchedParties.find(party => party.name.trim().toLowerCase() === query.toLowerCase())
      || (matchedParties.length === 1 ? matchedParties[0] : null))
    : null;

  const billRows = useMemo(() => {
    if (!selected) return [];
    return rows
      .filter(row => String(row.partyName || '').trim() === selected.name)
      .slice()
      .sort((a, b) => {
        const dateA = new Date(a.billDate).getTime() || 0;
        const dateB = new Date(b.billDate).getTime() || 0;
        if (dateA !== dateB) return dateA - dateB;
        return String(a.displayBillNumber || a.billNumber || '').localeCompare(
          String(b.displayBillNumber || b.billNumber || ''),
          undefined,
          { numeric: true }
        );
      });
  }, [rows, selected]);

  const totals = useMemo(() => billRows.reduce((sum, row) => {
    const line = lineAmounts(row);
    sum.net += line.net;
    sum.goodsReturn += line.goodsReturn;
    sum.paid += line.paid;
    sum.pending += line.pending;
    return sum;
  }, { net: 0, goodsReturn: 0, paid: 0, pending: 0 }), [billRows]);

  const openBill = (row: BillRow) => {
    if (!row?.editPath) return;
    window.location.href = row.editPath;
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Bill Wise Outstanding" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1200px] px-4 py-6">
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-gray-600">
          <ArrowLeft className="h-4 w-4" /> Back to ERP
        </button>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Sales / purchase outstanding bills</p>
          <p className="mt-1 text-xs text-gray-500">
            Each bill shows its pending amount. A part payment and a goods return come on their own row and reduce the balance.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="md:col-span-2">
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Party name</span>
              <PartyNameField
                value={partyName}
                onChange={setPartyName}
                names={names}
                placeholder="Type firoz ahmed"
              />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">Receivable / Payable</span>
              <select
                className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold"
                value={partyType}
                onChange={e => setPartyType(e.target.value as 'customer' | 'supplier')}
              >
                <option value="customer">Customer (Receivable)</option>
                <option value="supplier">Supplier (Payable)</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-gray-500">As On Date</span>
              <input type="date" className="w-full rounded-lg border px-2.5 py-2 text-sm font-semibold" value={asOnDate} onChange={e => setAsOnDate(e.target.value)} />
            </label>
            <div className="md:col-span-4">
              <button type="button" onClick={() => void load()} className="rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-black uppercase text-white">
                Show Report
              </button>
            </div>
          </div>
        </section>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        {loading ? (
          <div className="rounded-2xl border bg-white p-10 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-700" />
          </div>
        ) : selected ? (
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b bg-sky-50 px-4 py-3">
              <p className="text-sm font-black uppercase tracking-wide text-sky-950">
                Outstanding bills — {selected.name}
              </p>
              <p className="mt-1 text-xs font-semibold text-sky-900">
                {selected.phone ? `Ph: ${selected.phone}` : 'Ph: —'}
                {selected.address ? ` · ${selected.address}` : ''}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-600">
                {billRows.length} row{billRows.length === 1 ? '' : 's'} · Pending {money(totals.pending)}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-xs">
                <thead>
                  <tr>
                    <th className={thClass}>Bill No</th>
                    <th className={thClass}>Bill Date</th>
                    <th className={thClass}>Net Bill Amt</th>
                    <th className={thClass}>Goods Ret</th>
                    <th className={thClass}>Paid Amt</th>
                    <th className={thClass}>Pend. Amt</th>
                    <th className={thClass}>Days</th>
                    <th className={thClass}>Broker</th>
                  </tr>
                </thead>
                <tbody>
                  {billRows.map(row => {
                    const line = lineAmounts(row);
                    return (
                      <tr
                        key={row.id}
                        onClick={() => openBill(row)}
                        className={row.editPath ? 'cursor-pointer hover:bg-sky-50' : ''}
                        title={row.editPath ? 'Open this entry' : undefined}
                      >
                        <td className={`${tdClass} text-center font-black text-indigo-800`}>{row.displayBillNumber || row.billNumber}</td>
                        <td className={`${tdClass} text-center`}>{formatDate(row.billDate)}</td>
                        <td className={tdNum}>{money(line.net)}</td>
                        <td className={`${tdNum} ${line.goodsReturn < 0 ? 'font-bold text-rose-700' : ''}`}>{money(line.goodsReturn)}</td>
                        <td className={tdNum}>{money(line.paid)}</td>
                        <td className={`${tdNum} font-black ${line.pending < 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(line.pending)}</td>
                        <td className={`${tdNum}`}>{row.days ?? ''}</td>
                        <td className={tdClass}>{row.brokerName || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-sky-900 text-white">
                    <td className={`${tdClass} border-sky-800 font-black`} colSpan={2}>Grand Total</td>
                    <td className={`${tdNum} border-sky-800 font-black`}>{money(totals.net)}</td>
                    <td className={`${tdNum} border-sky-800 font-black`}>{money(totals.goodsReturn)}</td>
                    <td className={`${tdNum} border-sky-800 font-black`}>{money(totals.paid)}</td>
                    <td className={`${tdNum} border-sky-800 font-black`}>{money(totals.pending)}</td>
                    <td className={`${tdClass} border-sky-800`} colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b bg-sky-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-sky-950">
              {query ? `${matchedParties.length} parties match ${query}` : 'Parties with a balance. Type a name to open the bills'}
            </div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={thClass}>Party</th>
                  <th className={thClass}>Phone</th>
                  <th className={thClass}>Rows</th>
                  <th className={thClass}>Pending</th>
                </tr>
              </thead>
              <tbody>
                {matchedParties.length === 0 && (
                  <tr>
                    <td colSpan={4} className={`${tdClass} p-8 text-center font-bold text-gray-400`}>
                      No party matches that name.
                    </td>
                  </tr>
                )}
                {matchedParties.map(party => (
                  <tr
                    key={party.name}
                    className="cursor-pointer hover:bg-sky-50"
                    onClick={() => setPartyName(party.name)}
                  >
                    <td className={`${tdClass} font-bold`}>{party.name}</td>
                    <td className={tdClass}>{party.phone || '—'}</td>
                    <td className={tdNum}>{party.bills}</td>
                    <td className={`${tdNum} font-black ${party.pending < 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(party.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
};
