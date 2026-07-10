import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { bankEntriesApi, customersApi, erpApi } from '../services/api';
import { Customer } from '../types';
import { DEFAULT_SALES_TRANSACTION_TYPE, ERP_TRANSACTION_TYPES } from '../constants/erpTransactionTypes';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';

interface Props {
  onBack: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

const toNumber = (value: string) => Number(value || 0) || 0;

const emptyLine = () => ({
  description: '',
  quantity: 1,
  rate: 0,
  amount: 0
});

export const ErpSalesPage: React.FC<Props> = ({ onBack }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [transactionType, setTransactionType] = useState(DEFAULT_SALES_TRANSACTION_TYPE);
  const [typeBillNumber, setTypeBillNumber] = useState<number | null>(null);
  const [orderDate, setOrderDate] = useState(today());
  const [orderNumber, setOrderNumber] = useState('');
  const [state, setState] = useState('');
  const [agentName, setAgentName] = useState('');
  const [transportName, setTransportName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lineItems, setLineItems] = useState([emptyLine()]);
  const [taxableAmount, setTaxableAmount] = useState(0);
  const [totalTaxAmount, setTotalTaxAmount] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const { customers: fetched } = await customersApi.getAll();
      setCustomers(fetched || []);
    } catch {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    void bankEntriesApi.getNextTypeBillNumber({ transactionType, source: 'order' })
      .then(result => setTypeBillNumber(result.typeBillNumber))
      .catch(() => setTypeBillNumber(null));
  }, [transactionType]);

  useEffect(() => {
    const selected = customers.find(customer => customer.id === customerId);
    if (selected) {
      setBuyerName(selected.organizationName);
      setState(selected.state || '');
      setAgentName(selected.agentName || '');
    }
  }, [customerId, customers]);

  useEffect(() => {
    const taxable = lineItems.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
    setTaxableAmount(taxable);
    setGrandTotal(taxable + totalTaxAmount);
  }, [lineItems, totalTaxAmount]);

  const updateLine = (index: number, key: keyof ReturnType<typeof emptyLine>, value: string | number) => {
    setLineItems(prev => prev.map((line, idx) => {
      if (idx !== index) return line;
      const next = { ...line, [key]: value };
      if (key === 'quantity' || key === 'rate') {
        const qty = Number(next.quantity) || 0;
        const rate = Number(next.rate) || 0;
        next.amount = Math.round(qty * rate * 100) / 100;
      }
      return next;
    }));
  };

  const saveEntry = async () => {
    const partyName = buyerName.trim() || customers.find(c => c.id === customerId)?.organizationName || '';
    if (!partyName) {
      alert('Customer name is required.');
      return;
    }
    if (grandTotal <= 0) {
      alert('Enter at least one line with amount.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { order } = await erpApi.createSalesEntry({
        transactionType,
        customerId: customerId || undefined,
        buyerName: partyName,
        orderDate,
        orderNumber: orderNumber.trim() || undefined,
        agentName: agentName.trim() || undefined,
        transportName: transportName.trim() || undefined,
        state: state.trim() || undefined,
        remarks: remarks.trim() || undefined,
        taxableAmount,
        totalTaxAmount,
        grandTotal,
        lineItems: lineItems.filter(line => line.description.trim() || line.amount > 0)
      });
      const billNo = order.typeBillNumber ?? order.invoiceNumber ?? '-';
      setSuccess(`Saved ${transactionType} bill #${billNo} for ${partyName}.`);
      setLineItems([emptyLine()]);
      setRemarks('');
      setOrderNumber('');
      void bankEntriesApi.getNextTypeBillNumber({ transactionType, source: 'order' })
        .then(result => setTypeBillNumber(result.typeBillNumber));
    } catch (err: any) {
      setError(err.message || 'Could not save sales entry.');
    } finally {
      setSaving(false);
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
          <h1 className="text-lg font-black text-gray-900">Sales Entry</h1>
          <div className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-fuchsia-700">Finish Sales</h2>
          <p className="mt-1 text-xs text-gray-500">Select type head, customer, and bill details like Empire ERP.</p>

          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
          {success && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{success}</div>}

          <ErpFormShell onSave={saveEntry} saving={saving}>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Type</label>
              <select
                className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold"
                value={transactionType}
                onChange={e => setTransactionType(e.target.value)}
              >
                {ERP_TRANSACTION_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.value}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Voucher / Bill no.</label>
              <input
                readOnly
                className="w-full rounded-xl border bg-gray-100 px-3 py-2.5 text-sm font-black"
                value={typeBillNumber ?? '—'}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Date</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold" type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Voucher ref.</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">State</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold" value={state} onChange={e => setState(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Broker</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold" value={agentName} onChange={e => setAgentName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Transport</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold" value={transportName} onChange={e => setTransportName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Customer</label>
              {loadingCustomers ? (
                <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <select className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">Select customer</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.organizationName}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Customer name</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold" value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Or type customer name" />
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Bill Lines</h3>
            <button type="button" onClick={() => setLineItems(prev => [...prev, emptyLine()])} className="flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700">
              <Plus className="h-4 w-4" />
              Add Line
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {lineItems.map((line, idx) => (
              <div key={idx} className="grid gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-3 md:grid-cols-5">
                <input className="rounded-lg border px-2 py-2 text-sm md:col-span-2" placeholder="Item / description" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} />
                <input className="rounded-lg border px-2 py-2 text-sm" placeholder="Qty" type="number" value={line.quantity} onChange={e => updateLine(idx, 'quantity', toNumber(e.target.value))} />
                <input className="rounded-lg border px-2 py-2 text-sm" placeholder="Rate" type="number" value={line.rate || ''} onChange={e => updateLine(idx, 'rate', toNumber(e.target.value))} />
                <div className="flex gap-2">
                  <input className="w-full rounded-lg border px-2 py-2 text-sm" placeholder="Amount" type="number" value={line.amount || ''} onChange={e => updateLine(idx, 'amount', toNumber(e.target.value))} />
                  <button type="button" onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))} className="rounded-lg bg-red-50 px-2 py-2 text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <input readOnly className="rounded-xl border bg-gray-100 px-3 py-2 text-sm font-bold" value={taxableAmount} placeholder="Taxable" />
            <input className="rounded-xl border px-3 py-2 text-sm" type="number" placeholder="Tax" value={totalTaxAmount || ''} onChange={e => setTotalTaxAmount(toNumber(e.target.value))} />
            <input readOnly className="rounded-xl border bg-gray-100 px-3 py-2 text-sm font-black" value={grandTotal} placeholder="Grand total" />
            <input className="rounded-xl border px-3 py-2 text-sm sm:col-span-1" placeholder="Remark" value={remarks} onChange={e => setRemarks(e.target.value)} />
          </div>

          <ErpSaveButton
            saving={saving}
            label="Save Sales Entry"
            savingLabel="Saving sales entry..."
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
          />
          </div>
          </ErpFormShell>
        </section>
      </main>
    </div>
  );
};
