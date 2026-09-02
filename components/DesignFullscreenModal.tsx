import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, IndianRupee, Package } from 'lucide-react';
import { TextileDesign } from '../types';
import { DesignBarcode } from './DesignBarcode';
import { designFullSrc } from '../services/designMedia';

interface Props {
  design: TextileDesign | null;
  onClose: () => void;
}

export const DesignFullscreenModal: React.FC<Props> = ({ design, onClose }) => {
  const images = useMemo(() => {
    if (!design) return [];
    return [designFullSrc(design), ...(design.aiModels || [])];
  }, [design]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [design?.id]);

  const go = useCallback(
    (delta: number) => {
      if (images.length === 0) return;
      setIndex(i => (i + delta + images.length) % images.length);
    },
    [images.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go]);

  if (!design || images.length === 0) return null;

  const label = index === 0 ? 'Product' : `AI variant ${index}`;
  const displayPrice = design.basePrice || design.retailPrice || 0;
  const stockLabel = `${design.stockQuantity ?? 0} ${design.stockUnit || 'pcs'}`;
  const materialTotal = (design.costingDetails?.materials || []).reduce((sum, m) => sum + (Number(m.rate) || 0) * (Number(m.avgPerPcs) || 0), 0);
  const jobTotal = (design.costingDetails?.jobs || []).reduce((sum, j) => sum + (Number(j.rate) || 0), 0);
  const otherTotal = (design.costingDetails?.otherCosts || []).reduce((sum, c) => sum + (Number(c.rate) || 0), 0);
  const grandTotal = materialTotal + jobTotal + otherTotal;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Design details"
    >
      <div className="max-w-4xl mx-auto bg-white rounded-2xl overflow-hidden shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white">
          <p className="text-gray-900 text-sm font-bold truncate pr-4">
            {design.name || 'Design'} · {label}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-0">
          <div className="relative bg-gray-100">
            <img
              src={images[index]}
              alt={design.name || 'Design'}
              className="w-full h-full max-h-[420px] object-contain select-none"
              draggable={false}
            />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          <div className="p-4 sm:p-5 space-y-3">
            <div>
              <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Design Details</p>
              <h2 className="text-xl font-black text-gray-900 mt-1">{design.name || 'Untitled Design'}</h2>
              {design.designCode && (
                <p className="text-sm text-gray-600 mt-1">
                  Design Number: <span className="font-semibold text-gray-800">{design.designCode}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Price</p>
                <div className="flex items-center text-lg font-black text-gray-900 mt-0.5">
                  <IndianRupee className="w-4 h-4" />
                  <span>{displayPrice.toLocaleString('en-IN')}</span>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Stock</p>
                <div className={`mt-0.5 text-sm font-bold ${(design.stockQuantity ?? 0) <= 0 ? 'text-red-600' : 'text-gray-800'}`}>
                  <span className="inline-flex items-center gap-1">
                    <Package className="w-4 h-4" />
                    {stockLabel}
                  </span>
                </div>
              </div>
            </div>

            {design.fabric && (
              <p className="text-sm text-gray-700">
                Fabric: <span className="font-semibold">{design.fabric}</span>
              </p>
            )}
            {design.description && (
              <p className="text-sm text-gray-600">{design.description}</p>
            )}

            <DesignBarcode design={design} />

            {!!design.costingDetails && (
              <div className="mt-2 border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Costing Details</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <p className="text-gray-600">Material Cost</p><p className="text-right font-semibold text-gray-900">₹{materialTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  <p className="text-gray-600">Job Cost</p><p className="text-right font-semibold text-gray-900">₹{jobTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  <p className="text-gray-600">Other Cost</p><p className="text-right font-semibold text-gray-900">₹{otherTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  <p className="text-gray-900 font-bold">Total Cost</p><p className="text-right font-black text-indigo-700">₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {images.length > 1 && (
          <div className="flex justify-center gap-2 py-3 px-4 border-t border-gray-100 bg-gray-50">
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                  i === index ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200 opacity-70'
                }`}
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
