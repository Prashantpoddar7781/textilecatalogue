import React from 'react';

interface Props {
  onDelete: () => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

/** Confirms, then deletes the open voucher. Shown only while an existing entry is open. */
export const DeleteEntryButton: React.FC<Props> = ({
  onDelete,
  disabled = false,
  className = 'rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-rose-700 disabled:opacity-60'
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => {
      if (!window.confirm('Delete this entry? It will be removed from the books.')) return;
      void onDelete();
    }}
    className={className}
  >
    Delete entry
  </button>
);
