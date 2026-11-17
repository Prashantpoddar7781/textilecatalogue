/**
 * Checks the multi-challan attribution rules without touching the database.
 *   node backend/scripts/testDocumentLinks.mjs
 */

import assert from 'assert';
import { linesForSource, hasPerLineSources, sourceLineKey, qtySlicesForSalesOrder } from '../utils/documentLinkAttribution.js';
import { attributeLinesToSources } from '../services/documentLinkEngine.js';
import { allocateWorkReceipts, impliedDiscountPercent } from '../utils/workDespatchAllocation.js';
import { isInterStateSupply } from '../utils/gstCalculation.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`);
    process.exitCode = 1;
  }
}

const source = (id, challan, pendingPcs, pendingMts = pendingPcs * 6.3) => ({
  sourceId: id,
  documentNo: challan,
  pendingPcs,
  pendingMts,
  partyName: 'RAJESH EMB'
});

console.log('legacy receipts (no per-line source tag)');

test('whole receipt counts against its primary despatch', () => {
  const receipt = {
    workDespatchId: 'd1',
    lineItems: [{ lineNo: 1, itemName: 'A', pcs: 10 }, { lineNo: 2, itemName: 'B', pcs: 5 }]
  };
  assert.strictEqual(linesForSource(receipt, 'd1').length, 2);
});

test('legacy receipt contributes nothing to a different despatch', () => {
  const receipt = { workDespatchId: 'd1', lineItems: [{ lineNo: 1, itemName: 'A', pcs: 10 }] };
  assert.strictEqual(linesForSource(receipt, 'd2').length, 0);
});

test('legacy receipt is detected as untagged', () => {
  const receipt = { workDespatchId: 'd1', lineItems: [{ lineNo: 1, pcs: 1 }] };
  assert.strictEqual(hasPerLineSources(receipt), false);
});

console.log('\nmulti-challan receipts');

const multi = {
  workDespatchId: 'd1',
  sourceDespatchIds: ['d1', 'd2'],
  lineItems: [
    { lineNo: 1, sourceDespatchId: 'd1', sourceLineNo: 1, itemName: 'A', pcs: 10, mtsQty: 63 },
    { lineNo: 2, sourceDespatchId: 'd1', sourceLineNo: 2, itemName: 'B', pcs: 4, mtsQty: 25.2 },
    { lineNo: 3, sourceDespatchId: 'd2', sourceLineNo: 1, itemName: 'C', pcs: 7, mtsQty: 44.1 }
  ]
};

test('only the lines tagged with a despatch count towards it', () => {
  assert.strictEqual(linesForSource(multi, 'd1').length, 2);
  assert.strictEqual(linesForSource(multi, 'd2').length, 1);
});

test('a despatch not on the bill gets nothing, even though it is the primary field', () => {
  assert.strictEqual(linesForSource(multi, 'd3').length, 0);
});

test('source line number is preferred over the receipt line number', () => {
  assert.strictEqual(sourceLineKey({ lineNo: 3, sourceLineNo: 1, itemName: 'C' }), 1);
  assert.strictEqual(sourceLineKey({ lineNo: 3, itemName: 'C' }), 3);
  assert.strictEqual(sourceLineKey({ itemName: 'C' }), 'c');
});

console.log('\nattributing entered lines to picked challans');

test('untagged lines fall to the only picked challan', () => {
  const result = attributeLinesToSources({
    lines: [{ lineNo: 1, itemName: 'A', pcs: 5, mtsQty: 31.5 }],
    sources: [source('d1', 'C-1', 10)]
  });
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.lines[0].sourceDespatchId, 'd1');
  assert.strictEqual(result.lines[0].sourceChallanNo, 'C-1');
});

test('untagged lines are rejected when several challans are picked', () => {
  const result = attributeLinesToSources({
    lines: [{ lineNo: 1, itemName: 'A', pcs: 5 }],
    sources: [source('d1', 'C-1', 10), source('d2', 'C-2', 10)]
  });
  assert.strictEqual(result.errors.length, 1);
  assert.match(result.errors[0], /does not say which challan/);
});

test('a sample line with no challan is kept when the other lines already name theirs', () => {
  const result = attributeLinesToSources({
    lines: [
      { lineNo: 1, itemName: 'SATIN', pcs: 112, sourceDespatchId: 'd1' },
      { lineNo: 4, itemName: 'plain', pcs: 8 }
    ],
    sources: [source('d1', '5', 112), source('d2', '6', 240)]
  });
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.lines[1].sourceDespatchId, null);
  assert.strictEqual(result.perSource.find(row => row.source.sourceId === 'd1').pcs, 112);
});

test('a line pointing at an unpicked challan is rejected', () => {
  const result = attributeLinesToSources({
    lines: [{ lineNo: 1, itemName: 'A', pcs: 5, sourceDespatchId: 'dX' }],
    sources: [source('d1', 'C-1', 10)]
  });
  assert.strictEqual(result.errors.length, 1);
  assert.match(result.errors[0], /not selected/);
});

test('pending is checked per challan, not against the bill total', () => {
  // 12 pcs total would pass a naive bill-level check against 20 pcs pending,
  // but challan C-1 only has 4 pcs left.
  const result = attributeLinesToSources({
    lines: [
      { lineNo: 1, itemName: 'A', pcs: 8, mtsQty: 50.4, sourceDespatchId: 'd1' },
      { lineNo: 2, itemName: 'B', pcs: 4, mtsQty: 25.2, sourceDespatchId: 'd2' }
    ],
    sources: [source('d1', 'C-1', 4), source('d2', 'C-2', 16)]
  });
  assert.strictEqual(result.errors.length, 1);
  assert.match(result.errors[0], /C-1/);
  assert.match(result.errors[0], /only 4 pcs/);
});

test('quantities within each challan pass', () => {
  const result = attributeLinesToSources({
    lines: [
      { lineNo: 1, itemName: 'A', pcs: 4, mtsQty: 25.2, sourceDespatchId: 'd1' },
      { lineNo: 2, itemName: 'B', pcs: 10, mtsQty: 63, sourceDespatchId: 'd2' }
    ],
    sources: [source('d1', 'C-1', 4), source('d2', 'C-2', 16)]
  });
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.perSource.length, 2);
  assert.strictEqual(result.perSource[0].pcs, 4);
  assert.strictEqual(result.perSource[1].pcs, 10);
});

test('picked challans with no lines are reported as unused', () => {
  const result = attributeLinesToSources({
    lines: [{ lineNo: 1, itemName: 'A', pcs: 4, mtsQty: 25.2, sourceDespatchId: 'd1' }],
    sources: [source('d1', 'C-1', 4), source('d2', 'C-2', 16)]
  });
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.unused.length, 1);
  assert.strictEqual(result.unused[0].documentNo, 'C-2');
});

test('direct bill with no picked challan keeps untagged lines', () => {
  const lines = [{ lineNo: 1, itemName: 'A', pcs: 5, mtsQty: 31.5 }];
  const result = attributeLinesToSources({ lines, sources: [] });
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.lines[0].sourceDespatchId, undefined);
  assert.strictEqual(result.perSource.length, 0);
});

test('direct receipt with no despatch does not consume any challan pending', () => {
  const receipt = { workDespatchId: null, sourceDespatchIds: [], lineItems: [{ lineNo: 1, itemName: 'A', pcs: 5 }] };
  assert.strictEqual(linesForSource(receipt, 'd1').length, 0);
});

console.log('\nsales bills covering several sales orders');

test('legacy sales bill counts all lines against its primary SO', () => {
  const bill = {
    sourceSalesOrderId: 'so1',
    orderLines: [{ lineNo: 1, sourceLineNo: 1, pcs: 10 }, { lineNo: 2, sourceLineNo: 2, pcs: 5 }]
  };
  const opts = { primaryIdField: 'sourceSalesOrderId', lineSourceField: 'sourceSalesOrderId', linesField: 'orderLines' };
  assert.strictEqual(linesForSource(bill, 'so1', opts).length, 2);
  assert.strictEqual(linesForSource(bill, 'so2', opts).length, 0);
});

test('tagged sales bill lines only consume their own Sales Order', () => {
  const bill = {
    sourceSalesOrderId: 'so1',
    sourceSalesOrderIds: ['so1', 'so2'],
    orderLines: [
      { lineNo: 1, sourceSalesOrderId: 'so1', sourceLineNo: 1, pcs: 8 },
      { lineNo: 2, sourceSalesOrderId: 'so2', sourceLineNo: 1, pcs: 4 }
    ]
  };
  const opts = { primaryIdField: 'sourceSalesOrderId', lineSourceField: 'sourceSalesOrderId', linesField: 'orderLines' };
  assert.strictEqual(linesForSource(bill, 'so1', opts).length, 1);
  assert.strictEqual(linesForSource(bill, 'so2', opts).length, 1);
  assert.strictEqual(linesForSource(bill, 'so1', opts)[0].pcs, 8);
});

test('merged same-name line splits pending across both Sales Orders', () => {
  const line = {
    sourceSalesOrderId: 'so1',
    pcs: 12,
    mtsQty: 75.6,
    sourceAllocations: [
      { sourceSalesOrderId: 'so1', sourceLineNo: 1, pcs: 8, mtsQty: 50.4 },
      { sourceSalesOrderId: 'so2', sourceLineNo: 1, pcs: 4, mtsQty: 25.2 }
    ]
  };
  const so1 = qtySlicesForSalesOrder(line, 'so1');
  const so2 = qtySlicesForSalesOrder(line, 'so2');
  assert.strictEqual(so1.length, 1);
  assert.strictEqual(so1[0].pcs, 8);
  assert.strictEqual(so2[0].pcs, 4);
});

test('a line split across two challans counts only its own pieces on each', () => {
  const receipt = {
    workDespatchId: 'd5',
    sourceDespatchIds: ['d5', 'd7'],
    lineItems: [{
      lineNo: 1,
      itemName: 'FRANDY FABRIC',
      pcs: 120,
      mtsQty: 744,
      sourceDespatchId: 'd5',
      sourceAllocations: [
        { sourceDespatchId: 'd5', sourceLineNo: 1, pcs: 112, mtsQty: 694.4 },
        { sourceDespatchId: 'd7', sourceLineNo: 1, pcs: 8, mtsQty: 49.6 }
      ]
    }]
  };
  const on5 = linesForSource(receipt, 'd5');
  const on7 = linesForSource(receipt, 'd7');
  assert.strictEqual(on5.length, 1);
  assert.strictEqual(on5[0].pcs, 112);
  assert.strictEqual(on7[0].pcs, 8);
});

console.log('\nBhagwati work pending');

test('Empire pick leaves 712 pcs on challans 5, 6 and 7, and voucher 20 uses 6 and 7', () => {
  const desp = (id, vno, challan, item, pcs, mts) => ({
    id,
    challanNo: challan,
    srNo: vno,
    remarks: `[E:O5:${vno}]`,
    partyName: 'BHAGWATI FASHION',
    transactionType: 'WORK DESP CHALLAN',
    status: 'posted',
    totalPcs: pcs,
    totalMts: mts,
    lineItems: [{ lineNo: 1, itemName: item, pcs, mtsQty: mts }]
  });
  const line = (item, pcs, mts, vno) => ({
    itemName: item,
    pcs,
    mtsQty: mts,
    empirePickType: 'O5',
    empirePickVno: vno,
    empirePickBill: String(vno === 100099 ? '99*' : vno)
  });
  const rec = (id, voucher, bill, lines) => ({
    id,
    voucherNo: voucher,
    billNo: bill,
    partyName: 'BHAGWATI FASHION',
    transactionType: 'WORK REC. BILLS',
    status: 'posted',
    remarks: `[E:P7:${voucher}]`,
    lineItems: lines
  });
  const despatches = [
    desp('d99', 100099, '99*', 'FRANDY FABRIC', 480, 3024),
    desp('d4', 4, '4', 'SATIN FRANDY', 480, 2976),
    desp('d5', 5, '5', 'FRANDY FABRIC', 480, 2976),
    desp('d6', 6, '6', 'SATIN FRANDY', 360, 2232),
    desp('d7', 7, '7', 'FRANDY FABRIC', 480, 2976)
  ];
  const receipts = [
    rec('r105', 100116, '105*', [line('FRANDY FABRIC', 480, 3024, 0)]),
    rec('r3', 3, '13', [line('FRANDY FABRIC', 120, 756, 100099), line('FRANDY FABRIC', 120, 756, 100099), line('FRANDY FABRIC', 120, 756, 100099)]),
    rec('r4', 4, '16', [line('FRANDY FABRIC', 120, 756, 100099)]),
    rec('r15', 15, '42', [line('SATIN FRANDY', 120, 744, 4), line('SATIN FRANDY', 120, 744, 4), line('SATIN FRANDY', 120, 744, 4), line('SATIN FRANDY', 120, 744, 4)]),
    rec('r17', 17, '51', [line('FRANDY FABRIC', 120, 744, 5)]),
    rec('r18', 18, '53', [line('FRANDY FABRIC', 120, 744, 5)]),
    rec('r19', 19, '54', [line('FRANDY FABRIC', 120, 744, 5), line('FRANDY FABRIC', 4, 24.8, 5), line('FRANDY FABRIC', 3, 18.6, 5), line('FRANDY FABRIC', 1, 6.2, 5)]),
    rec('r20', 20, '57', [line('SATIN FRANDY', 120, 744, 6), line('FRANDY FABRIC', 120, 744, 7)])
  ];
  receipts[0].lineItems[0].empirePickType = null;
  receipts[0].lineItems[0].empirePickVno = null;
  const updates = allocateWorkReceipts({ despatches, receipts });
  const byId = new Map(updates.map(row => [row.id, row]));
  const bill20 = byId.get('r20');
  assert.deepStrictEqual(bill20.sourceDespatchIds, ['d6', 'd7']);
  assert.strictEqual(bill20.lineItems[0].sourceChallanNo, '6');
  assert.strictEqual(bill20.lineItems[1].sourceChallanNo, '7');
  const pendingOf = (despatchId) => {
    const despatch = despatches.find(row => row.id === despatchId);
    let taken = 0;
    for (const receipt of receipts) {
      const linked = byId.get(receipt.id) || receipt;
      for (const row of linesForSource(linked, despatchId)) taken += Number(row.pcs) || 0;
    }
    return Math.max(0, despatch.totalPcs - taken);
  };
  assert.strictEqual(pendingOf('d99'), 0);
  assert.strictEqual(pendingOf('d4'), 0);
  assert.strictEqual(pendingOf('d5'), 112);
  assert.strictEqual(pendingOf('d6'), 240);
  assert.strictEqual(pendingOf('d7'), 360);
  const open = ['d5', 'd6', 'd7'].reduce((sum, id) => sum + pendingOf(id), 0);
  assert.strictEqual(open, 712);
});

test('a lace challan with three designs links each receipt line to that design', () => {
  const despatch = {
    id: 'd232',
    remarks: '[E:O11:232]',
    status: 'posted',
    challanNo: '232/L',
    lineItems: [
      { lineNo: 1, itemName: 'FRANDY FABRIC', category: 'DARK BHAYA', pcs: 240, mtsQty: 1440 },
      { lineNo: 2, itemName: 'FRANDY FABRIC', category: 'BHAVYA DUSTY', pcs: 300, mtsQty: 1800 },
      { lineNo: 3, itemName: 'FRANDY FABRIC', category: 'BHAVYA COCO', pcs: 180, mtsQty: 1080 }
    ]
  };
  const receipt = {
    id: 'r275',
    voucherNo: 275,
    billNo: '65656',
    status: 'posted',
    remarks: '[E:P31:275]',
    lineItems: [
      { itemName: 'FRANDY FABRIC', category: 'BHAVYA COCO', pcs: 31, mtsQty: 186, empirePickType: 'O11', empirePickVno: 232, empirePickBill: '232/L' },
      { itemName: 'FRANDY FABRIC', category: 'DARK BHAYA', pcs: 240, mtsQty: 1440, empirePickType: 'O11', empirePickVno: 232, empirePickBill: '232/L' }
    ]
  };
  const [update] = allocateWorkReceipts({ despatches: [despatch], receipts: [receipt] });
  assert.strictEqual(update.lineItems[0].sourceLineNo, 3);
  assert.strictEqual(update.lineItems[1].sourceLineNo, 1);
  const taken = new Map();
  for (const row of update.lineItems) {
    taken.set(row.sourceLineNo, (taken.get(row.sourceLineNo) || 0) + row.pcs);
  }
  const left = (lineNo) => {
    const line = despatch.lineItems.find(item => item.lineNo === lineNo);
    return line.pcs - (taken.get(lineNo) || 0);
  };
  assert.strictEqual(left(3), 149);
  assert.strictEqual(left(1), 0);
  assert.strictEqual(left(2), 300);
});

test('same design on two lines keeps the exact piece match for the smaller line', () => {
  const despatch = {
    id: 'd208',
    remarks: '[E:O11:208]',
    status: 'posted',
    challanNo: '208/L',
    lineItems: [
      { lineNo: 1, itemName: 'FRANDY FABRIC', category: 'COCO MILL', pcs: 120 },
      { lineNo: 2, itemName: 'FRANDY FABRIC', category: 'COCO MILL', pcs: 53 },
      { lineNo: 3, itemName: 'FRANDY FABRIC', category: 'DUSTY', pcs: 120 },
      { lineNo: 4, itemName: 'FRANDY FABRIC', category: 'DUSTY', pcs: 56 },
      { lineNo: 5, itemName: 'KUNDAN', pcs: 240 }
    ]
  };
  const receipt = {
    id: 'r240',
    voucherNo: 240,
    status: 'posted',
    remarks: '[E:P31:240]',
    lineItems: [
      { itemName: 'FRANDY FABRIC', category: 'DUSTY', pcs: 4, empirePickType: 'O11', empirePickVno: 208 },
      { itemName: 'FRANDY FABRIC', category: 'COCO MILL', pcs: 53, empirePickType: 'O11', empirePickVno: 208 },
      { itemName: 'FRANDY FABRIC', category: 'DUSTY', pcs: 56, empirePickType: 'O11', empirePickVno: 208 }
    ]
  };
  const [update] = allocateWorkReceipts({ despatches: [despatch], receipts: [receipt] });
  assert.strictEqual(update.lineItems[0].sourceLineNo, 3);
  assert.strictEqual(update.lineItems[1].sourceLineNo, 2);
  assert.strictEqual(update.lineItems[2].sourceLineNo, 4);
});

test('a city in the state field is not treated as another state', () => {
  assert.strictEqual(isInterStateSupply('SURAT', 'GUJARAT'), false);
  assert.strictEqual(isInterStateSupply('GUJARAT', 'GUJARAT'), false);
  assert.strictEqual(isInterStateSupply('UTTAR PRADESH', 'GUJARAT'), true);
});

test('job-bill tax on a lower base recovers the 12 percent discount', () => {
  const pct = impliedDiscountPercent({
    grossAmount: 61200,
    gstRate: 5,
    cgstAmount: 1346.4,
    sgstAmount: 1346.4,
    igstAmount: 0,
    discountPercent: 0
  });
  assert.strictEqual(pct, 12);
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
