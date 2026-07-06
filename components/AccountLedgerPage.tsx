import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Loader2, RefreshCw, Search } from 'lucide-react';
import { ledgerApi, purchasesApi } from '../services/api';
import { AccountLedgerEntry, AccountLedgerParty, PurchaseBill } from '../types';

interface Props {
  onBack: () => void;
  initialPartyType?: 'customer' | 'supplier';
}

const formatMoney = (value: number) =>
  (Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

const sourceLabel: Record<string, string> = {
  order: 'Sales Bill',
  sales_invoice: 'Sales Invoice',
  purchase_bill: 'Purchase Bill',
  bank_entry: 'Bank Entry',
  credit_debit_note: 'Cr/Dr Note'
};

export const AccountLedgerPage: React.FC<Props> = ({ onBack, initialPartyType = 'customer' }) => {
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>(initialPartyType);
  const [parties, setParties] = useState<AccountLedgerParty[]>([]);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [ledger, setLedger] = useState<AccountLedgerEntry[]>([]);
  const [runningBalance, setRunningBalance] = useState(0);
  const [balanceType, setBalanceType] = useState<'DR' | 'CR'>('DR');
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [selectedBill, setSelectedBill] = useState<PurchaseBill | null>(null);
  const [loading, setLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const selectedPartyName = useMemo(() => {
    if (partyType === 'customer') return selectedCustomerName;
    return parties.find(p => p.supplierId === selectedSupplierId)?.partyName || '';
  }, [parties, partyType, selectedCustomerName, selectedSupplierId]);

  const loadParties = async () => {
    setLoading(true);
    setError('');
    try {
      const { parties: fetched } = await ledgerApi.getParties(partyType);
      setParties(fetched || []);
      if (partyType === 'customer' && fetched?.[0] && !selectedCustomerName) {
        setSelectedCustomerName(fetched[0].partyName);
      }
      if (partyType === 'supplier' && fetched?.[0]?.supplierId && !selectedSupplierId) {
        setSelectedSupplierId(fetched[0].supplierId);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  };

  const loadLedger = async () => {
    setLedgerLoading(true);
    setSelectedBill(null);
    setError('');
    try {
      if (partyType === 'customer') {
        if (!selectedCustomerName) {
          setLedger([]);
          return;
        }
        const result = await ledgerApi.getCustomerLedger(selectedCustomerName);
        setLedger(result.ledger);
        setRunningBalance(result.runningBalance);
        setBalanceType(result.balanceType);
        setTotalDebit(result.totalDebit);
        setTotalCredit(result.totalCredit);
      } else {
        if (!selectedSupplierId) {
          setLedger([]);
          return;
        }
        const result = await ledgerApi.getSupplierLedger(selectedSupplierId);
        setLedger(result.ledger);
        setRunningBalance(result.runningBalance);
        setBalanceType(result.balanceType);
        setTotalDebit(result.totalDebit);
        setTotalCredit(result.totalCredit);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load ledger.');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    setSelectedCustomerName('');
    setSelectedSupplierId('');
    setLedger([]);
    void loadParties();
  }, [partyType]);

  useEffect(() => {
    void loadLedger();
  }, [partyType, selectedCustomerName, selectedSupplierId]);

  const filteredParties = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter(party =>
      party.partyName.toLowerCase().includes(q)
      || (party.gstNumber || '').toLowerCase().includes(q)
      || (party.mobileNumber || '').toLowerCase().includes(q)
    );
  }, [parties, query]);

  const openPurchaseBill = async (entry: AccountLedgerEntry) => {
    if (entry.sourceType !== 'purchase_bill') return;
    setError('');
    try {
      const { bill } = await purchasesApi.getBill(entry.sourceId);
      setSelectedBill(bill);
    } catch (err: any) {
      setError(err.message || 'Could not load bill detail.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            ERP
          </button>
          <h1 className="text-lg font-black text-gray-900">Account Ledgers</h1>
          <button type="button" onClick={() => void loadParties()} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

        <section className="mb-4 rounded-2xl border border-indigo-100 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPartyType('customer')}
              className={`rounded-xl px-4 py-3 text-sm font-black ${partyType === 'customer' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-700'}`}
            >
              Customer Ledgers
            </button>
            <button
              type="button"
              onClick={() => setPartyType('supplier')}
              className={`rounded-xl px-4 py-3 text-sm font-black ${partyType === 'supplier' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-700'}`}
            >
              Supplier Ledgers
            </button>
          </div>
          <p className="mt-2 px-2 text-xs text-gray-500">
            Auto-synced from sales bills, purchase bills, bank receipts/payments, and credit/debit notes.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">
              {partyType === 'customer' ? 'Customers' : 'Suppliers'}
            </h2>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full rounded-2xl border bg-gray-50 py-2.5 pl-9 pr-3 text-sm"
                placeholder={partyType === 'customer' ? 'Search customer' : 'Search supplier/GST/mobile'}
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
                  {partyType === 'customer'
                    ? 'No customer accounts yet. Create sales bills or orders first.'
                    : 'No suppliers yet. Add purchase entries first.'}
                </p>
              ) : filteredParties.map(party => {
                const selected = partyType === 'customer'
                  ? selectedCustomerName === party.partyName
                  : selectedSupplierId === party.supplierId;
                return (
                  <button
                    key={partyType === 'customer' ? party.partyName : party.supplierId}
                    type="button"
                    onClick={() => {
                      if (partyType === 'customer') setSelectedCustomerName(party.partyName);
                      else if (party.supplierId) setSelectedSupplierId(party.supplierId);
                    }}
                    className={`w-full rounded-2xl border p-3 text-left ${selected ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-gray-50'}`}
                  >
                    <p className="font-black text-gray-900">{party.partyName}</p>
                    {party.gstNumber && <p className="text-xs text-gray-500">{party.gstNumber}</p>}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
            {!selectedPartyName ? (
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
                    <h2 className="text-2xl font-black text-gray-900">{selectedPartyName}</h2>
                    <p className="text-sm text-gray-500">
                      {partyType === 'customer' ? 'Customer account ledger' : 'Supplier account ledger'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-right">
                    <p className="text-xs font-black uppercase text-indigo-600">Closing Balance</p>
                    <p className="text-xl font-black text-indigo-950">
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
                  <div className="rounded-xl bg-indigo-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase text-indigo-600">Entries</p>
                    <p className="font-black text-indigo-950">{ledger.length}</p>
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
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b text-xs uppercase text-gray-500">
                        <tr>
                          <th className="py-2">Date</th>
                          <th>Source</th>
                          <th>Bill / Voucher</th>
                          <th>Account</th>
                          <th>Particulars</th>
                          <th className="text-right">Debit</th>
                          <th className="text-right">Credit</th>
                          <th className="text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map(entry => (
                          <tr
                            key={entry.id}
                            className={`border-b ${entry.sourceType === 'purchase_bill' ? 'cursor-pointer hover:bg-indigo-50' : ''}`}
                            onClick={() => void openPurchaseBill(entry)}
                          >
                            <td className="py-3">{formatDate(entry.date)}</td>
                            <td className="text-xs font-bold text-gray-600">{sourceLabel[entry.sourceType] || entry.sourceType}</td>
                            <td className="font-semibold">{entry.billNumber || entry.voucherNumber || '-'}</td>
                            <td className="text-xs">{entry.account}</td>
                            <td className="max-w-[220px] truncate text-xs text-gray-600" title={entry.particulars}>{entry.particulars}</td>
                            <td className="text-right text-red-700">{entry.debitAmount ? formatMoney(entry.debitAmount) : '-'}</td>
                            <td className="text-right text-emerald-700">{entry.creditAmount ? formatMoney(entry.creditAmount) : '-'}</td>
                            <td className="text-right font-bold">
                              {formatMoney(Math.abs(entry.runningBalance))} {entry.balanceType}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedBill && (
                  <div className="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50/60 p-4">
                    <h3 className="text-sm font-black uppercase tracking-wide text-indigo-950">
                      Purchase Bill: {selectedBill.billNumber || selectedBill.id}
                    </h3>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                      <p><span className="font-bold">Taxable:</span> {formatMoney(selectedBill.taxableAmount)}</p>
                      <p><span className="font-bold">CGST:</span> {formatMoney(selectedBill.cgstAmount)}</p>
                      <p><span className="font-bold">SGST:</span> {formatMoney(selectedBill.sgstAmount)}</p>
                      <p><span className="font-bold">Total:</span> {formatMoney(selectedBill.grandTotal)}</p>
                    </div>
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
