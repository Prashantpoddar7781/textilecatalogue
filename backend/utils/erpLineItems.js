import { roundMoney } from './orderBilling.js';
import { calculateGstBreakup } from './gstCalculation.js';

const optionalString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

/** Shared Finish Sales / Finish Purchase line normalizer with discounts + GST. */
export function normalizeErpLines(raw, context = {}) {
  if (!Array.isArray(raw)) return [];
  return raw.map((input, index) => {
    const pcs = roundMoney(input.pcs ?? input.quantity ?? 0);
    const cut = roundMoney(input.cut ?? 0);
    const mtsQty = roundMoney(
      input.mtsQty != null && input.mtsQty !== ''
        ? input.mtsQty
        : pcs * cut
    );
    const rate = roundMoney(input.rate ?? input.retailPrice ?? 0);
    const amount = roundMoney(
      input.amount != null && input.amount !== ''
        ? input.amount
        : pcs * rate
    );
    const discountPercent = Number(input.discountPercent) || 0;
    const discountAmount = roundMoney(
      input.discountAmount != null && input.discountAmount !== ''
        ? input.discountAmount
        : amount * discountPercent / 100
    );
    const manualAddLess = roundMoney(input.manualAddLess ?? 0);
    const taxableAmount = roundMoney(amount - discountAmount + manualAddLess);
    const gstRate = Number(input.gstRate ?? context.defaultGstRate) || 0;
    const gst = calculateGstBreakup({
      taxableAmount,
      gstRate,
      placeOfSupply: context.placeOfSupply,
      businessState: context.businessState
    });
    const taxAmount = roundMoney(gst.totalTaxAmount);
    return {
      lineNo: Number(input.lineNo) || index + 1,
      itemMasterId: optionalString(input.itemMasterId),
      itemName: optionalString(input.itemName || input.description) || '',
      description: optionalString(input.itemName || input.description) || '',
      bundles: roundMoney(input.bundles ?? 0),
      mainScreen: optionalString(input.mainScreen) || optionalString(input.category) || '',
      screenName: optionalString(input.screenName) || optionalString(input.itemName || input.description) || '',
      category: optionalString(input.category) || optionalString(input.mainScreen) || '',
      packing: optionalString(input.packing) || 'NAKED',
      unit: optionalString(input.unit) || 'PCS',
      pcs,
      quantity: pcs,
      cut,
      mtsQty,
      rate,
      amount,
      rd: roundMoney(input.rd ?? 0),
      discountPercent,
      discountAmount,
      manualAddLess,
      gstRate,
      cgstRate: gst.cgstRate,
      cgstAmount: gst.cgstAmount,
      sgstRate: gst.sgstRate,
      sgstAmount: gst.sgstAmount,
      igstRate: gst.igstRate,
      igstAmount: gst.igstAmount,
      taxAmount,
      taxableAmount,
      totalAmount: roundMoney(taxableAmount + taxAmount),
      hsnCode: optionalString(input.hsnCode) || context.defaultHsnCode || '5407',
      sourceLineNo: Number(input.sourceLineNo) || Number(input.lineNo) || index + 1
    };
  }).filter(line => line.itemName && (line.pcs > 0 || line.amount > 0));
}

export function aggregateErpLines(lines) {
  return {
    totalBundles: roundMoney(lines.reduce((sum, line) => sum + line.bundles, 0)),
    totalPcs: roundMoney(lines.reduce((sum, line) => sum + line.pcs, 0)),
    totalMts: roundMoney(lines.reduce((sum, line) => sum + line.mtsQty, 0)),
    grossAmount: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
    discountAmount: roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0)),
    taxableAmount: roundMoney(lines.reduce((sum, line) => sum + line.taxableAmount, 0)),
    cgstAmount: roundMoney(lines.reduce((sum, line) => sum + (Number(line.cgstAmount) || 0), 0)),
    sgstAmount: roundMoney(lines.reduce((sum, line) => sum + (Number(line.sgstAmount) || 0), 0)),
    igstAmount: roundMoney(lines.reduce((sum, line) => sum + (Number(line.igstAmount) || 0), 0)),
    totalTaxAmount: roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0)),
    netAmount: roundMoney(lines.reduce((sum, line) => sum + line.totalAmount, 0))
  };
}

export function isPurchaseReturn(transactionType) {
  return String(transactionType || '').toUpperCase().includes('PURCHASE RETURN');
}
