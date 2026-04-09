import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, Plus, Package } from 'lucide-react';
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map(order => {
              const isOpen = order.manualType === 'open';
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
                    {order.buyerPhone && order.buyerPhone !== '-' && (
                      <p>
                        <span className="font-semibold">Phone:</span> {order.buyerPhone}
                      </p>
                    )}
                    <p>
                      <span className="font-semibold">Qty:</span> {order.quantity}
                      {isOpen && <span className="text-gray-400"> (parcels)</span>}
                    </p>
                    {order.remarks && (
                      <p className="pt-1 border-t border-gray-50 mt-2">
                        <span className="font-semibold">Remarks:</span> {order.remarks}
                      </p>
                    )}
                    {order.manualBatchId && order.manualType === 'design' && (
                      <p className="text-[10px] text-gray-400">Part of same manual order batch</p>
                    )}
                    <p>
                      <span className="font-semibold">Status:</span> {order.status}
                    </p>
                  </div>
                  <button
                    onClick={() => markCompleted(order.id)}
                    disabled={order.status === 'completed' || updatingId === order.id}
                    className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {order.status === 'completed'
                      ? 'Completed'
                      : updatingId === order.id
                        ? 'Updating...'
                        : 'Mark Completed'}
                  </button>
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
