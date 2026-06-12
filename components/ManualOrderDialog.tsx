import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { X, Package, LayoutGrid, Plus, Trash2, Loader2, Search } from 'lucide-react';
import { customersApi, designsApi, ordersApi } from '../services/api';
import { Customer } from '../types';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type Kind = 'open' | 'design';
type CustomerMode = 'existing' | 'new';

interface CustomerForm {
  organizationName: string;
  gstNumber: string;
  contactPersonName: string;
  mobileNumber: string;
  agentName: string;
  category: string;
  state: string;
  city: string;
  pincode: string;
  discountRate: string;
}

interface DesignOption {
  id: string;
  /** Single line: name / number as stored on the design */
  displayLabel: string;
  searchBlob: string;
}

function mapDesignsToOptions(designs: any[]): DesignOption[] {
  return designs.map((d: any) => {
    const name = (d.name || '').trim();
    const code = (d.designCode || '').trim();
    const displayLabel = name || code || 'Untitled';
    const searchBlob = [name, code, (d.catalogue?.name || d.catalogueName || '').trim()]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return { id: d.id, displayLabel, searchBlob };
  });
}

async function fetchAllDesignsPages(): Promise<any[]> {
  const collected: any[] = [];
  let page = 1;
  const limit = 100;
  for (;;) {
    const res = await designsApi.getAll({ page, limit, sortBy: 'newest' });
    const batch = res.designs || [];
    collected.push(...batch);
    const pages = res.pagination?.pages ?? 1;
    if (page >= pages || batch.length === 0) break;
    page += 1;
  }
  return collected;
}

function DesignSearchPicker({
  options,
  value,
  onChange
}: {
  options: DesignOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = options.find(o => o.id === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.searchBlob.includes(q));
  }, [options, query]);

  const displayValue = open ? query : selected?.displayLabel ?? '';

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Search design name / number…"
          value={displayValue}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
        />
      </div>
      {open && (
        <ul
          className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-500">No matches. Try another search.</li>
          ) : (
            filtered.slice(0, 120).map(o => (
              <li key={o.id} role="option">
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 ${
                    value === o.id ? 'bg-indigo-50 font-semibold text-indigo-900' : 'text-gray-900'
                  }`}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  {o.displayLabel}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export const ManualOrderDialog: React.FC<Props> = ({ onClose, onCreated }) => {
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [kind, setKind] = useState<Kind | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm>({
    organizationName: '',
    gstNumber: '',
    contactPersonName: '',
    mobileNumber: '',
    agentName: '',
    category: '',
    state: '',
    city: '',
    pincode: '',
    discountRate: ''
  });
  const [priceCategory, setPriceCategory] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [agentName, setAgentName] = useState('');
  const [transportName, setTransportName] = useState('');
  const [haste, setHaste] = useState('');
  const [station, setStation] = useState('');
  const [discountRate, setDiscountRate] = useState('');
  const [shippingCharge, setShippingCharge] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [parcelQuantity, setParcelQuantity] = useState('');

  const [lines, setLines] = useState<{ designId: string; quantity: string }[]>([{ designId: '', quantity: '1' }]);

  const [designOptions, setDesignOptions] = useState<DesignOption[]>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const { customers: fetchedCustomers } = await customersApi.getAll();
      setCustomers(fetchedCustomers || []);
    } catch (e) {
      console.error('Could not load customers', e);
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  const loadDesigns = useCallback(async () => {
    setLoadingDesigns(true);
    setLoadError(null);
    try {
      const raw = await fetchAllDesignsPages();
      setDesignOptions(mapDesignsToOptions(raw));
    } catch (e) {
      console.error(e);
      setLoadError('Could not load designs. Check your connection and subscription, then retry.');
      setDesignOptions([]);
    } finally {
      setLoadingDesigns(false);
    }
  }, []);

  useEffect(() => {
    if (step === 'form') {
      void loadCustomers();
    }
  }, [step, loadCustomers]);

  useEffect(() => {
    if (kind === 'design' && step === 'form') {
      void loadDesigns();
    }
  }, [kind, step, loadDesigns]);

  useEffect(() => {
    const selected = customers.find(c => c.id === selectedCustomerId);
    if (!selected || customerMode !== 'existing') return;
    setCustomerName(selected.organizationName);
    setAgentName(selected.agentName || '');
    setDiscountRate(
      selected.discountRate !== undefined && selected.discountRate !== null
        ? String(selected.discountRate)
        : ''
    );
  }, [customerMode, customers, selectedCustomerId]);

  const setCustomerField = (field: keyof CustomerForm, fieldValue: string) => {
    setCustomerForm(prev => ({ ...prev, [field]: fieldValue }));
  };

  const numberOrUndefined = (value: string) => {
    if (value.trim() === '') return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  const getOrderMetaPayload = () => ({
    priceCategory: priceCategory.trim() || undefined,
    orderNumber: orderNumber.trim() || undefined,
    agentName: agentName.trim() || undefined,
    transportName: transportName.trim() || undefined,
    haste: haste.trim() || undefined,
    station: station.trim() || undefined,
    discountRate: numberOrUndefined(discountRate),
    shippingCharge: numberOrUndefined(shippingCharge),
    orderDate: orderDate || undefined,
    expectedDate: expectedDate || undefined
  });

  const getCustomerPayload = () => {
    if (customerMode === 'existing' && selectedCustomerId) {
      return { customerId: selectedCustomerId };
    }
    if (customerMode === 'new' && customerForm.organizationName.trim()) {
      return {
        customer: {
          organizationName: customerForm.organizationName.trim(),
          gstNumber: customerForm.gstNumber.trim() || undefined,
          contactPersonName: customerForm.contactPersonName.trim() || undefined,
          mobileNumber: customerForm.mobileNumber.trim() || undefined,
          agentName: customerForm.agentName.trim() || undefined,
          category: customerForm.category.trim() || undefined,
          state: customerForm.state.trim() || undefined,
          city: customerForm.city.trim() || undefined,
          pincode: customerForm.pincode.trim() || undefined,
          discountRate: numberOrUndefined(customerForm.discountRate)
        }
      };
    }
    return {};
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) return;
    const customerPayload = getCustomerPayload();
    const orderMetaPayload = getOrderMetaPayload();

    setSubmitting(true);
    try {
      if (kind === 'open') {
        const pq = parseInt(parcelQuantity, 10);
        if (!Number.isFinite(pq) || pq < 1) {
          alert('Enter a valid parcel quantity (at least 1).');
          setSubmitting(false);
          return;
        }
        await ordersApi.createManual({
          kind: 'open',
          ...customerPayload,
          ...orderMetaPayload,
          remarks: remarks.trim() || undefined,
          parcelQuantity: pq
        });
      } else {
        const parsedLines = lines
          .filter(l => l.designId && l.quantity)
          .map(l => ({
            designId: l.designId,
            quantity: parseInt(l.quantity, 10)
          }))
          .filter(l => Number.isFinite(l.quantity) && l.quantity >= 1);

        if (parsedLines.length === 0) {
          alert('Add at least one design with quantity.');
          setSubmitting(false);
          return;
        }

        await ordersApi.createManual({
          kind: 'design',
          ...customerPayload,
          ...orderMetaPayload,
          remarks: remarks.trim() || undefined,
          lines: parsedLines
        });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('threadx-orders-updated'));
      }
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create order.';
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const pickKind = (k: Kind) => {
    setKind(k);
    setStep('form');
    if (k === 'design') {
      setLines([{ designId: '', quantity: '1' }]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 safe-area-top safe-area-bottom">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[min(92vh,720px)] flex flex-col overflow-hidden">
        <div className="shrink-0 px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900">Create order</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'pick' ? (
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-600">Choose how you want to record this order.</p>
            <button
              type="button"
              onClick={() => pickKind('open')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-colors"
            >
              <div className="p-3 rounded-xl bg-amber-100 text-amber-800">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Open order</p>
                <p className="text-xs text-gray-500 mt-0.5">Parcel quantity only — no design linked yet.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => pickKind('design')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-colors"
            >
              <div className="p-3 rounded-xl bg-indigo-100 text-indigo-800">
                <LayoutGrid className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Design order</p>
                <p className="text-xs text-gray-500 mt-0.5">Search by design name / number and set quantities.</p>
              </div>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
              <button
                type="button"
                onClick={() => {
                  setStep('pick');
                  setKind(null);
                }}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                ← Change order type
              </button>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Customer (optional)</label>
                {customerMode === 'existing' ? (
                  <select
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={selectedCustomerId}
                    onChange={e => {
                      if (e.target.value === '__new__') {
                        setCustomerMode('new');
                        setSelectedCustomerId('');
                        setCustomerName('');
                        return;
                      }
                      setSelectedCustomerId(e.target.value);
                    }}
                    disabled={loadingCustomers}
                  >
                    <option value="">{loadingCustomers ? 'Loading customers...' : 'Select customer'}</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.organizationName}
                      </option>
                    ))}
                    <option value="__new__">+ Add new customer</option>
                  </select>
                ) : (
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-3">
                    <div className="col-span-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Add Customer</p>
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-indigo-600"
                        onClick={() => setCustomerMode('existing')}
                      >
                        Choose existing
                      </button>
                    </div>
                    <input
                      className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      placeholder="Customer organization name (optional)"
                      value={customerForm.organizationName}
                      onChange={e => setCustomerField('organizationName', e.target.value)}
                    />
                    <input
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      placeholder="GST number"
                      value={customerForm.gstNumber}
                      onChange={e => setCustomerField('gstNumber', e.target.value)}
                    />
                    <input
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      placeholder="Mobile number"
                      value={customerForm.mobileNumber}
                      onChange={e => setCustomerField('mobileNumber', e.target.value)}
                    />
                    <input
                      className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      placeholder="Contact person name"
                      value={customerForm.contactPersonName}
                      onChange={e => setCustomerField('contactPersonName', e.target.value)}
                    />
                    <input
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      placeholder="Agent"
                      value={customerForm.agentName}
                      onChange={e => {
                        setCustomerField('agentName', e.target.value);
                        setAgentName(e.target.value);
                      }}
                    />
                    <input
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      placeholder="Category"
                      value={customerForm.category}
                      onChange={e => setCustomerField('category', e.target.value)}
                    />
                    <input
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      placeholder="State"
                      value={customerForm.state}
                      onChange={e => setCustomerField('state', e.target.value)}
                    />
                    <input
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      placeholder="City"
                      value={customerForm.city}
                      onChange={e => setCustomerField('city', e.target.value)}
                    />
                    <input
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      placeholder="Pincode"
                      value={customerForm.pincode}
                      onChange={e => setCustomerField('pincode', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      placeholder="Discount %"
                      value={customerForm.discountRate}
                      onChange={e => {
                        setCustomerField('discountRate', e.target.value);
                        setDiscountRate(e.target.value);
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Order number</label>
                  <input
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Price category</label>
                  <input
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={priceCategory}
                    onChange={e => setPriceCategory(e.target.value)}
                    placeholder="Base / WSP / Retail"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Agent name</label>
                  <input
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Transport</label>
                  <input
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={transportName}
                    onChange={e => setTransportName(e.target.value)}
                    placeholder="Transport name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Haste</label>
                  <input
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={haste}
                    onChange={e => setHaste(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Station</label>
                  <input
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={station}
                    onChange={e => setStation(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Discount %</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={discountRate}
                    onChange={e => setDiscountRate(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Shipping charge</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={shippingCharge}
                    onChange={e => setShippingCharge(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Order date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Expected date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={expectedDate}
                    onChange={e => setExpectedDate(e.target.value)}
                  />
                </div>
              </div>

              {kind === 'open' && (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700">Parcel quantity *</label>
                    <input
                      type="number"
                      min={1}
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={parcelQuantity}
                      onChange={e => setParcelQuantity(e.target.value)}
                      placeholder="Number of parcels"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700">Remarks</label>
                    <textarea
                      rows={3}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="Notes, delivery, etc."
                    />
                  </div>
                </>
              )}

              {kind === 'design' && (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700">Remark</label>
                    <textarea
                      rows={2}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="Applies to this whole order"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-semibold text-gray-700">Design name / number &amp; qty</label>
                      <button
                        type="button"
                        onClick={() => setLines(prev => [...prev, { designId: '', quantity: '1' }])}
                        className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        Add line
                      </button>
                    </div>

                    {loadingDesigns ? (
                      <p className="text-xs text-gray-500 flex items-center gap-2 py-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading designs…
                      </p>
                    ) : loadError ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                        <p>{loadError}</p>
                        <button
                          type="button"
                          onClick={() => void loadDesigns()}
                          className="font-bold text-indigo-700 underline"
                        >
                          Retry
                        </button>
                      </div>
                    ) : designOptions.length === 0 ? (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                        No designs found. Add designs in your catalogue first.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {lines.map((line, idx) => (
                          <div key={idx} className="flex gap-2 items-start">
                            <DesignSearchPicker
                              options={designOptions}
                              value={line.designId}
                              onChange={id => {
                                setLines(prev =>
                                  prev.map((row, i) => (i === idx ? { ...row, designId: id } : row))
                                );
                              }}
                            />
                            <input
                              type="number"
                              min={1}
                              className="w-24 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 shrink-0"
                              value={line.quantity}
                              onChange={e => {
                                const v = e.target.value;
                                setLines(prev =>
                                  prev.map((row, i) => (i === idx ? { ...row, quantity: v } : row))
                                );
                              }}
                              aria-label="Quantity"
                            />
                            {lines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-xl shrink-0"
                                aria-label="Remove line"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="shrink-0 p-4 border-t bg-gray-50 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-bold text-gray-700 bg-white border border-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  submitting || (kind === 'design' && (loadingDesigns || designOptions.length === 0))
                }
                className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Create order
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
