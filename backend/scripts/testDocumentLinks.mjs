/**
 * Checks the multi-challan attribution rules without touching the database.
 *   node backend/scripts/testDocumentLinks.mjs
 */

import assert from 'assert';
import { linesForSource, hasPerLineSources, sourceLineKey } from '../utils/documentLinkAttribution.js';
import { attributeLinesToSources } from '../services/documentLinkEngine.js';

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

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
