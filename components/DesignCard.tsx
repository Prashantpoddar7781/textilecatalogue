
import React from 'react';
import { Trash2, CheckCircle, IndianRupee, Edit, Link2, Package } from 'lucide-react';
import { TextileDesign } from '../types';

function formatInventory(design: TextileDesign): string {
  const qty = design.stockQuantity ?? 0;
  if (qty <= 0) return 'Out of stock';
  const unit = design.stockUnit || 'pcs';
  return `${qty} ${unit}`;
}

interface Props {
  design: TextileDesign;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onShareLink?: () => void;
}

export const DesignCard: React.FC<Props> = ({ design, isSelected, onSelect, onDelete, onEdit, onShareLink }) => {
  return (
    <div 
      onClick={onSelect}
      className={`group relative bg-white rounded-2xl overflow-hidden border-2 transition-all active:scale-95 touch-manipulation ${
        isSelected ? 'border-indigo-600 ring-4 ring-indigo-50 shadow-xl' : 'border-transparent shadow-sm'
      }`}
    >
      <div className="aspect-[3/4] overflow-hidden bg-gray-100 relative">
        <img 
          src={design.image} 
          alt={design.fabric} 
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {isSelected && (
          <div className="absolute inset-0 bg-indigo-600/10 flex items-center justify-center">
            <div className="bg-indigo-600 text-white p-1.5 rounded-full shadow-lg scale-125">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
        )}

        <div className="absolute bottom-2 right-2 flex gap-2">
          {onShareLink && (design.stockQuantity ?? 0) > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShareLink();
              }}
              className="bg-white/90 text-green-600 p-2 rounded-xl shadow-md sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              title="Create share link"
            >
              <Link2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="bg-white/90 text-indigo-600 p-2 rounded-xl shadow-md sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="bg-white/90 text-red-500 p-2 rounded-xl shadow-md sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-3 bg-white/75 backdrop-blur-sm border-t border-white/50">
        <div className="flex flex-wrap gap-1 mb-1.5">
          <span className="bg-white/70 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
            {design.fabric}
          </span>
          {(design.stockQuantity ?? 0) <= 0 && (
            <span className="bg-red-400/80 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">
              Out of stock
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Price</span>
          <div className="flex items-center text-lg font-black text-gray-700 leading-tight">
            <IndianRupee className="w-3.5 h-3.5" />
            <span>{(design.basePrice || design.retailPrice || 0).toLocaleString()}</span>
          </div>
        </div>
        <div className={`flex items-center gap-1 mt-1.5 text-[11px] font-semibold ${(design.stockQuantity ?? 0) <= 0 ? 'text-red-600' : 'text-gray-600'}`}>
          <Package className="w-3 h-3" />
          {formatInventory(design)}
        </div>
        <p className="text-xs font-bold text-gray-700 line-clamp-1 mt-1">
          {design.name || 'Untitled Design'}
        </p>
        {design.catalogueName && (
          <p className="text-[10px] text-indigo-600/90 font-medium mt-0.5">
            {design.catalogueName}
          </p>
        )}
        <p className="text-xs text-gray-600/90 line-clamp-1 mt-1 font-medium italic">
          {design.description}
        </p>
      </div>
    </div>
  );
};
