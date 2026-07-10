import React, { useEffect, useRef } from 'react';
import { Loader2, Save, X } from 'lucide-react';

interface Props {
  open: boolean;
  saving?: boolean;
  title?: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ErpSaveConfirmDialog: React.FC<Props> = ({
  open,
  saving,
  title = 'Save this entry?',
  message = 'Press Yes to save or No to continue editing.',
  onConfirm,
  onCancel
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="erp-save-confirm-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="erp-save-confirm-title" className="text-base font-black text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-600">{message}</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-60"
          >
            No
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Yes, Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
