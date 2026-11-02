/**
 * Stationery taken from Poonam's Empire formats.
 * Sale bill is the full tax invoice (letterhead, buyer, items, tax, words).
 * Cheque: RCHEQUE. Envelope: REPLABEL_envelope. Those stay on the 8 by 12 inch page.
 * The print dialog chooses the printer.
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
function printSheet(markup: string, pageCss = '@page { size: 8in 12in; margin: 0; }') {
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
  doc.write(`<!doctype html><html><head><title>Print</title><style>${pageCss}${SHEET_CSS}</style></head><body>${markup}</body></html>`);
  doc.close();
  window.setTimeout(() => {
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 1500);
  }, 200);
}

function mountPreview(title: string, markup: string, pageCss: string, hint = '8 × 12 inch · choose any printer') {
  document.getElementById('stationery-preview')?.remove();
  const root = document.createElement('div');
  root.id = 'stationery-preview';
  root.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#e5e7eb;overflow:auto;color:#111;';
  root.innerHTML = `
    <style>${SHEET_CSS}${pageCss} .sheet, .invoice { margin: 0 auto; box-shadow: 0 8px 24px rgba(0,0,0,.15); }</style>
    <div style="position:sticky;top:0;display:flex;gap:12px;align-items:center;padding:10px 14px;background:#111827;color:white;font-family:Arial,sans-serif;z-index:1;">
      <button type="button" data-print style="border:0;border-radius:8px;background:white;color:#111;font-weight:800;padding:8px 14px;cursor:pointer;">Print</button>
      <button type="button" data-close style="border:0;border-radius:8px;background:#374151;color:white;font-weight:800;padding:8px 14px;cursor:pointer;">Close</button>
      <span style="font-size:12px;font-weight:600;">${escapeHtml(title)} · ${escapeHtml(hint)}</span>
    </div>
    <div style="padding:16px 0;">${markup}</div>
  `;
  root.querySelector('[data-close]')?.addEventListener('click', () => root.remove());
  root.querySelector('[data-print]')?.addEventListener('click', () => printSheet(markup, pageCss));
  document.body.appendChild(root);
  return true;
}

export function openStationeryPreview(title: string, lines: StationeryLine[], extras = '') {
  return mountPreview(title, sheetMarkup(lines, extras), '@page { size: 8in 12in; margin: 0; }');
}

export interface SaleBillPrintInput {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyGstin?: string;
  companyPan?: string;
  companyUdyam?: string;
  billNo: string;
  billDate: string;
  partyName: string;
  partyGstin?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  broker?: string;
  haste?: string;
  station?: string;
  transport?: string;
  lrNo?: string;
  lrDate?: string;
  orderNo?: string;
  hsn?: string;
  dueDays?: number;
  remarks?: string;
  terms?: string;
  lines: Array<{
    itemName: string;
    category?: string;
    pack?: string;
    cloth?: string;
    pcs: number;
    cut: number;
    mts: number;
    rate: number;
    unit?: string;
    amount: number;
    gstRate?: number;
  }>;
  totalPcs: number;
  totalMts?: number;
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
  transporterId?: string;
  qrDataUrl?: string;
}

const DEFAULT_TERMS = [
  '1) SUBJECT TO SURAT JURISDICTION.',
  '2) GOODS HAVE BEEN SOLD & DESPATCHED AT THE ENTIRE RISK OF THE PURCHASER.',
  '3) COMPLAINTS, IF ANY REGARDING THIS INVOICE MUST BE INFORMED IN WRITING WITHIN 48 HOURS.'
].join('\n');

function taxLine(name: string, rate: number, taxable: number, tax: number) {
  if (!(tax > 0)) return '';
  const rateText = rate > 0 ? ` @ ${rate.toFixed(2)}%` : '';
  return `${name}${rateText} on Taxable Value &nbsp; ${money(taxable)} &nbsp; = &nbsp; ${money(tax)}`;
}

export function openSaleBillPrint(input: SaleBillPrintInput) {
  const cityLine = [input.city, input.pincode].filter(Boolean).join('-');
  const buyerPlace = [cityLine, input.state].filter(Boolean).join(', ');
  const gstRates = Array.from(new Set(input.lines.map(line => Number(line.gstRate) || 0).filter(rate => rate > 0)));
  const gstRate = gstRates.length === 1 ? gstRates[0] : 0;
  const halfRate = gstRate ? gstRate / 2 : 0;
  const taxRows = [
    input.igst ? taxLine('IGST', gstRate, input.taxable, input.igst) : '',
    input.cgst ? taxLine('CGST', halfRate, input.taxable, input.cgst) : '',
    input.sgst ? taxLine('SGST', halfRate, input.taxable, input.sgst) : ''
  ].filter(Boolean);
  const bank = [
    input.bankName,
    input.bankAccount ? `A/C NO.: ${input.bankAccount}` : '',
    input.bankIfsc ? `IFSC: ${input.bankIfsc}` : ''
  ].filter(Boolean).map(part => escapeHtml(String(part))).join(' &nbsp; - &nbsp; ');
  const terms = (input.terms || DEFAULT_TERMS).split(/\r?\n/).filter(Boolean);
  const itemRows = input.lines.map((line, index) => `
    <tr>
      <td class="c">${index + 1}</td>
      <td>${escapeHtml(line.itemName)}</td>
      <td>${escapeHtml(line.category || '')}</td>
      <td>${escapeHtml(line.pack || '')}</td>
      <td>${escapeHtml(line.cloth || '')}</td>
      <td class="n">${line.pcs || ''}</td>
      <td class="n">${line.cut ? line.cut.toFixed(2) : ''}</td>
      <td class="n">${line.mts ? line.mts.toFixed(2) : ''}</td>
      <td class="n">${line.rate ? line.rate.toFixed(2) : ''}</td>
      <td class="c">${escapeHtml(line.unit || '')}</td>
      <td class="n">${money(line.amount)}</td>
    </tr>`).join('');
  const qr = input.qrDataUrl ? `<img class="qr" alt="QR" src="${input.qrDataUrl}" />` : '<div class="qr empty"></div>';
  const html = `
    <article class="invoice${input.lines.length <= 16 ? ' full' : ''}">
      <header class="head">
        ${qr}
        <div class="firm">
          <div class="bless">!! Shree Ganeshaya Namah !!</div>
          ${input.companyPhone ? `<div class="tiny">PHONES: ${escapeHtml(input.companyPhone)}</div>` : ''}
          <h1>${escapeHtml(input.companyName || 'TAX INVOICE')}</h1>
          <div class="tiny">${[input.companyUdyam ? `Udyam ${input.companyUdyam}` : '', input.companyPan ? `PAN No.: ${input.companyPan}` : ''].filter(Boolean).map(escapeHtml).join(' &nbsp; ')}</div>
          <div class="tiny">${escapeHtml(input.companyAddress || '')}</div>
          ${input.companyGstin ? `<div class="tiny">GSTIN: ${escapeHtml(input.companyGstin)}</div>` : ''}
          <div class="title">TAX INVOICE</div>
        </div>
        <table class="meta">
          <tr><td>BILL NO.</td><td>${escapeHtml(input.billNo)}</td></tr>
          <tr><td>CHALLAN</td><td>${escapeHtml(input.billNo)}</td></tr>
          <tr><td>DATE</td><td>${escapeHtml(shortDate(input.billDate))}</td></tr>
          <tr><td>ORDER NO.</td><td>${escapeHtml(input.orderNo || '')}</td></tr>
        </table>
      </header>
      <section class="party">
        <div>
          <div><b>Buyer:</b> ${escapeHtml(input.partyName)}</div>
          <div>${escapeHtml(input.address1 || '')}</div>
          <div>${escapeHtml(input.address2 || '')}</div>
          <div>${escapeHtml(buyerPlace)}${input.phone ? ` &nbsp; MO: ${escapeHtml(input.phone)}` : ''}</div>
          <div>${input.partyGstin ? `GSTIN: ${escapeHtml(input.partyGstin)}` : ''} ${input.state ? `&nbsp; Place of Supply: ${escapeHtml(input.state)}` : ''}</div>
          <div class="gap"><b>Consignee:</b> ${escapeHtml(input.haste || '')}</div>
        </div>
        <div>
          <div><b>AGENT:</b> ${escapeHtml(input.broker || '')}</div>
          <div class="gap"><b>L.R. NO.:</b> ${escapeHtml(input.lrNo || '')}</div>
          <div><b>LR DATE:</b> ${escapeHtml(shortDate(input.lrDate))}</div>
          <div><b>TRANSPORT:</b> ${escapeHtml(input.transport || '')}</div>
          <div><b>STATION:</b> ${escapeHtml(input.station || input.city || '')}</div>
        </div>
        <div>
          <div><b>WEIGHT:</b> 0.000</div>
          <div><b>FREIGHT:</b> 0.00</div>
          <div><b>CASE NO.:</b> ${escapeHtml(String(input.billNo || '').split('/')[0])}</div>
          <div><b>HSN:</b> ${escapeHtml(input.hsn || '')}</div>
        </div>
      </section>
      <div class="grid-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th>SR.</th><th>ITEM</th><th>CATEGORY</th><th>PACK</th><th>CLOTH</th>
              <th>PCS</th><th>CUT</th><th>MTS.</th><th>RATE</th><th>PER</th><th>AMOUNT</th>
            </tr>
          </thead>
          <tbody>${itemRows}${input.lines.length <= 16 ? `<tr class="pad">${'<td></td>'.repeat(11)}</tr>` : ''}</tbody>
        </table>
      </div>
      <section class="foot">
        <div>${bank ? `<b>BANK A/C:</b> ${bank}` : ''}</div>
        <div><b>REMARK:</b> ${escapeHtml(input.remarks || '')}</div>
        <table class="sums">
          <tr><td>SUB TOTAL</td><td class="n">${input.totalPcs || ''}</td><td class="n">${money(input.totalMts || 0)}</td><td class="n">${money(input.grossAmount)}</td></tr>
          ${taxRows.map(row => `<tr><td colspan="3">${row}</td><td></td></tr>`).join('')}
          <tr><td>DUE DAYS: ${Number(input.dueDays) || 0}</td><td colspan="2" class="c">Invoice Value</td><td class="n"><b>${money(input.netAmount)}</b></td></tr>
        </table>
        <div class="words">${escapeHtml(rupeesInWords(input.netAmount).toUpperCase())}</div>
        <div class="sign">
          <div class="terms">${terms.map(line => `<div>${escapeHtml(line)}</div>`).join('')}</div>
          <div class="for">FOR ${escapeHtml(input.companyName || '')}<div class="auth">AUTH. SIGN</div></div>
        </div>
        ${input.irn ? `<div class="irn">IRN: ${escapeHtml(input.irn)}${input.ackNo ? ` &nbsp; Ack No: ${escapeHtml(input.ackNo)}` : ''}</div>` : ''}
        ${input.ewayBillNo ? `<div>E-WAY BILL No: ${escapeHtml(input.ewayBillNo)}${input.transporterId ? ` &nbsp; Transporter ID: ${escapeHtml(input.transporterId)}` : ''}</div>` : ''}
      </section>
    </article>`;
  const pageCss = `
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: white; }
    .invoice {
      width: 210mm; box-sizing: border-box;
      margin: 0 auto; background: white; color: #111;
      font-family: Arial, Helvetica, sans-serif; font-size: 11px;
      padding: 8mm 8mm 9mm; display: flex; flex-direction: column;
    }
    .invoice.full { height: 296mm; }
    .head { display: grid; grid-template-columns: 78px 1fr 168px; gap: 8px; align-items: start; }
    .firm { text-align: center; }
    .firm h1 { margin: 2px 0 4px; font-size: 22px; letter-spacing: 0.6px; }
    .bless, .tiny { font-size: 10px; line-height: 1.35; }
    .title { margin-top: 6px; font-size: 14px; font-weight: 800; letter-spacing: 1px; }
    .qr { width: 72px; height: 72px; }
    .qr.empty { border: 1px solid #ddd; }
    .meta { width: 100%; border-collapse: collapse; }
    .meta td { border: 1px solid #111; padding: 3px 5px; font-size: 11px; }
    .meta td:first-child { font-weight: 700; width: 72px; }
    .party { display: grid; grid-template-columns: 1.4fr 1.2fr 0.8fr; gap: 10px; margin-top: 8px; border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 8px 0; line-height: 1.35; }
    .gap { margin-top: 8px; }
    .grid-wrap { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
    .grid { width: 100%; height: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; }
    .grid th, .grid td { border: 1px solid #222; padding: 4px 4px; font-size: 10px; vertical-align: top; }
    .grid th { font-size: 9px; }
    .grid th:nth-child(2), .grid td:nth-child(2) { width: 16%; }
    .grid tr.pad { height: 100%; }
    .grid tr.pad td { height: 100%; }
    .n { text-align: right; white-space: nowrap; }
    .c { text-align: center; }
    .foot { margin-top: 4px; }
    .sums { width: 100%; border-collapse: collapse; margin-top: 6px; border-top: 1px solid #111; }
    .sums td { padding: 3px 4px; font-size: 11px; }
    .sums td:last-child { width: 96px; }
    .words { margin: 8px 0; font-weight: 700; letter-spacing: 0.3px; font-size: 12px; }
    .sign { display: flex; justify-content: space-between; gap: 16px; margin-top: 4px; }
    .for { text-align: right; min-width: 180px; font-weight: 700; }
    .auth { margin-top: 36px; }
    .irn { margin-top: 8px; word-break: break-all; font-size: 9px; }
  `;
  return mountPreview(`Sale bill ${input.billNo || ''}`.trim(), html, pageCss, 'A4 tax invoice · choose any printer');
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
