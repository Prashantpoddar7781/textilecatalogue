import { isExpensePurchaseType } from '../constants/erpTransactionTypes.js';
import {
  formatSeriesBillNumber,
  getItcEligibility,
  gstDocumentSign,
  gstReturnSection
} from '../constants/erpTransactionPostingRules.js';
import { roundMoney } from './orderBilling.js';

export const ITC_BUCKETS = ['Input Goods', 'Input Services', 'Capital Goods'];

function optionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value) {
  const date = optionalDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = optionalDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function inRange(dateValue, fromDate, toDate) {
  const time = new Date(dateValue).getTime();
  if (fromDate && time < fromDate.getTime()) return false;
  if (toDate && time > toDate.getTime()) return false;
  return true;
}

function emptyTax() {
  return { taxable: 0, igst: 0, cgst: 0, sgst: 0, tax: 0, entries: 0 };
}

function addTax(target, row) {
  target.taxable = roundMoney(target.taxable + row.taxable);
  target.igst = roundMoney(target.igst + row.igst);
  target.cgst = roundMoney(target.cgst + row.cgst);
  target.sgst = roundMoney(target.sgst + row.sgst);
  target.tax = roundMoney(target.tax + row.tax);
  target.entries += 1;
}

function lineTax(lines) {
  const list = Array.isArray(lines) ? lines : [];
  return {
    taxable: roundMoney(list.reduce((sum, line) => sum + (Number(line.taxableAmount) || 0), 0)),
    igst: roundMoney(list.reduce((sum, line) => sum + (Number(line.igstAmount) || 0), 0)),
    cgst: roundMoney(list.reduce((sum, line) => sum + (Number(line.cgstAmount) || 0), 0)),
    sgst: roundMoney(list.reduce((sum, line) => sum + (Number(line.sgstAmount) || 0), 0))
  };
}

function headerOrLines(doc, lines) {
  const fromLines = lineTax(lines);
  const taxable = Number(doc.taxableAmount);
  const igst = Number(doc.igstAmount);
  const cgst = Number(doc.cgstAmount);
  const sgst = Number(doc.sgstAmount);
  const headerHasTax = (igst || 0) !== 0 || (cgst || 0) !== 0 || (sgst || 0) !== 0;
  if (headerHasTax || (taxable && !fromLines.tax)) {
    return {
      taxable: roundMoney(taxable || fromLines.taxable),
      igst: roundMoney(igst || 0),
      cgst: roundMoney(cgst || 0),
      sgst: roundMoney(sgst || 0)
    };
  }
  return fromLines;
}

function signedTax(amounts, sign) {
  const igst = roundMoney(amounts.igst * sign);
  const cgst = roundMoney(amounts.cgst * sign);
  const sgst = roundMoney(amounts.sgst * sign);
  return {
    taxable: roundMoney(amounts.taxable * sign),
    igst,
    cgst,
    sgst,
    tax: roundMoney(igst + cgst + sgst)
  };
}

function hasGstMovement(amounts) {
  return Math.abs(amounts.tax) > 0.001;
}

function voucherLabel(transactionType, typeBillNumber, fallback) {
  if (typeBillNumber != null && transactionType) {
    return formatSeriesBillNumber(transactionType, typeBillNumber) || String(typeBillNumber);
  }
  if (fallback) return String(fallback);
  if (typeBillNumber != null) return String(typeBillNumber);
  return '';
}

function purchaseEditPath(transactionType, id) {
  if (isExpensePurchaseType(transactionType)) return `/erp/expenses?edit=${id}`;
  return `/erp/purchase?edit=${id}`;
}

function classify(transactionType) {
  const section = gstReturnSection(transactionType);
  const itc = getItcEligibility(transactionType);
  const sign = gstDocumentSign(transactionType);
  return { section, itc, sign };
}

/**
 * GSTR-3B style summary: outward tax vs eligible ITC split by Empire
 * GST -> ELIGIBILITY FOR INPUT TAX CREDIT (Input Goods / Services / Capital Goods).
 */
export async function buildGstr3b(prisma, userId, options = {}) {
  const wanted = String(options.bucket || 'ALL').trim();
  const fromDate = startOfDay(options.fromDate);
  const toDate = endOfDay(options.toDate);
  const notCancelled = { not: 'cancelled' };

  const [purchaseBills, greyPurchases, greyReturns, millReceipts, workReceipts, salesBills] = await Promise.all([
    prisma.purchaseBill.findMany({
      where: { userId, status: notCancelled },
      select: {
        id: true, billDate: true, createdAt: true, billNumber: true, supplierBillNo: true,
        transactionType: true, typeBillNumber: true, taxableAmount: true, cgstAmount: true,
        sgstAmount: true, igstAmount: true, lineItems: true,
        supplier: { select: { name: true } }
      }
    }),
    prisma.greyPurchase.findMany({
      where: { userId, status: notCancelled },
      select: {
        id: true, billDate: true, createdAt: true, partyName: true, billNo: true,
        transactionType: true, typeBillNumber: true, taxableAmount: true, cgstAmount: true,
        sgstAmount: true, igstAmount: true
      }
    }),
    prisma.greyPurchaseReturn.findMany({
      where: { userId, status: notCancelled },
      select: {
        id: true, returnDate: true, createdAt: true, partyName: true, billNo: true,
        challanNo: true, voucherNo: true, taxableAmount: true, cgstAmount: true,
        sgstAmount: true, igstAmount: true
      }
    }),
    prisma.millReceipt.findMany({
      where: { userId, status: notCancelled },
      select: {
        id: true, receiptDate: true, createdAt: true, millName: true, billNo: true,
        entryType: true, processType: true, voucherNo: true, taxableAmount: true, cgstAmount: true,
        sgstAmount: true, igstAmount: true
      }
    }),
    prisma.workReceipt.findMany({
      where: { userId, status: notCancelled },
      select: {
        id: true, receiptDate: true, createdAt: true, partyName: true, challanNo: true,
        billNo: true, voucherNo: true, transactionType: true, taxableAmount: true,
        cgstAmount: true, sgstAmount: true, igstAmount: true, lineItems: true
      }
    }),
    prisma.order.findMany({
      where: { userId, status: notCancelled },
      select: {
        id: true, orderDate: true, createdAt: true, buyerName: true, transactionType: true,
        typeBillNumber: true, invoiceNumber: true, orderNumber: true, orderLines: true,
        customer: { select: { organizationName: true } }
      }
    })
  ]);

  const rows = [];

  const push = (seed) => {
    if (!seed.transactionType) return;
    const { section, itc, sign } = classify(seed.transactionType);
    const amounts = signedTax(seed.amounts, sign);
    if (!hasGstMovement(amounts)) return;
    const isOutward = section === 'GSTR-1';
    const isItc = Boolean(itc) && section === 'GSTR-2';
    if (!isOutward && !isItc) return;
    rows.push({
      id: seed.id,
      source: seed.source,
      date: seed.date,
      transactionType: seed.transactionType,
      voucherNo: seed.voucherNo || '',
      billNo: seed.billNo || '',
      partyName: seed.partyName || '',
      section: isOutward ? 'GSTR-1' : 'GSTR-3B',
      itcEligibility: isItc ? itc : null,
      bucket: isOutward ? 'Outward' : itc,
      sign,
      taxable: amounts.taxable,
      igst: amounts.igst,
      cgst: amounts.cgst,
      sgst: amounts.sgst,
      tax: amounts.tax,
      editPath: seed.editPath
    });
  };

  for (const row of purchaseBills) {
    const type = row.transactionType;
    if (!type) continue;
    if (!inRange(row.billDate || row.createdAt, fromDate, toDate)) continue;
    push({
      id: row.id,
      source: 'purchase_bill',
      date: row.billDate || row.createdAt,
      transactionType: type,
      voucherNo: voucherLabel(type, row.typeBillNumber, row.billNumber),
      billNo: row.supplierBillNo || row.billNumber || '',
      partyName: row.supplier?.name || '',
      amounts: headerOrLines(row, row.lineItems),
      editPath: purchaseEditPath(type, row.id)
    });
  }

  for (const row of greyPurchases) {
    if (!inRange(row.billDate || row.createdAt, fromDate, toDate)) continue;
    const type = row.transactionType || 'GREY PURCHASE';
    push({
      id: row.id,
      source: 'grey_purchase',
      date: row.billDate || row.createdAt,
      transactionType: type,
      voucherNo: voucherLabel(type, row.typeBillNumber, row.billNo),
      billNo: row.billNo || '',
      partyName: row.partyName,
      amounts: headerOrLines(row, null),
      editPath: `/erp/grey-purchase?edit=${row.id}`
    });
  }

  for (const row of greyReturns) {
    if (!inRange(row.returnDate || row.createdAt, fromDate, toDate)) continue;
    push({
      id: row.id,
      source: 'grey_return',
      date: row.returnDate || row.createdAt,
      transactionType: 'GREY PURCHASE RETURN',
      voucherNo: row.challanNo || (row.voucherNo != null ? String(row.voucherNo) : ''),
      billNo: row.billNo || '',
      partyName: row.partyName,
      amounts: headerOrLines(row, null),
      editPath: `/erp/grey-purchase-return?edit=${row.id}`
    });
  }

  for (const row of millReceipts) {
    if (String(row.processType || '').toUpperCase() === 'RETURN') continue;
    if (!inRange(row.receiptDate || row.createdAt, fromDate, toDate)) continue;
    const type = row.entryType || 'JOB WORK';
    push({
      id: row.id,
      source: 'mill_receipt',
      date: row.receiptDate || row.createdAt,
      transactionType: type,
      voucherNo: row.voucherNo != null ? String(row.voucherNo) : (row.billNo || ''),
      billNo: row.billNo || '',
      partyName: row.millName,
      amounts: headerOrLines(row, null),
      editPath: `/erp/mill-receipt?edit=${row.id}`
    });
  }

  for (const row of workReceipts) {
    if (!inRange(row.receiptDate || row.createdAt, fromDate, toDate)) continue;
    const type = row.transactionType || 'WORK REC. BILLS';
    push({
      id: row.id,
      source: 'work_receipt',
      date: row.receiptDate || row.createdAt,
      transactionType: type,
      voucherNo: row.challanNo || (row.voucherNo != null ? String(row.voucherNo) : ''),
      billNo: row.billNo || '',
      partyName: row.partyName,
      amounts: headerOrLines(row, row.lineItems),
      editPath: `/erp/work-receipt?edit=${row.id}`
    });
  }

  for (const row of salesBills) {
    const type = row.transactionType;
    if (!type) continue;
    if (!inRange(row.orderDate || row.createdAt, fromDate, toDate)) continue;
    push({
      id: row.id,
      source: 'sales_bill',
      date: row.orderDate || row.createdAt,
      transactionType: type,
      voucherNo: voucherLabel(type, row.typeBillNumber, row.invoiceNumber || row.orderNumber),
      billNo: row.orderNumber || (row.invoiceNumber != null ? String(row.invoiceNumber) : ''),
      partyName: row.customer?.organizationName || row.buyerName || '',
      amounts: headerOrLines(row, row.orderLines),
      editPath: `/erp/sales?edit=${row.id}&kind=bill`
    });
  }

  rows.sort((a, b) => {
    const da = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (da !== 0) return da;
    return String(a.id).localeCompare(String(b.id));
  });

  const outward = emptyTax();
  const itcByBucket = {
    'Input Goods': emptyTax(),
    'Input Services': emptyTax(),
    'Capital Goods': emptyTax()
  };
  const itcTotal = emptyTax();

  for (const row of rows) {
    if (row.bucket === 'Outward') addTax(outward, row);
    else if (itcByBucket[row.bucket]) {
      addTax(itcByBucket[row.bucket], row);
      addTax(itcTotal, row);
    }
  }

  const netTax = roundMoney(outward.tax - itcTotal.tax);
  const filtered = wanted === 'ALL'
    ? rows
    : wanted === 'Outward'
      ? rows.filter(row => row.bucket === 'Outward')
      : rows.filter(row => row.bucket === wanted);

  return {
    bucket: wanted,
    fromDate: fromDate ? fromDate.toISOString() : null,
    toDate: toDate ? toDate.toISOString() : null,
    outward,
    itc: {
      'Input Goods': itcByBucket['Input Goods'],
      'Input Services': itcByBucket['Input Services'],
      'Capital Goods': itcByBucket['Capital Goods'],
      total: itcTotal
    },
    netPayable: {
      igst: roundMoney(outward.igst - itcTotal.igst),
      cgst: roundMoney(outward.cgst - itcTotal.cgst),
      sgst: roundMoney(outward.sgst - itcTotal.sgst),
      tax: netTax
    },
    rows: filtered
  };
}
