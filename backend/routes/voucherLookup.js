import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { isExpensePurchaseType } from '../constants/erpTransactionTypes.js';
import { parseNoteType } from '../constants/creditDebitNoteTypes.js';
import { parseVoucherNumber, parseVoucherText } from '../utils/parseVoucherNumber.js';

const router = express.Router();
const prisma = new PrismaClient();

const text = (value) => String(value == null ? '' : value).trim();

function hit(id, editPath, extra = {}) {
  return { id, editPath, ...extra };
}

/**
 * Look up a saved voucher by the number the user typed in the voucher field.
 * Returns the document id and the same edit URL the reports already use.
 */
router.get('/lookup', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const module = text(req.query.module).toLowerCase();
    const transactionType = text(req.query.transactionType);
    const raw = text(req.query.voucher);
    const numeric = parseVoucherNumber(raw);
    const asText = parseVoucherText(raw);

    if (!module || (!numeric && !asText)) {
      return res.status(400).json({ error: 'Type a voucher number.' });
    }

    let found = null;

    if (module === 'sales') {
      if (!numeric) return res.status(404).json({ error: 'No sales bill with that voucher number.' });
      const where = {
        userId,
        manualType: 'erp_sales',
        typeBillNumber: numeric,
        ...(transactionType ? { transactionType } : {})
      };
      const bill = await prisma.order.findFirst({
        where,
        select: { id: true, transactionType: true, typeBillNumber: true },
        orderBy: { createdAt: 'desc' }
      });
      if (bill) found = hit(bill.id, `/erp/sales?edit=${bill.id}&kind=bill`, { kind: 'bill' });
    } else if (module === 'sales-order') {
      if (!numeric) return res.status(404).json({ error: 'No sales order with that number.' });
      const order = await prisma.salesOrder.findFirst({
        where: { userId, orderNo: numeric },
        select: { id: true, orderNo: true },
        orderBy: { createdAt: 'desc' }
      });
      if (order) found = hit(order.id, `/erp/sales?edit=${order.id}&kind=order`, { kind: 'order' });
    } else if (module === 'purchase' || module === 'expenses') {
      if (!numeric) return res.status(404).json({ error: 'No purchase voucher with that number.' });
      const bills = await prisma.purchaseBill.findMany({
        where: {
          userId,
          typeBillNumber: numeric,
          ...(transactionType ? { transactionType } : {})
        },
        select: { id: true, transactionType: true },
        orderBy: { createdAt: 'desc' }
      });
      const bill = bills.find((row) => {
        const expense = isExpensePurchaseType(row.transactionType);
        return module === 'expenses' ? expense : !expense;
      }) || (!transactionType ? bills[0] : null);
      if (bill) {
        const path = isExpensePurchaseType(bill.transactionType)
          ? `/erp/expenses?edit=${bill.id}`
          : `/erp/purchase?edit=${bill.id}`;
        found = hit(bill.id, path);
      }
    } else if (module === 'grey-purchase') {
      if (!numeric) return res.status(404).json({ error: 'No grey purchase with that voucher number.' });
      const entry = await prisma.greyPurchase.findFirst({
        where: {
          userId,
          OR: [{ typeBillNumber: numeric }, { srNo: numeric }]
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) found = hit(entry.id, `/erp/grey-purchase?edit=${entry.id}`);
    } else if (module === 'grey-purchase-return') {
      if (!numeric) return res.status(404).json({ error: 'No grey purchase return with that voucher number.' });
      const entry = await prisma.greyPurchaseReturn.findFirst({
        where: { userId, voucherNo: numeric },
        select: { id: true },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) found = hit(entry.id, `/erp/grey-purchase-return?edit=${entry.id}`);
    } else if (module === 'grey-dispatch') {
      const entry = await prisma.greyDispatch.findFirst({
        where: {
          userId,
          OR: [
            ...(numeric ? [{ srNo: numeric }] : []),
            ...(asText ? [{ challanNo: asText }, { challanNo: String(numeric || '') }] : [])
          ]
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) found = hit(entry.id, `/erp/grey-dispatch?edit=${entry.id}`);
    } else if (module === 'mill-receipt') {
      if (!numeric) return res.status(404).json({ error: 'No mill receipt with that voucher number.' });
      const entry = await prisma.millReceipt.findFirst({
        where: { userId, voucherNo: numeric },
        select: { id: true },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) found = hit(entry.id, `/erp/mill-receipt?edit=${entry.id}`);
    } else if (module === 'work-receipt') {
      if (!numeric) return res.status(404).json({ error: 'No work receipt with that voucher number.' });
      const entry = await prisma.workReceipt.findFirst({
        where: {
          userId,
          voucherNo: numeric,
          ...(transactionType ? { transactionType } : {})
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) found = hit(entry.id, `/erp/work-receipt?edit=${entry.id}`);
    } else if (module === 'work-despatch') {
      const entry = await prisma.workDespatch.findFirst({
        where: {
          userId,
          status: { not: 'cancelled' },
          OR: [
            ...(asText ? [{ challanNo: asText }] : []),
            ...(numeric ? [{ challanNo: String(numeric) }] : [])
          ]
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) found = hit(entry.id, `/erp/work-despatch?edit=${entry.id}`);
    } else if (module === 'bank') {
      const entry = await prisma.bankEntry.findFirst({
        where: {
          userId,
          ...(transactionType ? { transactionType } : {}),
          OR: [
            ...(asText ? [{ voucherNumber: asText }] : []),
            ...(numeric ? [{ voucherNumber: String(numeric) }] : [])
          ]
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) found = hit(entry.id, `/erp/bank?edit=${entry.id}`);
    } else if (module === 'note') {
      if (!numeric) return res.status(404).json({ error: 'No note with that voucher number.' });
      const type = parseNoteType(transactionType);
      const entry = await prisma.creditDebitNote.findFirst({
        where: {
          userId,
          voucherNumber: numeric,
          ...(type ? { noteKind: type.noteKind, noteSide: type.noteSide } : {})
        },
        select: { id: true, noteKind: true, noteSide: true },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) {
        found = hit(
          entry.id,
          `/erp/notes/${entry.noteKind}-note-${entry.noteSide}?edit=${entry.id}&type=${encodeURIComponent(type?.value || transactionType)}`
        );
      }
    } else if (module === 'journal') {
      if (!numeric) return res.status(404).json({ error: 'No journal voucher with that number.' });
      const entry = await prisma.journalVoucher.findFirst({
        where: { userId, typeBillNumber: numeric },
        select: { id: true },
        orderBy: { createdAt: 'desc' }
      });
      if (entry) found = hit(entry.id, `/erp/journal?edit=${entry.id}`);
    } else {
      return res.status(400).json({ error: `Unknown module "${module}".` });
    }

    if (!found) {
      return res.status(404).json({
        error: `No voucher ${raw} found${transactionType ? ` for ${transactionType}` : ''}.`
      });
    }

    res.json(found);
  } catch (error) {
    next(error);
  }
});

export default router;
