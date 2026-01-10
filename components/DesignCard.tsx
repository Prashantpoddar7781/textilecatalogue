
import React from 'react';
import { Trash2, CheckCircle, IndianRupee } from 'lucide-react';
import { TextileDesign } from '../types';

interface Props {
  design: TextileDesign;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export const DesignCard: React.FC<Props> = ({ design, isSelected, onSelect, onDelete }) => {
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
        
        <div className="absolute top-2 left-2">
          <span className="bg-white/95 backdrop-blur shadow-sm text-gray-900 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase">
            {design.fabric}
          </span>
        </div>

        {isSelected && (
          <div className="absolute inset-0 bg-indigo-600/10 flex items-center justify-center">
            <div className="bg-indigo-600 text-white p-1.5 rounded-full shadow-lg scale-125">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute bottom-2 right-2 bg-white/90 text-red-500 p-2 rounded-xl shadow-md sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 bg-white">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Retail</span>
          <div className="flex items-center text-lg font-black text-gray-900 leading-tight">
            <IndianRupee className="w-3.5 h-3.5" />
            <span>{design.retailPrice.toLocaleString()}</span>
          </div>
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
      </div>
    </div>
  );
};
