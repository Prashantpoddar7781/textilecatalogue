import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { resolveErpBack } from '../utils/erpBack';

/** Back to the report or ledger this entry was opened from, or to ERP home. */
export const ErpPageBack: React.FC<{ onBack: () => void; className?: string }> = ({ onBack, className }) => {
  const back = resolveErpBack();
  const cls = className || 'inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900';
  if (!back) {
    return (
      <button type="button" onClick={onBack} className={cls}>
        <ArrowLeft className="h-4 w-4" /> Back to ERP
      </button>
    );
  }
  return (
    <button type="button" onClick={() => { window.location.href = back.href; }} className={cls}>
      <ArrowLeft className="h-4 w-4" /> {back.label}
    </button>
  );
};
