import { isExpensePurchaseType } from '../constants/erpTransactionTypes.js';
import {
  formatSeriesBillNumber,
  resolveStockMovement
} from '../constants/erpTransactionPostingRules.js';
import { roundMoney } from './orderBilling.js';

export const STOCK_LEDGER_TYPES = ['GREY', 'FINISH', 'WORK', 'BOX'];

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

function lineQty(lines) {
  const list = Array.isArray(lines) ? lines : [];
  const pcs = roundMoney(list.reduce((sum, line) => sum + (Number(line.pcs ?? line.quantity) || 0), 0));
  const mts = roundMoney(list.reduce((sum, line) => sum + (Number(line.mtsQty) || 0), 0));
  const first = list.find(line => String(line.itemName || line.description || line.screenName || '').trim());
  return {
    pcs,
    mts,
    itemName: first ? String(first.itemName || first.description || first.screenName || '').trim() : ''
  };
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

function pushMovement(rows, seed) {
  const movement = resolveStockMovement(seed.transactionType);
  if (!movement.stockType || movement.stockEffect == null) return;
  const pcs = roundMoney(seed.pcs);
  const mts = roundMoney(seed.mts);
  if (pcs === 0 && mts === 0) return;
  rows.push({
    id: seed.id,
    source: seed.source,
    date: seed.date,
    stockType: movement.stockType,
    stockEffect: movement.stockEffect,
    inferred: Boolean(movement.inferred),
    direction: movement.stockEffect < 0 ? 'OUT' : 'IN',
    transactionType: seed.transactionType,
    voucherNo: seed.voucherNo || '',
    billNo: seed.billNo || '',
    partyName: seed.partyName || '',
    quality: seed.quality || '',
    itemName: seed.itemName || seed.quality || '',
    pcs,
    mts,
    signedPcs: roundMoney(pcs * movement.stockEffect),
    signedMts: roundMoney(mts * movement.stockEffect),
    editPath: seed.editPath
  });
}

function emptyTotals() {
  return { inPcs: 0, inMts: 0, outPcs: 0, outMts: 0, closingPcs: 0, closingMts: 0, entries: 0 };
}

function addQty(target, row) {
  if (row.stockEffect > 0) {
    target.inPcs = roundMoney(target.inPcs + row.pcs);
    target.inMts = roundMoney(target.inMts + row.mts);
  } else {
    target.outPcs = roundMoney(target.outPcs + row.pcs);
    target.outMts = roundMoney(target.outMts + row.mts);
  }
  target.closingPcs = roundMoney(target.inPcs - target.outPcs);
  target.closingMts = roundMoney(target.inMts - target.outMts);
  target.entries += 1;
}

/**
 * Voucher-driven stock register from Empire STOCK TYPE / STOCK EFFECT.
 *
 * Mill receipt is job-work billing — it does not add GREY or FINISH.
 * Grey mill dispatch (PROCESS / REPROCESS) is GREY out even though that series
 * is missing from Transaction Types. Grey purchase returns are counted once
 * (the companion GreyDispatch with type RETURN is skipped).
 */
export async function buildStockLedger(prisma, userId, options = {}) {
  const wantedType = String(options.stockType || 'ALL').trim().toUpperCase();
  const fromDate = startOfDay(options.fromDate);
  const toDate = endOfDay(options.toDate);
  const notCancelled = { not: 'cancelled' };

  const [greyPurchases, greyDispatches, greyReturns, purchaseBills, salesBills, workDespatches, workReceipts] =
    await Promise.all([
      prisma.greyPurchase.findMany({
        where: { userId, status: notCancelled },
        select: {
          id: true, billDate: true, createdAt: true, partyName: true, quality: true,
          billNo: true, transactionType: true, typeBillNumber: true, recTaka: true, recMts: true
        }
      }),
      prisma.greyDispatch.findMany({
        where: { userId, status: notCancelled },
        select: {
          id: true, dispatchDate: true, createdAt: true, millName: true, weaverName: true,
          quality: true, challanNo: true, transactionType: true, despTaka: true, despMts: true, srNo: true
        }
      }),
      prisma.greyPurchaseReturn.findMany({
        where: { userId, status: notCancelled },
        select: {
          id: true, returnDate: true, createdAt: true, partyName: true, quality: true,
          billNo: true, challanNo: true, voucherNo: true, pcs: true, mts: true
        }
      }),
      prisma.purchaseBill.findMany({
        where: { userId, status: notCancelled },
        select: {
          id: true, billDate: true, createdAt: true, billNumber: true, supplierBillNo: true,
          transactionType: true, typeBillNumber: true, lineItems: true,
          supplier: { select: { name: true } }
        }
      }),
      prisma.order.findMany({
        where: { userId, status: notCancelled },
        select: {
          id: true, orderDate: true, createdAt: true, buyerName: true, transactionType: true,
          typeBillNumber: true, invoiceNumber: true, orderNumber: true, orderLines: true,
          customer: { select: { organizationName: true } }
        }
      }),
      prisma.workDespatch.findMany({
        where: { userId, status: notCancelled },
        select: {
          id: true, despatchDate: true, createdAt: true, partyName: true, challanNo: true,
          transactionType: true, workType: true, lineItems: true, totalPcs: true, totalMts: true
        }
      }),
      prisma.workReceipt.findMany({
        where: { userId, status: notCancelled },
        select: {
          id: true, receiptDate: true, createdAt: true, partyName: true, challanNo: true,
          billNo: true, voucherNo: true, transactionType: true, workType: true, lineItems: true,
          totalPcs: true, totalMts: true
        }
      })
    ]);

  const movements = [];

  for (const row of greyPurchases) {
    pushMovement(movements, {
      id: row.id,
      source: 'grey_purchase',
      date: row.billDate || row.createdAt,
      transactionType: row.transactionType || 'GREY PURCHASE',
      voucherNo: voucherLabel(row.transactionType || 'GREY PURCHASE', row.typeBillNumber, row.billNo),
      billNo: row.billNo || '',
      partyName: row.partyName,
      quality: row.quality || '',
      itemName: row.quality || '',
      pcs: row.recTaka,
      mts: row.recMts,
      editPath: `/erp/grey-purchase?edit=${row.id}`
    });
  }

  for (const row of greyDispatches) {
    pushMovement(movements, {
      id: row.id,
      source: 'grey_dispatch',
      date: row.dispatchDate || row.createdAt,
      transactionType: row.transactionType || 'PROCESS',
      voucherNo: row.challanNo || (row.srNo != null ? String(row.srNo) : ''),
      billNo: row.challanNo || '',
      partyName: row.millName || row.weaverName || '',
      quality: row.quality || '',
      itemName: row.quality || '',
      pcs: row.despTaka,
      mts: row.despMts,
      editPath: `/erp/grey-dispatch?edit=${row.id}`
    });
  }

  for (const row of greyReturns) {
    pushMovement(movements, {
      id: row.id,
      source: 'grey_return',
      date: row.returnDate || row.createdAt,
      transactionType: 'GREY PURCHASE RETURN',
      voucherNo: row.challanNo || (row.voucherNo != null ? String(row.voucherNo) : ''),
      billNo: row.billNo || '',
      partyName: row.partyName,
      quality: row.quality || '',
      itemName: row.quality || '',
      pcs: row.pcs,
      mts: row.mts,
      editPath: `/erp/grey-purchase-return?edit=${row.id}`
    });
  }

  for (const row of purchaseBills) {
    const qty = lineQty(row.lineItems);
    const type = row.transactionType;
    if (!type) continue;
    pushMovement(movements, {
      id: row.id,
      source: 'purchase_bill',
      date: row.billDate || row.createdAt,
      transactionType: type,
      voucherNo: voucherLabel(type, row.typeBillNumber, row.billNumber),
      billNo: row.supplierBillNo || row.billNumber || '',
      partyName: row.supplier?.name || '',
      quality: qty.itemName,
      itemName: qty.itemName,
      pcs: qty.pcs,
      mts: qty.mts,
      editPath: purchaseEditPath(type, row.id)
    });
  }

  for (const row of salesBills) {
    const qty = lineQty(row.orderLines);
    const type = row.transactionType;
    if (!type) continue;
    pushMovement(movements, {
      id: row.id,
      source: 'sales_bill',
      date: row.orderDate || row.createdAt,
      transactionType: type,
      voucherNo: voucherLabel(type, row.typeBillNumber, row.invoiceNumber || row.orderNumber),
      billNo: row.orderNumber || (row.invoiceNumber != null ? String(row.invoiceNumber) : ''),
      partyName: row.customer?.organizationName || row.buyerName || '',
      quality: qty.itemName,
      itemName: qty.itemName,
      pcs: qty.pcs,
      mts: qty.mts,
      editPath: `/erp/sales?edit=${row.id}&kind=bill`
    });
  }

  for (const row of workDespatches) {
    const qty = lineQty(row.lineItems);
    pushMovement(movements, {
      id: row.id,
      source: 'work_despatch',
      date: row.despatchDate || row.createdAt,
      transactionType: row.transactionType || 'WORK DESP.SUIT CHALLAN',
      voucherNo: row.challanNo || '',
      billNo: row.challanNo || '',
      partyName: row.partyName,
      quality: row.workType || qty.itemName,
      itemName: qty.itemName || row.workType || '',
      pcs: row.totalPcs || qty.pcs,
      mts: row.totalMts || qty.mts,
      editPath: `/erp/work-despatch?edit=${row.id}`
    });
  }

  for (const row of workReceipts) {
    const qty = lineQty(row.lineItems);
    pushMovement(movements, {
      id: row.id,
      source: 'work_receipt',
      date: row.receiptDate || row.createdAt,
      transactionType: row.transactionType || 'WORK REC. CHALLAN',
      voucherNo: row.challanNo || (row.voucherNo != null ? String(row.voucherNo) : ''),
      billNo: row.billNo || '',
      partyName: row.partyName,
      quality: row.workType || qty.itemName,
      itemName: qty.itemName || row.workType || '',
      pcs: row.totalPcs || qty.pcs,
      mts: row.totalMts || qty.mts,
      editPath: `/erp/work-receipt?edit=${row.id}`
    });
  }

  movements.sort((a, b) => {
    const da = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (da !== 0) return da;
    return String(a.id).localeCompare(String(b.id));
  });

  const typed = wantedType && wantedType !== 'ALL'
    ? movements.filter(row => row.stockType === wantedType)
    : movements;

  const inRange = typed.filter(row => {
    const time = new Date(row.date).getTime();
    if (fromDate && time < fromDate.getTime()) return false;
    if (toDate && time > toDate.getTime()) return false;
    return true;
  });

  const runningByType = new Map();
  const withRunning = inRange.map(row => {
    const current = runningByType.get(row.stockType) || { pcs: 0, mts: 0 };
    current.pcs = roundMoney(current.pcs + row.signedPcs);
    current.mts = roundMoney(current.mts + row.signedMts);
    runningByType.set(row.stockType, current);
    return {
      ...row,
      runningPcs: current.pcs,
      runningMts: current.mts
    };
  });

  const balanceMap = new Map();
  for (const row of inRange) {
    const item = row.itemName || row.quality || '(blank)';
    const key = `${row.stockType}::${item.toLowerCase()}`;
    if (!balanceMap.has(key)) {
      balanceMap.set(key, {
        stockType: row.stockType,
        item,
        ...emptyTotals()
      });
    }
    addQty(balanceMap.get(key), row);
  }

  const balances = Array.from(balanceMap.values()).sort((a, b) => {
    if (a.stockType !== b.stockType) return a.stockType.localeCompare(b.stockType);
    return a.item.localeCompare(b.item);
  });

  const totalsByType = STOCK_LEDGER_TYPES
    .filter(type => wantedType === 'ALL' || wantedType === type)
    .map(type => {
      const totals = emptyTotals();
      for (const row of inRange.filter(item => item.stockType === type)) addQty(totals, row);
      return { stockType: type, ...totals };
    });

  const totals = emptyTotals();
  for (const row of inRange) addQty(totals, row);

  return {
    stockType: wantedType === 'ALL' ? 'ALL' : (STOCK_LEDGER_TYPES.includes(wantedType) ? wantedType : 'ALL'),
    fromDate: fromDate ? fromDate.toISOString() : null,
    toDate: toDate ? toDate.toISOString() : null,
    movements: withRunning,
    balances,
    totalsByType,
    totals
  };
}
