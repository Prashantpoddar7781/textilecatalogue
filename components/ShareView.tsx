import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Pencil, ShoppingCart, SlidersHorizontal, X } from 'lucide-react';
import { shareLinksApi, ordersApi } from '../services/api';
import { getShareDeviceToken } from '../services/shareDeviceToken';
import { ShareLink, TextileDesign } from '../types';
import { designThumbSrc } from '../services/designMedia';
import { getShareAttachLines, resolveAttachedPrice, resolveShareDisplay } from '../utils/shareAttachDetails';
import { ViewModeLightbox } from './ViewModeLightbox';
import { SearchableFilterSelect } from './SearchableFilterSelect';

const SESSION_KEY = 'threadx_share_session';
const BUYER_NAME_KEY_PREFIX = 'threadx_share_buyer_name_';
const APP_LOGO_SRC = '/threadx-logo.png';
const VIEW_MODE_THRESHOLD = 8;

function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function catalogueLabel(design: TextileDesign & { catalogue?: { id?: string; name?: string | null } | null }) {
  return design.catalogueName?.trim() || design.catalogue?.name?.trim() || design.fabric || '';
}

function catalogueKey(design: TextileDesign & { catalogue?: { id?: string; name?: string | null } | null }) {
  const name = design.catalogueName?.trim() || design.catalogue?.name?.trim() || '';
  const id = design.catalogueId || design.catalogue?.id || '';
  return { id: id || name, name };
}

export const ShareView: React.FC<{ token: string }> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [orderDesign, setOrderDesign] = useState<TextileDesign | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [savedBuyerName, setSavedBuyerName] = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(`${BUYER_NAME_KEY_PREFIX}${token}`) || '';
  });
  const [orderForm, setOrderForm] = useState({
    buyerName: savedBuyerName,
    quantity: 1,
    remarks: ''
  });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState(false);
  const [orderedLines, setOrderedLines] = useState<Record<string, { quantity: number; remarks: string }>>({});
  const [catalogue, setCatalogue] = useState('All');
  const [fabric, setFabric] = useState('All');
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(100000);

  const applyOrder = (order: any | null) => {
    if (!order?.orderLines || !Array.isArray(order.orderLines)) {
      setOrderedLines({});
      return;
    }
    const next: Record<string, { quantity: number; remarks: string }> = {};
    for (const line of order.orderLines) {
      if (!line?.designId) continue;
      next[line.designId] = {
        quantity: Number(line.quantity) || 1,
        remarks: String(line.remarks || '')
      };
    }
    setOrderedLines(next);
    if (order.buyerName) {
      sessionStorage.setItem(`${BUYER_NAME_KEY_PREFIX}${token}`, order.buyerName);
      setSavedBuyerName(order.buyerName);
    }
  };

  useEffect(() => {
    const storedName = sessionStorage.getItem(`${BUYER_NAME_KEY_PREFIX}${token}`) || '';
    setSavedBuyerName(storedName);
    setOrderForm(prev => ({ ...prev, buyerName: storedName }));
    loadShareLink();
    ordersApi.getPublic(token, getOrCreateSessionId()).then(res => applyOrder(res.order)).catch(() => {});
  }, [token]);

  const loadShareLink = async () => {
    try {
      setLoading(true);
      setError(null);
      const deviceToken = getShareDeviceToken();
      const link = await shareLinksApi.getByToken(token, deviceToken);
      setShareLink(link);
      const openKey = `share_open_${token}`;
      if (!sessionStorage.getItem(openKey)) {
        const sessionId = getOrCreateSessionId();
        shareLinksApi.recordOpen(token, sessionId).catch(() => {}).finally(() => {
          sessionStorage.setItem(openKey, '1');
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load shared design');
    } finally {
      setLoading(false);
    }
  };

  const designs = useMemo(() => {
    if (!shareLink) return [] as TextileDesign[];
    return shareLink.designs?.map(d => d.design) || (shareLink.design ? [shareLink.design] : []);
  }, [shareLink]);

  const display = useMemo(
    () => resolveShareDisplay(shareLink?.shareOptions, shareLink?.selectedPriceType),
    [shareLink]
  );

  const firmName = designs[0]?.user?.firmName || designs[0]?.firmName || '';
  const headerCatalogue = useMemo(() => {
    const names = [...new Set(designs.map(d => catalogueKey(d).name).filter(Boolean))];
    if (names.length === 1) return names[0];
    if (names.length > 1) return 'Catalogue';
    return designs[0]?.fabric || 'Catalogue';
  }, [designs]);

  const catalogues = useMemo(() => {
    const map = new Map<string, string>();
    designs.forEach(d => {
      const { id, name } = catalogueKey(d);
      if (name) map.set(id || name, name);
    });
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [designs]);

  const fabrics = useMemo(() => {
    const set = new Set(designs.map(d => d.fabric).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [designs]);

  const priceMaxBound = useMemo(() => {
    if (!display.options.includeRetail || designs.length === 0) return 100000;
    const amounts = designs.map(d => resolveAttachedPrice(d, display.selectedPriceType).amount);
    return Math.max(...amounts, 1000);
  }, [designs, display]);

  useEffect(() => {
    setMinPrice(0);
    setMaxPrice(priceMaxBound);
  }, [priceMaxBound]);

  const filteredDesigns = useMemo(() => {
    return designs.filter(design => {
      if (catalogue !== 'All') {
        const { id, name } = catalogueKey(design);
        if (id !== catalogue && name !== catalogue) return false;
      }
      if (fabric !== 'All' && design.fabric !== fabric) return false;
      if (display.options.includeRetail) {
        const amount = resolveAttachedPrice(design, display.selectedPriceType).amount;
        if (amount < minPrice || amount > maxPrice) return false;
      }
      return true;
    });
  }, [catalogue, designs, display, fabric, maxPrice, minPrice]);

  const useViewGrid = designs.length >= VIEW_MODE_THRESHOLD;

  const recordView = useCallback((designId: string) => {
    const viewKey = `share_view_${token}_${designId}`;
    if (sessionStorage.getItem(viewKey)) return;
    sessionStorage.setItem(viewKey, '1');
    shareLinksApi.recordDesignView(token, designId, getOrCreateSessionId()).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (lightboxIndex == null) return;
    const design = filteredDesigns[lightboxIndex];
    if (design) recordView(design.id);
  }, [filteredDesigns, lightboxIndex, recordView]);

  const handleBuyNow = (design: TextileDesign, edit = false) => {
    const existing = orderedLines[design.id];
    setOrderDesign(design);
    setEditingOrder(Boolean(edit || existing));
    setOrderForm({
      buyerName: savedBuyerName,
      quantity: existing?.quantity || 1,
      remarks: existing?.remarks || ''
    });
    setOrderSuccess(null);
  };

  const submitOrder = async () => {
    if (!orderDesign) return;
    const buyerName = savedBuyerName.trim() || orderForm.buyerName.trim();
    if (!buyerName || orderForm.quantity < 1) {
      alert('Please enter name and quantity.');
      return;
    }

    try {
      setPlacingOrder(true);
      const sessionId = getOrCreateSessionId();
      const result = editingOrder && orderedLines[orderDesign.id]
        ? await ordersApi.updatePublic({
            token,
            orderSessionId: sessionId,
            designId: orderDesign.id,
            quantity: Number(orderForm.quantity),
            remarks: orderForm.remarks.trim() || ''
          })
        : await ordersApi.createPublic({
            token,
            designId: orderDesign.id,
            buyerName,
            orderSessionId: sessionId,
            quantity: Number(orderForm.quantity),
            remarks: orderForm.remarks.trim() || undefined
          });
      applyOrder(result.order);
      if (!savedBuyerName.trim()) {
        sessionStorage.setItem(`${BUYER_NAME_KEY_PREFIX}${token}`, buyerName);
        setSavedBuyerName(buyerName);
      }
      setOrderSuccess(editingOrder ? 'Order updated.' : 'Added to one order form. You can add more designs from this link.');
    } catch (err: any) {
      alert(err.message || 'Failed to place order. Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  const removeOrderedDesign = async () => {
    if (!orderDesign) return;
    if (!confirm('Remove this design from your order?')) return;
    try {
      setPlacingOrder(true);
      const result = await ordersApi.updatePublic({
        token,
        orderSessionId: getOrCreateSessionId(),
        designId: orderDesign.id,
        remove: true
      });
      applyOrder(result.order);
      setOrderDesign(null);
      setOrderSuccess(null);
      setEditingOrder(false);
    } catch (err: any) {
      alert(err.message || 'Could not remove this design.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFDFF]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading shared design...</p>
        </div>
      </div>
    );
  }

  if (error || !shareLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFDFF]">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-red-100 p-4 rounded-full inline-block mb-4">
            <AlertCircle className="w-12 h-12 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Link Not Available</h2>
          <p className="text-gray-600">{error || 'This share link is not available or has expired.'}</p>
        </div>
      </div>
    );
  }

  if (designs.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFDFF]">
        <p className="text-gray-600">Design not found</p>
      </div>
    );
  }

  const showFilters = designs.length > 1;
  const groupedOneByOne = filteredDesigns.reduce((acc: Record<string, TextileDesign[]>, design) => {
    const key = design.fabric || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(design);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#FDFDFF] pb-10">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={APP_LOGO_SRC} alt="ThreadX" className="w-10 h-10 rounded-xl object-cover shadow-lg shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none truncate">ThreadX</h1>
              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest truncate block">
                {headerCatalogue}
              </span>
            </div>
          </div>
        </div>
      </header>

      {showFilters && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
            <div className="bg-white border-2 border-gray-100 p-2 px-3 rounded-2xl flex items-center gap-2 shadow-sm shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest hidden sm:inline">Filter By</span>
            </div>
            {catalogues.length > 0 && (
              <SearchableFilterSelect
                value={catalogue}
                onChange={setCatalogue}
                searchPlaceholder="Search catalogues…"
                options={[
                  { value: 'All', label: 'All Catalogues' },
                  ...catalogues
                ]}
              />
            )}
            {fabrics.length > 0 && (
              <SearchableFilterSelect
                value={fabric}
                onChange={setFabric}
                searchPlaceholder="Search fabrics…"
                options={[
                  { value: 'All', label: 'All Fabrics' },
                  ...fabrics.map(name => ({ value: name, label: name }))
                ]}
              />
            )}
            {(catalogue !== 'All' || fabric !== 'All' || minPrice > 0 || maxPrice < priceMaxBound) && (
              <button
                type="button"
                onClick={() => {
                  setCatalogue('All');
                  setFabric('All');
                  setMinPrice(0);
                  setMaxPrice(priceMaxBound);
                }}
                className="bg-white border-2 border-rose-100 text-rose-700 px-4 py-2.5 rounded-2xl text-xs font-black shadow-sm shrink-0"
              >
                Clear all filters
              </button>
            )}
          </div>
          {display.options.includeRetail && (
            <div className="mt-3 px-1">
              <div className="bg-white border-2 border-gray-100 rounded-2xl p-3 shadow-sm">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">
                  Price Range: ₹{minPrice.toLocaleString('en-IN')} - ₹{maxPrice.toLocaleString('en-IN')}
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    type="number"
                    min="0"
                    max={maxPrice}
                    value={minPrice}
                    onChange={e => setMinPrice(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Min"
                  />
                  <input
                    type="number"
                    min={minPrice}
                    value={maxPrice}
                    onChange={e => setMaxPrice(Math.max(minPrice, Number(e.target.value)))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Max"
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max={priceMaxBound}
                  value={maxPrice}
                  onChange={e => setMaxPrice(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4">
        {filteredDesigns.length === 0 ? (
          <p className="py-16 text-center text-sm font-semibold text-gray-500">No designs match your filters.</p>
        ) : useViewGrid ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {filteredDesigns.map((design, index) => (
              <div key={design.id} className="bg-white rounded-2xl overflow-hidden ring-1 ring-gray-200/90">
                <button
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  className="group relative w-full"
                >
                  <div className="aspect-[3/4] bg-gray-100 relative">
                    <img
                      src={designThumbSrc(design)}
                      alt={design.name || catalogueLabel(design) || 'Design'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      draggable={false}
                    />
                    {catalogueLabel(design) && (
                      <span className="absolute top-2 left-2 bg-white/95 backdrop-blur shadow-sm text-gray-900 text-[10px] font-bold px-2 py-0.5 rounded-lg max-w-[90%] truncate">
                        {catalogueLabel(design)}
                      </span>
                    )}
                  </div>
                </button>
                <div className="flex">
                  {orderedLines[design.id] ? (
                    <>
                      <p className="flex-1 py-2 text-[11px] font-black uppercase tracking-wide bg-emerald-600 text-white text-center">
                        Ordered
                      </p>
                      <button
                        type="button"
                        onClick={() => handleBuyNow(design, true)}
                        className="px-3 bg-emerald-700 text-white"
                        aria-label="Edit order"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleBuyNow(design)}
                      className="w-full py-2 text-[11px] font-black uppercase tracking-wide bg-green-600 text-white"
                    >
                      Order Now
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8 max-w-4xl mx-auto">
            {Object.keys(groupedOneByOne).sort((a, b) => a.localeCompare(b)).map(group => (
              <div key={group} className="space-y-4">
                {Object.keys(groupedOneByOne).length > 1 && (
                  <h3 className="text-xl font-black text-gray-900">{group}</h3>
                )}
                <div className="grid grid-cols-1 gap-6">
                  {groupedOneByOne[group].map(design => {
                    const index = filteredDesigns.findIndex(item => item.id === design.id);
                    const lines = getShareAttachLines(design, display.options, display.selectedPriceType, firmName);
                    return (
                      <div key={design.id} className="bg-white rounded-2xl overflow-hidden ring-1 ring-gray-200/90">
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(index)}
                          className="block w-full aspect-[3/4] bg-gray-100 relative"
                        >
                          <img
                            src={designThumbSrc(design)}
                            alt={design.name || catalogueLabel(design) || 'Design'}
                            className="w-full h-full object-cover"
                          />
                          {catalogueLabel(design) && (
                            <span className="absolute top-2 left-2 bg-white/95 backdrop-blur shadow-sm text-gray-900 text-[10px] font-bold px-2 py-0.5 rounded-lg max-w-[90%] truncate">
                              {catalogueLabel(design)}
                            </span>
                          )}
                        </button>
                        <div className="p-4 space-y-2">
                          {lines.map(line => (
                            <p key={`${design.id}-${line.label}`} className="text-sm font-semibold text-gray-800">
                              <span className="text-[10px] font-black uppercase tracking-wide text-gray-400 mr-2">{line.label}</span>
                              {line.value}
                            </p>
                          ))}
                          {orderedLines[design.id] ? (
                            <div className="flex items-center gap-2 mt-2">
                              <p className="flex-1 py-2 rounded-lg text-sm font-bold text-center bg-emerald-600 text-white uppercase">
                                Ordered
                              </p>
                              <button
                                type="button"
                                onClick={() => handleBuyNow(design, true)}
                                className="p-2 rounded-lg bg-emerald-50 text-emerald-800"
                                aria-label="Edit order"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleBuyNow(design)}
                              className="w-full mt-2 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white"
                            >
                              <ShoppingCart className="w-4 h-4" />
                              Order Now
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {lightboxIndex != null && filteredDesigns[lightboxIndex] && (
        <ViewModeLightbox
          designs={filteredDesigns}
          index={lightboxIndex}
          options={display.options}
          selectedPriceType={display.selectedPriceType}
          userFirmName={firmName}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          orderedQuantity={filteredDesigns[lightboxIndex] ? orderedLines[filteredDesigns[lightboxIndex].id]?.quantity || null : null}
          onOrderNow={design => {
            setLightboxIndex(null);
            handleBuyNow(design);
          }}
          onEditOrder={design => {
            setLightboxIndex(null);
            handleBuyNow(design, true);
          }}
        />
      )}

      {orderDesign && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{editingOrder ? 'Edit order' : 'Order Now'}</h3>
              <button
                type="button"
                onClick={() => {
                  setOrderDesign(null);
                  setOrderSuccess(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">{orderDesign.name || catalogueLabel(orderDesign) || 'Design'}</p>
            <p className="text-xs text-gray-500">
              {savedBuyerName
                ? `Ordering as ${savedBuyerName}. Enter quantity only.`
                : 'Enter your name once and quantity. Add more designs and they will stay in one order form.'}
            </p>
            <div className="space-y-3">
              {orderSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm font-semibold p-3 rounded-lg">
                  {orderSuccess}
                </div>
              )}
              {!savedBuyerName && (
                <input
                  type="text"
                  placeholder="Your Name"
                  className="w-full px-4 py-2 border rounded-lg"
                  value={orderForm.buyerName}
                  onChange={e => setOrderForm({ ...orderForm, buyerName: e.target.value })}
                />
              )}
              <input
                type="number"
                min={1}
                placeholder="Quantity"
                className="w-full px-4 py-2 border rounded-lg"
                value={orderForm.quantity}
                onChange={e => setOrderForm({ ...orderForm, quantity: Number(e.target.value) })}
              />
              <textarea
                placeholder="Remark (optional)"
                className="w-full px-4 py-2 border rounded-lg text-sm"
                rows={2}
                value={orderForm.remarks}
                onChange={e => setOrderForm({ ...orderForm, remarks: e.target.value })}
              />
              <button
                type="button"
                onClick={() => {
                  if (orderSuccess) {
                    setOrderDesign(null);
                    setOrderSuccess(null);
                    setEditingOrder(false);
                  } else {
                    submitOrder();
                  }
                }}
                disabled={placingOrder}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-bold"
              >
                {placingOrder ? 'Saving...' : orderSuccess ? 'Done' : editingOrder ? 'Update order' : 'Order Now'}
              </button>
              {editingOrder && !orderSuccess && (
                <button
                  type="button"
                  onClick={removeOrderedDesign}
                  disabled={placingOrder}
                  className="w-full bg-white border border-rose-200 text-rose-700 py-2 rounded-lg font-bold"
                >
                  Cancel this design
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
