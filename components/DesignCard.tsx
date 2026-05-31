
import React, { useRef } from 'react';
import { Trash2, CheckCircle, IndianRupee, Edit, Link2, Package, Eye } from 'lucide-react';
import { TextileDesign } from '../types';
import { DesignBarcode } from './DesignBarcode';

function formatInventory(design: TextileDesign): string {
  const qty = design.stockQuantity ?? 0;
  if (qty <= 0) return 'Out of stock';
  const unit = design.stockUnit || 'pcs';
  return `${qty} ${unit}`;
}

interface Props {
  design: TextileDesign;
  isSelected: boolean;
  selectionMode: boolean;
  onCardClick: () => void;
  onImageLongPress: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onView: () => void;
  onShareLink?: () => void;
}

const LONG_PRESS_MS = 500;

export const DesignCard: React.FC<Props> = ({
  design,
  isSelected,
  selectionMode,
  onCardClick,
  onImageLongPress,
  onDelete,
  onEdit,
  onView,
  onShareLink
}) => {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onImageLongPress();
    }, LONG_PRESS_MS);
  };

  const handleImageClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    onCardClick();
  };

  return (
    <div
      className={`group relative bg-white rounded-2xl overflow-hidden transition-all active:scale-95 touch-manipulation ring-1 ring-gray-200/90 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] ${
        isSelected ? 'ring-2 ring-indigo-600 ring-offset-2 ring-offset-[#FDFDFF] shadow-xl' : ''
      } ${selectionMode && !isSelected ? 'opacity-95' : ''}`}
    >
      <div
        className="aspect-[3/4] overflow-hidden bg-gray-100 relative select-none"
        onClick={handleImageClick}
        onTouchStart={startLongPress}
        onTouchEnd={clearLongPressTimer}
        onTouchMove={clearLongPressTimer}
        onTouchCancel={clearLongPressTimer}
        onMouseDown={startLongPress}
        onMouseUp={clearLongPressTimer}
        onMouseLeave={clearLongPressTimer}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src={design.image}
          alt={design.fabric}
          className="w-full h-full object-cover pointer-events-none"
          loading="lazy"
          draggable={false}
        />

        {design.aiModels && design.aiModels.length > 0 && (
          <div className="absolute bottom-2 left-2 flex -space-x-2 z-10 pointer-events-none">
            {design.aiModels.slice(0, 3).map((img, i) => (
              <div key={i} className="w-6 h-6 rounded-full border-2 border-white overflow-hidden shadow-sm">
                <img src={img} className="w-full h-full object-cover" alt="" />
              </div>
            ))}
            {design.aiModels.length > 3 && (
              <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-900 text-white flex items-center justify-center text-[8px] font-black">
                +{design.aiModels.length - 3}
              </div>
            )}
          </div>
        )}

        <div className="absolute top-2 left-2 flex flex-wrap gap-1 pointer-events-none">
          <span className="bg-white/95 backdrop-blur shadow-sm text-gray-900 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase">
            {design.fabric}
          </span>
          {(design.stockQuantity ?? 0) <= 0 && (
            <span className="bg-red-500/95 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase">
              Out of stock
            </span>
          )}
        </div>

        {isSelected && (
          <div className="absolute inset-0 bg-indigo-600/10 flex items-center justify-center pointer-events-none">
            <div className="bg-indigo-600 text-white p-1.5 rounded-full shadow-lg scale-125">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
        )}

        {!selectionMode && (
          <div className="absolute bottom-2 right-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
            <span className="bg-black/55 text-white text-[9px] font-semibold px-2 py-1 rounded-lg">
              Hold to share
            </span>
          </div>
        )}
      </div>

      <div
        className="p-3 bg-white/80 backdrop-blur-sm cursor-pointer"
        onClick={handleImageClick}
      >
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Price</span>
          <div className="flex items-center text-lg font-black text-gray-900 leading-tight">
            <IndianRupee className="w-3.5 h-3.5" />
            <span>{(design.basePrice || design.retailPrice || 0).toLocaleString()}</span>
          </div>
        </div>
        <div className={`flex items-center gap-1 mt-1.5 text-[11px] font-semibold ${(design.stockQuantity ?? 0) <= 0 ? 'text-red-600' : 'text-gray-600'}`}>
          <Package className="w-3 h-3" />
          {formatInventory(design)}
        </div>
        <p className="text-xs font-bold text-gray-900 line-clamp-1 mt-1">
          {design.name || 'Untitled Design'}
        </p>
        {design.catalogueName && (
          <p className="text-[10px] text-indigo-600 font-medium mt-0.5">
            {design.catalogueName}
          </p>
        )}
        <p className="text-xs text-gray-500 line-clamp-1 mt-1 font-medium italic">
          {design.description}
        </p>
        <DesignBarcode design={design} />

        <div className="grid grid-cols-4 gap-1.5 mt-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onView();
            }}
            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-gray-50 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 transition-colors"
            title="View details"
          >
            <Eye className="w-4 h-4" />
            <span className="text-[9px] font-bold uppercase tracking-tight">View</span>
          </button>
          <button
            type="button"
            disabled={!onShareLink || (design.stockQuantity ?? 0) <= 0}
            onClick={e => {
              e.stopPropagation();
              onShareLink?.();
            }}
            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-gray-50 hover:bg-green-50 text-gray-700 hover:text-green-700 transition-colors disabled:opacity-40 disabled:hover:bg-gray-50 disabled:cursor-not-allowed"
            title={(design.stockQuantity ?? 0) <= 0 ? 'Out of stock' : 'Share link for this design only'}
          >
            <Link2 className="w-4 h-4" />
            <span className="text-[9px] font-bold uppercase tracking-tight leading-tight text-center">Get link</span>
          </button>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onEdit();
            }}
            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-gray-50 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 transition-colors"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
            <span className="text-[9px] font-bold uppercase tracking-tight">Edit</span>
          </button>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-gray-50 hover:bg-red-50 text-gray-700 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-[9px] font-bold uppercase tracking-tight">Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
