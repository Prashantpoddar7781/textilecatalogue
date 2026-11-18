import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

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
      // Cursor at start so keyboard entry can continue without the mouse.
      field.setSelectionRange?.(0, 0);
    }
  }, []);

  const saveArmed = useRef(false);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (disabled || saving || confirmOpen) return;

    const target = event.target as HTMLElement | null;
    const container = containerRef.current;
    if (!target || !container?.contains(target)) return;
    if (target.closest('[data-erp-skip-nav]')) return;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      saveArmed.current = false;
    }

    const fields = getNavigableFields(container);
    const currentIndex = fields.indexOf(target);
    if (currentIndex === -1) return;

    const lineRow = target.closest('[data-erp-line]');
    const lineFields = lineRow ? getNavigableFields(lineRow as HTMLElement) : [];
    const lineHasEntry = (row: Element) => {
      if (row.hasAttribute('data-erp-line-filled')) return true;
      return getNavigableFields(row as HTMLElement).some(field => {
        if (field.hasAttribute('data-erp-line-default') || field instanceof HTMLSelectElement) return false;
        const value = String((field as HTMLInputElement).value || '').trim();
        return value !== '' && value !== '0';
      });
    };
    const emptyForSave = () => {
      if (lineRow) return !lineHasEntry(lineRow);
      if (target.hasAttribute('data-erp-save-if-empty')) {
        return !String((target as HTMLInputElement).value || '').trim();
      }
      return false;
    };

    if (event.key === 'F9') {
      event.preventDefault();
      requestSave();
      return;
    }

    if (event.key === 'ArrowDown') {
      if (target.hasAttribute('data-erp-arrow-custom')) return;
      if (target.hasAttribute('data-erp-save-if-empty')) {
        if (String((target as HTMLInputElement).value || '').trim()) return;
        event.preventDefault();
        saveArmed.current = true;
        return;
      }
      if (!lineRow) return;
      const grid = lineRow.closest('[data-erp-line-grid]');
      const rows = grid ? Array.from(grid.querySelectorAll('[data-erp-line]')) : [];
      const rowIndex = rows.indexOf(lineRow);
      const column = lineFields.indexOf(target);
      event.preventDefault();
      if (rowIndex >= 0 && rowIndex < rows.length - 1) {
        const nextFields = getNavigableFields(rows[rowIndex + 1] as HTMLElement);
        const next = nextFields[Math.min(Math.max(column, 0), nextFields.length - 1)];
        next?.focus();
        saveArmed.current = !lineHasEntry(rows[rowIndex + 1]);
        return;
      }
      if (!lineHasEntry(lineRow)) {
        saveArmed.current = true;
        return;
      }
      const outside = fields.slice(currentIndex + 1).find(field => !field.closest('[data-erp-line]'));
      outside?.focus();
      saveArmed.current = false;
      return;
    }

    if (event.key === 'ArrowUp') {
      if (target.hasAttribute('data-erp-arrow-custom')) return;
      if (lineRow) {
        const grid = lineRow.closest('[data-erp-line-grid]');
        const rows = grid ? Array.from(grid.querySelectorAll('[data-erp-line]')) : [];
        const rowIndex = rows.indexOf(lineRow);
        const column = lineFields.indexOf(target);
        if (rowIndex > 0) {
          event.preventDefault();
          const prevFields = getNavigableFields(rows[rowIndex - 1] as HTMLElement);
          prevFields[Math.min(Math.max(column, 0), prevFields.length - 1)]?.focus();
          saveArmed.current = false;
          return;
        }
      }
      event.preventDefault();
      if (currentIndex > 0) focusField(currentIndex - 1);
      return;
    }

    if (event.key === 'Enter') {
      if (target instanceof HTMLTextAreaElement && event.shiftKey) return;
      if (target.hasAttribute('data-erp-voucher-jump')) return;
      if (target.hasAttribute('data-erp-enter-custom')) return;

      if (saveArmed.current && emptyForSave()) {
        event.preventDefault();
        event.stopPropagation();
        saveArmed.current = false;
        requestSave();
        return;
      }
      saveArmed.current = false;

      const atLineEnd = Boolean(lineRow) && lineFields[lineFields.length - 1] === target;
      if (atLineEnd) {
        if (!lineHasEntry(lineRow as Element)) {
          event.preventDefault();
          event.stopPropagation();
          requestSave();
          return;
        }
        const grid = lineRow?.closest('[data-erp-line-grid]');
        const control = grid?.querySelector<HTMLElement>('[data-erp-add-line]');
        if (control) {
          event.preventDefault();
          event.stopPropagation();
          const before = grid?.querySelectorAll('[data-erp-line]').length || 0;
          if (control instanceof HTMLButtonElement) {
            control.click();
            window.setTimeout(() => {
              const rows = grid?.querySelectorAll('[data-erp-line]');
              const last = rows && rows.length > before ? rows[rows.length - 1] : null;
              const first = last ? getNavigableFields(last as HTMLElement)[0] : null;
              first?.focus();
              if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) {
                first.setSelectionRange?.(0, 0);
              }
            }, 40);
          } else {
            control.focus();
            if (control instanceof HTMLInputElement) control.select();
          }
          return;
        }
        const rows = grid ? Array.from(grid.querySelectorAll('[data-erp-line]')) : [];
        const rowIndex = lineRow ? rows.indexOf(lineRow) : -1;
        if (rowIndex >= 0 && rowIndex < rows.length - 1) {
          event.preventDefault();
          event.stopPropagation();
          getNavigableFields(rows[rowIndex + 1] as HTMLElement)[0]?.focus();
          return;
        }
      }

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
