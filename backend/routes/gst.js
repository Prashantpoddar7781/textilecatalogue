import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { loadGstDocuments, monthRange } from '../utils/gstDocuments.js';
import { buildGstr1, gstDataProblems } from '../utils/gstr1.js';
import { buildGstr1Workbook, buildTableWorkbook } from '../utils/gstr1Excel.js';
import { buildGstr3bRegister } from '../utils/gstr3bRegister.js';
import { buildGstr2bMatch, matchWindowStart, parsePortalStatement } from '../utils/gstr2b.js';

const router = express.Router();
const prisma = new PrismaClient();
const guard = [authenticateToken, requireActiveSubscription];

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const STATEMENT_SOURCES = ['2B', '2A'];

function periodFrom(req, res) {
  const range = monthRange(req.query.period || req.body?.period);
  if (!range) {
    res.status(400).json({ error: 'Pick the return month (period=YYYY-MM).' });
    return null;
  }
  return range;
}

function periodLabel(period) {
  const [year, month] = period.split('-');
  return `${MONTH_NAMES[Number(month) - 1]}_${year}`;
}

function sendXlsx(res, fileName, buffer) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(Buffer.from(buffer));
}

async function findStatement(userId, period, source) {
  const wanted = STATEMENT_SOURCES.includes(String(source || '').toUpperCase())
    ? [String(source).toUpperCase()]
    : STATEMENT_SOURCES;
  for (const src of wanted) {
    const found = await prisma.gstPortalStatement.findUnique({
      where: { userId_period_source: { userId, period, source: src } }
    });
    if (found) return found;
  }
  return null;
}

router.get('/gstr-1', ...guard, async (req, res, next) => {
  try {
    const range = periodFrom(req, res);
    if (!range) return;
    res.json(await buildGstr1(prisma, req.user.userId, range));
  } catch (error) {
    next(error);
  }
});

router.get('/gstr-1/excel', ...guard, async (req, res, next) => {
  try {
    const range = periodFrom(req, res);
    if (!range) return;
    const data = await buildGstr1(prisma, req.user.userId, range);
    const buffer = await buildGstr1Workbook(data);
    sendXlsx(res, `GSTR1_${periodLabel(range.period)}.xlsx`, buffer);
  } catch (error) {
    next(error);
  }
});

router.get('/problems', ...guard, async (req, res, next) => {
  try {
    const range = periodFrom(req, res);
    if (!range) return;
    const loaded = await loadGstDocuments(prisma, req.user.userId, range, { includeChallans: true });
    const problems = gstDataProblems(loaded.docs, loaded.businessCode);
    res.json({
      period: range.period,
      invalidGstins: problems.filter(row => /not a valid GSTIN/.test(row.issue)),
      problems
    });
  } catch (error) {
    next(error);
  }
});

/** Statements of earlier months in the matching window (they decide what is already reconciled). */
async function earlierStatements(userId, range, prevYear) {
  const startPeriod = matchWindowStart(range.fromDate, prevYear).slice(0, 7);
  return prisma.gstPortalStatement.findMany({
    where: { userId, period: { gte: startPeriod, lt: range.period } },
    select: { period: true, source: true, rows: true }
  });
}

const wantsPrevYear = (value) => value === true || value === '1' || value === 'true';

async function runMatch(userId, range, source, prevYear = false) {
  const statement = await findStatement(userId, range.period, source);
  const [earlier, saved] = await Promise.all([
    earlierStatements(userId, range, prevYear),
    prisma.gstReconciliation.findMany({ where: { userId } })
  ]);
  const result = await buildGstr2bMatch(prisma, userId, range, statement, earlier, { saved, prevYear });
  return { statement, result };
}

async function registerFor(userId, range) {
  const { statement, result: match } = await runMatch(userId, range);
  const result = await buildGstr3bRegister(prisma, userId, range, { reconciledIds: match.reconciledIds, hasStatement: Boolean(statement) });
  return { ...result, statementSource: statement?.source || null };
}

router.get('/gstr-3b-register', ...guard, async (req, res, next) => {
  try {
    const range = periodFrom(req, res);
    if (!range) return;
    res.json(await registerFor(req.user.userId, range));
  } catch (error) {
    next(error);
  }
});

router.get('/gstr-3b-register/excel', ...guard, async (req, res, next) => {
  try {
    const range = periodFrom(req, res);
    if (!range) return;
    const data = await registerFor(req.user.userId, range);
    const rows = [];
    for (const type of data.register) {
      for (const sub of type.subTypes) {
        for (const tran of sub.tranTypes) {
          for (const doc of tran.docs) {
            rows.push([type.type3b, sub.subType, tran.transactionType, doc.date, doc.docNo, doc.partyBillNo,
              doc.partyName, doc.partyGstin, doc.taxable, doc.igst, doc.cgst, doc.sgst, 0, doc.billAmount, doc.ledgerAmount]);
          }
        }
        rows.push(['', `Total ${sub.subType}`, '', '', '', '', '', '', sub.totals.taxable, sub.totals.igst,
          sub.totals.cgst, sub.totals.sgst, 0, sub.totals.billAmount, sub.totals.ledgerAmount]);
      }
      rows.push([`Total ${type.type3b}`, '', '', '', '', '', '', '', type.totals.taxable, type.totals.igst,
        type.totals.cgst, type.totals.sgst, 0, type.totals.billAmount, type.totals.ledgerAmount]);
    }
    const buffer = await buildTableWorkbook('GSTR-3B Register', `GSTR-3B Register ${periodLabel(range.period)}`,
      ['3B Type', 'Sub Type', 'Tran Type', 'Date', 'V.No.', 'Party Bill No.', 'Party', 'GSTIN', 'Taxable',
        'IGST', 'CGST', 'SGST', 'Cess', 'Bill Amount', 'Ledger Amt'], rows);
    sendXlsx(res, `GSTR3B_Register_${periodLabel(range.period)}.xlsx`, buffer);
  } catch (error) {
    next(error);
  }
});

router.get('/portal-statements', ...guard, async (req, res, next) => {
  try {
    const statements = await prisma.gstPortalStatement.findMany({
      where: { userId: req.user.userId },
      select: { id: true, period: true, source: true, fileName: true, rowCount: true, createdAt: true, updatedAt: true },
      orderBy: [{ period: 'desc' }, { source: 'asc' }]
    });
    res.json({ statements });
  } catch (error) {
    next(error);
  }
});

router.post('/portal-statements', ...guard, async (req, res, next) => {
  try {
    const range = periodFrom(req, res);
    if (!range) return;
    const source = String(req.body?.source || '2B').toUpperCase();
    if (!STATEMENT_SOURCES.includes(source)) {
      return res.status(400).json({ error: 'Source must be 2B or 2A.' });
    }
    const fileName = String(req.body?.fileName || '').trim();
    const content = String(req.body?.contentBase64 || '').replace(/^data:[^,]*,/, '');
    if (!fileName || !content) {
      return res.status(400).json({ error: 'Attach the GSTR-2B / 2A file.' });
    }
    let rows;
    try {
      rows = await parsePortalStatement(fileName, Buffer.from(content, 'base64'));
    } catch (error) {
      return res.status(error.status || 400).json({ error: error.message || 'Could not read the file.' });
    }
    const saved = await prisma.gstPortalStatement.upsert({
      where: { userId_period_source: { userId: req.user.userId, period: range.period, source } },
      create: { userId: req.user.userId, period: range.period, source, fileName, rows, rowCount: rows.length },
      update: { fileName, rows, rowCount: rows.length },
      select: { id: true, period: true, source: true, fileName: true, rowCount: true, createdAt: true, updatedAt: true }
    });
    res.json({ statement: saved });
  } catch (error) {
    next(error);
  }
});

router.delete('/portal-statements/:id', ...guard, async (req, res, next) => {
  try {
    const result = await prisma.gstPortalStatement.deleteMany({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!result.count) return res.status(404).json({ error: 'Statement not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

async function matchFor(req, res) {
  const range = periodFrom(req, res);
  if (!range) return null;
  const input = { ...req.query, ...(req.body || {}) };
  const { statement, result } = await runMatch(req.user.userId, range, input.source, wantsPrevYear(input.prevYear));
  return { range, statement, result };
}

/** Save Reconciliation Status: all MATCHED rows (or the picked ones), or Mark Directly as Reconciled. */
router.post('/reconciliations', ...guard, async (req, res, next) => {
  try {
    const found = await matchFor(req, res);
    if (!found) return;
    const { range, statement, result } = found;
    const direct = req.body?.mode === 'direct';
    const picked = new Set(Array.isArray(req.body?.rowKeys) ? req.body.rowKeys.map(String) : []);
    const rows = result.rows.filter(row => (direct
      ? picked.has(row.rowKey)
      : row.status === 'MATCHED' && (!picked.size || picked.has(row.rowKey))));
    if (!rows.length) {
      return res.status(400).json({ error: direct ? 'Tick the bills to mark as reconciled.' : 'No matched bills to save.' });
    }
    await prisma.gstReconciliation.createMany({
      data: rows.map(row => ({
        userId: req.user.userId,
        period: range.period,
        source: statement?.source || 'NONE',
        method: direct ? 'DIRECT' : 'MATCHED',
        status: row.status,
        bookIds: row.bookIds,
        portalKey: row.portalKey || null,
        gstin: row.gstin || null,
        partyName: row.partyName || null,
        billNo: row.book?.billNo || null,
        billDate: row.book?.date || null,
        portalDocNo: row.portal?.docNo || null,
        portalDate: row.portal?.date || null,
        bookTax: row.book?.tax || 0,
        portalTax: row.portal?.tax || 0
      }))
    });
    res.json({ saved: rows.length });
  } catch (error) {
    next(error);
  }
});

router.delete('/reconciliations/:id', ...guard, async (req, res, next) => {
  try {
    const result = await prisma.gstReconciliation.deleteMany({ where: { id: req.params.id, userId: req.user.userId } });
    if (!result.count) return res.status(404).json({ error: 'Saved reconciliation not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const BOOK_BILL_NO_FIELD = {
  purchase_bill: ['purchaseBill', 'supplierBillNo'],
  grey_purchase: ['greyPurchase', 'billNo'],
  grey_return: ['greyPurchaseReturn', 'billNo'],
  mill_receipt: ['millReceipt', 'billNo'],
  work_receipt: ['workReceipt', 'billNo']
};

/** Edit Bill Nos. in mismatched: fix the party bill no. in the books and/or on the uploaded 2B row. */
router.post('/gstr-2b-match/bill-no', ...guard, async (req, res, next) => {
  try {
    const found = await matchFor(req, res);
    if (!found) return;
    const { statement, result } = found;
    const row = result.rows.find(r => r.rowKey === String(req.body?.rowKey || ''));
    if (!row) return res.status(404).json({ error: 'Bill not found in the matching. Refresh and try again.' });
    const bookBillNo = String(req.body?.bookBillNo ?? '').trim();
    const portalDocNo = String(req.body?.portalDocNo ?? '').trim();

    if (bookBillNo && row.book && bookBillNo !== row.book.billNo) {
      const target = BOOK_BILL_NO_FIELD[row.bookSource];
      if (!target) return res.status(400).json({ error: 'Open the entry to change the number of this document.' });
      const [model, field] = target;
      await prisma[model].updateMany({
        where: { id: { in: row.bookIds }, userId: req.user.userId },
        data: { [field]: bookBillNo }
      });
    }

    if (portalDocNo && row.portal && statement && portalDocNo !== row.portal.docNo) {
      const rows = (Array.isArray(statement.rows) ? statement.rows : [])
        .map(r => (r.key === row.portal.rowId ? { ...r, docNo: portalDocNo } : r));
      await prisma.gstPortalStatement.update({ where: { id: statement.id }, data: { rows } });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/gstr-2b-match', ...guard, async (req, res, next) => {
  try {
    const found = await matchFor(req, res);
    if (!found) return;
    const { reconciledIds, ...rest } = found.result;
    res.json(rest);
  } catch (error) {
    next(error);
  }
});

router.get('/gstr-2b-match/excel', ...guard, async (req, res, next) => {
  try {
    const found = await matchFor(req, res);
    if (!found) return;
    const { range, result } = found;
    const rows = result.rows.map(row => [
      row.status, row.partyName, row.gstin,
      row.book?.voucherNo || '', row.book?.billNo || '', row.book?.date || '', row.book?.transactionType || '',
      row.book?.taxable ?? '', row.book?.tax ?? '',
      row.portal?.docNo || '', row.portal?.date || '', row.portal?.taxable ?? '', row.portal?.tax ?? '',
      row.taxableDiff || '', row.taxDiff || '', row.remark
    ]);
    const source = result.statement?.source || '2B';
    const buffer = await buildTableWorkbook(`GSTR-${source} Matching`, `GSTR-${source} Matching ${periodLabel(range.period)}`,
      ['Status', 'Party', 'GSTIN', 'Our V.No.', 'Party Bill No.', 'Bill Date', 'Tran Type', 'Books Taxable',
        'Books Tax', 'Portal Bill No.', 'Portal Date', 'Portal Taxable', 'Portal Tax', 'Taxable Diff', 'Tax Diff', 'Remark'],
      rows);
    sendXlsx(res, `GSTR${source}_Matching_${periodLabel(range.period)}.xlsx`, buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
