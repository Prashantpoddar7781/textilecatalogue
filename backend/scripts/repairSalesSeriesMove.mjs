/**
 * Poonam, 21 Nov 2026. Sales orders 1–11 are sales challans 1468–1478.
 * Sales orders 12–15 are 21–24. FINISH SALES 1–20 stay invoices. Running this
 * script puts those invoices back if they were copied into sales orders, and
 * puts bank receipt 542 of SHYAM TRADING CO. back onto FINISH SALES 2.
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
import { mapOrderToPendingBill } from '../utils/orderBilling.js';

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
 * FINISH SALES 1–20 stay invoices. An earlier pass moved them into sales
 * orders; that was put back. This returns the arrays unchanged.
 */
export function divertPoonamFinishSales(orders, salesOrders) {
  return { orders, salesOrders, moved: 0, shifted: 0 };
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

const EMPIRE_FINAL = {
  1: 42027, 2: 41826, 3: 41889, 4: 41889, 5: 42015,
  6: 42878, 7: 43401, 8: 43117, 9: 41076, 10: 42903,
  11: 43136, 12: 43042, 13: 42796, 14: 42928, 15: 42916,
  16: 43042, 17: 42985, 18: 40369, 19: 41909, 20: 42213
};

function originalRemark(remarks) {
  return String(remarks || '')
    .replace(/\s*Transferred from FINISH SALES \d+\.?(?:\s*E-way \d+\.?)?/i, '')
    .trim();
}

function ewayOf(remarks) {
  const match = String(remarks || '').match(/E-way (\d+)/i);
  return match ? match[1] : null;
}

async function restoreFinishSales() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    if (!user) throw new Error('Poonam user not found');
    const userId = user.id;
    const copies = await prisma.salesOrder.findMany({
      where: {
        userId,
        orderNo: { gte: 1, lte: 20 },
        remarks: { contains: 'Transferred from FINISH SALES' }
      },
      include: { customer: { select: { mobileNumber: true, organizationName: true } } },
      orderBy: { orderNo: 'asc' }
    });
    const already = await prisma.order.count({
      where: { userId, transactionType: 'FINISH SALES', typeBillNumber: { gte: 1, lte: 20 } }
    });
    if (already === 20 && copies.length === 0) {
      console.log(JSON.stringify({ already: true, finishSales: 20 }));
      return;
    }
    if (already > 0) throw new Error(`FINISH SALES 1-20 already has ${already} vouchers`);
    if (copies.length !== 20) throw new Error(`Expected 20 copied sales orders, found ${copies.length}`);

    const result = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const copy of copies) {
        const finalAmt = EMPIRE_FINAL[copy.orderNo];
        const lines = Array.isArray(copy.lineItems) ? copy.lineItems : [];
        const bill = await tx.order.create({
          data: {
            userId,
            customerId: copy.customerId || null,
            buyerName: copy.partyName,
            buyerPhone: copy.customer?.mobileNumber || '-',
            quantity: Math.max(1, Math.round(Number(copy.totalPcs) || 1)),
            orderLines: lines,
            status: 'completed',
            remarks: originalRemark(copy.remarks),
            manualType: 'erp_sales',
            transactionType: 'FINISH SALES',
            typeBillNumber: copy.orderNo,
            invoiceNumber: null,
            orderNumber: null,
            agentName: copy.brokerName || null,
            transportName: copy.transportName || null,
            discountRate: 0,
            shippingCharge: roundMoney(finalAmt - (Number(copy.grossAmount) || 0)),
            orderDate: copy.orderDate,
            haste: copy.haste || null,
            station: copy.station || null,
            challanNo: copy.challanNo || null,
            gstType: copy.gstType || null,
            lrNo: copy.lrNo || null,
            vehicleNo: copy.vehicleNo || null,
            dhara: copy.dhara ?? null,
            grace: copy.grace ?? null,
            screenSeries: copy.screenSeries || null,
            hasteGstin: copy.hasteGstin || null,
            ewayBillNo: ewayOf(copy.remarks)
          }
        });
        created.push(bill);
      }
      const bill2 = created.find(row => row.typeBillNumber === 2);
      const receipt = await tx.bankEntry.findFirst({
        where: {
          userId,
          entryType: 'receipt',
          voucherNumber: '542',
          partyName: 'SHYAM TRADING CO.'
        }
      });
      if (!receipt) throw new Error('Bank receipt 542 of SHYAM TRADING CO. was not found');
      const pending = mapOrderToPendingBill(
        { ...bill2, customer: copies.find(row => row.orderNo === 2)?.customer || null },
        new Map()
      );
      await tx.bankEntry.update({
        where: { id: receipt.id },
        data: {
          linkedId: bill2.id,
          linkedType: 'order',
          billNumber: '2',
          billAllocations: [{
            ...pending,
            adjustAmount: 41825.7,
            discountAmount: 0,
            discountPercent: 0,
            paidAmount: 41825.7,
            pendingAmount: 0,
            adjustDirection: 'add'
          }]
        }
      });
      await tx.salesOrder.deleteMany({ where: { id: { in: copies.map(row => row.id) } } });
      const restored = await tx.order.count({
        where: { userId, transactionType: 'FINISH SALES', typeBillNumber: { gte: 1, lte: 20 }, status: 'completed' }
      });
      const leftover = await tx.salesOrder.count({
        where: { userId, orderNo: { gte: 1, lte: 20 } }
      });
      if (restored !== 20 || leftover !== 0) {
        throw new Error(`Restore did not land: invoices ${restored}, sales orders 1-20 left ${leftover}`);
      }
      return { restored, receipt: receipt.voucherNumber, bill2: bill2.id };
    }, { timeout: 120000, maxWait: 20000 });
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
const self = fileURLToPath(import.meta.url);
if (invoked && path.normalize(invoked).toLowerCase() === path.normalize(self).toLowerCase()) {
  restoreFinishSales().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
