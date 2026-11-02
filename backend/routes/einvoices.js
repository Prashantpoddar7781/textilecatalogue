import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { getGstDocumentType } from '../constants/erpTransactionPostingRules.js';
import {
  CANCEL_REASONS,
  activeIrn,
  buildEinvoicePayload,
  cancelEinvoice,
  einvoiceDocType,
  generateEinvoice,
  plainDocNo,
  publicEinvoice,
  resolveEinvoiceConfig,
  stampFromResult,
  standInForDummy,
  validateEinvoicePayload,
  withinCancelWindow
} from '../services/einvoice.js';

const router = express.Router();
const prisma = new PrismaClient();

const text = (value) => String(value == null ? '' : value).trim();

const SALE_TYPES = ['FINISH SALES', 'FINISH SALES (GST)', 'GREY SALES', 'CASH SALES', 'FENT SALES'];
const NOTE_TYPES = ['CREDIT NOTE (ON SALES)', 'DEBIT NOTE (ON SALES)'];

function dayStart(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function dayEnd(value) {
  const date = dayStart(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function ymd(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function companyOf(profile) {
  return {
    gstin: text(profile?.gstNumber),
    legalName: text(profile?.legalName),
    tradeName: text(profile?.tradeName || profile?.legalName),
    addressLine1: text(profile?.addressLine1),
    addressLine2: text(profile?.addressLine2),
    city: text(profile?.city),
    state: text(profile?.state),
    pincode: text(profile?.pincode)
  };
}

function partyOf(customer, fallbackName, station) {
  return {
    gstin: text(customer?.gstNumber),
    tradeName: text(customer?.organizationName || fallbackName),
    addressLine1: text(customer?.address),
    addressLine2: text(customer?.addressLine2),
    city: text(customer?.city || station),
    state: text(customer?.state || station),
    pincode: text(customer?.pincode),
    placeOfSupply: text(customer?.state)
  };
}

function salesLines(orderLines) {
  const raw = Array.isArray(orderLines) ? orderLines : [];
  return raw.map((line) => ({
    itemName: text(line.itemName || line.description || line.designName),
    hsnCode: text(line.hsnCode),
    unit: text(line.unit) || 'PCS',
    quantity: Number(line.pcs ?? line.quantity) || 0,
    pcs: Number(line.pcs ?? line.quantity) || 0,
    mtsQty: Number(line.mtsQty) || 0,
    cgstRate: Number(line.cgstRate) || 0,
    sgstRate: Number(line.sgstRate) || 0,
    igstRate: Number(line.igstRate) || 0,
    cgstAmount: Number(line.cgstAmount) || 0,
    sgstAmount: Number(line.sgstAmount) || 0,
    igstAmount: Number(line.igstAmount) || 0,
    taxableAmount: Number(line.taxableAmount) || 0,
    totalAmount: Number(line.totalAmount) || 0
  }));
}

async function loadSales(userId, billId) {
  const bill = await prisma.order.findFirst({
    where: { id: billId, userId, manualType: 'erp_sales' },
    include: { customer: true }
  });
  if (!bill) return null;
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  const lines = salesLines(bill.orderLines);
  const weight = Math.round(lines.reduce((sum, line) => sum + (line.mtsQty || 0), 0) * 1000) / 1000;
  const amount = Math.round(lines.reduce((sum, line) => sum + (line.totalAmount || 0), 0) * 100) / 100;
  return {
    kind: 'sales',
    record: bill,
    profile,
    doc: {
      transactionType: bill.transactionType,
      docNo: plainDocNo(bill.typeBillNumber, bill.invoiceNumber),
      docDate: bill.orderDate || bill.createdAt,
      hsnCode: text(lines[0]?.hsnCode),
      lines
    },
    company: companyOf(profile),
    party: partyOf(bill.customer, bill.buyerName, bill.station),
    extra: {
      lrNo: text(bill.lrNo),
      lrDate: ymd(bill.lrDate),
      transportName: text(bill.transportName),
      station: text(bill.station),
      haste: text(bill.haste),
      weight,
      amount,
      ewayBillNo: bill.ewayBillStatus === 'cancelled' ? '' : text(bill.ewayBillNo),
      editPath: `/erp/sales?edit=${bill.id}&kind=bill`
    }
  };
}

function noteSeries(note) {
  if (note.noteSide !== 'sales') return '';
  return note.noteKind === 'debit' ? 'DEBIT NOTE (ON SALES)' : 'CREDIT NOTE (ON SALES)';
}

async function loadNote(userId, noteId) {
  const note = await prisma.creditDebitNote.findFirst({ where: { id: noteId, userId } });
  if (!note) return null;
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  const customer = note.customerId
    ? await prisma.customer.findFirst({ where: { id: note.customerId, userId } })
    : null;
  const series = noteSeries(note);
  const qty = Number(note.quantity) || Number(note.pieces) || 1;
  const lines = [{
    itemName: series || 'Goods',
    hsnCode: text(note.hsnSac),
    unit: Number(note.quantity) > 0 ? 'MTS' : 'PCS',
    quantity: qty,
    pcs: Number(note.pieces) || qty,
    mtsQty: Number(note.quantity) || 0,
    cgstRate: Number(note.cgstRate) || 0,
    sgstRate: Number(note.sgstRate) || 0,
    igstRate: Number(note.igstRate) || 0,
    cgstAmount: Number(note.cgstAmount) || 0,
    sgstAmount: Number(note.sgstAmount) || 0,
    igstAmount: Number(note.igstAmount) || 0,
    taxableAmount: Number(note.taxableAmount) || 0,
    totalAmount: Number(note.netAmount) || 0
  }];
  return {
    kind: 'note',
    record: note,
    profile,
    doc: {
      transactionType: series,
      docNo: plainDocNo(note.voucherNumber, note.noteNumber),
      docDate: note.noteDate,
      hsnCode: text(note.hsnSac),
      lines,
      refNo: text(note.refBillNumber || note.adjustBillNumber),
      refDate: note.refBillDate
    },
    company: companyOf(profile),
    party: partyOf(customer, note.partyName, note.placeOfSupply),
    extra: {
      lrNo: '',
      lrDate: '',
      transportName: '',
      station: text(note.placeOfSupply),
      haste: '',
      weight: Number(note.quantity) || 0,
      amount: Number(note.netAmount) || 0,
      ewayBillNo: '',
      editPath: `/erp/notes/${note.noteKind === 'debit' ? 'debit-note-sales' : 'credit-note-sales'}?edit=${note.id}`
    }
  };
}

function prepare(loaded, { dummy = false } = {}) {
  const built = buildEinvoicePayload(loaded);
  let payload = built;
  let warnings = [];
  if (dummy) {
    const stood = standInForDummy(built);
    payload = stood.payload;
    warnings = stood.warnings;
  }
  const errors = validateEinvoicePayload(payload);
  const needsIrn = Boolean(einvoiceDocType(loaded.doc.transactionType));
  if (!needsIrn) errors.unshift(`${loaded.doc.transactionType || 'This document'} is not an e-invoice series.`);
  return { payload, errors, warnings, gstDocumentType: getGstDocumentType(loaded.doc.transactionType) || '' };
}

async function generateOne(userId, id, kind, { dummy = false } = {}) {
  const loaded = kind === 'note' ? await loadNote(userId, id) : await loadSales(userId, id);
  if (!loaded) return { id, billNo: id, missing: ['This document was not found.'] };
  const billNo = loaded.doc.docNo;
  if (activeIrn(loaded.record)) {
    return { id: loaded.record.id, billNo, already: true, einvoice: publicEinvoice(loaded.record) };
  }
  if (loaded.record.einvoiceStatus === 'cancelled' && loaded.record.einvoiceMode !== 'mock') {
    return { id: loaded.record.id, billNo, missing: ['This IRN was cancelled. Raise a new voucher for a new IRN.'] };
  }
  const prepared = prepare(loaded, { dummy });
  if (prepared.errors.length) return { id: loaded.record.id, billNo, missing: prepared.errors };
  const config = resolveEinvoiceConfig(loaded.profile);
  const mode = dummy || config.mode === 'mock' ? 'mock' : config.mode;
  try {
    const result = await generateEinvoice(prepared.payload, config, { dummy: dummy || config.mode === 'mock' });
    const data = stampFromResult(result, mode);
    if (loaded.kind === 'note') await prisma.creditDebitNote.update({ where: { id: loaded.record.id }, data });
    else await prisma.order.update({ where: { id: loaded.record.id }, data });
    return { id: loaded.record.id, billNo, einvoice: publicEinvoice({ ...loaded.record, ...data }), warnings: prepared.warnings, mode };
  } catch (error) {
    const message = text(error?.message) || 'This e-invoice was not generated.';
    return { id: loaded.record.id, billNo, missing: message.split('\n').filter(Boolean) };
  }
}

function rowOf(loaded) {
  const hasIrn = activeIrn(loaded.record);
  const prepared = prepare(loaded, { dummy: false });
  const notNeeded = prepared.errors.some(message => /does not need an e-invoice|not an e-invoice series/i.test(message));
  return {
    id: loaded.record.id,
    partyName: loaded.party.tradeName,
    billNo: loaded.doc.docNo,
    date: ymd(loaded.doc.docDate),
    caseNo: loaded.doc.docNo,
    lrNo: loaded.extra.lrNo,
    lrDate: loaded.extra.lrDate,
    transportName: loaded.extra.transportName,
    irn: hasIrn ? loaded.record.einvoiceIrn : (loaded.record.einvoiceStatus === 'cancelled' ? loaded.record.einvoiceIrn : ''),
    status: loaded.record.einvoiceStatus || '',
    mode: loaded.record.einvoiceMode || '',
    ackNo: loaded.record.einvoiceAckNo || '',
    ewayBillNo: loaded.extra.ewayBillNo,
    station: loaded.extra.station,
    haste: loaded.extra.haste,
    weight: loaded.extra.weight,
    amount: loaded.extra.amount,
    editPath: loaded.extra.editPath,
    eligible: !notNeeded && prepared.errors.length === 0,
    notNeeded,
    missing: hasIrn ? [] : prepared.errors
  };
}

router.get('/reasons', authenticateToken, requireActiveSubscription, (_req, res) => {
  res.json({ reasons: CANCEL_REASONS });
});

router.get('/sales', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const transactionType = text(req.query.transactionType) || 'FINISH SALES (GST)';
    if (!SALE_TYPES.includes(transactionType)) return res.status(400).json({ error: 'Choose a sale bill type.' });
    const from = dayStart(req.query.fromDate);
    const to = dayEnd(req.query.toDate || req.query.fromDate);
    if (!from || !to) return res.status(400).json({ error: 'Choose the bill dates.' });
    const bills = await prisma.order.findMany({
      where: { userId: req.user.userId, manualType: 'erp_sales', transactionType, orderDate: { gte: from, lte: to } },
      include: { customer: true },
      orderBy: [{ orderDate: 'asc' }, { typeBillNumber: 'asc' }]
    });
    const profile = await prisma.businessProfile.findUnique({ where: { userId: req.user.userId } });
    const rows = [];
    for (const bill of bills) {
      const lines = salesLines(bill.orderLines);
      rows.push(rowOf({
        kind: 'sales',
        record: bill,
        profile,
        doc: {
          transactionType: bill.transactionType,
          docNo: plainDocNo(bill.typeBillNumber, bill.invoiceNumber),
          docDate: bill.orderDate || bill.createdAt,
          hsnCode: text(lines[0]?.hsnCode),
          lines
        },
        company: companyOf(profile),
        party: partyOf(bill.customer, bill.buyerName, bill.station),
        extra: {
          lrNo: text(bill.lrNo),
          lrDate: ymd(bill.lrDate),
          transportName: text(bill.transportName),
          station: text(bill.station),
          haste: text(bill.haste),
          weight: Math.round(lines.reduce((sum, line) => sum + (line.mtsQty || 0), 0) * 1000) / 1000,
          amount: Math.round(lines.reduce((sum, line) => sum + (line.totalAmount || 0), 0) * 100) / 100,
          ewayBillNo: bill.ewayBillStatus === 'cancelled' ? '' : text(bill.ewayBillNo),
          editPath: `/erp/sales?edit=${bill.id}&kind=bill`
        }
      }));
    }
    const config = resolveEinvoiceConfig(profile);
    res.json({
      transactionType,
      gstDocumentType: getGstDocumentType(transactionType) || '',
      mode: config.mode,
      companyName: text(profile?.tradeName || profile?.legalName),
      rows
    });
  } catch (error) {
    next(error);
  }
});

router.get('/notes', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const transactionType = text(req.query.transactionType);
    if (!NOTE_TYPES.includes(transactionType)) return res.status(400).json({ error: 'Choose a sales credit or debit note.' });
    const from = dayStart(req.query.fromDate);
    const to = dayEnd(req.query.toDate || req.query.fromDate);
    if (!from || !to) return res.status(400).json({ error: 'Choose the note dates.' });
    const noteKind = transactionType.startsWith('DEBIT') ? 'debit' : 'credit';
    const notes = await prisma.creditDebitNote.findMany({
      where: { userId: req.user.userId, noteSide: 'sales', noteKind, noteDate: { gte: from, lte: to } },
      orderBy: [{ noteDate: 'asc' }, { voucherNumber: 'asc' }]
    });
    const profile = await prisma.businessProfile.findUnique({ where: { userId: req.user.userId } });
    const rows = [];
    for (const note of notes) {
      const loaded = await loadNote(req.user.userId, note.id);
      if (loaded) rows.push(rowOf(loaded));
    }
    res.json({
      transactionType,
      gstDocumentType: getGstDocumentType(transactionType) || '',
      mode: resolveEinvoiceConfig(profile).mode,
      companyName: text(profile?.tradeName || profile?.legalName),
      rows
    });
  } catch (error) {
    next(error);
  }
});

router.post('/sales/bulk', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(text).filter(Boolean).slice(0, 100) : [];
    if (!ids.length) return res.status(400).json({ error: 'Select at least one bill.' });
    const dummy = Boolean(req.body?.dummy);
    const generated = [];
    const missing = [];
    for (const id of ids) {
      const outcome = await generateOne(req.user.userId, id, 'sales', { dummy });
      if (outcome.missing?.length) missing.push({ id: outcome.id, billNo: outcome.billNo, details: outcome.missing });
      else generated.push(outcome);
    }
    res.json({ generated, missing });
  } catch (error) {
    next(error);
  }
});

router.post('/notes/bulk', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(text).filter(Boolean).slice(0, 100) : [];
    if (!ids.length) return res.status(400).json({ error: 'Select at least one note.' });
    const dummy = Boolean(req.body?.dummy);
    const generated = [];
    const missing = [];
    for (const id of ids) {
      const outcome = await generateOne(req.user.userId, id, 'note', { dummy });
      if (outcome.missing?.length) missing.push({ id: outcome.id, billNo: outcome.billNo, details: outcome.missing });
      else generated.push(outcome);
    }
    res.json({ generated, missing });
  } catch (error) {
    next(error);
  }
});

function previewJson(loaded, config) {
  const prepared = prepare(loaded);
  return {
    mode: config.mode,
    gstDocumentType: prepared.gstDocumentType,
    docNo: loaded.doc.docNo,
    docDate: loaded.doc.docDate,
    partyName: loaded.party.tradeName,
    amount: loaded.extra.amount,
    blockers: prepared.errors,
    warnings: prepared.warnings,
    einvoice: publicEinvoice(loaded.record),
    canCancel: activeIrn(loaded.record) && withinCancelWindow(loaded.record.einvoiceAckDate),
    reasons: CANCEL_REASONS
  };
}

router.get('/sales/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const loaded = await loadSales(req.user.userId, req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Sales bill not found' });
    res.json(previewJson(loaded, resolveEinvoiceConfig(loaded.profile)));
  } catch (error) {
    next(error);
  }
});

router.get('/notes/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const loaded = await loadNote(req.user.userId, req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Note not found' });
    res.json(previewJson(loaded, resolveEinvoiceConfig(loaded.profile)));
  } catch (error) {
    next(error);
  }
});

router.post('/sales/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const outcome = await generateOne(req.user.userId, req.params.id, 'sales', { dummy: Boolean(req.body?.dummy) });
    if (outcome.missing?.[0] === 'This document was not found.') return res.status(404).json({ error: 'Sales bill not found' });
    if (outcome.already) return res.status(409).json({ error: `This bill already has IRN ${outcome.einvoice.irn}.`, einvoice: outcome.einvoice });
    if (outcome.missing?.length) return res.status(400).json({ error: outcome.missing.join('\n'), errors: outcome.missing });
    res.status(201).json({ einvoice: outcome.einvoice, docNo: outcome.billNo, warnings: outcome.warnings || [], mode: outcome.mode });
  } catch (error) {
    next(error);
  }
});

router.post('/notes/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const outcome = await generateOne(req.user.userId, req.params.id, 'note', { dummy: Boolean(req.body?.dummy) });
    if (outcome.missing?.[0] === 'This document was not found.') return res.status(404).json({ error: 'Note not found' });
    if (outcome.already) return res.status(409).json({ error: `This note already has IRN ${outcome.einvoice.irn}.`, einvoice: outcome.einvoice });
    if (outcome.missing?.length) return res.status(400).json({ error: outcome.missing.join('\n'), errors: outcome.missing });
    res.status(201).json({ einvoice: outcome.einvoice, docNo: outcome.billNo, warnings: outcome.warnings || [], mode: outcome.mode });
  } catch (error) {
    next(error);
  }
});

async function cancelOne(userId, id, kind, body) {
  const loaded = kind === 'note' ? await loadNote(userId, id) : await loadSales(userId, id);
  if (!loaded) return null;
  if (!activeIrn(loaded.record)) {
    const error = new Error('This document has no active IRN.');
    error.status = 400;
    throw error;
  }
  const config = resolveEinvoiceConfig(loaded.profile);
  const result = await cancelEinvoice(loaded.record, config, { reason: body?.reason, remark: body?.remark });
  const data = result.removed
    ? {
      einvoiceIrn: null,
      einvoiceAckNo: null,
      einvoiceAckDate: null,
      einvoiceSignedQr: null,
      einvoiceStatus: null,
      einvoiceMode: null,
      einvoiceCancelReason: null,
      einvoiceRaw: null
    }
    : {
      einvoiceStatus: 'cancelled',
      einvoiceCancelReason: text(body?.remark).slice(0, 200),
      einvoiceRaw: result.raw ?? undefined
    };
  const saved = loaded.kind === 'note'
    ? await prisma.creditDebitNote.update({ where: { id: loaded.record.id }, data })
    : await prisma.order.update({ where: { id: loaded.record.id }, data });
  return publicEinvoice(saved);
}

router.post('/sales/:id/cancel', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const loaded = await loadSales(req.user.userId, req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Sales bill not found' });
    const einvoice = await cancelOne(req.user.userId, req.params.id, 'sales', req.body);
    res.json({ einvoice, removed: !einvoice });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.post('/notes/:id/cancel', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const loaded = await loadNote(req.user.userId, req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Note not found' });
    const einvoice = await cancelOne(req.user.userId, req.params.id, 'note', req.body);
    res.json({ einvoice, removed: !einvoice });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

export default router;
