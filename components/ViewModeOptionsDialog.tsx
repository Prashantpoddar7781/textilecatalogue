import React, { useEffect, useState } from 'react';
import { CheckSquare, Eye, Square, X } from 'lucide-react';
import { ShareOptions, TextileDesign } from '../types';
import { loadSharePreferences, saveSharePreferences } from '../services/sharePreferences';
import { uniqueAdditionalPriceNames } from '../utils/shareAttachDetails';

interface Props {
  designs: TextileDesign[];
  onClose: () => void;
  onStart: (options: ShareOptions, selectedPriceType: string) => void;
}

export const ViewModeOptionsDialog: React.FC<Props> = ({ designs, onClose, onStart }) => {
  const [options, setOptions] = useState<ShareOptions>(() => loadSharePreferences().options);
  const [selectedPriceType, setSelectedPriceType] = useState(() => loadSharePreferences().selectedPriceType);
  const extraPrices = uniqueAdditionalPriceNames(designs);

  useEffect(() => {
    saveSharePreferences({ options, selectedPriceType });
  }, [options, selectedPriceType]);

  const toggle = (key: keyof ShareOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">View mode</p>
            <h2 className="text-lg font-black text-gray-900">What should appear on designs?</h2>
            <p className="text-xs text-gray-500 mt-1">Same choices as WhatsApp share. Tap a photo later to see them full screen.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                onClick={() => setSelectedPriceType('base')}
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
                  onClick={() => setSelectedPriceType(name)}
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

        <div className="p-4 border-t bg-gray-50">
          <button
            type="button"
            onClick={() => onStart(options, selectedPriceType)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-700 py-3 text-sm font-black uppercase text-white"
          >
            <Eye className="w-4 h-4" />
            Start viewing
          </button>
        </div>
      </div>
    </div>
  );
};
