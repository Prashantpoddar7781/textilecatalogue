import React, { createContext, useContext } from 'react';
import { useErpFormKeyboard } from '../hooks/useErpFormKeyboard';
import { ErpSaveConfirmDialog } from './ErpSaveConfirmDialog';

interface ErpFormContextValue {
  requestSave: () => void;
}

const ErpFormContext = createContext<ErpFormContextValue | null>(null);

export function useErpFormActions() {
  const ctx = useContext(ErpFormContext);
  return ctx;
}

interface Props {
  children: React.ReactNode;
  onSave: () => void | Promise<void>;
  saving?: boolean;
  disabled?: boolean;
  className?: string;
  showHint?: boolean;
  confirmTitle?: string;
  confirmMessage?: string;
}

export const ErpFormShell: React.FC<Props> = ({
  children,
  onSave,
  saving = false,
  disabled = false,
  className = '',
  showHint = true,
  confirmTitle,
  confirmMessage
}) => {
  const {
    containerRef,
    confirmOpen,
    confirmSave,
    cancelSave,
    handleKeyDown,
    requestSave
  } = useErpFormKeyboard(onSave, { disabled, saving });

  return (
    <ErpFormContext.Provider value={{ requestSave }}>
      <div
        ref={containerRef}
        data-erp-form
        className={className}
        onKeyDownCapture={handleKeyDown}
      >
        {children}
        {showHint && (
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Enter → next field · ↑ previous · F9 or Enter on last field → save
          </p>
        )}
      </div>
      <ErpSaveConfirmDialog
        open={confirmOpen}
        saving={saving}
        title={confirmTitle}
        message={confirmMessage}
        onConfirm={confirmSave}
        onCancel={cancelSave}
      />
    </ErpFormContext.Provider>
  );
};
