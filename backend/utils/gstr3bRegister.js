import { roundMoney } from './orderBilling.js';
import { loadGstDocuments } from './gstDocuments.js';

/**
 * GSTR-3B register in Empire's layout (3B TYPE → sub type → tran type → bills)
 * plus the GSTR-3B form tables built from the same rows.
 * Section and ITC bucket of every voucher come from the Transaction Types master
 * (GST DOCUMENT TYPE + ELIGIBILITY FOR INPUT TAX CREDIT).
 */

const zero = () => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, billAmount: 0, ledgerAmount: 0, count: 0 });

function add(target, amounts) {
  target.taxable = roundMoney(target.taxable + (amounts.taxable || 0));
  target.igst = roundMoney(target.igst + (amounts.igst || 0));
  target.cgst = roundMoney(target.cgst + (amounts.cgst || 0));
  target.sgst = roundMoney(target.sgst + (amounts.sgst || 0));
  target.cess = 0;
  target.billAmount = roundMoney(target.billAmount + (amounts.billAmount || 0));
  target.ledgerAmount = roundMoney(target.ledgerAmount + (amounts.ledgerAmount || 0));
  target.count += amounts.count ?? 1;
}

/** Signed amounts of the lines that pass the filter (taxed or nil lines of one voucher). */
function partOf(doc, filter) {
  const lines = doc.lines.filter(filter);
  const sum = lines.reduce((acc, line) => ({
    taxable: acc.taxable + line.taxable,
    igst: acc.igst + line.igst,
    cgst: acc.cgst + line.cgst,
    sgst: acc.sgst + line.sgst
  }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 });
  const s = doc.sign;
  return {
    taxable: roundMoney(sum.taxable * s),
    igst: roundMoney(sum.igst * s),
    cgst: roundMoney(sum.cgst * s),
    sgst: roundMoney(sum.sgst * s)
  };
}

const taxed = (line) => (Number(line.rate) || 0) > 0 || Math.abs(line.igst + line.cgst + line.sgst) > 0.001;
const untaxed = (line) => !taxed(line);

/** Register rows for one voucher: [{ type3b, subType, amounts }]. */
function classify(doc, reconciled, hasStatement) {
  const out = [];
  const bill = roundMoney(doc.invoiceValue * doc.sign);
  if (doc.direction === 'outward') {
    const main = partOf(doc, taxed);
    const nil = partOf(doc, untaxed);
    if (main.taxable || main.igst || main.cgst || main.sgst) {
      const subType = !doc.registered && doc.interState
        ? `3.2 Inter-state Unregd ${doc.pos || 'Unknown state'}`
        : 'All Other Regd+Unregd Sale';
      out.push({ type3b: 'OUTWARD', subType, table: '3.1(a)', amounts: main });
    }
    if (nil.taxable) {
      out.push({ type3b: 'OUTWARD', subType: 'Nil Rated / Exempt Sale', table: '3.1(c)', amounts: nil });
    }
  } else if (doc.direction === 'inward') {
    const all = partOf(doc, () => true);
    const tax = Math.abs(all.igst) + Math.abs(all.cgst) + Math.abs(all.sgst);
    let subType;
    let table;
    if (doc.kind === 'rcm_invoice') {
      subType = 'Inward (Reverse Charge)';
      table = '3.1(d)';
    } else if (tax < 0.001) {
      subType = 'Non-GST';
      table = '5';
    } else if (!doc.itc) {
      subType = 'ITC Ineligible';
      table = '4(D)(2)';
    } else if (doc.kind === 'inward_credit' || doc.kind === 'inward_debit') {
      subType = doc.docType;
      table = '4(A)(5)';
    } else if (hasStatement || reconciled.has(doc.id)) {
      subType = reconciled.has(doc.id) ? 'ITC (Reconciled with 2B)' : 'ITC (Unreconciled with 2B)';
      table = '4(A)(5)';
    } else {
      subType = 'ITC (Unreconciled with 2A)';
      table = '4(A)(5)';
    }
    out.push({ type3b: 'INWARD', subType, table, amounts: all });
  }
  return out.map(row => ({
    ...row,
    amounts: { ...row.amounts, billAmount: bill, ledgerAmount: bill }
  }));
}

/**
 * Rule 88A set-off: IGST credit first against IGST, then CGST / SGST;
 * CGST credit against CGST then IGST; SGST credit against SGST then IGST.
 * CGST credit never pays SGST and vice versa.
 */
export function utiliseCredit(liability, credit) {
  const due = {
    igst: Math.max(0, roundMoney(liability.igst)),
    cgst: Math.max(0, roundMoney(liability.cgst)),
    sgst: Math.max(0, roundMoney(liability.sgst))
  };
  const left = {
    igst: Math.max(0, roundMoney(credit.igst)),
    cgst: Math.max(0, roundMoney(credit.cgst)),
    sgst: Math.max(0, roundMoney(credit.sgst))
  };
  const paid = {
    igst: { igst: 0, cgst: 0, sgst: 0 },
    cgst: { igst: 0, cgst: 0, sgst: 0 },
    sgst: { igst: 0, cgst: 0, sgst: 0 }
  };
  const use = (head, from) => {
    const amount = roundMoney(Math.min(due[head], left[from]));
    if (amount <= 0) return;
    due[head] = roundMoney(due[head] - amount);
    left[from] = roundMoney(left[from] - amount);
    paid[head][from] = roundMoney(paid[head][from] + amount);
  };
  use('igst', 'igst');
  // Remaining IGST credit is spread over CGST and SGST so both heads benefit.
  if (left.igst > 0) {
    const halfC = roundMoney(Math.min(due.cgst, left.igst / 2));
    const halfS = roundMoney(Math.min(due.sgst, left.igst - halfC));
    if (halfC > 0) { due.cgst = roundMoney(due.cgst - halfC); left.igst = roundMoney(left.igst - halfC); paid.cgst.igst = halfC; }
    if (halfS > 0) { due.sgst = roundMoney(due.sgst - halfS); left.igst = roundMoney(left.igst - halfS); paid.sgst.igst = halfS; }
    use('cgst', 'igst');
    use('sgst', 'igst');
  }
  use('cgst', 'cgst');
  use('sgst', 'sgst');
  use('igst', 'cgst');
  use('igst', 'sgst');
  return ['igst', 'cgst', 'sgst'].map(head => ({
    head,
    liability: Math.max(0, roundMoney(liability[head])),
    paidByIgst: paid[head].igst,
    paidByCgst: paid[head].cgst,
    paidBySgst: paid[head].sgst,
    cash: due[head],
    creditCarriedForward: left[head]
  }));
}

/**
 * @param {object} options.reconciledIds  voucher ids MATCHED in the 2B/2A match (optional)
 */
export async function buildGstr3bRegister(prisma, userId, range, options = {}) {
  const loaded = await loadGstDocuments(prisma, userId, range);
  const reconciled = new Set(options.reconciledIds || []);
  const hasStatement = Boolean(options.hasStatement);

  const groups = new Map();
  const forms = {
    '3.1(a)': zero(),
    '3.1(b)': zero(),
    '3.1(c)': zero(),
    '3.1(d)': zero(),
    '3.1(e)': zero()
  };
  const interStateUnregd = new Map();
  const itcBuckets = { 'Input Goods': zero(), 'Input Services': zero(), 'Capital Goods': zero() };
  const itcReconciled = zero();
  const itcUnreconciled = zero();
  const ineligible = zero();
  const inwardExempt = { inter: zero(), intra: zero() };

  for (const doc of loaded.docs) {
    for (const row of classify(doc, reconciled, hasStatement)) {
      const typeKey = row.type3b;
      if (!groups.has(typeKey)) groups.set(typeKey, { type3b: typeKey, totals: zero(), subTypes: new Map() });
      const typeGroup = groups.get(typeKey);
      if (!typeGroup.subTypes.has(row.subType)) {
        typeGroup.subTypes.set(row.subType, { subType: row.subType, table: row.table, totals: zero(), tranTypes: new Map() });
      }
      const subGroup = typeGroup.subTypes.get(row.subType);
      if (!subGroup.tranTypes.has(doc.transactionType)) {
        subGroup.tranTypes.set(doc.transactionType, { transactionType: doc.transactionType, totals: zero(), docs: [] });
      }
      const tranGroup = subGroup.tranTypes.get(doc.transactionType);
      add(typeGroup.totals, row.amounts);
      add(subGroup.totals, row.amounts);
      add(tranGroup.totals, row.amounts);
      tranGroup.docs.push({
        id: doc.id,
        source: doc.source,
        editPath: doc.editPath,
        date: doc.date,
        docNo: doc.docNo,
        partyBillNo: doc.partyBillNo,
        partyName: doc.partyName,
        partyGstin: doc.partyGstin,
        pos: doc.pos,
        ...row.amounts,
        count: undefined
      });

      if (forms[row.table]) add(forms[row.table], row.amounts);
      if (row.subType.startsWith('3.2 ')) {
        const cur = interStateUnregd.get(doc.pos) || { pos: doc.pos, ...zero() };
        add(cur, row.amounts);
        interStateUnregd.set(doc.pos, cur);
      }
      if (row.table === '4(A)(5)') {
        if (itcBuckets[doc.itc]) add(itcBuckets[doc.itc], row.amounts);
        if (row.subType === 'ITC (Reconciled with 2B)') add(itcReconciled, row.amounts);
        else if (row.subType.startsWith('ITC (Unreconciled')) add(itcUnreconciled, row.amounts);
      }
      if (row.table === '4(D)(2)') add(ineligible, row.amounts);
      if (row.table === '5') add(doc.interState ? inwardExempt.inter : inwardExempt.intra, row.amounts);
    }
  }

  const register = ['OUTWARD', 'INWARD']
    .filter(key => groups.has(key))
    .map(key => {
      const typeGroup = groups.get(key);
      return {
        type3b: typeGroup.type3b,
        totals: typeGroup.totals,
        subTypes: Array.from(typeGroup.subTypes.values())
          .sort((a, b) => a.subType.localeCompare(b.subType))
          .map(sub => ({
            subType: sub.subType,
            table: sub.table,
            totals: sub.totals,
            tranTypes: Array.from(sub.tranTypes.values()).sort((a, b) => a.transactionType.localeCompare(b.transactionType))
          }))
      };
    });

  const itcTotal = zero();
  Object.values(itcBuckets).forEach(bucket => add(itcTotal, { ...bucket, count: bucket.count }));
  const reversal = zero();
  const netItc = {
    igst: roundMoney(itcTotal.igst - reversal.igst),
    cgst: roundMoney(itcTotal.cgst - reversal.cgst),
    sgst: roundMoney(itcTotal.sgst - reversal.sgst)
  };
  const outwardTax = {
    igst: roundMoney(forms['3.1(a)'].igst + forms['3.1(d)'].igst),
    cgst: roundMoney(forms['3.1(a)'].cgst + forms['3.1(d)'].cgst),
    sgst: roundMoney(forms['3.1(a)'].sgst + forms['3.1(d)'].sgst)
  };

  return {
    period: range.period || '',
    fromDate: range.fromDate || '',
    toDate: range.toDate || '',
    company: { name: loaded.companyName, gstin: loaded.gstin, stateCode: loaded.businessCode },
    hasStatement,
    register,
    forms: {
      table31: [
        { code: '3.1(a)', label: 'Outward taxable supplies (other than zero rated, nil rated and exempted)', ...forms['3.1(a)'] },
        { code: '3.1(b)', label: 'Outward taxable supplies (zero rated)', ...forms['3.1(b)'] },
        { code: '3.1(c)', label: 'Other outward supplies (Nil rated, exempted)', ...forms['3.1(c)'] },
        { code: '3.1(d)', label: 'Inward supplies (liable to reverse charge)', ...forms['3.1(d)'] },
        { code: '3.1(e)', label: 'Non-GST outward supplies', ...forms['3.1(e)'] }
      ],
      table32: Array.from(interStateUnregd.values()).sort((a, b) => String(a.pos).localeCompare(String(b.pos))),
      table4: [
        { code: '4(A)(1)', label: 'Import of goods', ...zero() },
        { code: '4(A)(2)', label: 'Import of services', ...zero() },
        { code: '4(A)(3)', label: 'Inward supplies liable to reverse charge', ...forms['3.1(d)'] },
        { code: '4(A)(4)', label: 'Inward supplies from ISD', ...zero() },
        { code: '4(A)(5)', label: 'All other ITC', ...itcTotal },
        { code: '4(A)(5) Input Goods', label: '— Input Goods', ...itcBuckets['Input Goods'] },
        { code: '4(A)(5) Input Services', label: '— Input Services', ...itcBuckets['Input Services'] },
        { code: '4(A)(5) Capital Goods', label: '— Capital Goods', ...itcBuckets['Capital Goods'] },
        { code: '4(B)', label: 'ITC reversed (Rule 38/42/43, 17(5), others)', ...reversal },
        { code: '4(C)', label: 'Net ITC available (A − B)', ...zero(), ...netItc },
        { code: '4(D)(2)', label: 'Ineligible ITC (series with no ITC eligibility in the master)', ...ineligible }
      ],
      itcCheck: hasStatement
        ? { reconciled: itcReconciled, unreconciled: itcUnreconciled }
        : null,
      table5: [
        { code: '5', label: 'Exempt, nil rated and non-GST inward supplies — Inter-state', ...inwardExempt.inter },
        { code: '5', label: 'Exempt, nil rated and non-GST inward supplies — Intra-state', ...inwardExempt.intra }
      ],
      table61: utiliseCredit(outwardTax, netItc)
    }
  };
}
