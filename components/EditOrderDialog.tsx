import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { customersApi, ordersApi } from '../services/api';
import { Customer, Order } from '../types';
import { OrderFormCheckout, OrderFormMeta } from './OrderFormCheckout';

interface Props {
  order: Order;
  firmName?: string;
  onClose: () => void;
  onSaved: (order: Order) => void;
}

const toMeta = (order: Order): OrderFormMeta => ({
  orderNumber: order.orderNumber || '',
  orderDate: order.orderDate ? order.orderDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
  expectedDate: order.expectedDate ? order.expectedDate.slice(0, 10) : '',
  haste: order.haste || '',
  agentName: order.agentName || '',
  transportName: order.transportName || '',
  station: order.station || '',
  priceCategory: order.priceCategory || '',
  discountRate: order.discountRate != null ? String(order.discountRate) : '',
  shippingCharge: order.shippingCharge != null ? String(order.shippingCharge) : '',
  remarks: order.remarks || ''
});

export const EditOrderDialog: React.FC<Props> = ({ order, onClose, onSaved }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(order.customerId || '');
  const [customerName, setCustomerName] = useState(order.buyerName || '');
  const [meta, setMeta] = useState<OrderFormMeta>(() => toMeta(order));
  const [lineQty, setLineQty] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    (order.orderLines || []).forEach((line, idx) => {
      map[`${line.designId}-${idx}`] = String(line.quantity);
    });
    return map;
  });
  const [lineRemarks, setLineRemarks] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    (order.orderLines || []).forEach((line, idx) => {
      map[`${line.designId}-${idx}`] = line.remarks || '';
    });
    return map;
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void customersApi.getAll().then(res => setCustomers(res.customers || [])).catch(() => setCustomers([]));
  }, []);

  const numberOrUndefined = (value: string) => {
    if (value.trim() === '') return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  const lines = useMemo(() => (order.orderLines || []).map((line, idx) => {
    const key = `${line.designId}-${idx}`;
    return {
      key,
      image: line.image,
      designCode: line.designCode,
      designName: line.designName,
      fabric: line.fabric,
      quantity: lineQty[key] ?? String(line.quantity),
      price: line.basePrice || line.retailPrice || 0,
      remarks: lineRemarks[key] ?? line.remarks ?? '',
      onQuantityChange: (value: string) => setLineQty(prev => ({ ...prev, [key]: value })),
      onRemarksChange: (value: string) => setLineRemarks(prev => ({ ...prev, [key]: value }))
    };
  }), [lineQty, lineRemarks, order.orderLines]);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const customerPayload = selectedCustomerId
        ? { customerId: selectedCustomerId }
        : customerName.trim()
          ? { customer: { organizationName: customerName.trim() } }
          : { buyerName: 'Walk-in customer' };

      const payload: Parameters<typeof ordersApi.update>[1] = {
        ...customerPayload,
        remarks: meta.remarks.trim() || undefined,
        priceCategory: meta.priceCategory.trim() || undefined,
        orderNumber: meta.orderNumber.trim() || undefined,
        agentName: meta.agentName.trim() || undefined,
        transportName: meta.transportName.trim() || undefined,
        haste: meta.haste.trim() || undefined,
        station: meta.station.trim() || undefined,
        discountRate: numberOrUndefined(meta.discountRate),
        shippingCharge: numberOrUndefined(meta.shippingCharge),
        orderDate: meta.orderDate || undefined,
        expectedDate: meta.expectedDate || undefined
      };

      if ((order.orderLines || []).length > 0) {
        payload.lines = (order.orderLines || []).map((line, idx) => {
          const key = `${line.designId}-${idx}`;
          return {
            designId: line.designId,
            quantity: parseInt(lineQty[key] || String(line.quantity), 10),
            remarks: lineRemarks[key]?.trim() || undefined
          };
        });
      }

      const { order: updated } = await ordersApi.update(order.id, payload);
      onSaved(updated);
      onClose();
    } catch (error: any) {
      alert(error.message || 'Could not update order.');
    } finally {
      setSubmitting(false);
    }
  };

  const patchMeta = useCallback((patch: Partial<OrderFormMeta>) => {
    setMeta(prev => ({ ...prev, ...patch }));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[min(94vh,900px)] overflow-hidden flex flex-col">
        <div className="shrink-0 px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900">Edit order form</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <OrderFormCheckout
            customerName={customerName}
            selectedCustomerId={selectedCustomerId}
            customers={customers}
            onCustomerIdChange={setSelectedCustomerId}
            onCustomerNameChange={setCustomerName}
            meta={meta}
            onMetaChange={patchMeta}
            lines={lines}
          />
        </div>
        <div className="shrink-0 border-t bg-gray-50 p-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 bg-white py-3 font-bold text-gray-700">
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSave()}
            className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
};
