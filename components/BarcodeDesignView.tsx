import React, { useEffect, useState } from 'react';
import { AlertCircle, IndianRupee, Loader2 } from 'lucide-react';
import { designsApi } from '../services/api';
import { TextileDesign } from '../types';

export const BarcodeDesignView: React.FC<{ designId: string }> = ({ designId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [design, setDesign] = useState<TextileDesign | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await designsApi.getPublicById(designId);
        setDesign({
          id: response.id,
          name: response.name || 'Untitled Design',
          image: response.image,
          designCode: response.designCode || undefined,
          basePrice: response.basePrice || response.retailPrice || 0,
          wholesalePrice: response.wholesalePrice || response.basePrice || 0,
          retailPrice: response.retailPrice || response.basePrice || 0,
          fabric: response.fabric || 'N/A',
          description: response.description || '',
          createdAt: Date.now()
        });
      } catch (err: any) {
        setError(err.message || 'Design not found');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [designId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-3" />
          <p className="text-gray-600">Loading design details...</p>
        </div>
      </div>
    );
  }

  if (error || !design) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <div className="inline-flex p-4 rounded-full bg-red-100 mb-4">
            <AlertCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Barcode not valid</h1>
          <p className="text-gray-600">{error || 'Unable to find this design.'}</p>
        </div>
      </div>
    );
  }

  const displayPrice = design.basePrice || design.retailPrice || 0;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        <img src={design.image} alt={design.name || 'Design'} className="w-full aspect-[3/4] object-cover bg-gray-100" />
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Design Details</p>
            <h1 className="text-2xl font-black text-gray-900 mt-1">{design.name || 'Untitled Design'}</h1>
            {design.designCode && (
              <p className="text-sm text-gray-500 mt-1">Design Number: <span className="font-semibold text-gray-700">{design.designCode}</span></p>
            )}
          </div>

          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</p>
            <div className="mt-1 flex items-center text-2xl font-black text-gray-900">
              <IndianRupee className="w-5 h-5" />
              <span>{displayPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
