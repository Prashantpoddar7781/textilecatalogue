import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, IndianRupee } from 'lucide-react';
import { shareLinksApi } from '../services/api';
import { ShareLink, TextileDesign } from '../types';

export const ShareView: React.FC<{ token: string }> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-6 sm:p-8">
            {designs.map((design) => {
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
                  </div>
                </div>
              );
            })}
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
    </div>
  );
};
