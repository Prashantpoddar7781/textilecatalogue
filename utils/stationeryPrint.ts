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

/**
 * Open a page that is only the sheet. Printing the ERP screen is what shrinks
 * the bill and paints a second copy down the right edge.
 */
function printInOwnWindow(title: string, markup: string, pageCss: string) {
  const invoice = markup.includes('class="invoice');
  const width = invoice ? '210mm' : '8in';
  const height = invoice ? '297mm' : '12in';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: ${width} ${height}; margin: 0; }
html, body {
  margin: 0; padding: 0; width: ${width}; height: ${height};
  overflow: hidden; background: #fff;
}
#stationery-preview, #stationery-preview .sheet-pad {
  margin: 0; padding: 0; width: ${width}; height: ${height};
  overflow: hidden; background: #fff;
}
#stationery-preview .invoice {
  width: ${width} !important; max-width: ${width} !important;
  height: ${height} !important; min-height: ${height} !important; max-height: ${height} !important;
  margin: 0 !important; box-shadow: none !important; overflow: hidden !important;
}
#stationery-preview .sheet { margin: 0; box-shadow: none; }
${SHEET_CSS}
${pageCss}
</style></head>
<body><div id="stationery-preview"><div class="sheet-pad">${markup}</div></div></body></html>`;

  const popup = window.open('', 'threadx-print');
  if (!popup) {
    window.alert('Allow pop-ups for textilecatalogue.vercel.app so the bill can print on one A4 page.');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  const run = () => {
    popup.focus();
    popup.print();
  };
  popup.addEventListener('afterprint', () => popup.close(), { once: true });
  window.setTimeout(run, 250);
}

function mountPreview(title: string, markup: string, pageCss: string, hint = '8 × 12 inch · choose any printer') {
  document.getElementById('stationery-preview')?.remove();
  const root = document.createElement('div');
  root.id = 'stationery-preview';
  root.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#e5e7eb;overflow:auto;color:#111;';
  root.innerHTML = `
    <style>${SHEET_CSS}${pageCss}
      .sheet, .invoice { margin: 0 auto; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
    </style>
    <div class="no-print" style="position:sticky;top:0;display:flex;gap:12px;align-items:center;padding:10px 14px;background:#111827;color:white;font-family:Arial,sans-serif;z-index:1;">
      <button type="button" data-print style="border:0;border-radius:8px;background:white;color:#111;font-weight:800;padding:8px 14px;cursor:pointer;">Print</button>
      <button type="button" data-close style="border:0;border-radius:8px;background:#374151;color:white;font-weight:800;padding:8px 14px;cursor:pointer;">Close</button>
      <span style="font-size:12px;font-weight:600;">${escapeHtml(title)} · ${escapeHtml(hint)}</span>
    </div>
    <div class="sheet-pad" style="padding:16px 0;">${markup}</div>
  `;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    root.remove();
  };
  const onKey = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      event.stopPropagation();
      printInOwnWindow(title, markup, pageCss);
    }
  };
  root.querySelector('[data-close]')?.addEventListener('click', close);
  root.querySelector('[data-print]')?.addEventListener('click', () => printInOwnWindow(title, markup, pageCss));
  document.addEventListener('keydown', onKey);
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
    /** Entered less-fold. The bill prints 100 minus this figure. */
    lessFold?: number;
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
      <td class="n">${(100 - (Number(line.lessFold) || 0)).toFixed(2)}</td>
      <td class="n">${line.mts ? line.mts.toFixed(2) : ''}</td>
      <td class="n">${line.rate ? line.rate.toFixed(2) : ''}</td>
      <td class="c">${escapeHtml(line.unit || '')}</td>
      <td class="n">${money(line.amount)}</td>
    </tr>`).join('');
  const qr = input.qrDataUrl ? `<img class="qr" alt="QR" src="${input.qrDataUrl}" />` : '<div class="qr empty"></div>';
  const cols = ['4%', '14%', '12%', '9%', '9%', '6%', '6%', '8%', '8%', '8%', '6%', '10%'];
  const fillPage = input.lines.length <= 16;
  const html = `
    <article class="invoice${fillPage ? ' full' : ''}">
      <header class="head">
        ${qr}
        <div class="firm">
          <div class="bless">!! Shree Ganeshaya Namah !!</div>
          ${input.companyPhone ? `<div class="tiny">PHONES: ${escapeHtml(input.companyPhone)}</div>` : ''}
          <h1>${escapeHtml(input.companyName || 'TAX INVOICE')}</h1>
          <div class="tiny">${[input.companyUdyam ? `Udyam ${input.companyUdyam}` : '', input.companyPan ? `PAN No.: ${input.companyPan}` : ''].filter(Boolean).map(escapeHtml).join(' &nbsp;&nbsp; ')}</div>
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
        <div class="buyer">
          <div><b>Buyer:</b> ${escapeHtml(input.partyName)}</div>
          ${input.address1 ? `<div>${escapeHtml(input.address1)}</div>` : ''}
          ${input.address2 ? `<div>${escapeHtml(input.address2)}</div>` : ''}
          <div>${escapeHtml(buyerPlace)}${input.phone ? ` &nbsp;&nbsp; MO: ${escapeHtml(input.phone)}` : ''}</div>
          <div>${input.partyGstin ? `GSTIN: ${escapeHtml(input.partyGstin)}` : ''}${input.state ? ` &nbsp;&nbsp; Place of Supply: ${escapeHtml(input.state)}` : ''}</div>
          <div><b>Consignee:</b> ${escapeHtml(input.haste || '')}</div>
        </div>
        <div class="dispatch">
          <div><b>AGENT:</b> ${escapeHtml(input.broker || '')}</div>
          <div class="lr">
            <span><b>L.R. NO.:</b> ${escapeHtml(input.lrNo || '')}</span>
            <span><b>LR DATE:</b> ${escapeHtml(shortDate(input.lrDate))}</span>
            <span><b>WEIGHT:</b> 0.000</span>
            <span><b>FREIGHT:</b> 0.00</span>
          </div>
          <div class="lr">
            <span><b>TRANSPORT:</b> ${escapeHtml(input.transport || '')}</span>
            <span><b>CASE NO.:</b> ${escapeHtml(String(input.billNo || '').split('/')[0])}</span>
            <span><b>HSN:</b> ${escapeHtml(input.hsn || '')}</span>
          </div>
          <div><b>STATION:</b> ${escapeHtml(input.station || input.city || '')}</div>
        </div>
      </section>
      <div class="lines">
        <table class="grid">
          <colgroup>${cols.map(width => `<col style="width:${width}">`).join('')}</colgroup>
          <thead>
            <tr>
              <th>SR.</th><th>ITEM</th><th>CATEGORY</th><th>PACK</th><th>CLOTH</th>
              <th>PCS</th><th>CUT</th><th>LESS FOLD</th><th>MTS.</th><th>RATE</th><th>PER</th><th>AMOUNT</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        ${fillPage ? `<div class="ruler" aria-hidden="true">${cols.map(() => '<i></i>').join('')}</div>` : ''}
      </div>
      <section class="foot">
        <div class="bank">${bank ? `<b>BANK A/C No.:</b> ${bank}` : ''}</div>
        <div><b>REMARK:</b> ${escapeHtml(input.remarks || '')}</div>
        <table class="totals">
          <colgroup>${cols.map(width => `<col style="width:${width}">`).join('')}</colgroup>
          <tbody>
            <tr>
              <td colspan="5">SUB TOTAL</td>
              <td class="n">${input.totalPcs || ''}</td>
              <td></td>
              <td></td>
              <td class="n">${money(input.totalMts || 0)}</td>
              <td colspan="2"></td>
              <td class="n amt">${money(input.grossAmount)}</td>
            </tr>
            ${taxRows.map(row => `<tr><td class="taxline" colspan="12">${row}</td></tr>`).join('')}
            <tr>
              <td colspan="5">DUE DAYS: ${Number(input.dueDays) || 0}</td>
              <td class="inv" colspan="6">Invoice Value</td>
              <td class="n amt">${money(input.netAmount)}</td>
            </tr>
          </tbody>
        </table>
        <div class="words">${escapeHtml(rupeesInWords(input.netAmount).toUpperCase())}</div>
        <div class="sign">
          <div class="terms">
            <div class="termhead">TERMS &amp; CONDITIONS:-</div>
            ${terms.map(line => `<div>${escapeHtml(line)}</div>`).join('')}
          </div>
          <div class="for">FOR ${escapeHtml(input.companyName || '')}</div>
        </div>
        <div class="checks"><span>CHECKED BY</span><span>DELIVERED BY</span><span>AUTH. SIGN</span></div>
        ${input.irn ? `<div class="irn">IRN: ${escapeHtml(input.irn)}${input.ackNo ? ` &nbsp; Ack No: ${escapeHtml(input.ackNo)}` : ''}</div>` : ''}
        ${input.ewayBillNo ? `<div class="irn">E-WAY BILL No: ${escapeHtml(input.ewayBillNo)}${input.transporterId ? ` &nbsp; Transporter ID: ${escapeHtml(input.transporterId)}` : ''}</div>` : ''}
      </section>
    </article>`;
  const pageCss = `
    @page { size: A4 portrait; margin: 0; }
    #stationery-preview .invoice {
      width: 210mm; max-width: 210mm; box-sizing: border-box; margin: 0 auto; background: #fff; color: #111;
      font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.25;
      padding: 8mm; display: flex; flex-direction: column; overflow: hidden;
    }
    #stationery-preview .invoice.full { height: 296mm; min-height: 296mm; max-height: 296mm; }
    #stationery-preview .head { display: grid; grid-template-columns: 18mm minmax(0, 1fr) 42mm; gap: 3mm; align-items: start; }
    #stationery-preview .firm, #stationery-preview .party, #stationery-preview .tiny, #stationery-preview .words, #stationery-preview .terms {
      overflow-wrap: anywhere;
    }
    #stationery-preview .firm { text-align: center; }
    #stationery-preview .firm h1 { margin: 1px 0 2px; font-size: 20px; letter-spacing: 0.4px; line-height: 1.1; }
    #stationery-preview .bless, #stationery-preview .tiny { font-size: 10px; line-height: 1.25; }
    #stationery-preview .title { margin-top: 3px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; }
    #stationery-preview .qr { width: 68px; height: 68px; display: block; }
    #stationery-preview .qr.empty { border: 1px solid #ccc; }
    #stationery-preview .meta { width: 100%; border-collapse: collapse; }
    #stationery-preview .meta td { border: 1px solid #111; padding: 2px 4px; font-size: 11px; }
    #stationery-preview .meta td:first-child { font-weight: 700; width: 68px; }
    #stationery-preview .party {
      display: grid; grid-template-columns: 1.15fr 1fr; gap: 6px 18px;
      margin-top: 6px; padding: 5px 0 6px; border-top: 1px solid #111; border-bottom: 1px solid #111;
    }
    #stationery-preview .lr { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 2px; }
    #stationery-preview .lines { flex: 1 1 auto; display: flex; flex-direction: column; margin-top: 2mm; min-height: 120mm; }
    #stationery-preview .grid {
      display: table; width: 100%; height: auto; border-collapse: collapse; table-layout: fixed; flex: 0 0 auto;
    }
    #stationery-preview .grid thead { display: table-header-group; }
    #stationery-preview .grid tbody { display: table-row-group; }
    #stationery-preview .grid tr { display: table-row; }
    #stationery-preview .grid th, #stationery-preview .grid td {
      display: table-cell; border: 1px solid #222; padding: 2px 3px; font-size: 10px;
      vertical-align: middle; font-weight: 500; line-height: 1.2;
    }
    #stationery-preview .grid th { font-size: 9px; font-weight: 700; text-align: center; background: #fff; }
    #stationery-preview .ruler {
      flex: 1 1 auto; display: grid; grid-template-columns: ${cols.join(' ')}; grid-template-rows: 1fr;
      border-left: 1px solid #222; border-bottom: 1px solid #222; min-height: 0;
    }
    #stationery-preview .ruler i { display: block; border-right: 1px solid #222; min-height: 100%; }
    #stationery-preview .n { text-align: right; white-space: nowrap; }
    #stationery-preview .c { text-align: center; }
    #stationery-preview .foot { flex: 0 0 auto; margin-top: 6px; }
    #stationery-preview .bank { min-height: 14px; }
    #stationery-preview .totals { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 2px; }
    #stationery-preview .totals td { border: none; padding: 2px 3px; font-size: 11px; vertical-align: middle; }
    #stationery-preview .amt { font-weight: 800; }
    #stationery-preview .inv { font-weight: 700; text-align: right; }
    #stationery-preview .taxline { text-align: right; }
    #stationery-preview .words { margin: 6px 0 4px; font-weight: 800; letter-spacing: 0.2px; }
    #stationery-preview .sign { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    #stationery-preview .termhead { font-weight: 700; }
    #stationery-preview .for { font-weight: 800; white-space: nowrap; padding-top: 14px; }
    #stationery-preview .checks { display: flex; justify-content: space-between; margin-top: 16px; font-weight: 700; }
    #stationery-preview .irn { margin-top: 4px; word-break: break-all; font-size: 9px; }
    @media print {
      #stationery-preview .lines { min-height: 0; }
    }
  `;
  return mountPreview(`Sale bill ${input.billNo || ''}`.trim(), html, pageCss, 'A4 · scale 100% · margins None');
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
