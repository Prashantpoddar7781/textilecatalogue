import { BankPendingBill } from '../types';

const KEY = 'erp_bank_outstanding_prefill';

export interface BankOutstandingPrefill {
  entryId: string;
  bills: BankPendingBill[];
}

export function stashBankOutstandingPrefill(payload: BankOutstandingPrefill) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch { /* private mode */ }
}

export function readBankOutstandingPrefill(entryId: string): BankPendingBill[] | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BankOutstandingPrefill;
    if (!parsed || parsed.entryId !== entryId || !Array.isArray(parsed.bills)) return null;
    return parsed.bills;
  } catch {
    return null;
  }
}

export function clearBankOutstandingPrefill(entryId: string) {
  const bills = readBankOutstandingPrefill(entryId);
  if (!bills) return;
  try {
    sessionStorage.removeItem(KEY);
  } catch { /* private mode */ }
}
