import React, { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { ShareOptions, TextileDesign } from '../types';
import { loadSharePreferences, saveSharePreferences } from '../services/sharePreferences';
import { ShareDetailsOptions } from './ShareDetailsOptions';

interface Props {
  designs: TextileDesign[];
  onClose: () => void;
  onStart: (options: ShareOptions, selectedPriceType: string) => void;
}

export const ViewModeOptionsDialog: React.FC<Props> = ({ designs, onClose, onStart }) => {
  const [options, setOptions] = useState<ShareOptions>(() => loadSharePreferences().options);
  const [selectedPriceType, setSelectedPriceType] = useState(() => loadSharePreferences().selectedPriceType);

  useEffect(() => {
    saveSharePreferences({ options, selectedPriceType });
  }, [options, selectedPriceType]);

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

        <div className="flex-1 overflow-y-auto p-4">
          <ShareDetailsOptions
            designs={designs}
            options={options}
            selectedPriceType={selectedPriceType}
            onOptionsChange={setOptions}
            onPriceTypeChange={setSelectedPriceType}
          />
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
