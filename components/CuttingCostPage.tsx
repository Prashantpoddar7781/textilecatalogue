import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import { cuttingCostsApi } from '../services/api';
import { CuttingCard, CuttingCostSource, ErpSession } from '../types';
import { buildCuttingCost, interestDaySpan } from '../utils/cuttingCost';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (value: string) => Number(value) || 0;
const money = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-teal-400';
const readonlyClass = 'w-full rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-2 text-sm font-semibold';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

export const CuttingCostPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [cutCard, setCutCard] = useState('');
  const [source, setSource] = useState<CuttingCostSource | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(today());
  const [freshSarees, setFreshSarees] = useState('');
  const [secondSarees, setSecondSarees] = useState('');
  const [interestRate, setInterestRate] = useState('0');
  const [entries, setEntries] = useState<CuttingCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadList = async () => {
    const { entries: rows } = await cuttingCostsApi.list();
    setEntries(rows || []);
  };

  const loadCard = async (card: string, keepDate = false) => {
    const trimmed = card.trim();
    if (!trimmed) {
      setError('Type the cut card number. That is the grey dispatch challan.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { source: next, saved } = await cuttingCostsApi.lookup(trimmed, keepDate ? entryDate : undefined);
      setSource(next);
      setCutCard(next.cutCardNo);
      setSavedId(saved?.id || null);
      setInterestRate(String(saved?.interestRate ?? next.interestRate ?? 0));
      setFreshSarees(saved && saved.freshSarees ? String(saved.freshSarees) : '');
      setSecondSarees(saved && saved.secondSarees ? String(saved.secondSarees) : '');
      if (saved?.entryDate && !keepDate) setEntryDate(String(saved.entryDate).slice(0, 10));
      if (!next.hasMillReceipt) {
        setError('This challan is dispatched, but the mill receipt is not entered yet. Finish metres and printing rate come from that bill.');
      }
    } catch (err: any) {
      setSource(null);
      setError(err.message || 'Could not load this cut card.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const edit = params.get('edit');
    const cut = params.get('cut');
    void loadList().catch(() => undefined);
    if (edit) {
      setLoading(true);
      cuttingCostsApi.getById(edit)
        .then(({ entry }) => loadCard(entry.cutCardNo))
        .catch((err: any) => {
          setError(err.message || 'Could not open this cutting card.');
          setLoading(false);
        });
    } else if (cut) {
      setCutCard(cut);
      void loadCard(cut);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interestDays = source ? interestDaySpan(source.greyDate, entryDate) : 0;
  const costs = useMemo(() => {
    if (!source) return null;
    return buildCuttingCost({
      greyMts: source.greyMts,
      greyRate: source.greyRate,
      finMts: source.finMts,
      jobRate: source.jobRate,
      discountPercent: source.discountPercent,
      freshSarees: toNum(freshSarees),
      interestRate: toNum(interestRate),
      interestDays
    });
  }, [source, freshSarees, interestRate, interestDays]);

  const handleSave = async () => {
    if (!source) {
      setError('Load a cut card first.');
      return;
    }
    if (toNum(freshSarees) <= 0) {
      setError('Type the quantity of fresh sarees.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { entry } = await cuttingCostsApi.save({
        id: savedId || undefined,
        cutCardNo: source.cutCardNo,
        entryDate,
        freshSarees: toNum(freshSarees),
        secondSarees: toNum(secondSarees),
        interestRate: toNum(interestRate)
      });
      setSavedId(entry.id);
      setSuccess(`Cutting card ${entry.cutCardNo} saved. Average cut ${money(entry.actCut)} m.`);
      await loadList();
      if (!window.location.search.includes('edit=')) {
        window.history.replaceState(null, '', `/erp/cutting-cost?edit=${entry.id}`);
      }
    } catch (err: any) {
      setError(err.message || 'Could not save the cutting card.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Cutting Costing" erpSession={erpSession} onBackToCatalogue={onBack} />
      <ErpFormShell onSave={handleSave} saving={saving} disabled={!source}>
        <main className="mx-auto max-w-6xl px-4 py-6">
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px]">
                <label className={labelClass}>Cut card no.</label>
                <input
                  className={inputClass}
                  value={cutCard}
                  onChange={e => setCutCard(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void loadCard(cutCard);
                    }
                  }}
                  placeholder="Dispatch challan"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => void loadCard(cutCard)}
                disabled={loading}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-60"
              >
                {loading ? 'Loading…' : 'Open'}
              </button>
              <div>
                <label className={labelClass}>Date</label>
                <input type="date" className={inputClass} value={entryDate} onChange={e => setEntryDate(e.target.value)} />
              </div>
              <p className="pb-2 text-xs font-semibold text-gray-500">
                Cut card is the grey dispatch challan. Rec card is the number allotted on the mill receipt.
              </p>
            </div>
            {error && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{error}</p>}
            {success && <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900">{success}</p>}
          </section>

          {source && costs && (
            <>
              <section className="mt-4 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-4 lg:grid-cols-6">
                <div>
                  <label className={labelClass}>Mill</label>
                  <input className={readonlyClass} value={source.millName || ''} readOnly />
                </div>
                <div>
                  <label className={labelClass}>Lot</label>
                  <input className={readonlyClass} value={source.lotNo || ''} readOnly />
                </div>
                <div>
                  <label className={labelClass}>Rec card</label>
                  <input className={readonlyClass} value={source.recCardNo || '—'} readOnly />
                </div>
                <div>
                  <label className={labelClass}>Weaver</label>
                  <input className={readonlyClass} value={source.weaverName || ''} readOnly />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Quality</label>
                  <input className={readonlyClass} value={source.quality || ''} readOnly />
                </div>
              </section>

              <section className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Taka</th>
                        <th className="px-3 py-2 text-right">Grey</th>
                        <th className="px-3 py-2 text-right">Finish</th>
                        <th className="px-3 py-2 text-right">Short %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {source.takaDetails.map(row => (
                        <tr key={row.srNo} className="border-b">
                          <td className="px-3 py-2 font-semibold">{row.srNo}</td>
                          <td className="px-3 py-2 text-right">{money(row.greyMts)}</td>
                          <td className="px-3 py-2 text-right">{money(row.finMts)}</td>
                          <td className="px-3 py-2 text-right text-rose-700">{row.shortPct.toFixed(2)}%</td>
                        </tr>
                      ))}
                      {!source.takaDetails.length && (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-500">No taka breakdown on this challan.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 border-t bg-slate-50 p-4 md:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <label className={labelClass}>Grey mts</label>
                    <input className={readonlyClass} value={money(source.greyMts)} readOnly />
                  </div>
                  <div>
                    <label className={labelClass}>Grey rate</label>
                    <input className={readonlyClass} value={money(source.greyRate)} readOnly />
                  </div>
                  <div>
                    <label className={labelClass}>Finish mts</label>
                    <input className={readonlyClass} value={money(source.finMts)} readOnly />
                  </div>
                  <div>
                    <label className={labelClass}>Job rate</label>
                    <input className={readonlyClass} value={money(source.jobRate)} readOnly />
                  </div>
                  <div>
                    <label className={labelClass}>Shortage</label>
                    <input className={readonlyClass} value={`${costs.shortPct.toFixed(2)}%`} readOnly />
                  </div>
                  <div>
                    <label className={labelClass}>Mill bill</label>
                    <input className={readonlyClass} value={source.billNo || '—'} readOnly />
                  </div>
                </div>
              </section>

              <section className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Fresh sarees</label>
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="1"
                        value={freshSarees}
                        onChange={e => setFreshSarees(e.target.value)}
                        placeholder="Quantity cut fresh"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Second quality</label>
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="1"
                        value={secondSarees}
                        onChange={e => setSecondSarees(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Weaver interest %</label>
                      <input
                        className={inputClass}
                        type="number"
                        step="0.01"
                        value={interestRate}
                        onChange={e => setInterestRate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Interest days</label>
                      <input className={readonlyClass} value={String(interestDays)} readOnly />
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-gray-600">
                    Cost without interest is grey plus mill printing, per fresh saree. Basic cost is that figure plus
                    interest on the grey. Interest is grey amount × interest % × days from the grey bill
                    ({source.greyDate || '—'}) to this date, divided by 360. On lot 25301 that is 194.12 without
                    interest and 198.23 basic cost, because interest adds 4.11 a saree.
                  </p>
                </div>

                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-gray-500">Average cut</dt>
                    <dd className="text-right font-black text-teal-800">{toNum(freshSarees) > 0 ? `${money(costs.actCut)} m` : '—'}</dd>
                    <dt className="text-gray-500">Grey cost</dt>
                    <dd className="text-right font-bold">{money(costs.greyAmount)}</dd>
                    <dt className="text-gray-500">Mill printing</dt>
                    <dd className="text-right font-bold">{money(costs.jobAmount)}</dd>
                    <dt className="text-gray-500">Mill discount {source.discountPercent || 0}%</dt>
                    <dd className="text-right font-bold">{money(costs.discountAmount)}</dd>
                    <dt className="font-black text-gray-800">Cost w/o int.</dt>
                    <dd className="text-right text-lg font-black">{toNum(freshSarees) > 0 ? money(costs.costWithoutInterest) : '—'}</dd>
                    <dt className="font-black text-gray-800">INT / saree</dt>
                    <dd className="text-right font-black text-rose-700">
                      {toNum(freshSarees) > 0 ? `−${money(costs.interestPerPc)}` : '—'}
                    </dd>
                    <dt className="font-black text-gray-800">Basic cost</dt>
                    <dd className="text-right text-lg font-black">{toNum(freshSarees) > 0 ? money(costs.basicCost) : '—'}</dd>
                    <dt className="text-gray-500">After mill discount</dt>
                    <dd className="text-right font-bold">{toNum(freshSarees) > 0 ? money(costs.costWithDiscount) : '—'}</dd>
                  </dl>
                  {toNum(freshSarees) > 0 && toNum(interestRate) <= 0 && (
                    <p className="mt-3 text-xs leading-5 text-amber-800">
                      Basic cost includes interest. This weaver is saved at 0%, so basic cost matches cost without interest until an interest % is entered.
                    </p>
                  )}
                </div>
              </section>

              <div className="mt-4 flex justify-end">
                <ErpSaveButton saving={saving} label="Save cutting card" />
              </div>
            </>
          )}

          <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Calculator className="h-4 w-4 text-teal-700" />
              <h2 className="text-sm font-black uppercase tracking-wide">Saved cutting cards</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Cut card</th>
                    <th className="px-3 py-2">Rec card</th>
                    <th className="px-3 py-2">Lot</th>
                    <th className="px-3 py-2 text-right">Fresh</th>
                    <th className="px-3 py-2 text-right">Avg cut</th>
                    <th className="px-3 py-2 text-right">Cost w/o int.</th>
                    <th className="px-3 py-2 text-right">INT</th>
                    <th className="px-3 py-2 text-right">Basic cost</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(row => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b hover:bg-teal-50"
                      onClick={() => { window.location.href = `/erp/cutting-cost?edit=${row.id}`; }}
                    >
                      <td className="px-3 py-2">{String(row.entryDate).slice(0, 10)}</td>
                      <td className="px-3 py-2 font-black text-teal-800">{row.cutCardNo}</td>
                      <td className="px-3 py-2">{row.recCardNo || '—'}</td>
                      <td className="px-3 py-2">{row.lotNo || '—'}</td>
                      <td className="px-3 py-2 text-right">{row.freshSarees}</td>
                      <td className="px-3 py-2 text-right">{money(row.actCut)}</td>
                      <td className="px-3 py-2 text-right">{money(row.costWithoutInterest)}</td>
                      <td className="px-3 py-2 text-right text-rose-700">−{money(row.interestPerPc)}</td>
                      <td className="px-3 py-2 text-right font-bold">{money(row.basicCost)}</td>
                    </tr>
                  ))}
                  {!entries.length && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500">
                        {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'No cutting cards saved yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </ErpFormShell>
    </div>
  );
};
