import React from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { ShareOptions, TextileDesign } from '../types';
import { uniqueAdditionalPriceNames } from '../utils/shareAttachDetails';

interface Props {
  designs: TextileDesign[];
  options: ShareOptions;
  selectedPriceType: string;
  onOptionsChange: (options: ShareOptions) => void;
  onPriceTypeChange: (value: string) => void;
}

export const ShareDetailsOptions: React.FC<Props> = ({
  designs,
  options,
  selectedPriceType,
  onOptionsChange,
  onPriceTypeChange
}) => {
  const extraPrices = uniqueAdditionalPriceNames(designs);
  const toggle = (key: keyof ShareOptions) => {
    onOptionsChange({ ...options, [key]: !options[key] });
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => toggle('includeRetail')}
        className={`flex w-full items-center gap-3 p-4 rounded-2xl border-2 text-left ${
          options.includeRetail ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-gray-50 text-gray-400'
        }`}
      >
        {options.includeRetail ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5" />}
        <span className="font-bold text-xs uppercase tracking-tight">Price</span>
      </button>

      {options.includeRetail && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onPriceTypeChange('base')}
            className={`p-3 rounded-xl border-2 text-left text-xs font-bold ${
              selectedPriceType === 'base' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200'
            }`}
          >
            Base Price
          </button>
          {extraPrices.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => onPriceTypeChange(name)}
              className={`p-3 rounded-xl border-2 text-left text-xs font-bold ${
                selectedPriceType === name ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[
          { key: 'includeCatalogueName' as const, label: 'Catalogue name' },
          { key: 'includeDesignName' as const, label: 'Design name / No.' },
          { key: 'includeFabric' as const, label: 'Fabric Info' },
          { key: 'includeDescription' as const, label: 'Description' },
          { key: 'includeFirmName' as const, label: 'Firm Name' }
        ].map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => toggle(opt.key)}
            className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left ${
              options[opt.key] ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-gray-50 text-gray-400'
            }`}
          >
            {options[opt.key] ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5" />}
            <span className="font-bold text-xs uppercase tracking-tight">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
