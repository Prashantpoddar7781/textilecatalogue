import { roundMoney } from './orderBilling.js';

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

const normalizeState = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function isInterStateSupply(placeOfSupply, businessState) {
  const supply = normalizeState(placeOfSupply);
  const business = normalizeState(businessState);
  if (!supply || !business) return false;
  return supply !== business;
}

export function calculateGstBreakup({
  taxableAmount,
  gstRate,
  placeOfSupply,
  businessState
}) {
  const taxable = roundMoney(taxableAmount);
  const rate = Number(gstRate) || 0;
  if (taxable <= 0 || rate <= 0) {
    return {
      taxableAmount: taxable,
      gstRate: rate,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: 0,
      igstAmount: 0,
      totalTaxAmount: 0,
      gstType: 'none'
    };
  }

  const interState = isInterStateSupply(placeOfSupply, businessState);
  const totalTax = roundMoney(taxable * rate / 100);

  if (interState) {
    return {
      taxableAmount: taxable,
      gstRate: rate,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: rate,
      igstAmount: totalTax,
      totalTaxAmount: totalTax,
      gstType: 'IGST'
    };
  }

  const halfRate = rate / 2;
  const halfTax = roundMoney(totalTax / 2);
  return {
    taxableAmount: taxable,
    gstRate: rate,
    cgstRate: halfRate,
    cgstAmount: halfTax,
    sgstRate: halfRate,
    sgstAmount: halfTax,
    igstRate: 0,
    igstAmount: 0,
    totalTaxAmount: totalTax,
    gstType: 'CGST+SGST'
  };
}

export function calculateNoteTotals(input) {
  const grossAmount = roundMoney(input.grossAmount);
  const discountAmount = roundMoney(input.discountAmount ?? (grossAmount * (Number(input.discountPercent) || 0) / 100));
  const taxableAmount = roundMoney(
    input.taxableAmount != null && input.taxableAmount !== ''
      ? input.taxableAmount
      : grossAmount - discountAmount - roundMoney(input.otherLess) + roundMoney(input.addAmount) - roundMoney(input.returnGoods)
  );
  const gst = calculateGstBreakup({
    taxableAmount,
    gstRate: input.gstRate,
    placeOfSupply: input.placeOfSupply,
    businessState: input.businessState
  });
  const tcsAmount = roundMoney(taxableAmount * (Number(input.tcsRate) || 0) / 100);
  const netAmount = roundMoney(taxableAmount + gst.totalTaxAmount + tcsAmount);
  return {
    grossAmount,
    discountAmount,
    taxableAmount,
    ...gst,
    tcsRate: Number(input.tcsRate) || 0,
    tcsAmount,
    netAmount,
    netAmountAfterTds: netAmount
  };
}
