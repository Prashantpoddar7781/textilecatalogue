/**
 * Poonam, 21 Nov 2026. Sales orders 1–11 become sales challans (next free
 * numbers). FINISH SALES (S1) vouchers 1–20, dated before 21 Nov 2026, become
 * sales orders 1–20. Sales orders 12–15 become 21–24, and FINISH SALES 21–24
 * keep billing those same rows.
 *
 *   node backend/scripts/repairSalesSeriesMove.mjs
 *
 * A later import of this backup diverts those same S1 vouchers before insert
 * (`divertPoonamFinishSales`). Sales orders 1–11 were typed after the backup,
 * so only the live books have that half of the move.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const EMAIL = 'poonamcreation1012@gmail.com';
const CUTOFF = new Date('2026-11-21T00:00:00+05:30');

export function isMovedFinishSale(row) {
  const number = Number(row?.typeBillNumber);
  const when = row?.orderDate ? new Date(row.orderDate) : null;
  return row?.transactionType === 'FINISH SALES'
    && number >= 1
    && number <= 20
    && when
    && !Number.isNaN(when.getTime())
    && when < CUTOFF
    && /\[E:/i.test(String(row?.remarks || ''));
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function lineList(value) {
  return Array.isArray(value) ? value : [];
}

export function totalsOf(lines) {
  const rows = lineList(lines);
  return {
    totalBundles: roundMoney(rows.reduce((sum, line) => sum + (Number(line.bundles) || 0), 0)),
    totalPcs: roundMoney(rows.reduce((sum, line) => sum + (Number(line.pcs) || Number(line.quantity) || 0), 0)),
    totalMts: roundMoney(rows.reduce((sum, line) => sum + (Number(line.mtsQty) || 0), 0)),
    grossAmount: roundMoney(rows.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)),
    discountAmount: roundMoney(rows.reduce((sum, line) => sum + (Number(line.discountAmount) || 0), 0)),
    taxableAmount: roundMoney(rows.reduce((sum, line) => sum + (Number(line.taxableAmount) || 0), 0)),
    totalTaxAmount: roundMoney(rows.reduce((sum, line) => sum + (Number(line.taxAmount) || 0), 0)),
    netAmount: roundMoney(rows.reduce((sum, line) => sum + (Number(line.totalAmount) || 0), 0))
  };
}

function asBillLines(lines) {
  return lineList(lines).map(line => ({
    ...line,
    description: line.description || line.itemName || '',
    designName: line.designName || line.itemName || '',
    quantity: line.quantity ?? line.pcs ?? 0
  }));
}

function retargetChallanLines(lines, challanNo) {
  const label = String(challanNo);
  return lineList(lines).map(line => ({
    ...line,
    sourceSalesOrderId: null,
    sourceOrderNo: label,
    sourceAllocations: Array.isArray(line.sourceAllocations)
      ? line.sourceAllocations.map(slice => ({
        ...slice,
        sourceSalesOrderId: null,
        sourceOrderNo: label
      }))
      : line.sourceAllocations
  }));
}

function rewriteOrderLines(lines, oldNo, newNo) {
  const from = String(oldNo);
  const to = String(newNo);
  const swap = (value) => String(value ?? '').trim() === from ? to : value;
  return lineList(lines).map(line => ({
    ...line,
    sourceOrderNo: swap(line.sourceOrderNo),
    sourceAllocations: Array.isArray(line.sourceAllocations)
      ? line.sourceAllocations.map(slice => ({ ...slice, sourceOrderNo: swap(slice.sourceOrderNo) }))
      : line.sourceAllocations
  }));
}

export function salesOrderFromFinishBill(row, orderNo, customer = null) {
  const lines = lineList(row.orderLines);
  const totals = totalsOf(lines);
  const hsn = lines.map(line => String(line.hsnCode || '').trim()).find(Boolean) || '5407';
  const note = String(row.remarks || '').trim();
  let moved = /Transferred from FINISH SALES/i.test(note)
    ? note
    : `${note}${note ? ' ' : ''}Transferred from FINISH SALES ${row.typeBillNumber}.`.trim();
  if (row.ewayBillNo && !moved.includes(String(row.ewayBillNo))) {
    moved = `${moved} E-way ${row.ewayBillNo}.`.trim();
  }
  return {
    userId: row.userId,
    customerId: row.customerId || null,
    partyName: row.buyerName,
    partyGstin: customer?.gstNumber || null,
    state: customer?.state || null,
    station: row.station || null,
    brokerName: row.agentName || null,
    transportName: row.transportName || null,
    vehicleNo: row.vehicleNo || null,
    lrNo: row.lrNo || null,
    challanNo: row.challanNo || null,
    gstType: row.gstType || null,
    hasteGstin: row.hasteGstin || null,
    dhara: row.dhara ?? null,
    grace: row.grace ?? null,
    screenSeries: row.screenSeries || null,
    orderNo,
    orderDate: row.orderDate || new Date(),
    haste: row.haste || null,
    remarks: moved,
    hsnCode: hsn,
    lineItems: lines,
    ...totals,
    status: 'open'
  };
}

/**
 * Before insert: FINISH SALES 1–20 dated before 21 Nov 2026 go in as sales
 * orders of the same number. A sales order that already holds that number
 * takes the next free number.
 */
export function divertPoonamFinishSales(orders, salesOrders) {
  const kept = [];
  const moved = [];
  for (const order of orders) {
    if (isMovedFinishSale(order)) moved.push(order);
    else kept.push(order);
  }
  if (!moved.length) return { orders, salesOrders, moved: 0, shifted: 0 };
  const used = new Set(salesOrders.map(row => Number(row.orderNo)));
  let maxNo = used.size ? Math.max(...used) : 0;
  let shifted = 0;
  for (const row of moved.sort((a, b) => a.typeBillNumber - b.typeBillNumber)) {
    const wanted = Number(row.typeBillNumber);
    if (used.has(wanted)) {
      const other = salesOrders.find(item => Number(item.orderNo) === wanted);
      maxNo += 1;
      while (used.has(maxNo)) maxNo += 1;
      other.orderNo = maxNo;
      used.add(maxNo);
      shifted += 1;
    }
    used.add(wanted);
    salesOrders.push(salesOrderFromFinishBill(row, wanted));
  }
  return { orders: kept, salesOrders, moved: moved.length, shifted };
}

function challanFromSalesOrder(so, challanNo) {
  const lines = asBillLines(so.lineItems);
  const pcs = Math.max(1, Math.round(Number(so.totalPcs) || totalsOf(lines).totalPcs || 1));
  const note = String(so.remarks || '').trim();
  const moved = /Transferred from Sales Order/i.test(note)
    ? note
    : `${note}${note ? ' ' : ''}Transferred from Sales Order ${so.orderNo}.`.trim();
  return {
    userId: so.userId,
    customerId: so.customerId || null,
    buyerName: so.partyName,
    buyerPhone: so.customer?.mobileNumber || '-',
    quantity: pcs,
    orderLines: lines,
    status: 'posted',
    remarks: moved,
    manualType: 'erp_sales',
    transactionType: 'SALES CHALLAN',
    typeBillNumber: challanNo,
    invoiceNumber: null,
    orderNumber: null,
    agentName: so.brokerName || null,
    transportName: so.transportName || null,
    discountRate: 0,
    shippingCharge: 0,
    orderDate: so.orderDate,
    haste: so.haste || null,
    station: so.station || null,
    challanNo: so.challanNo || null,
    gstType: so.gstType || null,
    lrNo: so.lrNo || null,
    vehicleNo: so.vehicleNo || null,
    dhara: so.dhara ?? null,
    grace: so.grace ?? null,
    screenSeries: so.screenSeries || null,
    hasteGstin: so.hasteGstin || null
  };
}

async function alreadyMoved(prisma, userId) {
  const [finishLeft, salesOrders, finishKept] = await Promise.all([
    prisma.order.count({
      where: { userId, transactionType: 'FINISH SALES', typeBillNumber: { gte: 1, lte: 20 } }
    }),
    prisma.salesOrder.count({ where: { userId, orderNo: { gte: 1, lte: 24 } } }),
    prisma.order.count({
      where: { userId, transactionType: 'FINISH SALES', typeBillNumber: { gte: 21, lte: 24 } }
    })
  ]);
  if (finishLeft === 0 && salesOrders === 24 && finishKept === 4) {
    const challans = await prisma.order.count({
      where: {
        userId,
        transactionType: 'SALES CHALLAN',
        status: 'posted',
        remarks: { contains: 'Transferred from Sales Order' }
      }
    });
    if (challans >= 11) return { salesOrders, challans, finishSalesKept: finishKept };
  }
  return null;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    if (!user) throw new Error('Poonam user not found');
    const userId = user.id;
    const done = await alreadyMoved(prisma, userId);
    if (done) {
      console.log(JSON.stringify({ already: true, ...done }));
      return;
    }

    const salesOrders = await prisma.salesOrder.findMany({
      where: { userId },
      include: {
        customer: { select: { gstNumber: true, state: true, mobileNumber: true } }
      },
      orderBy: { orderNo: 'asc' }
    });
    const soByNo = new Map(salesOrders.map(row => [row.orderNo, row]));
    for (let number = 1; number <= 15; number += 1) {
      if (!soByNo.has(number)) throw new Error(`Sales order ${number} is missing`);
    }
    for (const number of [21, 22, 23, 24]) {
      if (soByNo.has(number)) throw new Error(`Sales order ${number} already exists`);
    }

    const finish = await prisma.order.findMany({
      where: { userId, transactionType: 'FINISH SALES', typeBillNumber: { gte: 1, lte: 24 } },
      orderBy: { typeBillNumber: 'asc' }
    });
    const finishByNo = new Map(finish.map(row => [row.typeBillNumber, row]));
    for (let number = 1; number <= 24; number += 1) {
      if (!finishByNo.has(number)) throw new Error(`FINISH SALES ${number} is missing`);
    }
    const moving = [];
    for (let number = 1; number <= 20; number += 1) {
      const row = finishByNo.get(number);
      if (!isMovedFinishSale(row)) throw new Error(`FINISH SALES ${number} is not one of the Empire vouchers to move`);
      if (row.sourceSalesOrderId) throw new Error(`FINISH SALES ${number} already picks a sales order`);
      if (row.einvoiceIrn && row.einvoiceStatus !== 'cancelled') throw new Error(`FINISH SALES ${number} has an IRN`);
      moving.push(row);
    }
    for (const [billNo, orderNo] of [[21, 12], [22, 13], [23, 14], [24, 15]]) {
      const bill = finishByNo.get(billNo);
      const order = soByNo.get(orderNo);
      if (bill.sourceSalesOrderId !== order.id) {
        throw new Error(`FINISH SALES ${billNo} does not bill sales order ${orderNo}`);
      }
    }

    const moveIds = moving.map(row => row.id);
    const [invoiceCount, formRefs] = await Promise.all([
      prisma.salesInvoice.count({ where: { orderId: { in: moveIds } } }),
      prisma.order.count({ where: { sourceOrderFormId: { in: moveIds } } })
    ]);
    if (invoiceCount) throw new Error(`${invoiceCount} sales invoices hang off FINISH SALES 1-20`);
    if (formRefs) throw new Error(`${formRefs} bills were copied from FINISH SALES 1-20`);

    const banks = await prisma.bankEntry.findMany({
      where: { userId },
      select: {
        id: true, voucherNumber: true, entryType: true, partyName: true, amount: true,
        linkedId: true, billNumber: true, billAllocations: true
      }
    });
    const moveIdSet = new Set(moveIds);
    const bankHits = banks.filter(entry => {
      if (moveIdSet.has(entry.linkedId)) return true;
      const lines = Array.isArray(entry.billAllocations) ? entry.billAllocations : [];
      return lines.some(line => moveIdSet.has(line?.billId));
    });

    const soIds = [];
    for (let number = 1; number <= 11; number += 1) soIds.push(soByNo.get(number).id);
    const gstBills = await prisma.order.findMany({
      where: {
        userId,
        transactionType: 'FINISH SALES (GST)',
        OR: [
          { sourceSalesOrderId: { in: soIds } },
          { sourceSalesOrderIds: { hasSome: soIds } }
        ]
      }
    });
    if (gstBills.length !== 11) {
      throw new Error(`Expected 11 GST bills on sales orders 1-11, found ${gstBills.length}`);
    }
    const seen = new Map();
    for (const bill of gstBills) {
      if (!soIds.includes(bill.sourceSalesOrderId)) {
        throw new Error(`GST bill ${bill.typeBillNumber} is not billed from sales orders 1-11`);
      }
      seen.set(bill.sourceSalesOrderId, (seen.get(bill.sourceSalesOrderId) || 0) + 1);
    }
    if ([...seen.values()].some(count => count !== 1) || seen.size !== 11) {
      throw new Error('Sales orders 1-11 are not each billed once');
    }

    const maxChallan = await prisma.order.aggregate({
      where: { userId, transactionType: 'SALES CHALLAN' },
      _max: { typeBillNumber: true }
    });
    const challanStart = (maxChallan._max.typeBillNumber || 0) + 1;
    const challanEnd = challanStart + 10;
    const clash = await prisma.order.count({
      where: {
        userId,
        transactionType: 'SALES CHALLAN',
        typeBillNumber: { gte: challanStart, lte: challanEnd }
      }
    });
    if (clash) throw new Error(`Sales challan numbers ${challanStart}-${challanEnd} are already used`);

    const customerIds = [...new Set(moving.map(row => row.customerId).filter(Boolean))];
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, gstNumber: true, state: true }
    });
    const customerById = new Map(customers.map(row => [row.id, row]));
    const soById = new Map(salesOrders.map(row => [row.id, row]));

    const result = await prisma.$transaction(async (tx) => {
      const challanMap = [];
      for (let number = 1; number <= 11; number += 1) {
        const order = soByNo.get(number);
        const challanNo = challanStart + number - 1;
        await tx.order.create({ data: challanFromSalesOrder(order, challanNo) });
        challanMap.push({ salesOrder: number, challan: challanNo, party: order.partyName });
      }
      for (const bill of gstBills) {
        const order = soById.get(bill.sourceSalesOrderId);
        const challanNo = challanStart + order.orderNo - 1;
        await tx.order.update({
          where: { id: bill.id },
          data: {
            orderNumber: String(challanNo),
            sourceSalesOrderId: null,
            sourceSalesOrderIds: [],
            orderLines: retargetChallanLines(bill.orderLines, challanNo)
          }
        });
      }
      await tx.salesOrder.deleteMany({ where: { id: { in: soIds } } });

      const renumber = [[12, 21], [13, 22], [14, 23], [15, 24]];
      for (const [from, to] of renumber) {
        await tx.salesOrder.update({
          where: { id: soByNo.get(from).id },
          data: { orderNo: to }
        });
      }
      for (const [billNo, orderNo] of [[21, 12], [22, 13], [23, 14], [24, 15]]) {
        const bill = finishByNo.get(billNo);
        const nextNo = orderNo + 9;
        await tx.order.update({
          where: { id: bill.id },
          data: {
            orderNumber: String(nextNo),
            orderLines: rewriteOrderLines(bill.orderLines, orderNo, nextNo)
          }
        });
      }

      for (const bill of moving) {
        await tx.salesOrder.create({
          data: salesOrderFromFinishBill(bill, bill.typeBillNumber, customerById.get(bill.customerId))
        });
      }
      for (const entry of bankHits) {
        const lines = Array.isArray(entry.billAllocations) ? entry.billAllocations : [];
        const kept = lines.filter(line => !moveIdSet.has(line?.billId));
        const linkedMoved = moveIdSet.has(entry.linkedId);
        await tx.bankEntry.update({
          where: { id: entry.id },
          data: {
            billAllocations: kept,
            linkedId: linkedMoved ? (kept[0]?.billId || null) : entry.linkedId,
            billNumber: linkedMoved ? (kept[0]?.billNumber || null) : entry.billNumber
          }
        });
      }
      await tx.order.deleteMany({ where: { id: { in: moveIds } } });

      const [orderCount, finishLeft, finishKept, challanCount] = await Promise.all([
        tx.salesOrder.count({ where: { userId, orderNo: { gte: 1, lte: 24 } } }),
        tx.order.count({
          where: { userId, transactionType: 'FINISH SALES', typeBillNumber: { gte: 1, lte: 20 } }
        }),
        tx.order.count({
          where: { userId, transactionType: 'FINISH SALES', typeBillNumber: { gte: 21, lte: 24 } }
        }),
        tx.order.count({
          where: {
            userId,
            transactionType: 'SALES CHALLAN',
            typeBillNumber: { gte: challanStart, lte: challanEnd },
            status: 'posted'
          }
        })
      ]);
      if (orderCount !== 24 || finishLeft !== 0 || finishKept !== 4 || challanCount !== 11) {
        throw new Error(`Move did not land: orders ${orderCount}, finish left ${finishLeft}, finish kept ${finishKept}, challans ${challanCount}`);
      }
      const kept = await tx.order.findMany({
        where: { userId, transactionType: 'FINISH SALES', typeBillNumber: { gte: 21, lte: 24 } },
        select: { typeBillNumber: true, orderNumber: true, sourceSalesOrderId: true },
        orderBy: { typeBillNumber: 'asc' }
      });
      return { challanStart, challanEnd, challanMap, kept };
    }, { timeout: 120000, maxWait: 20000 });

    console.log(JSON.stringify({
      challans: `${result.challanStart}-${result.challanEnd}`,
      challanMap: result.challanMap.map(row => `${row.salesOrder}->${row.challan} ${row.party}`),
      salesOrdersFromFinishSales: '1-20',
      ewayKept: moving.filter(row => row.ewayBillNo).length,
      receiptsUnlinked: bankHits.map(entry => `${entry.entryType} ${entry.voucherNumber} ${entry.partyName} ${entry.amount}`),
      salesOrdersRenumbered: '12-15 -> 21-24',
      finishSalesKept: result.kept
    }));
  } finally {
    await prisma.$disconnect();
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
const self = fileURLToPath(import.meta.url);
if (invoked && path.normalize(invoked).toLowerCase() === path.normalize(self).toLowerCase()) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
