import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, Clock, Download, Edit3, MessageCircle, Plus, Package, RefreshCw, ScanLine, Search, ThumbsUp, X } from 'lucide-react';
import { ordersApi } from '../services/api';
import { findOrdersByDesignQuery } from '../services/orderDesignSearch';
import { downloadOrderSummaryPdfBlob, orderToPdfInput, shareOrderSummaryPdf } from '../services/orderSummaryPdf';
import { Order } from '../types';
import { BarcodeOrderBuilder } from './BarcodeOrderBuilder';
import { EditOrderDialog } from './EditOrderDialog';
import { ManualOrderDialog } from './ManualOrderDialog';

/** How often the orders list polls for new orders from other staff/devices (ms). */
const ORDERS_AUTO_REFRESH_MS = 8000;

interface Props {
  onBack: () => void;
  firmName?: string;
}

export const OrdersPage: React.FC<Props> = ({ onBack, firmName }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<'waiting_approval' | 'pending' | 'completed' | 'all'>('waiting_approval');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [designSearch, setDesignSearch] = useState('');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const loadOrders = useCallback(async (options?: { background?: boolean }) => {
    try {
      if (!options?.background) setLoading(true);
      const { orders: fetchedOrders } = await ordersApi.getAll();
      setOrders(fetchedOrders);
      setLastRefreshedAt(new Date());
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      if (!options?.background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    if (!editId || orders.length === 0) return;
    const match = orders.find(order => order.id === editId);
    if (match) {
      setEditingOrder(match);
      params.delete('edit');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, [orders]);

  useEffect(() => {
    const refresh = () => void loadOrders({ background: true });
    const intervalId = window.setInterval(refresh, ORDERS_AUTO_REFRESH_MS);
    window.addEventListener('focus', refresh);
    window.addEventListener('threadx-orders-updated', refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('threadx-orders-updated', refresh);
    };
  }, [loadOrders]);

  const markCompleted = async (orderId: string) => {
    try {
      setUpdatingId(orderId);
      const { order } = await ordersApi.updateStatus(orderId, 'completed');
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, ...order } : o)));
    } catch (error) {
      alert('Failed to update order status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const markLineCompleted = async (orderId: string, lineIndex: number) => {
    const updateKey = `${orderId}:${lineIndex}`;
    try {
      setUpdatingId(updateKey);
      const { order } = await ordersApi.updateLineCompletion(orderId, lineIndex, true);
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, ...order } : o)));
    } catch (error) {
      alert('Failed to complete this item.');
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

  const tabOrders = useMemo(() => {
    if (activeTab === 'all') return orders;
    return orders.filter(order => order.status === activeTab);
  }, [activeTab, orders]);

  const designSearchMatches = useMemo(
    () => findOrdersByDesignQuery(tabOrders, designSearch),
    [tabOrders, designSearch]
  );

  const designSearchOrderIds = useMemo(
    () => new Set(designSearchMatches.map(match => match.order.id)),
    [designSearchMatches]
  );

  const totalDesignSearchQty = useMemo(
    () => designSearchMatches.reduce((sum, match) => sum + match.quantity, 0),
    [designSearchMatches]
  );

  const filteredOrders = useMemo(() => {
    let list = activeTab === 'all' ? orders : orders.filter(order => order.status === activeTab);
    if (designSearch.trim()) {
      list = list.filter(order => designSearchOrderIds.has(order.id));
    }
    return list;
  }, [activeTab, orders, designSearch, designSearchOrderIds]);

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
          <div className="flex items-center gap-2">
            <a
              href="/orders/scan"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-2 hover:bg-indigo-100"
            >
              <ScanLine className="w-4 h-4" />
              New scan tab
            </a>
            <button
              type="button"
              onClick={() => { window.location.href = '/orders/scan'; }}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold px-3 py-2 hover:bg-indigo-700 shadow-sm"
            >
              <ScanLine className="w-4 h-4" />
              <span className="hidden sm:inline">Scan station</span>
            </button>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gray-900 text-white text-xs font-bold px-3 py-2 hover:bg-black shadow-sm"
            >
              <ScanLine className="w-4 h-4" />
              <span className="hidden sm:inline">Quick scan</span>
            </button>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold px-3 py-2 hover:bg-indigo-700 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
          <p className="font-bold">Multiple orders at once</p>
          <p className="text-indigo-800/90 mt-1">
            During peak season, staff can create orders in parallel — scan station on PC, quick scan on mobile, or open extra scan tabs. Every saved order appears here automatically (refreshes every {ORDERS_AUTO_REFRESH_MS / 1000} seconds).
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-indigo-700">
            <button type="button" onClick={() => void loadOrders()} className="inline-flex items-center gap-1 hover:text-indigo-900">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh now
            </button>
            {lastRefreshedAt && (
              <span className="text-indigo-600">
                Updated {lastRefreshedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        <div className="sticky top-[52px] z-20 -mx-4 px-4 pt-2 pb-3 mb-4 bg-[#FDFDFF]/95 backdrop-blur border-b border-gray-100">
          <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600 block mb-2">
            Find design in orders
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={designSearch}
              onChange={e => setDesignSearch(e.target.value)}
              placeholder="Design number or name..."
              className="w-full pl-10 pr-10 py-3 bg-white border-2 border-indigo-100 rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
            {designSearch && (
              <button
                type="button"
                onClick={() => setDesignSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 text-gray-500"
                aria-label="Clear design search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {designSearch.trim() && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              {designSearchMatches.length === 0 ? (
                <p className="text-sm font-semibold text-amber-900">
                  No orders contain &ldquo;{designSearch.trim()}&rdquo; in this tab
                </p>
              ) : (
                <>
                  <p className="text-sm font-black text-amber-950">
                    &ldquo;{designSearch.trim()}&rdquo; in {designSearchMatches.length} line{designSearchMatches.length === 1 ? '' : 's'}
                    {' · '}Total qty: {totalDesignSearchQty}
                  </p>
                  <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                    {designSearchMatches.map((match, idx) => (
                      <div
                        key={`${match.order.id}-${match.designId || idx}`}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs border border-amber-100"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">
                            {match.designLabel} · Qty {match.quantity}
                          </p>
                          <p className="text-gray-600 truncate">
                            {match.order.buyerName}
                            {match.order.orderNumber ? ` · #${match.order.orderNumber}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

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
              onClick={() => { window.location.href = '/orders/scan'; }}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white text-sm font-bold px-5 py-3 hover:bg-indigo-700"
            >
              <ScanLine className="w-5 h-5" />
              Open scan station (USB scanner)
            </button>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-bold px-5 py-3 hover:bg-gray-50"
            >
              <ScanLine className="w-5 h-5" />
              Quick scan
            </button>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-bold px-5 py-3 hover:bg-gray-50"
            >
              <Plus className="w-5 h-5" />
              Create manually
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-sm text-gray-400">
              {designSearch.trim() ? 'No matching orders in this section.' : 'No orders in this section.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map(order => {
              const isOpen = order.manualType === 'open';
              const orderLines = order.orderLines || [];
              const hasGroupedLines = orderLines.length > 0;
              const completedLineCount = orderLines.filter(line => line.completed).length;
              const hasIncompleteLines = orderLines.some(line => !line.completed);
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
                    ) : hasGroupedLines && orderLines[0]?.image ? (
                      <div className="relative">
                        <img
                          src={orderLines[0].image}
                          alt={orderLines[0].designName || 'Design'}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        {orderLines.length > 1 && (
                          <span className="absolute -right-2 -top-2 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                            +{orderLines.length - 1}
                          </span>
                        )}
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
                          {isOpen
                            ? 'Open order'
                            : hasGroupedLines
                              ? `${orderLines.length} design order`
                              : order.design?.name || 'Design'}
                        </p>
                        {order.manualType && (
                          <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {order.manualType === 'open' ? 'Parcel' : 'Manual'}
                          </span>
                        )}
                      </div>
                      {!isOpen && !hasGroupedLines && order.design?.fabric && (
                        <p className="text-xs text-gray-500 truncate">{order.design.fabric}</p>
                      )}
                      {hasGroupedLines && (
                        <p className="text-xs text-gray-500 truncate">
                          {orderLines.map(line => line.designCode || line.designName || line.designId).join(', ')}
                        </p>
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
                    {hasGroupedLines && (
                      <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-2 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-wide text-gray-500">Design lines</p>
                        {orderLines.map((line, idx) => (
                          <div key={`${line.designId}-${idx}`} className="flex items-center gap-2 rounded-lg bg-white p-2">
                            {line.image && (
                              <img src={line.image} alt={line.designName || 'Design'} className="h-9 w-9 rounded-md object-cover" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className={`truncate font-semibold ${line.completed ? 'text-green-700 line-through decoration-green-500' : 'text-gray-800'}`}>
                                {line.designCode || line.designName || line.designId}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                Qty: {line.quantity}
                                {line.remarks ? ` • ${line.remarks}` : ''}
                              </p>
                            </div>
                            {order.status === 'pending' && (
                              line.completed ? (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[10px] font-black text-green-700">
                                  <CheckCircle className="h-3 w-3" />
                                  Done
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void markLineCompleted(order.id, idx)}
                                  disabled={updatingId === `${order.id}:${idx}` || updatingId === order.id}
                                  className="shrink-0 rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-[10px] font-black text-green-800 hover:bg-green-100 disabled:opacity-50"
                                >
                                  {updatingId === `${order.id}:${idx}` ? '...' : 'Complete'}
                                </button>
                              )
                            )}
                          </div>
                        ))}
                        {order.status === 'pending' && orderLines.length > 0 && (
                          <p className="text-[10px] font-bold text-gray-500">
                            Completed {completedLineCount}/{orderLines.length} items
                          </p>
                        )}
                      </div>
                    )}
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
                      {order.haste && (
                        <p><span className="font-semibold">Haste:</span> {order.haste}</p>
                      )}
                      {order.station && (
                        <p><span className="font-semibold">Station:</span> {order.station}</p>
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
                    {!isOpen && (
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => void downloadOrderSummaryPdfBlob(orderToPdfInput(order, firmName))}
                          className="rounded-lg border border-gray-200 bg-white py-2 text-[11px] font-bold text-gray-700 hover:bg-gray-50 flex flex-col items-center justify-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => void shareOrderSummaryPdf(orderToPdfInput(order, firmName))}
                          className="rounded-lg border border-green-200 bg-green-50 py-2 text-[11px] font-bold text-green-800 hover:bg-green-100 flex flex-col items-center justify-center gap-1"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Share
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingOrder(order)}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 py-2 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 flex flex-col items-center justify-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      </div>
                    )}
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
                    {order.status === 'pending' && hasGroupedLines && (
                      <button
                        onClick={() => markCompleted(order.id)}
                        disabled={updatingId === order.id || !hasIncompleteLines}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {updatingId === order.id ? 'Updating...' : 'Complete all items'}
                      </button>
                    )}
                    {order.status === 'pending' && !hasGroupedLines && (
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
      {showScanner && (
        <BarcodeOrderBuilder
          firmName={firmName}
          onClose={() => setShowScanner(false)}
          onCreated={() => {
            void loadOrders();
            setShowScanner(false);
          }}
        />
      )}
      {editingOrder && (
        <EditOrderDialog
          order={editingOrder}
          firmName={firmName}
          onClose={() => setEditingOrder(null)}
          onSaved={updated => {
            setOrders(prev => prev.map(o => (o.id === updated.id ? { ...o, ...updated } : o)));
            setEditingOrder(null);
          }}
        />
      )}
    </div>
  );
};
