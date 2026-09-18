import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { customersApi, journalVouchersApi, purchasesApi } from '../services/api';
import {
  ERP_SALE_PURCHASE_ACCOUNTS,
  formatSeriesBillNumber,
  postingSummary,
  warnsOnManualEntry
} from '../constants/erpTransactionPostingRules';
import { JOURNAL_TYPE } from '../constants/bankCashSeries';
import { Customer, ErpSession, JournalVoucher, Supplier } from '../types';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';
import { ErpTopMenu } from './ErpTopMenu';
import { useVoucherJump } from '../hooks/useVoucherJump';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (value: string | number) => Number(value) || 0;
const isoDate = (value?: string | Date | null) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500';
const money = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const OPPOSITE_ACCOUNTS = Array.from(new Set([
  ...ERP_SALE_PURCHASE_ACCOUNTS,
  'SALARY EXP A/C',
  'ROUND OFF',
  'ROUND OFF A/C',
  'DISCOUNT A/C',
  'CASH DISCOUNT A/C',
  'OFFICE EXP A/C',
  'RENT A/C',
  'ELECTRICITY A/C',
  'TRANSPORT A/C',
  'REPAIR A/C',
  'BANK CHARGES',
  'INTEREST A/C',
  'COMMISSION A/C'
])).sort((a, b) => a.localeCompare(b));

export const JournalVoucherPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [editingId, setEditingId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('edit'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [typeBillNumber, setTypeBillNumber] = useState<number | null>(null);
  const [allocatedVoucher, setAllocatedVoucher] = useState('');
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherDate, setVoucherDate] = useState(today());
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('supplier');
  const [partyName, setPartyName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [oppositeAccount, setOppositeAccount] = useState('SALARY EXP A/C');
  const [partySide, setPartySide] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [vouchers, setVouchers] = useState<JournalVoucher[]>([]);

  const voucherJump = useVoucherJump({
    module: 'journal',
    transactionType: JOURNAL_TYPE,
    currentId: editingId,
    shownNumber: typeBillNumber,
    onError: setError
  });

  const applyVoucher = (row: JournalVoucher) => {
    setEditingId(row.id);
    setCompanyName(row.companyName || '');
    setTypeBillNumber(row.typeBillNumber ?? null);
    setAllocatedVoucher(row.voucherNumber || formatSeriesBillNumber(JOURNAL_TYPE, row.typeBillNumber) || '');
    setVoucherInput(row.voucherNumber || formatSeriesBillNumber(JOURNAL_TYPE, row.typeBillNumber) || '');
    setVoucherDate(isoDate(row.voucherDate) || today());
    setPartyType(row.partyType === 'customer' ? 'customer' : 'supplier');
    setPartyName(row.partyName || '');
    setCustomerId(row.customerId || '');
    setSupplierId(row.supplierId || '');
    setOppositeAccount(row.oppositeAccount || '');
    setPartySide(row.partySide === 'debit' ? 'debit' : 'credit');
    setAmount(row.amount ? String(row.amount) : '');
    setNarration(row.narration || row.remarks || '');
  };

  const loadMaster = useCallback(async () => {
    try {
      const result = await journalVouchersApi.getNextVoucher();
      setCompanyName(result.companyName || '');
      setTypeBillNumber(result.typeBillNumber);
      setAllocatedVoucher(result.voucherNumber);
      setVoucherInput(result.voucherNumber);
    } catch {
      setTypeBillNumber(1);
      setAllocatedVoucher(formatSeriesBillNumber(JOURNAL_TYPE, 1));
      setVoucherInput(formatSeriesBillNumber(JOURNAL_TYPE, 1));
      setError('Could not load the next journal voucher number.');
    }
  }, []);

  const loadList = useCallback(async () => {
    try {
      const { vouchers: rows } = await journalVouchersApi.getAll();
      setVouchers(rows || []);
    } catch {
      setVouchers([]);
    }
  }, []);

  useEffect(() => {
    void customersApi.getAll().then(r => setCustomers(r.customers || [])).catch(() => setCustomers([]));
    void purchasesApi.getSuppliers().then(r => setSuppliers(r.suppliers || [])).catch(() => setSuppliers([]));
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (!editId) {
      void loadMaster().finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    void journalVouchersApi.getById(editId)
      .then(({ voucher }) => applyVoucher(voucher))
      .catch(() => setError('Could not load this journal voucher.'))
      .finally(() => setLoading(false));
  }, [loadMaster]);

  const startNew = () => {
    setEditingId(null);
    setError('');
    setSuccess('');
    setPartyName('');
    setCustomerId('');
    setSupplierId('');
    setOppositeAccount('SALARY EXP A/C');
    setPartySide('credit');
    setPartyType('supplier');
    setAmount('');
    setNarration('');
    setVoucherDate(today());
    const url = new URL(window.location.href);
    url.searchParams.delete('edit');
    window.history.replaceState({}, '', `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}`);
    void loadMaster();
  };

  const openVoucher = (row: JournalVoucher) => {
    applyVoucher(row);
    const url = new URL(window.location.href);
    url.searchParams.set('edit', row.id);
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
  };

  const amountValue = toNum(amount);
  const debitAccount = partySide === 'debit' ? partyName || 'Party' : oppositeAccount || 'Opposite A/C';
  const creditAccount = partySide === 'credit' ? partyName || 'Party' : oppositeAccount || 'Opposite A/C';
  const postingHint = postingSummary(JOURNAL_TYPE);

  const partyOptions = useMemo(
    () => (partyType === 'customer'
      ? customers.map(c => ({ id: c.id, name: c.organizationName }))
      : suppliers.map(s => ({ id: s.id, name: s.name }))),
    [customers, partyType, suppliers]
  );

  const save = async () => {
    if (!partyName.trim()) {
      setError('Party name is required.');
      return;
    }
    if (!oppositeAccount.trim()) {
      setError('Opposite A/C is required.');
      return;
    }
    if (!(amountValue > 0)) {
      setError('Enter an amount.');
      return;
    }
    if (
      !editingId
      && warnsOnManualEntry(JOURNAL_TYPE)
      && allocatedVoucher
      && voucherInput.trim()
      && voucherInput.trim() !== allocatedVoucher
    ) {
      if (!confirm(`Voucher no. was changed from ${allocatedVoucher} to ${voucherInput}. Continue?`)) return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        partyType,
        partyName: partyName.trim(),
        customerId: customerId || undefined,
        supplierId: supplierId || undefined,
        oppositeAccount: oppositeAccount.trim(),
        partySide,
        amount: amountValue,
        voucherDate,
        companyName,
        narration: narration.trim() || undefined
      };
      const { voucher } = editingId
        ? await journalVouchersApi.update(editingId, payload)
        : await journalVouchersApi.create(payload);
      setSuccess(`Saved journal ${voucher.voucherNumber} for ${voucher.partyName}. Ledger only — no bank A/C.`);
      startNew();
      void loadList();
    } catch (err: any) {
      setError(err.message || 'Could not save journal voucher.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Journal Voucher" erpSession={erpSession} onBackToCatalogue={onBack} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-indigo-600">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <>
            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-500">Accounts</p>
                  <h1 className="mt-1 text-2xl font-black text-gray-900">Journal Voucher</h1>
                  <p className="mt-1 text-sm font-medium text-gray-500">
                    Ledger-only entry (no bank). Salary, round-off, and other non-GST adjustments — pick JOURNAL / JV on bank receipt or payment to settle.
                  </p>
                </div>
                {editingId && (
                  <button type="button" onClick={startNew} className="rounded-xl bg-gray-100 px-4 py-2 text-xs font-black uppercase tracking-wide text-gray-700">
                    New voucher
                  </button>
                )}
              </div>

              {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
              {success && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{success}</p>}

              <ErpFormShell onSave={save} saving={saving} className="mt-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className={labelClass}>Company</label>
                    <input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Type</label>
                    <input className={inputClass} readOnly value={JOURNAL_TYPE} />
                  </div>
                  <div>
                    <label className={labelClass}>Voucher</label>
                    <input
                      className={inputClass}
                      value={voucherInput}
                      onChange={e => setVoucherInput(e.target.value)}
                      {...voucherJump.voucherFieldProps}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Date</label>
                    <input className={inputClass} type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Party type</label>
                    <select
                      className={inputClass}
                      value={partyType}
                      onChange={e => {
                        setPartyType(e.target.value as 'customer' | 'supplier');
                        setPartyName('');
                        setCustomerId('');
                        setSupplierId('');
                      }}
                    >
                      <option value="supplier">Supplier / expense party</option>
                      <option value="customer">Customer</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Party</label>
                    <input
                      className={inputClass}
                      list="journal-parties"
                      value={partyName}
                      onChange={e => {
                        const name = e.target.value;
                        setPartyName(name);
                        const match = partyOptions.find(p => p.name === name);
                        if (partyType === 'customer') setCustomerId(match?.id || '');
                        else setSupplierId(match?.id || '');
                      }}
                      placeholder={partyType === 'customer' ? 'Customer name' : 'Supplier / employee'}
                    />
                    <datalist id="journal-parties">
                      {partyOptions.map(p => <option key={p.id} value={p.name} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className={labelClass}>Opposite A/C</label>
                    <input
                      className={inputClass}
                      list="journal-accounts"
                      value={oppositeAccount}
                      onChange={e => setOppositeAccount(e.target.value)}
                      placeholder="SALARY EXP A/C"
                    />
                    <datalist id="journal-accounts">
                      {OPPOSITE_ACCOUNTS.map(name => <option key={name} value={name} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className={labelClass}>Party effect</label>
                    <select className={inputClass} value={partySide} onChange={e => setPartySide(e.target.value as 'credit' | 'debit')}>
                      <option value="credit">Credit party (salary / less received)</option>
                      <option value="debit">Debit party (amount due from party)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Amount</label>
                    <input className={inputClass} type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
                  </div>
                  <div className="xl:col-span-3">
                    <label className={labelClass}>Narration</label>
                    <input className={inputClass} value={narration} onChange={e => setNarration(e.target.value)} placeholder="Salary / round off / less received" />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 md:grid-cols-2">
                  <div>
                    <p className={labelClass}>Debit</p>
                    <p className="text-lg font-black text-gray-900">{debitAccount}</p>
                    <p className="text-sm font-bold text-indigo-800">{money(amountValue)}</p>
                  </div>
                  <div>
                    <p className={labelClass}>Credit</p>
                    <p className="text-lg font-black text-gray-900">{creditAccount}</p>
                    <p className="text-sm font-bold text-indigo-800">{money(amountValue)}</p>
                  </div>
                  <p className="md:col-span-2 text-xs font-semibold text-indigo-700">
                    {partySide === 'credit'
                      ? 'Bank payment: Type JOURNAL / JV (or the opposite A/C, e.g. SALARY) to pay this. Bank receipt: Type U / JOURNAL to deduct round-off against a bill.'
                      : 'Bank receipt: Type JOURNAL / JV to collect this. Bank payment: Type U / JOURNAL to deduct against a bill.'}
                    {' '}Master: {postingHint}. No GST, no stock, no bank A/C.
                  </p>
                </div>

                <ErpSaveButton
                  saving={saving}
                  label={editingId ? 'Update Journal' : 'Save Journal'}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                />
              </ErpFormShell>
            </section>

            <section className="mt-5 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b px-5 py-3">
                <h2 className="text-sm font-black uppercase tracking-widest text-gray-500">Recent journals</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Voucher</th>
                      <th className="px-3 py-2">Party</th>
                      <th className="px-3 py-2">Opposite A/C</th>
                      <th className="px-3 py-2">Dr / Cr</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No journal vouchers yet.</td></tr>
                    ) : vouchers.map(row => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-t border-gray-100 hover:bg-indigo-50"
                        onClick={() => openVoucher(row)}
                      >
                        <td className="px-3 py-2.5">{isoDate(row.voucherDate)}</td>
                        <td className="px-3 py-2.5 font-bold">{row.voucherNumber || formatSeriesBillNumber(JOURNAL_TYPE, row.typeBillNumber)}</td>
                        <td className="px-3 py-2.5">{row.partyName}</td>
                        <td className="px-3 py-2.5">{row.oppositeAccount}</td>
                        <td className="px-3 py-2.5">{row.partySide === 'credit' ? 'Cr party' : 'Dr party'}</td>
                        <td className="px-3 py-2.5 text-right font-bold">{money(row.amount || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};
