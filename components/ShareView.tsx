import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, IndianRupee, ShoppingCart } from 'lucide-react';
import { shareLinksApi, ordersApi } from '../services/api';
import { ShareLink, TextileDesign } from '../types';

export const ShareView: React.FC<{ token: string }> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [orderDesign, setOrderDesign] = useState<TextileDesign | null>(null);
  const [orderForm, setOrderForm] = useState({
    buyerName: '',
    buyerPhone: '',
    quantity: 1
  });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadShareLink();
  }, [token]);

  const loadShareLink = async () => {
    try {
      setLoading(true);
      setError(null);
      const link = await shareLinksApi.getByToken(token);
      setShareLink(link);
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
      buyerName: '',
      buyerPhone: '',
      quantity: 1
    });
    setOrderSuccess(null);
  };

  const submitOrder = async () => {
    if (!orderDesign) return;
    if (!orderForm.buyerName.trim() || !orderForm.buyerPhone.trim() || orderForm.quantity < 1) {
      alert('Please enter name, phone number, and quantity.');
      return;
    }

    try {
      setPlacingOrder(true);
      const result = await ordersApi.createPublic({
        token,
        designId: orderDesign.id,
        buyerName: orderForm.buyerName.trim(),
        buyerPhone: orderForm.buyerPhone.trim(),
        quantity: Number(orderForm.quantity)
      });
      if (result.order?.id) {
        setOrderSuccess('Order placed successfully!');
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
            <p className="text-sm text-gray-500">Shared via TextileHub</p>
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
                  {groupedDesigns[fabric].map((design) => {
                    const { displayPrice, priceLabel } = getDisplayPrice(design);
                    return (
                      <div key={design.id} className="bg-gray-50 rounded-xl overflow-hidden">
                        <div className="aspect-[3/4] bg-gray-100 overflow-hidden">
                          <img 
                            src={design.image} 
                            alt={design.name || 'Design'} 
                            className="w-full h-full object-cover"
                          />
                        </div>
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
                          {design.description && (
                            <p className="text-xs text-gray-600 line-clamp-2">{design.description}</p>
                          )}
                          <button
                            onClick={() => handleBuyNow(design)}
                            className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                          >
                            <ShoppingCart className="w-4 h-4" />
                            Buy Now
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
          <p>Shared via TextileHub</p>
        </div>
      </div>
      
      {orderDesign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Place Order</h3>
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
            <div className="space-y-3">
              {orderSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm font-semibold p-3 rounded-lg">
                  {orderSuccess}
                </div>
              )}
              <input
                type="text"
                placeholder="Your Name"
                className="w-full px-4 py-2 border rounded-lg"
                value={orderForm.buyerName}
                onChange={e => setOrderForm({ ...orderForm, buyerName: e.target.value })}
              />
              <input
                type="text"
                placeholder="Phone Number"
                className="w-full px-4 py-2 border rounded-lg"
                value={orderForm.buyerPhone}
                onChange={e => setOrderForm({ ...orderForm, buyerPhone: e.target.value })}
              />
              <input
                type="number"
                min={1}
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
                {placingOrder ? 'Placing Order...' : orderSuccess ? 'Done' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
