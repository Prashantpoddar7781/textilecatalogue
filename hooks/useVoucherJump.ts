import { KeyboardEvent, useCallback, useRef, useState } from 'react';
import { getNavigableFields } from './useErpFormKeyboard';
import { vouchersApi } from '../services/api';
import { parseVoucherNumber } from '../utils/parseVoucherNumber';

export type VoucherModule =
  | 'sales'
  | 'sales-order'
  | 'purchase'
  | 'expenses'
  | 'grey-purchase'
  | 'grey-purchase-return'
  | 'grey-dispatch'
  | 'mill-receipt'
  | 'work-receipt'
  | 'work-despatch'
  | 'bank'
  | 'note'
  | 'journal';

function blankEntryPath(module: VoucherModule, voucher: number) {
  if (module === 'grey-purchase') return `/erp/grey-purchase?voucher=${voucher}`;
  if (module === 'grey-dispatch') return `/erp/grey-dispatch?voucher=${voucher}`;
  return null;
}

interface Options {
  module: VoucherModule;
  transactionType?: string;
  currentId?: string | null;
  /** The voucher currently on screen (next number in add mode). */
  shownNumber?: string | number | null;
  /** Open the found voucher in place. When omitted, the page reloads at editPath. */
  onOpen?: (found: { id: string; editPath: string }) => Promise<void> | void;
  /** The typed number is not saved. The screen starts a blank entry with that number. */
  onMissing?: (voucher: number) => void;
  onError?: (message: string) => void;
}

/**
 * Type a voucher number and press Enter to open that saved entry,
 * the same way Empire jumps from bill 12 to bill 6.
 */
export function useVoucherJump({
  module,
  transactionType,
  currentId,
  shownNumber,
  onOpen,
  onMissing,
  onError
}: Options) {
  const [jumping, setJumping] = useState(false);
  const attemptRef = useRef(0);
  const cancelPendingJump = useCallback(() => {
    attemptRef.current += 1;
  }, []);

  const tryJump = useCallback(async (raw: string, currentField?: HTMLElement | null) => {
    const typed = parseVoucherNumber(raw);
    if (!typed) return 'next' as const;
    const shown = parseVoucherNumber(String(shownNumber ?? '')) ?? (Number(shownNumber) || null);
    if (currentId && shown && typed === shown) return 'next' as const;

    const attempt = ++attemptRef.current;
    setJumping(true);
    try {
      const result = await vouchersApi.lookup({
        module,
        voucher: String(raw).trim(),
        transactionType: transactionType || undefined
      });
      if (attemptRef.current !== attempt) return 'busy' as const;
      if (result.id && result.editPath && result.id !== currentId) {
        if (onOpen) await onOpen({ id: result.id, editPath: result.editPath });
        else window.location.href = result.editPath;
        return 'navigated' as const;
      }
      return 'next' as const;
    } catch (err: any) {
      if (attemptRef.current !== attempt) return 'busy' as const;
      if (!currentId && shown && typed === shown) return 'next' as const;
      if (err?.status === 404 && onMissing && typed) {
        onMissing(typed);
        return 'navigated' as const;
      }
      const blank = err?.status === 404 ? blankEntryPath(module, typed) : null;
      if (blank) {
        const here = `${window.location.pathname}${window.location.search}`;
        if (here !== blank) window.location.href = blank;
        return here === blank ? 'next' as const : 'navigated' as const;
      }
      onError?.(err.message || `No voucher ${raw} found.`);
      return 'error' as const;
    } finally {
      if (attemptRef.current === attempt) setJumping(false);
      if (currentField) {
        // stay; caller focuses next field on 'next'
      }
    }
  }, [currentId, module, onError, onMissing, onOpen, shownNumber, transactionType]);

  const onVoucherKeyDown = useCallback(async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    const field = event.currentTarget;
    const outcome = await tryJump(field.value, field);
    if (outcome !== 'next') return;
    const form = field.closest('[data-erp-form]') as HTMLElement | null;
    if (!form) return;
    const fields = getNavigableFields(form);
    const index = fields.indexOf(field);
    if (index >= 0 && index < fields.length - 1) {
      const next = fields[index + 1];
      next.focus();
      if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
        next.setSelectionRange?.(0, 0);
      }
    }
  }, [tryJump]);

  const onVoucherFocus = useCallback((event: { currentTarget: HTMLInputElement }) => {
    event.currentTarget.select();
  }, []);

  const onVoucherBlur = useCallback((event: { currentTarget: HTMLInputElement }) => {
    const raw = event.currentTarget.value;
    const typed = parseVoucherNumber(raw);
    const shown = parseVoucherNumber(String(shownNumber ?? '')) ?? (Number(shownNumber) || null);
    if (!typed || (shown && typed === shown)) return;
    void tryJump(raw);
  }, [shownNumber, tryJump]);

  return {
    jumping,
    cancelPendingJump,
    tryJump,
    onVoucherKeyDown,
    onVoucherFocus,
    voucherFieldProps: {
      'data-erp-voucher-jump': '',
      autoComplete: 'off' as const,
      autoFocus: true,
      onFocus: onVoucherFocus,
      onBlur: onVoucherBlur,
      onKeyDown: onVoucherKeyDown,
      title: 'Type a voucher number and press Enter to open that entry'
    }
  };
}
