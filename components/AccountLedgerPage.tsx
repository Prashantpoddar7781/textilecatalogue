import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { ledgerApi } from '../services/api';
import { AccountLedgerEntry, AccountLedgerParty, ErpSession, LedgerEntryDetail } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  initialPartyType?: 'customer' | 'supplier';
  erpSession?: ErpSession | null;
}

const formatMoney = (value: number) =>
  (Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

const formatFieldValue = (field: { value: string | number; isMoney?: boolean }) => {
  if (field.isMoney) return formatMoney(Number(field.value));
  const text = String(field.value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return formatDate(text);
  return text;
};

const sourceLabel: Record<string, string> = {
  order: 'Sales Bill',
  sales_invoice: 'Sales Invoice',
  purchase_bill: 'Purchase Bill',
  bank_entry: 'Bank Entry',
  credit_debit_note: 'Cr/Dr Note',
  grey_purchase: 'Grey Purchase',
  grey_purchase_return: 'Grey Purchase Return',
  mill_receipt: 'Job Charges',
  mill_receipt_tds: 'TDS Payable',
  work_receipt: 'EMB Job Charges',
  work_receipt_tds: 'TDS Payable'
};

const billTypeLabel: Record<string, string> = {
  order: 'Sales Bill',
  purchase_bill: 'Purchase Bill',
  credit_debit_note: 'Cr/Dr Note'
};

export const AccountLedgerPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [parties, setParties] = useState<AccountLedgerParty[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [ledger, setLedger] = useState<AccountLedgerEntry[]>([]);
  const [runningBalance, setRunningBalance] = useState(0);
  const [balanceType, setBalanceType] = useState<'DR' | 'CR'>('DR');
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AccountLedgerEntry | null>(null);
  const [entryDetail, setEntryDetail] = useState<LedgerEntryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const selectedParty = useMemo(
    () => parties.find(p => `${p.partyName}::${p.supplierId || ''}::${p.customerId || ''}` === selectedKey) || null,
    [parties, selectedKey]
  );

  const loadParties = async () => {
    setLoading(true);
    setError('');
    try {
      const { parties: fetched } = await ledgerApi.getParties('all');
      setParties(fetched || []);
      if (fetched?.length && !selectedKey) {
        const first = fetched[0];
        setSelectedKey(`${first.partyName}::${first.supplierId || ''}::${first.customerId || ''}`);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  };

  const clearEntryDetail = () => {
    setSelectedEntry(null);
    setEntryDetail(null);
  };

  const loadLedger = async () => {
    if (!selectedParty?.partyName) {
      setLedger([]);
      return;
    }
    setLedgerLoading(true);
    clearEntryDetail();
    setError('');
    try {
      const result = await ledgerApi.getAccountLedger({
        partyName: selectedParty.partyName,
        supplierId: selectedParty.supplierId,
        customerId: selectedParty.customerId
      });
      setLedger(result.ledger || []);
      setRunningBalance(result.runningBalance);
      setBalanceType(result.balanceType);
      setTotalDebit(result.totalDebit);
      setTotalCredit(result.totalCredit);
    } catch (err: any) {
      setError(err.message || 'Could not load ledger.');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    void loadParties();
  }, []);

  useEffect(() => {
    void loadLedger();
  }, [selectedKey]);

  const filteredParties = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter(party =>
      party.partyName.toLowerCase().includes(q)
      || (party.gstNumber || '').toLowerCase().includes(q)
      || (party.mobileNumber || '').toLowerCase().includes(q)
    );
  }, [parties, query]);

  const openEntryDetail = async (entry: AccountLedgerEntry) => {
    setSelectedEntry(entry);
    setEntryDetail(null);
    setDetailLoading(true);
    setError('');
    try {
      const { detail } = await ledgerApi.getEntryDetail(entry.sourceType, entry.sourceId);
      setEntryDetail(detail);
    } catch (err: any) {
      setError(err.message || 'Could not load entry details.');
      setSelectedEntry(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Ledger - Dynamic View" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <button type="button" onClick={() => void loadParties()} className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-bold">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">A/C Name</h2>
            <p className="mt-1 text-[11px] font-semibold text-gray-500">Single account ledger · all parties</p>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full rounded-2xl border bg-gray-50 py-2.5 pl-9 pr-3 text-sm"
                placeholder="Search account / GST / mobile"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : filteredParties.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">
                  No accounts yet. Add sales, purchases, mill or work entries first.
                </p>
              ) : filteredParties.map(party => {
                const key = `${party.partyName}::${party.supplierId || ''}::${party.customerId || ''}`;
                const selected = selectedKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`w-full rounded-2xl border p-3 text-left ${selected ? 'border-sky-300 bg-sky-50' : 'border-gray-100 bg-gray-50'}`}
                  >
                    <p className="font-black text-gray-900">{party.partyName}</p>
                    {party.gstNumber && <p className="text-xs text-gray-500">{party.gstNumber}</p>}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
            {!selectedParty ? (
              <div className="flex min-h-[420px] items-center justify-center text-center">
                <div>
                  <BookOpen className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-sm font-bold text-gray-600">Select an account to view ledger.</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">A/C</p>
                    <h2 className="text-2xl font-black text-gray-900">{selectedParty.partyName}</h2>
                    <p className="text-sm text-gray-500">Single account ledger · Dynamic view</p>
                  </div>
                  <div className="rounded-2xl bg-sky-50 px-4 py-3 text-right">
                    <p className="text-xs font-black uppercase text-sky-700">Closing Balance</p>
                    <p className="text-xl font-black text-sky-950">
                      {formatMoney(Math.abs(runningBalance))} {balanceType}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase text-gray-500">Total Debit</p>
                    <p className="font-black text-gray-900">{formatMoney(totalDebit)}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase text-gray-500">Total Credit</p>
                    <p className="font-black text-gray-900">{formatMoney(totalCredit)}</p>
                  </div>
                  <div className="rounded-xl bg-sky-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase text-sky-700">Entries</p>
                    <p className="font-black text-sky-950">{ledger.length}</p>
                  </div>
                </div>

                {ledgerLoading ? (
                  <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading ledger...
                  </div>
                ) : ledger.length === 0 ? (
                  <p className="py-16 text-center text-sm text-gray-400">No ledger entries for this account yet.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="border-b bg-slate-50 text-[10px] uppercase text-gray-500">
                        <tr>
                          <th className="px-2 py-2">Date</th>
                          <th className="px-2 py-2">Chq/Bill</th>
                          <th className="px-2 py-2">Reference A/C</th>
                          <th className="px-2 py-2 text-right">Debit</th>
                          <th className="px-2 py-2 text-right">Credit</th>
                          <th className="px-2 py-2 text-right">Balance</th>
                          <th className="px-2 py-2">V No.</th>
                          <th className="px-2 py-2">Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b bg-gray-50 text-gray-500">
                          <td className="px-2 py-2" colSpan={3}>Bal. Brought Forward</td>
                          <td className="px-2 py-2 text-right">0.00</td>
                          <td className="px-2 py-2 text-right">0.00</td>
                          <td className="px-2 py-2 text-right">-</td>
                          <td className="px-2 py-2" colSpan={2} />
                        </tr>
                        {ledger.map(entry => {
                          const isSelected = selectedEntry?.id === entry.id;
                          return (
                            <tr
                              key={entry.id}
                              className={`cursor-pointer border-b transition-colors hover:bg-sky-50 ${isSelected ? 'bg-sky-50' : ''}`}
                              onClick={() => void openEntryDetail(entry)}
                            >
                              <td className="px-2 py-2.5 whitespace-nowrap">{formatDate(entry.date)}</td>
                              <td className="px-2 py-2.5 font-semibold">{entry.billNumber || '-'}</td>
                              <td className="px-2 py-2.5 font-bold text-slate-800">{entry.account}</td>
                              <td className="px-2 py-2.5 text-right text-red-700">{entry.debitAmount ? formatMoney(entry.debitAmount) : ''}</td>
                              <td className="px-2 py-2.5 text-right text-emerald-700">{entry.creditAmount ? formatMoney(entry.creditAmount) : ''}</td>
                              <td className="px-2 py-2.5 text-right font-bold whitespace-nowrap">
                                {formatMoney(Math.abs(entry.runningBalance))} {entry.balanceType === 'CR' ? 'Cr' : 'Dr'}
                              </td>
                              <td className="px-2 py-2.5">{entry.voucherNumber || '-'}</td>
                              <td className="px-2 py-2.5 max-w-[180px] truncate text-gray-600" title={entry.remarks || entry.particulars || ''}>
                                {entry.remarks || entry.particulars || ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {(selectedEntry || detailLoading) && (
                  <div className="mt-6 rounded-3xl border border-sky-100 bg-sky-50/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {detailLoading ? (
                          <>
                            <h3 className="text-sm font-black uppercase tracking-wide text-sky-950">Loading entry...</h3>
                            <p className="mt-1 text-xs text-sky-700">
                              {sourceLabel[selectedEntry?.sourceType || ''] || selectedEntry?.sourceType}
                            </p>
                          </>
                        ) : entryDetail ? (
                          <>
                            <h3 className="text-sm font-black uppercase tracking-wide text-sky-950">{entryDetail.title}</h3>
                            {entryDetail.subtitle && (
                              <p className="mt-1 text-xs font-semibold text-sky-700">{entryDetail.subtitle}</p>
                            )}
                            <p className="mt-1 text-[10px] font-bold uppercase text-sky-500">
                              {sourceLabel[entryDetail.sourceType] || entryDetail.sourceType}
                            </p>
                            {entryDetail.canEdit && entryDetail.editPath && (
                              <a
                                href={entryDetail.editPath}
                                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs font-bold text-sky-800 hover:bg-sky-100"
                              >
                                Edit entry
                              </a>
                            )}
                          </>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={clearEntryDetail}
                        className="rounded-lg border border-sky-200 bg-white p-1.5 text-sky-700 hover:bg-sky-100"
                        aria-label="Close entry details"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {detailLoading ? (
                      <div className="mt-4 flex items-center text-sm text-sky-700">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Fetching complete details...
                      </div>
                    ) : entryDetail ? (
                      <>
                        {selectedEntry && (
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-white px-2.5 py-1 font-bold text-red-700">
                              Debit: {selectedEntry.debitAmount ? formatMoney(selectedEntry.debitAmount) : '-'}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 font-bold text-emerald-700">
                              Credit: {selectedEntry.creditAmount ? formatMoney(selectedEntry.creditAmount) : '-'}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 font-bold text-sky-900">
                              Balance: {formatMoney(Math.abs(selectedEntry.runningBalance))} {selectedEntry.balanceType}
                            </span>
                          </div>
                        )}

                        {entryDetail.fields.length > 0 && (
                          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                            {entryDetail.fields.map(field => (
                              <p key={field.label} className="rounded-xl bg-white/80 px-3 py-2">
                                <span className="font-bold text-gray-700">{field.label}:</span>{' '}
                                <span className="text-gray-900">{formatFieldValue(field)}</span>
                              </p>
                            ))}
                          </div>
                        )}

                        {entryDetail.lineItems && entryDetail.lineItems.length > 0 && entryDetail.lineColumns && (
                          <div className="mt-4 overflow-x-auto rounded-2xl border border-sky-100 bg-white">
                            <table className="min-w-full text-left text-xs">
                              <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                                <tr>
                                  {entryDetail.lineColumns.map(column => (
                                    <th
                                      key={column.key}
                                      className={`px-3 py-2 ${column.align === 'right' ? 'text-right' : ''}`}
                                    >
                                      {column.label}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {entryDetail.lineItems.map((line, index) => (
                                  <tr key={index} className="border-b last:border-0">
                                    {entryDetail.lineColumns!.map(column => {
                                      const raw = line[column.key];
                                      const value = column.key === 'billType' && typeof raw === 'string'
                                        ? (billTypeLabel[raw] || raw)
                                        : column.isMoney
                                          ? (raw === '-' || raw == null || raw === '')
                                            ? '-'
                                            : formatMoney(Number(raw))
                                          : (raw ?? '-');
                                      return (
                                        <td
                                          key={column.key}
                                          className={`px-3 py-2 ${column.align === 'right' ? 'text-right' : ''}`}
                                        >
                                          {value}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
