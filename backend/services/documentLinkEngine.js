/**
 * Document link engine.
 *
 * The Transaction Types master says which document each voucher is raised against
 * (PREVIOUS LINK / NEXT LINK). This turns those declarations into working pickers:
 * given a target series such as WORK REC. BILLS it finds the pending source
 * documents that may feed it, and validates a saved document's lines back against
 * each source's remaining quantity.
 *
 * A target may draw on several source documents at once — one work receipt bill
 * covering ten work despatch challans — so every line carries the id of the source
 * document it came from.
 *
 * Adding a new linked flow (sales bill against sales orders, mill receipt against
 * grey dispatches) means registering one adapter below; the link map itself already
 * comes from the master.
 */

import { PrismaClient } from '@prisma/client';
import { roundMoney } from '../utils/orderBilling.js';
import {
  getPostingRule,
  getSourceSeriesFor,
  copiesItemDetailsFromSource,
  requiresCompulsoryLink,
  showsAllEntriesInPick
} from '../constants/erpTransactionPostingRules.js';
import { buildDespatchPending } from '../routes/workDespatches.js';

const prisma = new PrismaClient();

const QTY_TOLERANCE = 0.01;

const WORK_DESPATCH_SERIES = [
  'WORK DESP CHALLAN',
  'WORK DESP.SUIT CHALLAN',
  'WORK DESP.LACE SUIT CHALLAN',
  'WORK DESP LACE CHALLAN',
  'WORK DESP POONAM CHALLAN',
  'WORK DESP POONAM LACE CHALLAN'
];

/** Normalizes a work despatch + its pending state into the engine's source shape. */
function toWorkDespatchSource(pending, despatch) {
  return {
    sourceSeries: despatch.transactionType,
    sourceId: despatch.id,
    documentNo: despatch.challanNo,
    documentDate: despatch.despatchDate,
    partyName: despatch.partyName,
    partyGstin: despatch.partyGstin,
    placeOfSupply: despatch.placeOfSupply,
    stateCode: despatch.stateCode,
    gstType: despatch.gstType,
    brokerName: despatch.brokerName,
    workType: despatch.workType,
    companyName: despatch.companyName,
    totalPcs: pending.totalPcs,
    totalMts: pending.totalMts,
    receivedPcs: pending.receivedPcs,
    receivedMts: pending.receivedMts,
    pendingPcs: pending.pendingPcs,
    pendingMts: pending.pendingMts,
    lineItems: pending.lineItems,
    pendingLines: pending.pendingLines
  };
}

const WORK_DESPATCH_ADAPTER = {
  key: 'workDespatch',
  label: 'Work Desp Challan',
  series: WORK_DESPATCH_SERIES,

  async listPending({ userId, partyName, seriesNames, excludeTargetId, includeFullyConsumed }) {
    const despatches = await prisma.workDespatch.findMany({
      where: {
        userId,
        status: { not: 'cancelled' },
        ...(partyName ? { partyName: { equals: partyName, mode: 'insensitive' } } : {}),
        ...(seriesNames && seriesNames.length ? { transactionType: { in: seriesNames } } : {})
      },
      orderBy: [{ despatchDate: 'asc' }, { createdAt: 'asc' }],
      take: 300
    });
    const sources = [];
    for (const despatch of despatches) {
      const pending = await buildDespatchPending(despatch, excludeTargetId);
      const hasPending = pending.pendingPcs > 0.001 || pending.pendingMts > 0.001;
      if (hasPending || includeFullyConsumed) {
        sources.push(toWorkDespatchSource(pending, despatch));
      }
    }
    return sources;
  },

  async loadByIds({ userId, ids, excludeTargetId }) {
    const despatches = await prisma.workDespatch.findMany({
      where: { userId, id: { in: ids }, status: { not: 'cancelled' } }
    });
    const sources = [];
    for (const despatch of despatches) {
      const pending = await buildDespatchPending(despatch, excludeTargetId);
      sources.push(toWorkDespatchSource(pending, despatch));
    }
    return sources;
  }
};

const ADAPTERS = [WORK_DESPATCH_ADAPTER];

const ADAPTER_BY_SERIES = new Map();
for (const adapter of ADAPTERS) {
  for (const series of adapter.series) {
    ADAPTER_BY_SERIES.set(series.toUpperCase(), adapter);
  }
}

/**
 * Which source series may feed `targetSeries`.
 *
 * `fromMaster` is false when the master declares no link for this series — the
 * caller should then fall back to its previous behaviour rather than show an empty
 * picker. Our older receipt types (WORK REC. CHALLAN, WORK REC. BILL) have no link
 * row, and must keep working.
 */
export function resolveSourceSeries(targetSeries) {
  const declared = getSourceSeriesFor(targetSeries).filter(series =>
    ADAPTER_BY_SERIES.has(series.toUpperCase())
  );
  if (declared.length) return { series: declared, fromMaster: true };

  const adapter = inferAdapterForTarget(targetSeries);
  if (adapter) return { series: adapter.series, fromMaster: false };
  return { series: [], fromMaster: false };
}

/**
 * Series with no link row still need a picker. Work receipts of any name pick work
 * despatch challans.
 */
function inferAdapterForTarget(targetSeries) {
  const upper = String(targetSeries || '').trim().toUpperCase();
  if (upper.includes('WORK REC')) return WORK_DESPATCH_ADAPTER;
  return null;
}

function adaptersFor(seriesNames) {
  const grouped = new Map();
  for (const series of seriesNames) {
    const adapter = ADAPTER_BY_SERIES.get(series.toUpperCase());
    if (!adapter) continue;
    const list = grouped.get(adapter.key) || { adapter, seriesNames: [] };
    list.seriesNames.push(series);
    grouped.set(adapter.key, list);
  }
  return Array.from(grouped.values());
}

/**
 * Pending source documents that may be picked for a new or edited target document.
 *
 * `excludeTargetId` must be the id of the document being edited, so its own
 * consumption is not counted against the pending it is allowed to claim.
 */
export async function listPendingSources({ userId, targetSeries, partyName, excludeTargetId = null }) {
  const { series, fromMaster } = resolveSourceSeries(targetSeries);
  if (!series.length) return { sources: [], sourceSeries: [], fromMaster };

  const includeFullyConsumed = showsAllEntriesInPick(targetSeries);
  const groups = adaptersFor(series);
  const sources = [];
  for (const { adapter, seriesNames } of groups) {
    const rows = await adapter.listPending({
      userId,
      partyName,
      // When the link map is silent we deliberately do not filter by series.
      seriesNames: fromMaster ? seriesNames : null,
      excludeTargetId,
      includeFullyConsumed
    });
    sources.push(...rows);
  }
  sources.sort((a, b) => new Date(a.documentDate) - new Date(b.documentDate));
  return { sources, sourceSeries: series, fromMaster };
}

/** Loads specific source documents by id, for validation when saving. */
export async function loadSourcesByIds({ userId, targetSeries, ids, excludeTargetId = null }) {
  const unique = Array.from(new Set((ids || []).map(id => String(id)).filter(Boolean)));
  if (!unique.length) return [];
  const { series } = resolveSourceSeries(targetSeries);
  const groups = adaptersFor(series.length ? series : WORK_DESPATCH_SERIES);
  const sources = [];
  for (const { adapter } of groups) {
    const rows = await adapter.loadByIds({ userId, ids: unique, excludeTargetId });
    sources.push(...rows);
  }
  return sources;
}

/**
 * Tags each line with the source document it belongs to and checks the totals per
 * source against that source's remaining quantity.
 *
 * Lines that already name a source keep it. Lines that don't are attributed to the
 * only selected source, which is what a single-challan payload from the old screen
 * looks like.
 */
export function attributeLinesToSources({ lines, sources }) {
  const byId = new Map(sources.map(source => [source.sourceId, source]));
  const errors = [];

  const tagged = lines.map(line => {
    const declared = line.sourceDespatchId ? String(line.sourceDespatchId) : null;
    const resolvedId = declared || (sources.length === 1 ? sources[0].sourceId : null);
    if (!resolvedId) {
      errors.push(`Line ${line.lineNo} (${line.itemName || 'item'}) does not say which challan it came from.`);
      return line;
    }
    const source = byId.get(resolvedId);
    if (!source) {
      errors.push(`Line ${line.lineNo} (${line.itemName || 'item'}) refers to a challan that is not selected.`);
      return line;
    }
    return {
      ...line,
      sourceDespatchId: source.sourceId,
      sourceChallanNo: line.sourceChallanNo || source.documentNo,
      sourceLineNo: line.sourceLineNo != null ? line.sourceLineNo : null
    };
  });

  if (errors.length) return { lines: tagged, perSource: [], errors };

  const perSource = [];
  for (const source of sources) {
    const mine = tagged.filter(line => line.sourceDespatchId === source.sourceId);
    const pcs = roundMoney(mine.reduce((sum, line) => sum + (Number(line.pcs) || 0), 0));
    const mts = roundMoney(mine.reduce((sum, line) => sum + (Number(line.mtsQty) || 0), 0));
    perSource.push({ source, lines: mine, pcs, mts });

    if (pcs > source.pendingPcs + QTY_TOLERANCE || mts > source.pendingMts + QTY_TOLERANCE) {
      errors.push(
        `Challan ${source.documentNo || source.sourceId}: only ${source.pendingPcs} pcs / ${source.pendingMts} mts pending, `
        + `but ${pcs} pcs / ${mts} mts entered.`
      );
    }
  }

  const claimed = new Set(tagged.map(line => line.sourceDespatchId));
  const unused = sources.filter(source => !claimed.has(source.sourceId));

  return { lines: tagged, perSource, unused, errors };
}

/**
 * Seeds receipt lines from the pending lines of the picked source documents, each
 * tagged with where it came from.
 */
export function seedLinesFromSources(sources) {
  const lines = [];
  let lineNo = 1;
  for (const source of sources) {
    for (const pendingLine of source.pendingLines || []) {
      lines.push({
        lineNo: lineNo++,
        sourceDespatchId: source.sourceId,
        sourceChallanNo: source.documentNo,
        sourceLineNo: pendingLine.lineNo,
        itemName: pendingLine.itemName,
        bundles: pendingLine.bundles,
        jobType: pendingLine.jobType,
        unit: pendingLine.unit,
        pcs: pendingLine.pendingPcs,
        cut: pendingLine.cut,
        mtsQty: pendingLine.pendingMts,
        rate: pendingLine.rate,
        fabricRate: pendingLine.fabricRate
      });
    }
  }
  return lines;
}

/** Link-driven behaviour flags for the entry screen. */
export function linkBehaviour(targetSeries) {
  const rule = getPostingRule(targetSeries);
  const { series, fromMaster } = resolveSourceSeries(targetSeries);
  return {
    sourceSeries: series,
    fromMaster,
    compulsoryLink: requiresCompulsoryLink(targetSeries),
    copyItemDetails: copiesItemDetailsFromSource(targetSeries),
    showAllEntriesInPick: showsAllEntriesInPick(targetSeries),
    seriesCode: rule?.seriesCode || null
  };
}
