import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ledgerApi } from '../services/api';
import { AccountLedgerParty } from '../types';
import { InterestGraceSource, InterestReport } from '../utils/interestCalculation';

interface Props {
  open: boolean;
  party: AccountLedgerParty | null;
  fromDate: string;
  toDate: string;
  onClose: () => void;
  onReport: (report: InterestReport) => void;
}

const todayIso = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

export const InterestReportOptionsDialog: React.FC<Props> = ({
  open,
  party,
  fromDate,
  toDate,
  onClose,
  onReport
}) => {
  const [tab, setTab] = useState<'report' | 'jv'>('report');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [daysInYear, setDaysInYear] = useState('365');
  const [interestRate, setInterestRate] = useState('');
  const [masterRate, setMasterRate] = useState(0);
  const [masterGrace, setMasterGrace] = useState(0);
  const [graceSource, setGraceSource] = useState<InterestGraceSource>('master');
  const [typedGrace, setTypedGrace] = useState('30');
  const [basedOnChequeDate, setBasedOnChequeDate] = useState(false);
  const [asOnDate, setAsOnDate] = useState(todayIso);

  useEffect(() => {
    if (!open || !party?.partyName) return;
    setTab('report');
    setError('');
    setDaysInYear('365');
    setBasedOnChequeDate(false);
    setGraceSource('master');
    setTypedGrace('30');
    setAsOnDate(todayIso());
    setLoading(true);
    void ledgerApi.getInterestDefaults({
      partyName: party.partyName,
      partyType: party.partyType,
      customerId: party.customerId,
      supplierId: party.supplierId
    }).then(result => {
      const rate = Number(result.masterInterestRate) || 0;
      const grace = Number(result.masterGraceDays) || 0;
      setMasterRate(rate);
      setMasterGrace(grace);
      setInterestRate(rate > 0 ? String(rate) : '');
      if (grace > 0) setTypedGrace(String(grace));
    }).catch(() => {
      setMasterRate(0);
      setMasterGrace(0);
      setInterestRate('');
    }).finally(() => setLoading(false));
  }, [open, party?.partyName, party?.customerId, party?.supplierId, party?.partyType]);

  if (!open) return null;

  const generate = async () => {
    if (!party?.partyName) {
      setError('Select a party ledger first.');
      return;
    }
    const rate = Number(interestRate);
    if (!(rate > 0)) {
      setError('Type an interest rate (or save Int. Rate on the party master).');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const report = await ledgerApi.getInterestReport({
        partyName: party.partyName,
        partyType: party.partyType,
        customerId: party.customerId,
        supplierId: party.supplierId,
        fromDate,
        toDate,
        asOnDate,
        daysInYear: Number(daysInYear) || 365,
        interestRate: rate,
        graceSource,
        typedGraceDays: Number(typedGrace) || 0,
        basedOnChequeDate
      });
      onReport(report);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not generate interest report.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
      <div className="w-full max-w-lg rounded-2xl border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-slate-800 px-4 py-3 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Ledger</p>
            <h2 className="text-sm font-black uppercase tracking-wide">Interest Report Options</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b bg-slate-100 text-[11px] font-black uppercase tracking-wide">
          <button
            type="button"
            className={`flex-1 px-3 py-2 ${tab === 'report' ? 'bg-white text-indigo-800' : 'text-slate-500'}`}
            onClick={() => setTab('report')}
          >
            Report Options
          </button>
          <button
            type="button"
            className={`flex-1 px-3 py-2 ${tab === 'jv' ? 'bg-white text-indigo-800' : 'text-slate-500'}`}
            onClick={() => setTab('jv')}
          >
            J.V. Entry Options
          </button>
        </div>

        <div className="space-y-4 p-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}
          {tab === 'jv' ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-600">
              Interest posting as a journal voucher will be built next. Use Generate Report for now.
            </p>
          ) : loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading party terms...
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-600">
                Party: <span className="font-black text-slate-900">{party?.partyName}</span>
                {' · '}Ledger {fromDate} to {toDate}
              </p>
              <label>
                <span className={labelClass}>As on date</span>
                <input className={inputClass} type="date" value={asOnDate} onChange={e => setAsOnDate(e.target.value)} />
                <span className="mt-1 block text-[11px] font-semibold text-gray-400">Defaults to today. Days run through this date, not the ledger year-end.</span>
              </label>
              <label>
                <span className={labelClass}>Days in Year</span>
                <input className={inputClass} type="number" value={daysInYear} onChange={e => setDaysInYear(e.target.value)} />
                <span className="mt-1 block text-[11px] font-semibold text-gray-400">365, or type 360</span>
              </label>
              <label>
                <span className={labelClass}>Interest Rate %</span>
                <input className={inputClass} type="number" step="0.01" value={interestRate} onChange={e => setInterestRate(e.target.value)} />
                <span className="mt-1 block text-[11px] font-semibold text-gray-400">
                  {masterRate > 0 ? `Master Int. Rate ${masterRate.toFixed(2)}% — you can override` : 'Not set on master — type the rate'}
                </span>
              </label>
              <div>
                <span className={labelClass}>Sale / Purchase Grace</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${graceSource === 'master' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'}`}>
                    <input type="radio" checked={graceSource === 'master'} onChange={() => setGraceSource('master')} />
                    Master ({masterGrace} days)
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${graceSource === 'typed' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'}`}>
                    <input type="radio" checked={graceSource === 'typed'} onChange={() => setGraceSource('typed')} />
                    Typed in
                  </label>
                </div>
                <input
                  className={`${inputClass} mt-2 ${graceSource === 'typed' ? '' : 'bg-slate-50'}`}
                  type="number"
                  value={graceSource === 'master' ? String(masterGrace) : typedGrace}
                  disabled={graceSource !== 'typed'}
                  onChange={e => setTypedGrace(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={basedOnChequeDate} onChange={e => setBasedOnChequeDate(e.target.checked)} className="h-4 w-4" />
                Based on Chq. Date
              </label>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t bg-slate-50 px-4 py-3">
          <button
            type="button"
            disabled={saving || loading || tab !== 'report'}
            onClick={() => void generate()}
            className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50"
          >
            {saving ? 'Generating…' : 'Generate Report'}
          </button>
          <button type="button" disabled className="rounded-xl border bg-white px-4 py-2 text-xs font-black uppercase text-slate-400" title="Coming next">
            Interest Product
          </button>
          <button type="button" disabled className="rounded-xl border bg-white px-4 py-2 text-xs font-black uppercase text-slate-400" title="Coming next">
            Summary Only
          </button>
        </div>
      </div>
    </div>
  );
};
