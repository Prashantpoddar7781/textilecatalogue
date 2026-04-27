import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, Clock, Plus, Package, ThumbsUp } from 'lucide-react';
import { ordersApi } from '../services/api';
import { Order } from '../types';
import { ManualOrderDialog } from './ManualOrderDialog';

interface Props {
  onBack: () => void;
}

export const OrdersPage: React.FC<Props> = ({ onBack }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [activeTab, setActiveTab] = useState<'waiting_approval' | 'pending' | 'completed' | 'all'>('waiting_approval');

  const loadOrders = async () => {
    try {
      setLoading(true);
      const { orders: fetchedOrders } = await ordersApi.getAll();
      setOrders(fetchedOrders);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const markCompleted = async (orderId: string) => {
    try {
      setUpdatingId(orderId);
      const { order } = await ordersApi.updateStatus(orderId, 'completed');
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: order.status } : o)));
    } catch (error) {
      alert('Failed to update order status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const approveOrder = async (orderId: string) => {
    try {
      setUpdatingId(orderId);
      const { order } = await ordersApi.updateStatus(orderId, 'pending');
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, ...order } : o)));
    } catch (error) {
      alert('Failed to approve order.');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    if (activeTab === 'all') return orders;
    return orders.filter(order => order.status === activeTab);
  }, [activeTab, orders]);

  const counts = useMemo(() => ({
    waiting_approval: orders.filter(order => order.status === 'waiting_approval').length,
    pending: orders.filter(order => order.status === 'pending').length,
    completed: orders.filter(order => order.status === 'completed').length,
    all: orders.length
  }), [orders]);

  const formatDate = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString();
  };

  const tabItems = [
    { id: 'waiting_approval' as const, label: 'Waiting for approval' },
    { id: 'pending' as const, label: 'Pending' },
    { id: 'completed' as const, label: 'Completed' },
    { id: 'all' as const, label: 'All orders' }
  ];

  return (
    <div className="min-h-screen bg-[#FDFDFF]">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b px-4 py-3 md:px-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-lg font-black text-gray-900">Orders</h1>
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold px-3 py-2 hover:bg-indigo-700 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create</span>
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {tabItems.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-black border transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label} ({counts[tab.id]})
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading orders...</p>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-sm text-gray-400">No orders yet.</p>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white text-sm font-bold px-5 py-3 hover:bg-indigo-700"
            >
              <Plus className="w-5 h-5" />
              Create order manually
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-sm text-gray-400">No orders in this section.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map(order => {
              const isOpen = order.manualType === 'open';
              const statusLabel = order.status === 'waiting_approval'
                ? 'Waiting for approval'
                : order.status === 'pending'
                  ? 'Pending'
                  : order.status === 'completed'
                    ? 'Completed'
                    : order.status;
              return (
                <div key={order.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    {isOpen ? (
                      <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center border border-amber-100">
                        <Package className="w-6 h-6 text-amber-700" />
                      </div>
                    ) : order.design?.image ? (
                      <img
                        src={order.design.image}
                        alt={order.design?.name || 'Design'}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-400 font-bold">
                        —
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {isOpen ? 'Open order' : order.design?.name || 'Design'}
                        </p>
                        {order.manualType && (
                          <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {order.manualType === 'open' ? 'Parcel' : 'Manual'}
                          </span>
                        )}
                      </div>
                      {!isOpen && order.design?.fabric && (
                        <p className="text-xs text-gray-500 truncate">{order.design.fabric}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-gray-600 space-y-1">
                    <p>
                      <span className="font-semibold">Customer:</span> {order.buyerName}
                    </p>
                    {order.customer?.contactPersonName && (
                      <p>
                        <span className="font-semibold">Contact:</span> {order.customer.contactPersonName}
                      </p>
                    )}
                    {order.buyerPhone && order.buyerPhone !== '-' && (
                      <p>
                        <span className="font-semibold">Phone:</span> {order.buyerPhone}
                      </p>
                    )}
                    <p>
                      <span className="font-semibold">Qty:</span> {order.quantity}
                      {isOpen && <span className="text-gray-400"> (parcels)</span>}
                    </p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
                      {order.orderNumber && (
                        <p><span className="font-semibold">Order #:</span> {order.orderNumber}</p>
                      )}
                      {order.priceCategory && (
                        <p><span className="font-semibold">Price:</span> {order.priceCategory}</p>
                      )}
                      {order.agentName && (
                        <p><span className="font-semibold">Agent:</span> {order.agentName}</p>
                      )}
                      {order.transportName && (
                        <p><span className="font-semibold">Transport:</span> {order.transportName}</p>
                      )}
                      {order.discountRate !== undefined && order.discountRate !== null && (
                        <p><span className="font-semibold">Discount:</span> {order.discountRate}%</p>
                      )}
                      {order.shippingCharge !== undefined && order.shippingCharge !== null && (
                        <p><span className="font-semibold">Shipping:</span> ₹{order.shippingCharge.toLocaleString('en-IN')}</p>
                      )}
                      {formatDate(order.orderDate) && (
                        <p><span className="font-semibold">Date:</span> {formatDate(order.orderDate)}</p>
                      )}
                      {formatDate(order.expectedDate) && (
                        <p><span className="font-semibold">Expected:</span> {formatDate(order.expectedDate)}</p>
                      )}
                    </div>
                    {order.remarks && (
                      <p className="pt-1 border-t border-gray-50 mt-2">
                        <span className="font-semibold">Remarks:</span> {order.remarks}
                      </p>
                    )}
                    {order.manualBatchId && order.manualType === 'design' && (
                      <p className="text-[10px] text-gray-400">Part of same manual order batch</p>
                    )}
                    <p>
                      <span className="font-semibold">Status:</span> {statusLabel}
                    </p>
                  </div>
                  <div className="mt-4 space-y-2">
                    {order.status === 'waiting_approval' && (
                      <button
                        onClick={() => approveOrder(order.id)}
                        disabled={updatingId === order.id}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        {updatingId === order.id ? 'Approving...' : 'Approve'}
                      </button>
                    )}
                    {order.status === 'pending' && (
                      <button
                        onClick={() => markCompleted(order.id)}
                        disabled={updatingId === order.id}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {updatingId === order.id ? 'Updating...' : 'Mark Completed'}
                      </button>
                    )}
                    {order.status === 'completed' && (
                      <div className="w-full bg-green-50 text-green-700 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Completed
                      </div>
                    )}
                    {order.status !== 'waiting_approval' && order.status !== 'pending' && order.status !== 'completed' && (
                      <div className="w-full bg-gray-50 text-gray-600 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                        <Clock className="w-4 h-4" />
                        {statusLabel}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showManual && (
        <ManualOrderDialog
          onClose={() => setShowManual(false)}
          onCreated={() => void loadOrders()}
        />
      )}
    </div>
  );
};
