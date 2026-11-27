import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]):not([readonly]):not([data-erp-skip-nav])',
  'select:not([disabled]):not([data-erp-skip-nav])',
  'textarea:not([disabled]):not([readonly]):not([data-erp-skip-nav])'
].join(', ');

function selectFieldText(field: HTMLElement | null) {
  if (field instanceof HTMLInputElement) {
    const skip = ['checkbox', 'radio', 'file', 'date', 'datetime-local', 'time', 'month', 'color', 'range', 'button', 'submit', 'hidden'];
    if (skip.includes(field.type)) return;
    field.select();
    return;
  }
  if (field instanceof HTMLTextAreaElement) field.select();
}

export function focusAdjacentField(target: HTMLElement, delta: number) {
  const container = target.closest('[data-erp-form]') as HTMLElement | null;
  if (!container) return;
  const fields = getNavigableFields(container);
  const index = fields.indexOf(target);
  const next = index >= 0 ? fields[index + delta] : null;
  if (!next) return;
  next.focus();
  selectFieldText(next);
}

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
    selectFieldText(field);
  }, []);

  const saveArmed = useRef(false);
  const blankEnters = useRef(0);
  const skipPickAdvance = useRef(false);

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
      blankEnters.current = 0;
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

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      skipPickAdvance.current = true;
      window.setTimeout(() => { skipPickAdvance.current = false; }, 80);
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

      if (emptyForSave()) {
        event.preventDefault();
        event.stopPropagation();
        // Two Enters on a blank line ask to save. Down, then Enter, still does too.
        if (saveArmed.current || blankEnters.current >= 1) {
          saveArmed.current = false;
          blankEnters.current = 0;
          requestSave();
          return;
        }
        blankEnters.current = 1;
        return;
      }
      saveArmed.current = false;
      blankEnters.current = 0;

      const nextField = fields[currentIndex + 1];
      const atLineEnd = Boolean(lineRow) && (!nextField || !lineRow.contains(nextField));
      if (atLineEnd && lineRow) {
        if (!lineHasEntry(lineRow)) {
          event.preventDefault();
          event.stopPropagation();
          requestSave();
          return;
        }
        const grid = lineRow.closest('[data-erp-line-grid]');
        const control = grid?.querySelector<HTMLElement>('[data-erp-add-line]');
        if (control) {
          event.preventDefault();
          event.stopPropagation();
          const before = grid?.querySelectorAll('[data-erp-line]').length || 0;
          if (control instanceof HTMLButtonElement) {
            control.click();
            const focusNewLine = () => {
              const rows = grid?.querySelectorAll('[data-erp-line]');
              const last = rows && rows.length > before ? rows[rows.length - 1] : null;
              const first = last ? getNavigableFields(last as HTMLElement)[0] : null;
              if (!first) return false;
              first.focus();
              selectFieldText(first);
              return document.activeElement === first;
            };
            window.requestAnimationFrame(() => {
              if (focusNewLine()) return;
              window.setTimeout(focusNewLine, 60);
            });
          } else {
            control.focus();
            selectFieldText(control);
          }
          return;
        }
        const rows = grid ? Array.from(grid.querySelectorAll('[data-erp-line]')) : [];
        const rowIndex = rows.indexOf(lineRow);
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
    const container = containerRef.current;
    if (!container) return;
    let queued: HTMLElement | null = null;
    const scheduleAdvance = (target: HTMLElement) => {
      if (queued === target) return;
      queued = target;
      window.setTimeout(() => {
        queued = null;
        if (skipPickAdvance.current) return;
        if (document.activeElement !== target) return;
        focusAdjacentField(target, 1);
      }, 0);
    };
    const onInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.list || !container.contains(target)) return;
      const native = event as InputEvent;
      if (native.inputType !== 'insertReplacementText') return;
      scheduleAdvance(target);
    };
    const onChange = (event: Event) => {
      const target = event.target;
      if (!container.contains(target as Node)) return;
      if (target instanceof HTMLSelectElement) {
        scheduleAdvance(target);
        return;
      }
      if (target instanceof HTMLInputElement && target.list) scheduleAdvance(target);
    };
    container.addEventListener('input', onInput);
    container.addEventListener('change', onChange);
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !container.contains(target)) return;
      window.setTimeout(() => {
        if (document.activeElement === target) selectFieldText(target);
      }, 0);
    };
    container.addEventListener('focusin', onFocusIn);
    return () => {
      container.removeEventListener('input', onInput);
      container.removeEventListener('change', onChange);
      container.removeEventListener('focusin', onFocusIn);
    };
  }, [disabled]);

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
