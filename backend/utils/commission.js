import { roundMoney } from './orderBilling.js';
import { getPostingRule } from '../constants/erpTransactionPostingRules.js';

export const COMMISSION_SERIES = 'PURCHASE (COMM)';
export const COMMISSION_ACCOUNT = 'COMMISSION PAYABLE A/C';
export const COMMISSION_TDS_ACCOUNT = 'TDS PAYABLE A/C';

export function isCommissionPurchase(transactionType) {
  return String(transactionType || '').trim().toUpperCase() === COMMISSION_SERIES;
}

export function isBrokerAccountType(accountType) {
  const value = String(accountType || '').trim().toUpperCase();
  return value.includes('BROKER') || value.includes('BROK');
}

export function roundRupee(value) {
  const n = Number(value) || 0;
  return Math.round(n + Math.sign(n) * Number.EPSILON);
}

export function commissionRule() {
  return getPostingRule(COMMISSION_SERIES);
}

export function commissionMeta(bill) {
  const json = bill?.extractionJson;
  if (!json || typeof json !== 'object' || json.kind !== 'commission') return null;
  return json;
}

/** Invoice, GST, TDS and the net the broker is owed. Null when the bill is not commission. */
export function commissionFigures(bill) {
  if (!bill || (!isCommissionPurchase(bill.transactionType) && !commissionMeta(bill))) return null;
  const meta = commissionMeta(bill) || {};
  const gst = roundMoney(
    (Number(bill.igstAmount) || 0) + (Number(bill.cgstAmount) || 0) + (Number(bill.sgstAmount) || 0)
  );
  const invoiceValue = roundRupee(
    meta.invoiceValue != null ? meta.invoiceValue : ((Number(bill.taxableAmount) || 0) + gst)
  );
  const tdsAmount = roundRupee(meta.tdsAmount || 0);
  const expenseAmount = roundMoney(invoiceValue - gst);
  const netPayable = roundMoney(
    bill.grandTotal != null && Number(bill.grandTotal) > 0
      ? bill.grandTotal
      : (meta.netPayable != null ? meta.netPayable : (invoiceValue - tdsAmount))
  );
  const gstLabel = (Number(bill.igstAmount) || 0) > 0
    ? 'IGST'
    : (gst > 0 ? 'CGST/SGST' : '');
  return {
    invoiceValue,
    tdsAmount,
    gst,
    expenseAmount,
    netPayable,
    gstLabel,
    purchaseAccount: bill.purchaseAccount || COMMISSION_ACCOUNT,
    tdsAccount: meta.tdsAccount || commissionRule()?.tdsAccount || COMMISSION_TDS_ACCOUNT
  };
}

export function purchasePartyAmount(bill) {
  const comm = commissionFigures(bill);
  if (comm) return comm.netPayable;
  return roundMoney(bill?.grandTotal);
}

export function purchaseExpenseAmount(bill) {
  const comm = commissionFigures(bill);
  if (comm) return comm.expenseAmount;
  return roundMoney(bill?.grandTotal);
}

/**
 * Gross is the commission before GST.
 * Invoice (gross + GST) and TDS are rounded to the nearest rupee, matching the commission bill.
 */
export function computeCommissionAmounts(gross, { interstate = false, tdsPercent = 5, cgstPercent = 2.5, sgstPercent = 2.5 } = {}) {
  const grossAmount = roundMoney(gross);
  const cgstRate = Number(cgstPercent) || 0;
  const sgstRate = Number(sgstPercent) || 0;
  const igstRate = roundMoney(cgstRate + sgstRate);
  const igstAmount = interstate ? roundMoney(grossAmount * igstRate / 100) : 0;
  const cgstAmount = interstate ? 0 : roundMoney(grossAmount * cgstRate / 100);
  const sgstAmount = interstate ? 0 : roundMoney(grossAmount * sgstRate / 100);
  const totalTaxAmount = roundMoney(igstAmount + cgstAmount + sgstAmount);
  const invoiceValue = roundRupee(grossAmount + totalTaxAmount);
  const tds = roundRupee(grossAmount * (Number(tdsPercent) || 0) / 100);
  const netPayable = invoiceValue - tds;
  return {
    taxableAmount: grossAmount,
    igstAmount,
    cgstAmount,
    sgstAmount,
    igstRate: interstate ? igstRate : 0,
    cgstRate: interstate ? 0 : cgstRate,
    sgstRate: interstate ? 0 : sgstRate,
    totalTaxAmount,
    invoiceValue,
    tdsAmount: tds,
    netPayable
  };
}

export function commissionEditPath(id) {
  return `/erp/commission?edit=${id}`;
}

export function sameName(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}
