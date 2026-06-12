import React from 'react';
import { Customer } from '../types';

export interface OrderFormMeta {
  orderNumber: string;
  orderDate: string;
  expectedDate: string;
  haste: string;
  agentName: string;
  transportName: string;
  station: string;
  priceCategory: string;
  discountRate: string;
  shippingCharge: string;
  remarks: string;
}

interface DesignLineRow {
  key: string;
  image?: string | null;
  designCode?: string | null;
  designName?: string | null;
  fabric?: string | null;
  catalogueName?: string | null;
  quantity: string;
  price?: number | null;
  remarks?: string;
  onQuantityChange?: (value: string) => void;
  onRemarksChange?: (value: string) => void;
  onRemove?: () => void;
}

interface Props {
  customerName: string;
  selectedCustomerId: string;
  customers: Customer[];
  onCustomerIdChange: (id: string) => void;
  onCustomerNameChange: (name: string) => void;
  meta: OrderFormMeta;
  onMetaChange: (patch: Partial<OrderFormMeta>) => void;
  lines: DesignLineRow[];
  readOnly?: boolean;
}

export const OrderFormCheckout: React.FC<Props> = ({
  customerName,
  selectedCustomerId,
  customers,
  onCustomerIdChange,
  onCustomerNameChange,
  meta,
  onMetaChange,
  lines,
  readOnly = false
}) => {
  const totalQty = lines.reduce((sum, line) => sum + (parseInt(line.quantity, 10) || 0), 0);
  const grandTotal = lines.reduce((sum, line) => {
    const qty = parseInt(line.quantity, 10) || 0;
    const rate = Number(line.price) || 0;
    return sum + qty * rate;
  }, 0);

  return (
    <div className="rounded-2xl border-2 border-indigo-100 bg-white shadow-sm overflow-hidden">
      <div className="bg-indigo-600 px-4 py-3 text-white">
        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">ThreadX</p>
        <h3 className="text-lg font-black">Order Form</h3>
      </div>

      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Customer (optional)</label>
          {readOnly ? (
            <p className="text-sm font-bold text-gray-900">{customerName}</p>
          ) : (
            <>
              <select
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedCustomerId}
                onChange={e => {
                  onCustomerIdChange(e.target.value);
                  if (e.target.value) onCustomerNameChange('');
                }}
              >
                <option value="">Select customer or enter name below</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>{customer.organizationName}</option>
                ))}
              </select>
              {!selectedCustomerId && (
                <input
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  value={customerName}
                  onChange={e => onCustomerNameChange(e.target.value)}
                  placeholder="Customer name (optional)"
                />
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'orderDate' as const, label: 'Date', type: 'date' },
            { key: 'orderNumber' as const, label: 'Order form no.', type: 'text' },
            { key: 'haste' as const, label: 'Haste', type: 'text' },
            { key: 'agentName' as const, label: 'Agent / Aadhat', type: 'text' },
            { key: 'transportName' as const, label: 'Transport', type: 'text' },
            { key: 'station' as const, label: 'Station', type: 'text' },
            { key: 'expectedDate' as const, label: 'Expected date', type: 'date' },
            { key: 'priceCategory' as const, label: 'Price category', type: 'text' }
          ].map(field => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">{field.label}</label>
              <input
                type={field.type}
                readOnly={readOnly}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 read-only:bg-gray-100"
                value={meta[field.key]}
                onChange={e => onMetaChange({ [field.key]: e.target.value })}
                placeholder={field.type === 'text' ? 'Optional' : undefined}
              />
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-gray-500">
            Designs — photo, name, quantity, price
          </div>
          <div className="divide-y divide-gray-100">
            {lines.map(line => {
              const rate = Number(line.price) || 0;
              const qty = parseInt(line.quantity, 10) || 0;
              return (
                <div key={line.key} className="grid grid-cols-[52px_1fr_auto] sm:grid-cols-[52px_1.2fr_72px_88px_1fr_auto] gap-2 items-center p-3">
                  {line.image ? (
                    <img src={line.image} alt={line.designName || 'Design'} className="h-12 w-12 rounded-lg object-cover border border-gray-100" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-gray-100" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{line.designCode || line.designName || 'Design'}</p>
                    <p className="text-[11px] text-gray-500 truncate">{line.designName || line.fabric || line.catalogueName}</p>
                    <p className="text-xs font-semibold text-indigo-700 sm:hidden">₹{rate.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="hidden sm:block text-xs font-bold text-gray-800">₹{rate.toLocaleString('en-IN')}</div>
                  {readOnly || !line.onQuantityChange ? (
                    <div className="text-sm font-bold text-gray-900">Qty {line.quantity}</div>
                  ) : (
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={e => line.onQuantityChange?.(e.target.value)}
                      className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      aria-label="Quantity"
                    />
                  )}
                  <div className="hidden sm:block text-xs font-bold text-gray-900 col-span-1">
                    ₹{(rate * qty).toLocaleString('en-IN')}
                  </div>
                  {!readOnly && line.onRemarksChange && (
                    <input
                      value={line.remarks || ''}
                      onChange={e => line.onRemarksChange?.(e.target.value)}
                      placeholder="Remarks"
                      className="hidden sm:block w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                  {!readOnly && line.onRemove && (
                    <button type="button" onClick={line.onRemove} className="text-xs font-bold text-red-600 hover:text-red-700">
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-900">
            <span>Total qty: {totalQty}</span>
            <span>Grand total: ₹{grandTotal.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {!readOnly && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Order remarks</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              value={meta.remarks}
              onChange={e => onMetaChange({ remarks: e.target.value })}
              placeholder="Optional notes"
            />
          </div>
        )}
      </div>
    </div>
  );
};
