const GEMINI_MODEL = process.env.GEMINI_PHOTO_MODEL || process.env.GEMINI_PURCHASE_MODEL || 'gemini-2.5-flash';
const MAX_PAGES = 4;

/** What the photo usually is for each entry screen. */
const KIND_HINTS = {
  purchase: 'a supplier\'s finish-goods purchase invoice (or a purchase return / debit note we sent). The party is the SELLER printed at the top, not the buyer.',
  expense: 'an expense / service bill (rent, electricity, transport, repairs, packing material, professional fees). The party is the SELLER / service provider.',
  grey_purchase: 'a grey (unfinished) fabric purchase bill from a weaver or trader. Lines are fabric qualities with takas and metres. Rate is per metre.',
  mill_receipt: 'a process house / dyeing mill job-work bill or receipt challan. The party is the MILL. Rate is the job rate per metre; look for taka, metres, lot no., challan no.',
  work_receipt: 'a job-worker\'s bill for embroidery / hand work / stitching. Lines are items with pieces and job rate.',
  sales: 'a sales order, handwritten order slip or sales invoice. The party is the BUYER / customer (billed to).',
  note: 'a credit note or debit note. The party is the other firm on the note (not us). Capture the original bill number it refers to.',
  bank: 'a payment proof: cheque, bank deposit slip, NEFT/RTGS/UPI screenshot or cash receipt. The party is who paid us or whom we paid.'
};

const SCHEMA = `{
  "party": {
    "name": "firm name of the other party",
    "gstin": "15-char GSTIN or empty",
    "mobile": "", "address": "", "city": "", "state": "", "pincode": "", "pan": ""
  },
  "docNo": "invoice / bill / challan / note / cheque / UTR number",
  "docDate": "YYYY-MM-DD",
  "refDocNo": "original bill no. a note or receipt refers to, else empty",
  "refDocDate": "YYYY-MM-DD or empty",
  "challanNo": "delivery / receipt challan no. if separate from bill no.",
  "orderNo": "order / PO number if any",
  "lotNo": "lot no. if any",
  "broker": "agent / broker name if printed",
  "transport": { "name": "", "lrNo": "", "vehicleNo": "" },
  "hsn": "main HSN / SAC code",
  "lines": [
    {
      "description": "item / quality / design name",
      "hsn": "",
      "takas": number, "pcs": number, "cut": number, "mts": number, "qty": number,
      "unit": "MTR|PCS|KG|NOS",
      "rate": number, "amount": number, "gstRate": number
    }
  ],
  "takaCount": number, "totalMts": number, "totalPcs": number,
  "grossAmount": number,
  "discountPercent": number, "discountAmount": number,
  "otherAdd": number, "otherLess": number,
  "taxableAmount": number,
  "gstRate": number, "cgstAmount": number, "sgstAmount": number, "igstAmount": number,
  "tdsAmount": number, "tcsAmount": number, "roundOff": number,
  "totalAmount": number,
  "payment": { "mode": "CHEQUE|NEFT|RTGS|UPI|CASH|", "bankName": "", "chequeNo": "", "utr": "", "amount": number },
  "remarks": "anything important that has no field above",
  "confidence": "high|medium|low",
  "unclear": ["names of fields you could not read reliably"]
}`;

const text = (v) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const gstinOf = (v) => text(v).toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);

function isoDate(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { mimeType: match[1], data: match[2] };
  return { mimeType: 'image/jpeg', data: String(dataUrl || '').split(',').pop() };
}

function stripJsonFence(value) {
  return String(value || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
}

export function normalizePhotoExtraction(raw) {
  const lines = (Array.isArray(raw?.lines) ? raw.lines : []).map(line => {
    const pcs = num(line.pcs);
    const cut = num(line.cut);
    const mts = num(line.mts) || (pcs && cut ? round2(pcs * cut) : 0);
    const rate = num(line.rate);
    const qty = num(line.qty) || mts || pcs;
    return {
      description: text(line.description),
      hsn: text(line.hsn),
      takas: num(line.takas),
      pcs,
      cut,
      mts,
      qty,
      unit: text(line.unit).toUpperCase() || (mts ? 'MTR' : 'PCS'),
      rate,
      amount: num(line.amount) || round2(qty * rate),
      gstRate: num(line.gstRate)
    };
  }).filter(line => line.description || line.amount || line.qty);

  const cgst = num(raw?.cgstAmount);
  const sgst = num(raw?.sgstAmount);
  const igst = num(raw?.igstAmount);
  const taxable = num(raw?.taxableAmount) || round2(lines.reduce((s, l) => s + l.amount, 0));
  const gstRate = num(raw?.gstRate) || lines.find(l => l.gstRate)?.gstRate
    || (taxable ? Math.round(((cgst + sgst + igst) / taxable) * 1000) / 10 : 0);

  return {
    party: {
      name: text(raw?.party?.name),
      gstin: gstinOf(raw?.party?.gstin),
      mobile: text(raw?.party?.mobile),
      address: text(raw?.party?.address),
      city: text(raw?.party?.city),
      state: text(raw?.party?.state),
      pincode: text(raw?.party?.pincode),
      pan: text(raw?.party?.pan).toUpperCase() || gstinOf(raw?.party?.gstin).slice(2, 12)
    },
    docNo: text(raw?.docNo),
    docDate: isoDate(raw?.docDate),
    refDocNo: text(raw?.refDocNo),
    refDocDate: isoDate(raw?.refDocDate),
    challanNo: text(raw?.challanNo),
    orderNo: text(raw?.orderNo),
    lotNo: text(raw?.lotNo),
    broker: text(raw?.broker),
    transport: {
      name: text(raw?.transport?.name),
      lrNo: text(raw?.transport?.lrNo),
      vehicleNo: text(raw?.transport?.vehicleNo).toUpperCase()
    },
    hsn: text(raw?.hsn) || lines.find(l => l.hsn)?.hsn || '',
    lines,
    takaCount: num(raw?.takaCount) || lines.reduce((s, l) => s + l.takas, 0),
    totalMts: num(raw?.totalMts) || round2(lines.reduce((s, l) => s + l.mts, 0)),
    totalPcs: num(raw?.totalPcs) || lines.reduce((s, l) => s + l.pcs, 0),
    grossAmount: num(raw?.grossAmount) || round2(lines.reduce((s, l) => s + l.amount, 0)),
    discountPercent: num(raw?.discountPercent),
    discountAmount: num(raw?.discountAmount),
    otherAdd: num(raw?.otherAdd),
    otherLess: num(raw?.otherLess),
    taxableAmount: taxable,
    gstRate,
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    tdsAmount: num(raw?.tdsAmount),
    tcsAmount: num(raw?.tcsAmount),
    roundOff: num(raw?.roundOff),
    totalAmount: num(raw?.totalAmount) || round2(taxable + cgst + sgst + igst),
    payment: {
      mode: text(raw?.payment?.mode).toUpperCase(),
      bankName: text(raw?.payment?.bankName),
      chequeNo: text(raw?.payment?.chequeNo),
      utr: text(raw?.payment?.utr),
      amount: num(raw?.payment?.amount)
    },
    remarks: text(raw?.remarks),
    confidence: ['high', 'medium', 'low'].includes(text(raw?.confidence)) ? text(raw?.confidence) : 'medium',
    unclear: Array.isArray(raw?.unclear) ? raw.unclear.map(text).filter(Boolean) : []
  };
}

/** Sanity checks the user should see before trusting the numbers. */
export function photoWarnings(x) {
  const out = [];
  if (!x.party.name && !x.party.gstin) out.push('Party name not found on the photo.');
  if (x.party.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(x.party.gstin)) out.push(`GSTIN "${x.party.gstin}" does not look valid — check it.`);
  if (!x.docNo) out.push('Bill / document number not found.');
  if (!x.docDate) out.push('Date not found.');
  const tax = x.cgstAmount + x.sgstAmount + x.igstAmount;
  if (x.taxableAmount && x.totalAmount) {
    const expected = x.taxableAmount + tax - x.tdsAmount + x.tcsAmount + x.roundOff;
    if (Math.abs(expected - x.totalAmount) > Math.max(2, x.totalAmount * 0.01)) {
      out.push(`Totals do not add up: taxable ${x.taxableAmount} + tax ${round2(tax)} ≠ bill total ${x.totalAmount}.`);
    }
  }
  const lineSum = x.lines.reduce((s, l) => s + l.amount, 0);
  if (x.lines.length && x.grossAmount && Math.abs(lineSum - x.grossAmount) > Math.max(2, x.grossAmount * 0.01)) {
    out.push('Line amounts do not add up to the bill amount — some lines may be missed.');
  }
  if (x.unclear.length) out.push(`Could not read clearly: ${x.unclear.join(', ')}.`);
  return out;
}

export async function extractPhotoEntry(kind, images) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('Photo entry is not set up on the server (GEMINI_API_KEY missing).'), { status: 400 });
  }
  const pages = (Array.isArray(images) ? images : [images]).filter(Boolean).slice(0, MAX_PAGES);
  if (!pages.length) throw Object.assign(new Error('Attach at least one photo.'), { status: 400 });

  const prompt = `You read Indian textile business documents for an ERP data entry screen.
The photo${pages.length > 1 ? `s are ${pages.length} pages of ONE document` : ' is one document'}: ${KIND_HINTS[kind] || KIND_HINTS.purchase}
Our own firm is the other side of the document; never return our firm as the party.
Read printed and handwritten text. Numbers: no commas or currency symbols. Dates as YYYY-MM-DD (Indian dates are DD/MM/YY).
Use 0 or "" when a value is not on the document — never guess. List every item line.
Return only JSON in this shape:
${SCHEMA}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [...pages.map(page => ({ inlineData: parseDataUrl(page) })), { text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw Object.assign(new Error(payload?.error?.message || `Could not read the photo (${response.status}).`), { status: 502 });
  }
  const payload = await response.json();
  const raw = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
  if (!raw.trim()) throw Object.assign(new Error('Nothing could be read from the photo. Try a clearer, straight photo.'), { status: 422 });
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    throw Object.assign(new Error('The photo could not be read properly. Try again with better light.'), { status: 422 });
  }
  const extraction = normalizePhotoExtraction(parsed);
  return { extraction, warnings: photoWarnings(extraction) };
}

export const PHOTO_KINDS = Object.keys(KIND_HINTS);
