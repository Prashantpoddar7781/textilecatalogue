import { useCallback, useEffect, useRef, useState } from 'react';

const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]):not([data-erp-skip-nav])',
  'select:not([disabled]):not([data-erp-skip-nav])',
  'textarea:not([disabled]):not([data-erp-skip-nav])'
].join(', ');

export function getNavigableFields(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(el => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  });
}

interface Options {
  disabled?: boolean;
  saving?: boolean;
}

export function useErpFormKeyboard(onSave: () => void | Promise<void>, options: Options = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { disabled = false, saving = false } = options;

  const requestSave = useCallback(() => {
    if (disabled || saving) return;
    setConfirmOpen(true);
  }, [disabled, saving]);

  const confirmSave = useCallback(() => {
    setConfirmOpen(false);
    void onSave();
  }, [onSave]);

  const cancelSave = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  const focusField = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const fields = getNavigableFields(container);
    const field = fields[index];
    if (!field) return;
    field.focus();
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      const value = field.value;
      field.setSelectionRange?.(value.length, value.length);
    }
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (disabled || saving || confirmOpen) return;

    const target = event.target as HTMLElement | null;
    const container = containerRef.current;
    if (!target || !container?.contains(target)) return;
    if (target.closest('[data-erp-skip-nav]')) return;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    const fields = getNavigableFields(container);
    const currentIndex = fields.indexOf(target);
    if (currentIndex === -1) return;

    if (event.key === 'F9') {
      event.preventDefault();
      requestSave();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (currentIndex > 0) focusField(currentIndex - 1);
      return;
    }

    if (event.key === 'Enter') {
      if (target instanceof HTMLTextAreaElement && event.shiftKey) return;

      event.preventDefault();
      if (currentIndex === fields.length - 1) {
        requestSave();
      } else {
        focusField(currentIndex + 1);
      }
    }
  }, [confirmOpen, disabled, focusField, requestSave, saving]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F9' || disabled || saving || confirmOpen) return;
      const container = containerRef.current;
      if (!container?.contains(document.activeElement)) return;
      event.preventDefault();
      setConfirmOpen(true);
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [confirmOpen, disabled, saving]);

  return {
    containerRef,
    confirmOpen,
    confirmSave,
    cancelSave,
    handleKeyDown,
    requestSave
  };
}
