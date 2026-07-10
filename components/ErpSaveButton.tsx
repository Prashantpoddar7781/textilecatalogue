import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { useErpFormActions } from './ErpFormShell';

interface Props {
  saving?: boolean;
  disabled?: boolean;
  label?: string;
  savingLabel?: string;
  className?: string;
}

export const ErpSaveButton: React.FC<Props> = ({
  saving = false,
  disabled = false,
  label = 'Save',
  savingLabel = 'Saving...',
  className = 'flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-black text-white disabled:opacity-60'
}) => {
  const actions = useErpFormActions();

  return (
    <button
      type="button"
      onClick={() => actions?.requestSave()}
      disabled={saving || disabled}
      className={className}
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {saving ? savingLabel : label}
    </button>
  );
};
