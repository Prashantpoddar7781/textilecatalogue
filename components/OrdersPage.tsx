import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { ordersApi } from '../services/api';
import { Order } from '../types';

interface Props {
  onBack: () => void;
}

export const OrdersPage: React.FC<Props> = ({ onBack }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-sm text-gray-500">Loading orders...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-400">No orders yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map(order => (
              <div key={order.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  {order.design?.image && (
                    <img
                      src={order.design.image}
                      alt={order.design?.name || 'Design'}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  )}
                  <div>
                    <p className="text-sm font-bold text-gray-900">{order.design?.name || 'Design'}</p>
                    <p className="text-xs text-gray-500">{order.design?.fabric}</p>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-600 space-y-1">
                  <p><span className="font-semibold">Buyer:</span> {order.buyerName}</p>
                  <p><span className="font-semibold">Phone:</span> {order.buyerPhone}</p>
                  <p><span className="font-semibold">Qty:</span> {order.quantity}</p>
                  <p><span className="font-semibold">Status:</span> {order.status}</p>
                </div>
                <button
                  onClick={() => markCompleted(order.id)}
                  disabled={order.status === 'completed' || updatingId === order.id}
                  className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  {order.status === 'completed' ? 'Completed' : updatingId === order.id ? 'Updating...' : 'Mark Completed'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
