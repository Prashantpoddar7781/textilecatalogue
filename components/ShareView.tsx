import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, AlertCircle, IndianRupee, ShoppingCart, X, Maximize2, Package } from 'lucide-react';
import { shareLinksApi, ordersApi } from '../services/api';
import { getShareDeviceToken } from '../services/shareDeviceToken';
import { ShareLink, TextileDesign } from '../types';

const SESSION_KEY = 'threadx_share_session';
const BUYER_NAME_KEY_PREFIX = 'threadx_share_buyer_name_';

function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function getTouchDistance(touches: TouchList): number {
  if (touches.length < 2) return 0;
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

const FullScreenDesignView: React.FC<{
  design: TextileDesign;
  token: string;
  onClose: () => void;
}> = ({ design, token, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const positionRef = useRef(position);
  const isDragging = useRef(false);
  const isPinching = useRef(false);
  const startPos = useRef({ x: 0, y: 0, imgX: 0, imgY: 0 });
  const pinchStart = useRef({ dist: 0, zoom: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  positionRef.current = position;

  // Record view when full-screen modal opens (once per session)
  useEffect(() => {
    const viewKey = `share_view_${token}_${design.id}`;
    if (sessionStorage.getItem(viewKey)) return;
    sessionStorage.setItem(viewKey, '1');
    const sessionId = getOrCreateSessionId();
    shareLinksApi.recordDesignView(token, design.id, sessionId).catch(() => {});
  }, [token, design.id]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => Math.min(4, Math.max(0.5, z + delta)));
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    isDragging.current = true;
    startPos.current = { x: e.clientX, y: e.clientY, imgX: position.x, imgY: position.y };
  }, [zoom, position]);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPosition({
      x: startPos.current.imgX + e.clientX - startPos.current.x,
      y: startPos.current.imgY + e.clientY - startPos.current.y
    });
  }, []);
  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isPinching.current = true;
      isDragging.current = false;
      pinchStart.current = { dist: getTouchDistance(e.touches), zoom };
    } else if (e.touches.length === 1) {
      isDragging.current = true;
      startPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        imgX: positionRef.current.x,
        imgY: positionRef.current.y
      };
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getTouchDistance(e.touches);
      if (pinchStart.current.dist > 0) {
        const scale = dist / pinchStart.current.dist;
        const newZoom = Math.min(4, Math.max(0.5, pinchStart.current.zoom * scale));
        setZoom(newZoom);
      }
    } else if (e.touches.length === 1 && isDragging.current) {
      setPosition({
        x: startPos.current.imgX + e.touches[0].clientX - startPos.current.x,
        y: startPos.current.imgY + e.touches[0].clientY - startPos.current.y
      });
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) isPinching.current = false;
    if (e.touches.length === 0) {
      isDragging.current = false;
    } else if (e.touches.length === 1) {
      startPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        imgX: positionRef.current.x,
        imgY: positionRef.current.y
      };
    }
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Prevent browser zoom during pinch - need passive: false
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    el.addEventListener('touchmove', preventZoom, { passive: false });
    return () => el.removeEventListener('touchmove', preventZoom);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      style={{ touchAction: 'none' }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <h3 className="text-white font-bold truncate max-w-[60%]">{design.name || 'Design'}</h3>
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={resetView}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs font-medium transition-colors"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={design.image}
          alt={design.name || 'Design'}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
          }}
          draggable={false}
        />
      </div>
      <p className="text-center text-white/70 text-xs pb-4">
        Pinch to zoom • Drag to pan
      </p>
    </div>
  );
};

const DesignViewCard: React.FC<{
  design: TextileDesign;
  token: string;
  getDisplayPrice: (d: TextileDesign) => { displayPrice: number; priceLabel: string };
  onBuyNow: (d: TextileDesign) => void;
  onViewFullScreen: (d: TextileDesign) => void;
}> = ({ design, token, getDisplayPrice, onBuyNow, onViewFullScreen }) => {
  const { displayPrice, priceLabel } = getDisplayPrice(design);
  return (
    <div className="bg-gray-50 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => onViewFullScreen(design)}
        className="block w-full aspect-[3/4] bg-gray-100 overflow-hidden relative group focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded-t-xl"
      >
        <img
          src={design.image}
          alt={design.name || 'Design'}
          className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 bg-white/90 text-gray-900 px-4 py-2 rounded-full font-semibold text-sm">
            <Maximize2 className="w-4 h-4" />
            View full screen
          </div>
        </div>
      </button>
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {design.name || 'Untitled Design'}
          </h3>
          {design.catalogueName && (
            <p className="text-indigo-600 font-semibold text-xs uppercase tracking-wide">
              {design.catalogueName}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {priceLabel}
            </p>
            <div className="flex items-center text-xl font-black text-gray-900">
              <IndianRupee className="w-4 h-4" />
              <span>{displayPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fabric</p>
            <p className="text-sm font-bold text-gray-900">{design.fabric}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${(design.stockQuantity ?? 0) <= 0 ? 'text-red-600' : 'text-gray-600'}`}>
          <Package className="w-4 h-4" />
          {`${design.stockQuantity ?? 0} ${design.stockUnit || 'pcs'}`}
        </div>
        {design.description && (
          <p className="text-xs text-gray-600 line-clamp-2">{design.description}</p>
        )}
        <button
          onClick={() => onBuyNow(design)}
          disabled={(design.stockQuantity ?? 0) <= 0}
          className={`w-full mt-2 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
            (design.stockQuantity ?? 0) <= 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          {(design.stockQuantity ?? 0) <= 0 ? 'Not Available' : 'Add to Order'}
        </button>
      </div>
    </div>
  );
};

export const ShareView: React.FC<{ token: string }> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [orderDesign, setOrderDesign] = useState<TextileDesign | null>(null);
  const [fullScreenDesign, setFullScreenDesign] = useState<TextileDesign | null>(null);
  const [savedBuyerName, setSavedBuyerName] = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(`${BUYER_NAME_KEY_PREFIX}${token}`) || '';
  });
  const [orderForm, setOrderForm] = useState({
    buyerName: savedBuyerName,
    quantity: 1
  });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  useEffect(() => {
    const storedName = sessionStorage.getItem(`${BUYER_NAME_KEY_PREFIX}${token}`) || '';
    setSavedBuyerName(storedName);
    setOrderForm(prev => ({ ...prev, buyerName: storedName }));
    loadShareLink();
  }, [token]);

  const loadShareLink = async () => {
    try {
      setLoading(true);
      setError(null);
      const deviceToken = getShareDeviceToken();
      const link = await shareLinksApi.getByToken(token, deviceToken);
      setShareLink(link);
      // Record open once per session (so admin sees "how many people opened")
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading shared design...</p>
        </div>
      </div>
    );
  }

  if (error || !shareLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
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

  const designs = shareLink.designs?.map(d => d.design) || (shareLink.design ? [shareLink.design as TextileDesign] : []);
  const groupedDesigns = designs.reduce((acc: Record<string, TextileDesign[]>, design) => {
    const key = design.fabric || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(design);
    return acc;
  }, {});
  const fabricGroups = Object.keys(groupedDesigns).sort((a, b) => a.localeCompare(b));
  if (designs.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Design not found</p>
        </div>
      </div>
    );
  }

  const getDisplayPrice = (design: TextileDesign) => {
    let displayPrice = design.basePrice || design.retailPrice || 0;
    let priceLabel = 'Price';

    if (shareLink.selectedPriceType && shareLink.selectedPriceType !== 'base') {
      const selectedPrice = design.additionalPrices?.find(ap => ap.name === shareLink.selectedPriceType);
      if (selectedPrice && selectedPrice.calculatedPrice) {
        displayPrice = selectedPrice.calculatedPrice;
        priceLabel = selectedPrice.name;
      }
    }

    return { displayPrice, priceLabel };
  };

  const handleBuyNow = (design: TextileDesign) => {
    setOrderDesign(design);
    setOrderForm({
      buyerName: savedBuyerName,
      quantity: 1
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
      const result = await ordersApi.createPublic({
        token,
        designId: orderDesign.id,
        buyerName,
        orderSessionId: getOrCreateSessionId(),
        quantity: Number(orderForm.quantity)
      });
      if (result.order?.id) {
        if (!savedBuyerName.trim()) {
          sessionStorage.setItem(`${BUYER_NAME_KEY_PREFIX}${token}`, buyerName);
          setSavedBuyerName(buyerName);
        }
        setOrderSuccess('Added to one order form. You can add more designs from this link.');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to place order. Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="p-6 sm:p-8 border-b border-gray-100">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {designs.length === 1 ? (designs[0].name || 'Untitled Design') : `${designs.length} Designs`}
            </h1>
            <p className="text-sm text-gray-500">Shared via ThreadX</p>
          </div>

          {/* Designs Grid */}
          <div className="p-6 sm:p-8 space-y-8">
            {fabricGroups.map((fabric) => (
              <div key={fabric} className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-gray-900">{fabric}</h3>
                  <span className="text-xs text-gray-400 font-semibold">
                    {groupedDesigns[fabric].length} {groupedDesigns[fabric].length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {groupedDesigns[fabric].map((design) => (
                    <DesignViewCard
                      key={design.id}
                      design={design}
                      token={token}
                      getDisplayPrice={getDisplayPrice}
                      onBuyNow={handleBuyNow}
                      onViewFullScreen={setFullScreenDesign}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Firm Name */}
          {designs[0]?.user?.firmName && (
            <div className="p-6 sm:p-8 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                From: <span className="font-semibold text-gray-700">{designs[0].user.firmName}</span>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>Shared via ThreadX</p>
        </div>
      </div>

      {fullScreenDesign && (
        <FullScreenDesignView
          design={fullScreenDesign}
          token={token}
          onClose={() => setFullScreenDesign(null)}
        />
      )}
      
      {orderDesign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Add to Order</h3>
              <button
                onClick={() => {
                  setOrderDesign(null);
                  setOrderSuccess(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-600">{orderDesign.name || 'Design'}</p>
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
              <button
                onClick={() => {
                  if (orderSuccess) {
                    setOrderDesign(null);
                    setOrderSuccess(null);
                  } else {
                    submitOrder();
                  }
                }}
                disabled={placingOrder}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-bold"
              >
                {placingOrder ? 'Adding...' : orderSuccess ? 'Done' : 'Add to Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
