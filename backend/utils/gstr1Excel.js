import ExcelJS from 'exceljs';
import { roundMoney } from './orderBilling.js';

/**
 * GSTR-1 "all in 1" workbook in the GST offline tool layout (same sheet names,
 * summary rows 1–3, headers on row 4, data from row 5) — the file Empire builds
 * from GSTR1_V21_blank.xlsx and the CA imports into the Java offline tool.
 */

const distinct = (rows, field) => new Set(rows.map(row => row[field]).filter(v => v !== '' && v != null)).size;
const sum = (rows, field) => roundMoney(rows.reduce((s, row) => s + (Number(row[field]) || 0), 0));
const sumDistinct = (rows, keyField, valueField) => {
  const seen = new Map();
  for (const row of rows) if (!seen.has(row[keyField])) seen.set(row[keyField], Number(row[valueField]) || 0);
  return roundMoney(Array.from(seen.values()).reduce((s, v) => s + v, 0));
};

function toExcelDate(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return key || '';
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

const blank = (title, headers, summary = []) => ({ title, headers, summary, rows: [] });

function sheetSpecs(data) {
  const b2b = data.b2b || [];
  const b2cl = data.b2cl || [];
  const b2cs = data.b2cs || [];
  const cdnr = data.cdnr || [];
  const cdnur = data.cdnur || [];
  const exemp = data.exemp || [];
  const hsnB2b = data.hsnB2b || [];
  const hsnB2c = data.hsnB2c || [];
  const docs = data.docs || [];

  const hsnHeaders = ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value',
    'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'];
  const hsnSheet = (rows) => ({
    title: 'Summary For HSN(12)',
    headers: hsnHeaders,
    summary: [
      [1, 'No. of HSN', distinct(rows, 'hsn')],
      [5, 'Total Value', sum(rows, 'totalValue')],
      [7, 'Total Taxable Value', sum(rows, 'taxable')],
      [8, 'Total Integrated Tax', sum(rows, 'igst')],
      [9, 'Total Central Tax', sum(rows, 'cgst')],
      [10, 'Total State/UT Tax', sum(rows, 'sgst')],
      [11, 'Total Cess', 0]
    ],
    rows: rows.map(r => [r.hsn, r.description, r.uqc, r.qty, r.totalValue, r.rate, r.taxable, r.igst, r.cgst, r.sgst, 0])
  });

  return [
    ['b2b,sez,de', {
      title: 'Summary For B2B, SEZ, DE (4A, 4B, 6B, 6C)',
      headers: ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value',
        'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN',
        'Rate', 'Taxable Value', 'Cess Amount'],
      summary: [
        [1, 'No. of Recipients', distinct(b2b, 'gstin')],
        [3, 'No. of Invoices', distinct(b2b, 'invoiceNo')],
        [5, 'Total Invoice Value', sumDistinct(b2b, 'invoiceNo', 'invoiceValue')],
        [12, 'Total Taxable Value', sum(b2b, 'taxable')],
        [13, 'Total Cess', 0]
      ],
      dateCols: [4],
      rows: b2b.map(r => [r.gstin, r.receiverName, r.invoiceNo, r.invoiceDate, r.invoiceValue, r.pos,
        r.reverseCharge, '', r.invoiceType, '', r.rate, r.taxable, 0])
    }],
    ['b2ba', blank('Summary For B2BA', ['GSTIN/UIN of Recipient', 'Receiver Name', 'Original Invoice Number',
      'Original Invoice date', 'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value', 'Place Of Supply',
      'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value',
      'Cess Amount'], [[1, 'No. of Recipients', 0], [3, 'No. of Invoices', 0], [7, 'Total Invoice Value', 0],
      [14, 'Total Taxable Value', 0], [15, 'Total Cess', 0]])],
    ['b2cl', {
      title: 'Summary For B2CL(5)',
      headers: ['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Applicable % of Tax Rate',
        'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
      summary: [
        [1, 'No. of Invoices', distinct(b2cl, 'invoiceNo')],
        [3, 'Total Inv Value', sumDistinct(b2cl, 'invoiceNo', 'invoiceValue')],
        [7, 'Total Taxable Value', sum(b2cl, 'taxable')],
        [8, 'Total Cess', 0]
      ],
      dateCols: [2],
      rows: b2cl.map(r => [r.invoiceNo, r.invoiceDate, r.invoiceValue, r.pos, '', r.rate, r.taxable, 0, ''])
    }],
    ['b2cla', blank('Summary For B2CLA', ['Original Invoice Number', 'Original Invoice date', 'Original Place Of Supply',
      'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value', 'Applicable % of Tax Rate', 'Rate',
      'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'], [[1, 'No. of Invoices', 0], [6, 'Total Inv Value', 0],
      [9, 'Total Taxable Value', 0], [10, 'Total Cess', 0]])],
    ['b2cs', {
      title: 'Summary For B2CS(7)',
      headers: ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
        'E-Commerce GSTIN'],
      summary: [[5, 'Total Taxable  Value', sum(b2cs, 'taxable')], [6, 'Total Cess', 0]],
      rows: b2cs.map(r => [r.type, r.pos, '', r.rate, r.taxable, 0, ''])
    }],
    ['b2csa', blank('Summary For B2CSA', ['Financial Year', 'Original Month', 'Place Of Supply', 'Type',
      'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
    [[7, 'Total Taxable  Value', 0], [8, 'Total Cess', 0]])],
    ['cdnr', {
      title: 'Summary For CDNR(9B)',
      headers: ['GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date', 'Note Type',
        'Place Of Supply', 'Reverse Charge', 'Note Supply Type', 'Note Value', 'Applicable % of Tax Rate',
        'Rate', 'Taxable Value', 'Cess Amount'],
      summary: [
        [1, 'No. of Recipients', distinct(cdnr, 'gstin')],
        [3, 'No. of Notes', distinct(cdnr, 'noteNo')],
        [9, 'Total Note Value', sumDistinct(cdnr, 'noteNo', 'noteValue')],
        [12, 'Total Taxable Value', sum(cdnr, 'taxable')],
        [13, 'Total Cess', 0]
      ],
      dateCols: [4],
      rows: cdnr.map(r => [r.gstin, r.receiverName, r.noteNo, r.noteDate, r.noteType, r.pos, r.reverseCharge,
        r.noteSupplyType, r.noteValue, '', r.rate, r.taxable, 0])
    }],
    ['cdnra', blank('Summary For CDNRA', ['GSTIN/UIN of Recipient', 'Receiver Name', 'Original Note Number',
      'Original Note Date', 'Revised Note Number', 'Revised Note Date', 'Note Type', 'Place Of Supply',
      'Reverse Charge', 'Note Supply Type', 'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value',
      'Cess Amount'], [[1, 'No. of Recipients', 0], [3, 'No. of Notes/Vouchers', 0], [11, 'Total Note Value', 0],
      [14, 'Total Taxable Value', 0], [15, 'Total Cess', 0]])],
    ['cdnur', {
      title: 'Summary For CDNUR(9B)',
      headers: ['UR Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Note Value',
        'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'],
      summary: [
        [2, 'No. of Notes/Vouchers', distinct(cdnur, 'noteNo')],
        [6, 'Total Note Value', sumDistinct(cdnur, 'noteNo', 'noteValue')],
        [9, 'Total Taxable Value', sum(cdnur, 'taxable')],
        [10, 'Total Cess', 0]
      ],
      dateCols: [3],
      rows: cdnur.map(r => [r.urType, r.noteNo, r.noteDate, r.noteType, r.pos, r.noteValue, '', r.rate, r.taxable, 0])
    }],
    ['cdnura', blank('Summary For CDNURA', ['UR Type', 'Original Note Number', 'Original Note Date',
      'Revised Note Number', 'Revised Note Date', 'Note Type', 'Place Of Supply', 'Note Value',
      'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'], [[2, 'No. of Notes/Vouchers', 0],
      [8, 'Total Note Value', 0], [11, 'Total Taxable Value', 0], [12, 'Total Cess', 0]])],
    ['exp', blank('Summary For EXP(6)', ['Export Type', 'Invoice Number', 'Invoice date', 'Invoice Value',
      'Port Code', 'Shipping Bill Number', 'Shipping Bill Date', 'Rate', 'Taxable Value', 'Cess Amount'],
    [[2, 'No. of Invoices', 0], [4, 'Total Invoice Value', 0], [6, 'No. of Shipping Bill', 0],
      [9, 'Total Taxable Value', 0]])],
    ['expa', blank('Summary For EXPA', ['Export Type', 'Original Invoice Number', 'Original Invoice date',
      'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value', 'Port Code', 'Shipping Bill Number',
      'Shipping Bill Date', 'Rate', 'Taxable Value', 'Cess Amount'], [[2, 'No. of Invoices', 0],
      [6, 'Total Invoice Value', 0], [8, 'No. of Shipping Bill', 0], [11, 'Total Taxable Value', 0], [12, 'Total Cess', 0]])],
    ['at', blank('Summary For Advance Received (11B) ', ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate',
      'Gross Advance Received', 'Cess Amount'], [[4, 'Total Advance Received', 0], [5, 'Total Cess', 0]])],
    ['ata', blank('Summary For Amended Tax Liability(Advance Received) ', ['Financial Year', 'Original Month',
      'Original Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Received', 'Cess Amount'],
    [[6, 'Total Advance Received', 0], [7, 'Total Cess', 0]])],
    ['atadj', blank('Summary For Advance Adjusted (11B) ', ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate',
      'Gross Advance Adjusted', 'Cess Amount'], [[4, 'Total Advance Adjusted', 0], [5, 'Total Cess', 0]])],
    ['atadja', blank('Summary For Amendement Of Adjustment Advances', ['Financial Year', 'Original Month',
      'Original Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Adjusted', 'Cess Amount'],
    [[6, 'Total Advance Adjusted', 0], [7, 'Total Cess', 0]])],
    ['exemp', {
      title: 'Summary For Nil rated, exempted and non GST outward supplies (8)',
      headers: ['Description', 'Nil Rated Supplies', 'Exempted(other than nil rated/non GST supply)', 'Non-GST Supplies'],
      summary: [
        [2, 'Total Nil Rated Supplies', sum(exemp, 'nilRated')],
        [3, 'Total Exempted Supplies', sum(exemp, 'exempted')],
        [4, 'Total Non-GST Supplies', sum(exemp, 'nonGst')]
      ],
      rows: exemp.map(r => [r.description, r.nilRated, r.exempted, r.nonGst])
    }],
    ['hsn(b2b)', hsnSheet(hsnB2b)],
    ['hsn(b2c)', hsnSheet(hsnB2c)],
    ['docs', {
      title: 'Summary of documents issued during the tax period (13)',
      headers: ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'],
      summary: [[4, 'Total Number', sum(docs, 'totalNumber')], [5, 'Total Cancelled', sum(docs, 'cancelled')]],
      rows: docs.map(r => [r.nature, r.fromNo, r.toNo, r.totalNumber, r.cancelled])
    }],
    ['eco', blank('Summary For Supplies through ECO-14', ['Nature of Supply', 'GSTIN of E-Commerce Operator',
      'E-Commerce Operator Name', 'Net value of supplies', 'Integrated tax', 'Central tax', 'State/UT tax', 'Cess'],
    [[2, 'No. of E-Commerce Operator', 0], [4, 'Total Net Value of Supplies', 0], [5, 'Total Integrated Tax', 0],
      [6, 'Total Central Tax ', 0], [7, 'Total State/UT Tax ', 0], [8, 'Total Cess', 0]])],
    ['ecoa', blank('Summary For Amended Supplies through ECO-14A', ['Nature of Supply', 'Financial Year',
      'Original Month/Quarter', 'Original GSTIN of E-Commerce Operator', 'Revised GSTIN of E-Commerce Operator',
      'E-Commerce Operator Name', 'Revised Net value of supplies', 'Integrated tax', 'Central tax', 'State/UT tax', 'Cess'],
    [[4, 'No. of E-Commerce Operator', 0], [7, 'Total Net Value of Supplies', 0], [8, 'Total Integrated Tax', 0],
      [9, 'Total Central Tax ', 0], [10, 'Total State/UT Tax ', 0], [11, 'Total Cess', 0]])],
    ['ecob2b', blank('Summary For Supplies U/s 9(5)-15-B2B', ['Supplier GSTIN/UIN', 'Supplier Name',
      'Recipient GSTIN/UIN', 'Recipient Name', 'Document Number', 'Document Date', 'Value of supplies made',
      'Place Of Supply', 'Document type', 'Rate', 'Taxable Value', 'Cess Amount'], [[1, 'No. of Supplier', 0],
      [3, 'No. of Recipients', 0], [5, 'No. of Documents', 0], [7, 'Total value of supplies made', 0],
      [11, 'Total Taxable Value', 0], [12, 'Total Cess', 0]])],
    ['ecourp2b', blank('Summary For Supplies U/s 9(5)-15-URP2B', ['Recipient GSTIN/UIN', 'Recipient Name',
      'Document Number', 'Document Date', 'Value of supplies made', 'Place Of Supply', 'Document type', 'Rate',
      'Taxable Value', 'Cess Amount'], [[1, 'No. of Recipients', 0], [3, 'No. of Documents', 0],
      [5, 'Total value of supplies made', 0], [9, 'Total Taxable Value', 0], [10, 'Total Cess', 0]])],
    ['ecob2c', blank('Summary For Supplies U/s 9(5)-15-B2C', ['Supplier GSTIN/UIN', 'Supplier Name',
      'Place Of Supply', 'Taxable Value', 'Rate', 'Cess Amount'], [[1, 'No. of Supplier', 0],
      [4, 'Total Taxable Value', 0], [6, 'Total Cess', 0]])],
    ['ecourp2c', blank('Summary For Supplies U/s 9(5)-15-URP2C', ['Place Of Supply', 'Taxable Value', 'Rate',
      'Cess Amount'], [[2, 'Total Taxable Value', 0], [4, 'Total Cess', 0]])],
    ['ecoab2b', blank('Summary For Supplies U/s 9(5) - 15A-B2B', ['Supplier GSTIN/UIN', 'Supplier Name',
      'Recipient GSTIN/UIN', 'Recipient Name', 'Original Document Number', 'Original Document Date',
      'Revised Document Number', 'Revised Document Date', 'Value of supplies made', 'Place Of Supply',
      'Document type', 'Rate', 'Taxable Value', 'Cess Amount'], [[1, 'No. of Supplier', 0],
      [3, 'No. of Recipients', 0], [5, 'No. of Documents', 0], [9, 'Total value of supplies made', 0],
      [13, 'Total Taxable Value', 0], [14, 'Total Cess', 0]])],
    ['ecoab2c', blank('Summary For Supplies U/s 9(5)-15A-B2C', ['Financial Year', 'Original Month',
      'Supplier GSTIN/UIN', 'Supplier Name', 'Place Of Supply', 'Rate', 'Taxable Value', 'Cess Amount'],
    [[3, 'No. of Supplier', 0], [7, 'Total Taxable Value', 0], [8, 'Total Cess', 0]])],
    ['ecoaurp2b', blank('Summary For Supplies U/s 9(5)-15A-URP2B', ['Recipient GSTIN/UIN', 'Recipient Name',
      'Original Document Number', 'Original Document Date', 'Revised Document Number', 'Revised Document Date',
      'Value of supplies made', 'Document type', 'Place Of Supply', 'Rate', 'Taxable Value', 'Cess Amount'],
    [[1, 'No. of Recipients', 0], [3, 'No. of Documents', 0], [7, 'Total value of supplies made', 0],
      [11, 'Total Taxable Value', 0], [12, 'Total Cess', 0]])],
    ['ecoaurp2c', blank('Summary For Supplies U/s 9(5)-15A-URP2C', ['Financial Year', 'Original Month',
      'Place Of Supply', 'Rate', 'Taxable Value', 'Cess Amount'], [[5, 'Total Taxable Value', 0], [6, 'Total Cess', 0]])]
  ];
}

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
const TITLE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };

export async function buildGstr1Workbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ThreadX';
  workbook.created = new Date();

  for (const [name, spec] of sheetSpecs(data)) {
    const sheet = workbook.addWorksheet(name);
    const width = spec.headers.length;

    const title = sheet.getRow(1);
    title.getCell(1).value = spec.title;
    title.getCell(width).value = 'HELP';
    for (let c = 1; c <= width; c += 1) {
      title.getCell(c).fill = TITLE_FILL;
      title.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }

    const labels = sheet.getRow(2);
    const values = sheet.getRow(3);
    for (const [col, label, value] of spec.summary) {
      labels.getCell(col).value = label;
      labels.getCell(col).font = { bold: true };
      values.getCell(col).value = value;
    }

    const header = sheet.getRow(4);
    spec.headers.forEach((head, index) => {
      const cell = header.getCell(index + 1);
      cell.value = head;
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.alignment = { wrapText: true, vertical: 'middle' };
    });

    const dateCols = new Set(spec.dateCols || []);
    spec.rows.forEach((values, rowIndex) => {
      const row = sheet.getRow(5 + rowIndex);
      values.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        if (dateCols.has(index + 1)) {
          cell.value = toExcelDate(value);
          cell.numFmt = 'dd-mmm-yyyy';
        } else {
          cell.value = value === '' ? null : value;
        }
      });
    });

    sheet.columns.forEach((column, index) => {
      column.width = Math.max(14, Math.min(42, String(spec.headers[index] || '').length + 4));
    });
    sheet.views = [{ state: 'frozen', ySplit: 4 }];
  }

  return workbook.xlsx.writeBuffer();
}

/** Plain table export (matching report, 3B register) in one sheet. */
export async function buildTableWorkbook(sheetName, title, headers, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ThreadX';
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.getRow(1).getCell(1).value = title;
  sheet.getRow(1).getCell(1).font = { bold: true, size: 13 };
  const header = sheet.getRow(3);
  headers.forEach((head, index) => {
    const cell = header.getCell(index + 1);
    cell.value = head;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });
  rows.forEach((values, rowIndex) => {
    const row = sheet.getRow(4 + rowIndex);
    values.forEach((value, index) => {
      const cell = row.getCell(index + 1);
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        cell.value = toExcelDate(value);
        cell.numFmt = 'dd-mm-yyyy';
      } else {
        cell.value = value === '' ? null : value;
      }
    });
  });
  sheet.columns.forEach((column, index) => {
    column.width = Math.max(12, Math.min(40, String(headers[index] || '').length + 6));
  });
  sheet.views = [{ state: 'frozen', ySplit: 3 }];
  return workbook.xlsx.writeBuffer();
}
