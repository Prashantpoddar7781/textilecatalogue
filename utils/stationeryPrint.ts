/**
 * Stationery taken from Poonam's Empire formats.
 * Sale bill: SALEBILLNEW. Cheque: RCHEQUE. Envelope: REPLABEL_envelope.
 * The page is 8 inch by 12 inch. The print dialog chooses the printer.
 */

export interface StationeryLine {
  row: number;
  col: number;
  text: string;
  /** Characters per inch. 10 is the bill, 17 is the cheque, 6 is the envelope name. */
  pitch?: 10 | 17 | 6;
  bold?: boolean;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(value: number) {
  if (value < 20) return ONES[value];
  const ten = TENS[Math.floor(value / 10)];
  const one = ONES[value % 10];
  return one ? `${ten} ${one}` : ten;
}

function threeDigits(value: number) {
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  const head = hundred ? `${ONES[hundred]} Hundred` : '';
  const tail = rest ? twoDigits(rest) : '';
  return [head, tail].filter(Boolean).join(' ');
}

/** Whole rupees, the way the Empire bill rounds the amount in words. */
export function rupeesInWords(amount: number) {
  const rupees = Math.max(0, Math.round(Number(amount) || 0));
  if (!rupees) return 'Zero only';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  const parts = [
    crore ? `${threeDigits(crore)} Crore` : '',
    lakh ? `${threeDigits(lakh)} Lakh` : '',
    thousand ? `${threeDigits(thousand)} Thousand` : '',
    rest ? threeDigits(rest) : ''
  ].filter(Boolean);
  return `${parts.join(' ')} only`;
}

export function shortDate(value?: string | null) {
  if (!value) return '';
  const ymd = String(value).slice(0, 10);
  const [year, month, day] = ymd.split('-');
  if (!day || !month || !year) return '';
  return `${day}/${month}/${year.slice(2)}`;
}

function clip(value: unknown, width: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, width);
}

function money(value: number) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const SHEET_CSS = `
  @page { size: 8in 12in; margin: 0; }
  html, body { margin: 0; }
  .sheet { position: relative; width: 8in; height: 12in; background: white; overflow: hidden; font-family: "Courier New", Courier, monospace; }
  .field { position: absolute; white-space: pre; line-height: 1; }
`;

function sheetMarkup(lines: StationeryLine[], extras = '') {
  const fields = lines.map(line => {
    const pitch = line.pitch || 10;
    const columns = pitch === 17 ? 136 : pitch === 6 ? 48 : 80;
    const left = ((line.col - 1) * (8 / columns)).toFixed(3);
    const top = ((line.row - 1) * (12 / 72)).toFixed(3);
    const size = pitch === 6 ? '18pt' : pitch === 17 ? '8.5pt' : '11pt';
    const weight = line.bold || pitch === 6 ? 700 : 500;
    return `<div class="field" style="left:${left}in;top:${top}in;font-size:${size};font-weight:${weight}">${escapeHtml(line.text)}</div>`;
  }).join('');
  return `<div class="sheet">${fields}${extras}</div>`;
}

/** Print from a hidden frame on this page. A new window is blocked once any loading has happened. */
function printSheet(markup: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow?.document;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html><head><title>Print</title><style>${SHEET_CSS}</style></head><body>${markup}</body></html>`);
  doc.close();
  window.setTimeout(() => {
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 1500);
  }, 200);
}

export function openStationeryPreview(title: string, lines: StationeryLine[], extras = '') {
  document.getElementById('stationery-preview')?.remove();
  const markup = sheetMarkup(lines, extras);
  const root = document.createElement('div');
  root.id = 'stationery-preview';
  root.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#e5e7eb;overflow:auto;color:#111;';
  root.innerHTML = `
    <style>${SHEET_CSS} .sheet { margin: 0 auto; box-shadow: 0 8px 24px rgba(0,0,0,.15); }</style>
    <div style="position:sticky;top:0;display:flex;gap:12px;align-items:center;padding:10px 14px;background:#111827;color:white;font-family:Arial,sans-serif;">
      <button type="button" data-print style="border:0;border-radius:8px;background:white;color:#111;font-weight:800;padding:8px 14px;cursor:pointer;">Print</button>
      <button type="button" data-close style="border:0;border-radius:8px;background:#374151;color:white;font-weight:800;padding:8px 14px;cursor:pointer;">Close</button>
      <span style="font-size:12px;font-weight:600;">${escapeHtml(title)} · 8 × 12 inch · choose any printer</span>
    </div>
    <div style="padding:16px 0;">${markup}</div>
  `;
  root.querySelector('[data-close]')?.addEventListener('click', () => root.remove());
  root.querySelector('[data-print]')?.addEventListener('click', () => printSheet(markup));
  document.body.appendChild(root);
  return true;
}

export interface SaleBillPrintInput {
  companyName: string;
  billNo: string;
  billDate: string;
  partyName: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  broker?: string;
  transport?: string;
  lrNo?: string;
  orderNo?: string;
  remarks?: string;
  lines: Array<{ itemName: string; pcs: number; cut: number; mts: number; rate: number; amount: number }>;
  totalPcs: number;
  grossAmount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  netAmount: number;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  irn?: string;
  ackNo?: string;
  ewayBillNo?: string;
  qrDataUrl?: string;
}

export function openSaleBillPrint(input: SaleBillPrintInput) {
  const city = [input.city, input.pincode].filter(Boolean).join(' - ');
  const place = [city, input.state].filter(Boolean).join(', ');
  const rows: StationeryLine[] = [
    { row: 12, col: 10, text: clip(input.partyName, 58) },
    { row: 12, col: 70, text: clip(input.billNo, 8), bold: true },
    { row: 13, col: 10, text: clip(input.address1, 58) },
    { row: 13, col: 70, text: shortDate(input.billDate) },
    { row: 14, col: 10, text: clip(input.phone ? `PH: ${input.phone}` : '', 58) },
    { row: 15, col: 10, text: clip(input.address2, 58) },
    { row: 15, col: 70, text: clip(input.orderNo, 10) },
    { row: 16, col: 10, text: clip(place, 58) },
    { row: 19, col: 16, text: clip(input.broker, 40) },
    { row: 21, col: 25, text: clip(input.transport, 28) },
    { row: 21, col: 55, text: clip(input.lrNo, 16) },
    { row: 23, col: 1, text: 'Sr Particulars              PCS   Cut     Mts    Rate      Amount' },
    { row: 24, col: 1, text: '----------------------------------------------------------------' }
  ];
  const shown = input.lines.slice(0, 18);
  shown.forEach((line, index) => {
    const text = [
      String(index + 1).padStart(2, ' '),
      clip(line.itemName, 22).padEnd(22, ' '),
      String(line.pcs || 0).padStart(6, ' '),
      (line.cut ? line.cut.toFixed(2) : '').padStart(6, ' '),
      (line.mts ? line.mts.toFixed(2) : '').padStart(8, ' '),
      (line.rate ? line.rate.toFixed(2) : '').padStart(8, ' '),
      money(line.amount).padStart(12, ' ')
    ].join(' ');
    rows.push({ row: 25 + index, col: 1, text });
  });
  if (input.lines.length > shown.length) {
    rows.push({ row: 43, col: 1, text: `+ ${input.lines.length - shown.length} more items` });
  }
  const taxBits = [
    input.taxable ? `Taxable ${money(input.taxable)}` : '',
    input.cgst ? `CGST ${money(input.cgst)}` : '',
    input.sgst ? `SGST ${money(input.sgst)}` : '',
    input.igst ? `IGST ${money(input.igst)}` : ''
  ].filter(Boolean).join('  ');
  if (taxBits) rows.push({ row: 48, col: 2, text: clip(taxBits, 76) });
  rows.push({
    row: 51,
    col: 2,
    text: `Pcs ${String(input.totalPcs || 0).padStart(6, ' ')}          Gross ${money(input.grossAmount).padStart(14, ' ')}`
  });
  rows.push({
    row: 53,
    col: 10,
    text: clip(`RS-> ${rupeesInWords(input.netAmount)}`, 54)
  });
  rows.push({ row: 53, col: 66, text: money(input.netAmount), bold: true });
  if (input.remarks) rows.push({ row: 57, col: 10, text: clip(input.remarks, 60) });
  if (input.ewayBillNo) rows.push({ row: 59, col: 5, text: `E-WAY ${input.ewayBillNo}` });
  if (input.bankName) {
    rows.push({ row: 62, col: 6, text: 'OUR BANKER', bold: true });
    rows.push({ row: 63, col: 6, text: clip(input.bankName, 40), bold: true });
    const account = [input.bankAccount ? `A/C NO.: ${input.bankAccount}` : '', input.bankIfsc ? `IFSC ${input.bankIfsc}` : ''].filter(Boolean).join('  ');
    if (account) rows.push({ row: 64, col: 6, text: clip(account, 60), bold: true });
  }
  if (input.irn) {
    rows.push({ row: 66, col: 2, text: `IRN ${input.irn}` });
    if (input.ackNo) rows.push({ row: 67, col: 2, text: `Ack ${input.ackNo}` });
  }
  const qr = input.qrDataUrl
    ? `<img alt="QR" src="${input.qrDataUrl}" style="position:absolute;right:0.35in;bottom:0.45in;width:1.15in;height:1.15in" />`
    : '';
  return openStationeryPreview(`Sale bill ${input.billNo || ''}`.trim(), rows, qr);
}

export interface ChequePrintInput {
  payee: string;
  date?: string;
  amount: number;
  remark?: string;
  address?: string;
  phone?: string;
}

export function openChequePrint(input: ChequePrintInput) {
  const words = rupeesInWords(input.amount).replace(/ only$/, '');
  const rows: StationeryLine[] = [
    { row: 16, col: 102, text: 'A/C PAYEE', pitch: 17 },
    { row: 16, col: 119, text: shortDate(input.date), pitch: 17 },
    { row: 20, col: 53, text: clip(`${input.payee} ***`, 60), pitch: 17 },
    { row: 22, col: 88, text: clip(words, 48), pitch: 17 },
    { row: 24, col: 120, text: `**${money(input.amount)}`, pitch: 17, bold: true }
  ];
  const remark = clip(input.remark, 58);
  if (remark) {
    rows.push({ row: 30, col: 106, text: remark.slice(0, 40), pitch: 17 });
    if (remark.length > 40) rows.push({ row: 31, col: 106, text: remark.slice(40), pitch: 17 });
  }
  if (input.address) rows.push({ row: 33, col: 90, text: clip(`ADD: ${input.address}`, 40), pitch: 17 });
  if (input.phone) rows.push({ row: 34, col: 90, text: clip(`PHONE : ${input.phone}`, 40), pitch: 17 });
  return openStationeryPreview(`Cheque ${input.payee}`, rows);
}

export interface EnvelopePrintInput {
  name: string;
  phone?: string;
  phone2?: string;
  mobile?: string;
  address1?: string;
  address2?: string;
  city?: string;
  pincode?: string;
  state?: string;
}

export function openEnvelopePrint(input: EnvelopePrintInput) {
  const phones = [
    input.phone ? `(O) ${input.phone}` : '',
    input.phone2 || '',
    input.mobile ? `M.: ${input.mobile}` : ''
  ].filter(Boolean).join(' , ');
  const city = [input.city, input.pincode].filter(Boolean).join('-');
  const place = [city, input.state].filter(Boolean).join(', ');
  const rows: StationeryLine[] = [];
  if (phones) rows.push({ row: 13, col: 89, text: clip(`PO.: ${phones}`, 40), pitch: 17 });
  rows.push({ row: 16, col: 54, text: clip(input.name, 28), pitch: 6, bold: true });
  if (input.address1) rows.push({ row: 18, col: 95, text: clip(input.address1, 36), pitch: 17 });
  if (input.address2) rows.push({ row: 20, col: 99, text: clip(input.address2, 32), pitch: 17 });
  if (place) rows.push({ row: 22, col: 101, text: clip(place, 32), pitch: 17 });
  return openStationeryPreview(`Envelope ${input.name}`, rows);
}
