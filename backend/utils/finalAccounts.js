import {
  calculateOrderDiscountAmount,
  calculateOrderGrandTotal,
  isPurchaseReturn,
  isSalesGoodsReturn,
  OPENING_BANK_BALANCE,
  roundMoney
} from './orderBilling.js';
import {
  DEFAULT_CREDITOR_ACCOUNT_TYPE,
  DEFAULT_DEBTOR_ACCOUNT_TYPE,
  getAccountType
} from '../constants/accountTypes.js';
import {
  formatSeriesBillNumber,
  getGstDocumentType,
  postingPartyAccountType,
  postingSaleOrPurchaseAccount,
  resolveDiscountJournal
} from '../constants/erpTransactionPostingRules.js';

/** Generic role defaults: a party sitting on one of these was never classified deliberately. */
const UNCLASSIFIED_ACCOUNT_TYPES = new Set([
  DEFAULT_CREDITOR_ACCOUNT_TYPE.toUpperCase(),
  DEFAULT_DEBTOR_ACCOUNT_TYPE.toUpperCase()
]);

/**
 * A/C Type each party's own vouchers imply, via the Transaction Types master.
 * A party is grouped under the account type carrying the largest share of their
 * postings, so grey suppliers land in Creditors for Grey even when nobody set
 * the field on the party master.
 */
function buildPostedAccountTypeMap({ purchaseBills = [], greyPurchases = [], greyReturns = [], orders = [] }) {
  const weights = new Map();
  const add = (name, accountType, amount) => {
    const key = String(name || '').trim().toLowerCase();
    const type = String(accountType || '').trim();
    const value = Math.abs(Number(amount) || 0);
    if (!key || !type || value <= 0) return;
    const byType = weights.get(key) || new Map();
    byType.set(type, roundMoney((byType.get(type) || 0) + value));
    weights.set(key, byType);
  };

  for (const bill of purchaseBills) {
    add(bill.supplier?.name, postingPartyAccountType(bill.transactionType), bill.grandTotal);
  }
  for (const grey of greyPurchases) {
    add(grey.partyName, postingPartyAccountType('GREY PURCHASE'), grey.netAmount);
  }
  for (const ret of greyReturns) {
    add(ret.partyName, postingPartyAccountType('GREY PURCHASE RETURN'), ret.netAmount);
  }
  for (const order of orders) {
    const party = order.customer?.organizationName || order.buyerName;
    add(party, postingPartyAccountType(order.transactionType), calculateOrderGrandTotal(order));
  }

  const dominant = new Map();
  for (const [key, byType] of weights.entries()) {
    let best = null;
    for (const [type, amount] of byType.entries()) {
      if (!best || amount > best.amount) best = { type, amount };
    }
    if (best) dominant.set(key, best.type);
  }
  return dominant;
}

/**
 * Grouping precedence: a deliberately chosen A/C Type on the party master wins,
 * otherwise the posting rule decides, otherwise the plain role default.
 */
function makeAccountTypeResolver(masterMap, postedMap) {
  return (partyName, fallback) => {
    const key = String(partyName || '').trim().toLowerCase();
    const master = masterMap.get(key) || null;
    const posted = postedMap.get(key) || null;
    if (master && !UNCLASSIFIED_ACCOUNT_TYPES.has(master.toUpperCase())) return master;
    return posted || master || fallback;
  };
}

const optionalDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const inRange = (dateValue, fromDate, toDate) => {
  if (!dateValue) return !fromDate && !toDate;
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return false;
  if (fromDate && time < fromDate.getTime()) return false;
  if (toDate && time > toDate.getTime()) return false;
  return true;
};

const bump = (map, key, field, amount) => {
  const name = String(key || 'Other').trim() || 'Other';
  const current = map.get(name) || { account: name, debit: 0, credit: 0 };
  current[field] = roundMoney(current[field] + (Number(amount) || 0));
  map.set(name, current);
};

const typeOf = (value) => String(value || '').trim().toUpperCase();

/** GST Capital Goods → Balance Sheet (fixed assets) */
export function isCapitalGoodsPurchase(transactionType) {
  return typeOf(transactionType).includes('GST CAPITAL GOODS');
}

/** GST General Goods / Input Services → P&L expenses */
export function isPlExpensePurchase(transactionType) {
  const value = typeOf(transactionType);
  return value.includes('GST GENERAL GOODS') || value.includes('GST INPUT SERVICES');
}

const mapToRows = (map, field = 'debit') => Array.from(map.values())
  .filter(row => (row[field] || 0) > 0.001 || (row.debit || 0) > 0.001 || (row.credit || 0) > 0.001)
  .map(row => ({
    account: row.account,
    amount: roundMoney(field === 'net'
      ? Math.max((row.debit || 0) - (row.credit || 0), 0)
      : (row[field] || row.debit || 0))
  }))
  .filter(row => row.amount > 0.001)
  .sort((a, b) => a.account.localeCompare(b.account));

/**
 * Final Accounts from ERP postings.
 * - Finish / grey purchases → Trading
 * - GST Capital Goods → Balance Sheet fixed assets (by Pur A/C)
 * - GST General Goods / Input Services → P&L expenses (by Pur A/C)
 * Views: trial | trading | pl | balance | all
 */
export async function buildFinalAccounts(prisma, userId, {
  view = 'all',
  presentation = 'normal',
  fromDate: fromRaw,
  toDate: toRaw,
  asOnDate: asOnRaw
} = {}) {
  const asOn = optionalDate(asOnRaw) || new Date();
  asOn.setHours(23, 59, 59, 999);

  let fromDate = optionalDate(fromRaw);
  let toDate = optionalDate(toRaw);
  if (!fromDate && !toDate) {
    const year = asOn.getMonth() >= 3 ? asOn.getFullYear() : asOn.getFullYear() - 1;
    fromDate = new Date(year, 3, 1);
    toDate = asOn;
  } else {
    if (fromDate) fromDate.setHours(0, 0, 0, 0);
    if (toDate) toDate.setHours(23, 59, 59, 999);
    else toDate = asOn;
  }

  const [
    orders,
    purchaseBills,
    greyPurchases,
    greyReturns,
    bankEntries,
    salesNotes,
    purchaseNotes,
    suppliers,
    customers
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        userId,
        status: 'completed',
        OR: [{ transactionType: null }, { transactionType: { not: 'SALES ORDERS' } }]
      },
      include: { customer: true }
    }),
    prisma.purchaseBill.findMany({
      where: { userId, status: 'posted' },
      include: { supplier: true }
    }),
    prisma.greyPurchase.findMany({
      where: { userId, status: { not: 'cancelled' } }
    }),
    prisma.greyPurchaseReturn.findMany({
      where: { userId, status: { not: 'cancelled' } }
    }),
    prisma.bankEntry.findMany({ where: { userId } }),
    prisma.creditDebitNote.findMany({
      where: { userId, noteSide: 'sales', status: { not: 'cancelled' } }
    }),
    prisma.creditDebitNote.findMany({
      where: { userId, noteSide: 'purchase', status: { not: 'cancelled' } }
    }),
    prisma.supplier.findMany({ where: { userId }, select: { name: true, accountType: true } }),
    prisma.customer.findMany({ where: { userId }, select: { organizationName: true, accountType: true } })
  ]);

  const partyAccountType = new Map();
  for (const row of suppliers) {
    const name = String(row.name || '').trim().toLowerCase();
    if (name && row.accountType) partyAccountType.set(name, row.accountType);
  }
  for (const row of customers) {
    const name = String(row.organizationName || '').trim().toLowerCase();
    if (name && row.accountType) partyAccountType.set(name, row.accountType);
  }

  const postedAccountType = buildPostedAccountTypeMap({
    purchaseBills,
    greyPurchases,
    greyReturns,
    orders
  });
  const resolvePartyAccountType = makeAccountTypeResolver(partyAccountType, postedAccountType);

  let sales = 0;
  let salesReturn = 0;
  let purchases = 0;
  let purchaseReturn = 0;
  let greyPurchaseAmt = 0;
  let greyReturnAmt = 0;
  let expenses = 0;
  let capitalGoodsPeriod = 0;
  let bankReceipts = 0;
  let bankPayments = 0;
  let salesDiscountAmt = 0;
  let salesReturnDiscountAmt = 0;
  let purchaseDiscountAmt = 0;
  let purchaseReturnDiscountAmt = 0;
  let greyDiscountAmt = 0;
  let greyReturnDiscountAmt = 0;

  const expenseByAccount = new Map();
  const fixedAssetsPeriod = new Map();
  const fixedAssetsAsOn = new Map();
  const trial = new Map();

  // Party balances as-on (for B/S)
  const debtorsAsOn = new Map();
  const creditorsAsOn = new Map();

  const applyOrder = (order, periodOnly) => {
    const date = order.orderDate || order.createdAt;
    const amount = roundMoney(calculateOrderGrandTotal(order));
    if (amount <= 0) return;
    const party = (order.customer?.organizationName || order.buyerName || '').trim() || 'Customer';
    const isReturn = isSalesGoodsReturn(order.transactionType);
    const disc = resolveDiscountJournal(order.transactionType, calculateOrderDiscountAmount(order));
    const trialAmt = disc ? roundMoney(amount + disc.amount) : amount;

    if (!periodOnly || inRange(date, fromDate, toDate)) {
      if (periodOnly) {
        if (isReturn) {
          salesReturn = roundMoney(salesReturn + amount);
          bump(trial, 'Sales Goods Return', 'debit', trialAmt);
          if (disc) {
            salesReturnDiscountAmt = roundMoney(salesReturnDiscountAmt + disc.amount);
            bump(trial, disc.account, 'credit', disc.amount);
          }
        } else {
          sales = roundMoney(sales + amount);
          bump(trial, order.transactionType || 'Finish Sales', 'credit', trialAmt);
          if (disc) {
            salesDiscountAmt = roundMoney(salesDiscountAmt + disc.amount);
            bump(trial, disc.account, 'debit', disc.amount);
          }
        }
      }
    }

    if (inRange(date, null, asOn)) {
      bump(debtorsAsOn, party, 'debit', isReturn ? -amount : amount);
    }
  };

  for (const order of orders) applyOrder(order, true);

  for (const bill of purchaseBills) {
    const date = bill.billDate || bill.createdAt;
    const amount = roundMoney(bill.grandTotal);
    if (amount <= 0) continue;
    const party = bill.supplier?.name || 'Supplier';
    const account = bill.purchaseAccount
      || postingSaleOrPurchaseAccount(bill.transactionType)
      || bill.transactionType
      || 'Purchase';

    if (inRange(date, null, asOn)) {
      if (isPurchaseReturn(bill.transactionType)) {
        bump(creditorsAsOn, party, 'credit', -amount);
      } else {
        bump(creditorsAsOn, party, 'credit', amount);
      }
      if (isCapitalGoodsPurchase(bill.transactionType) && !isPurchaseReturn(bill.transactionType)) {
        bump(fixedAssetsAsOn, account, 'debit', amount);
      }
    }

    if (!inRange(date, fromDate, toDate)) continue;

    const disc = resolveDiscountJournal(bill.transactionType, bill.discountAmount);
    const trialAmt = disc ? roundMoney(amount + disc.amount) : amount;

    if (isPurchaseReturn(bill.transactionType)) {
      // Returns against finish/trading purchases
      purchaseReturn = roundMoney(purchaseReturn + amount);
      bump(trial, bill.transactionType || 'Purchase Return', 'credit', trialAmt);
      if (disc) {
        purchaseReturnDiscountAmt = roundMoney(purchaseReturnDiscountAmt + disc.amount);
        bump(trial, disc.account, 'debit', disc.amount);
      }
    } else if (isCapitalGoodsPurchase(bill.transactionType)) {
      capitalGoodsPeriod = roundMoney(capitalGoodsPeriod + amount);
      bump(fixedAssetsPeriod, account, 'debit', amount);
      bump(trial, `Fixed Asset · ${account}`, 'debit', trialAmt);
      if (disc) bump(trial, disc.account, 'credit', disc.amount);
    } else if (isPlExpensePurchase(bill.transactionType)) {
      expenses = roundMoney(expenses + amount);
      bump(expenseByAccount, account, 'debit', amount);
      bump(trial, `Expense · ${account}`, 'debit', trialAmt);
      if (disc) bump(trial, disc.account, 'credit', disc.amount);
    } else {
      // Finish purchase / other trading purchases
      purchases = roundMoney(purchases + amount);
      bump(trial, bill.transactionType || 'Finish Purchase', 'debit', trialAmt);
      if (disc) {
        purchaseDiscountAmt = roundMoney(purchaseDiscountAmt + disc.amount);
        bump(trial, disc.account, 'credit', disc.amount);
      }
    }
  }

  for (const grey of greyPurchases) {
    const date = grey.billDate || grey.createdAt;
    const amount = roundMoney(grey.netAmount);
    if (amount <= 0) continue;
    if (inRange(date, null, asOn)) {
      bump(creditorsAsOn, grey.partyName || 'Supplier', 'credit', amount);
    }
    if (!inRange(date, fromDate, toDate)) continue;
    const disc = resolveDiscountJournal('GREY PURCHASE', grey.discountAmount);
    greyPurchaseAmt = roundMoney(greyPurchaseAmt + amount);
    bump(trial, 'Grey Purchase', 'debit', disc ? roundMoney(amount + disc.amount) : amount);
    if (disc) {
      greyDiscountAmt = roundMoney(greyDiscountAmt + disc.amount);
      bump(trial, disc.account, 'credit', disc.amount);
    }
  }

  for (const ret of greyReturns) {
    const date = ret.returnDate || ret.createdAt;
    const amount = roundMoney(ret.netAmount);
    if (amount <= 0) continue;
    if (inRange(date, null, asOn)) {
      bump(creditorsAsOn, ret.partyName || 'Supplier', 'credit', -amount);
    }
    if (!inRange(date, fromDate, toDate)) continue;
    const disc = resolveDiscountJournal('GREY PURCHASE RETURN', ret.discountAmount);
    greyReturnAmt = roundMoney(greyReturnAmt + amount);
    bump(trial, ret.saleAccount || 'Grey Purchase Return', 'credit', disc ? roundMoney(amount + disc.amount) : amount);
    if (disc) {
      greyReturnDiscountAmt = roundMoney(greyReturnDiscountAmt + disc.amount);
      bump(trial, disc.account, 'debit', disc.amount);
    }
  }

  for (const entry of bankEntries) {
    const date = entry.entryDate || entry.createdAt;
    const amount = roundMoney(entry.amount);
    if (amount <= 0) continue;

    if (inRange(date, null, asOn)) {
      if (entry.entryType === 'receipt') {
        if (entry.partyType === 'customer') bump(debtorsAsOn, entry.partyName || 'Customer', 'debit', -amount);
        if (entry.partyType === 'supplier') bump(creditorsAsOn, entry.partyName || 'Supplier', 'credit', -amount);
      } else {
        if (entry.partyType === 'supplier') bump(creditorsAsOn, entry.partyName || 'Supplier', 'credit', -amount);
        if (entry.partyType === 'customer') bump(debtorsAsOn, entry.partyName || 'Customer', 'debit', -amount);
      }
    }

    if (!inRange(date, fromDate, toDate)) continue;
    if (entry.entryType === 'receipt') {
      bankReceipts = roundMoney(bankReceipts + amount);
      bump(trial, entry.bankName || 'Bank Receipts', 'debit', amount);
    } else {
      bankPayments = roundMoney(bankPayments + amount);
      bump(trial, entry.bankName || 'Bank Payments', 'credit', amount);
    }
  }

  for (const note of salesNotes) {
    const date = note.noteDate || note.createdAt;
    const amount = roundMoney(note.netAmount);
    if (amount <= 0) continue;
    const isCredit = String(note.noteKind || '').toLowerCase() === 'credit';
    if (inRange(date, null, asOn)) {
      bump(debtorsAsOn, note.partyName || 'Customer', 'debit', isCredit ? -amount : amount);
    }
    if (!inRange(date, fromDate, toDate)) continue;
    bump(trial, isCredit ? 'Sales Credit Note' : 'Sales Debit Note', isCredit ? 'debit' : 'credit', amount);
    if (isCredit) salesReturn = roundMoney(salesReturn + amount);
    else sales = roundMoney(sales + amount);
  }

  for (const note of purchaseNotes) {
    const date = note.noteDate || note.createdAt;
    const amount = roundMoney(note.netAmount);
    if (amount <= 0) continue;
    const isCredit = String(note.noteKind || '').toLowerCase() === 'credit';
    if (inRange(date, null, asOn)) {
      bump(creditorsAsOn, note.partyName || 'Supplier', 'credit', isCredit ? -amount : amount);
    }
    if (!inRange(date, fromDate, toDate)) continue;
    bump(trial, isCredit ? 'Purchase Credit Note' : 'Purchase Debit Note', isCredit ? 'credit' : 'debit', amount);
    if (isCredit) purchaseReturn = roundMoney(purchaseReturn + amount);
    else purchases = roundMoney(purchases + amount);
  }

  let bankBalance = OPENING_BANK_BALANCE;
  for (const entry of bankEntries) {
    const date = entry.entryDate || entry.createdAt;
    if (date && new Date(date).getTime() > asOn.getTime()) continue;
    if (entry.entryType === 'receipt') bankBalance += entry.amount;
    else if (entry.entryType === 'payment') bankBalance -= entry.amount;
  }
  bankBalance = roundMoney(bankBalance);

  const netPurchases = roundMoney(purchases + greyPurchaseAmt - purchaseReturn - greyReturnAmt);
  const netSales = roundMoney(sales - salesReturn);
  const grossProfit = roundMoney(netSales - netPurchases);
  const netProfit = roundMoney(grossProfit - expenses);

  const debtorTotal = roundMoney(
    Array.from(debtorsAsOn.values()).reduce((sum, row) => sum + Math.max((row.debit || 0) - (row.credit || 0), 0), 0)
  );
  const creditorTotal = roundMoney(
    Array.from(creditorsAsOn.values()).reduce((sum, row) => sum + Math.max((row.credit || 0) - (row.debit || 0), 0), 0)
  );
  const fixedAssetsTotal = roundMoney(
    Array.from(fixedAssetsAsOn.values()).reduce((sum, row) => sum + (row.debit || 0), 0)
  );

  const trialRows = Array.from(trial.values())
    .filter(row => row.debit > 0.001 || row.credit > 0.001)
    .sort((a, b) => a.account.localeCompare(b.account));
  const trialTotals = trialRows.reduce(
    (acc, row) => ({
      debit: roundMoney(acc.debit + row.debit),
      credit: roundMoney(acc.credit + row.credit)
    }),
    { debit: 0, credit: 0 }
  );
  const trialDiff = roundMoney(trialTotals.debit - trialTotals.credit);
  if (Math.abs(trialDiff) > 0.001) {
    if (trialDiff > 0) {
      trialRows.push({ account: 'Difference (Credit short)', debit: 0, credit: trialDiff });
      trialTotals.credit = roundMoney(trialTotals.credit + trialDiff);
    } else {
      trialRows.push({ account: 'Difference (Debit short)', debit: Math.abs(trialDiff), credit: 0 });
      trialTotals.debit = roundMoney(trialTotals.debit + Math.abs(trialDiff));
    }
  }

  const period = {
    fromDate: fromDate ? fromDate.toISOString().slice(0, 10) : null,
    toDate: toDate ? toDate.toISOString().slice(0, 10) : null,
    asOnDate: asOn.toISOString().slice(0, 10)
  };

  const summary = {
    sales: netSales,
    salesGross: sales,
    salesReturn,
    purchases: netPurchases,
    purchasesGross: purchases,
    purchaseReturn,
    greyPurchase: greyPurchaseAmt,
    greyReturn: greyReturnAmt,
    expenses,
    capitalGoods: capitalGoodsPeriod,
    fixedAssets: fixedAssetsTotal,
    bankReceipts,
    bankPayments,
    grossProfit,
    netProfit,
    bankBalance,
    sundryDebtors: debtorTotal,
    sundryCreditors: creditorTotal
  };

  const discountReceived = roundMoney(purchaseDiscountAmt + greyDiscountAmt);
  const discountAllowed = roundMoney(salesDiscountAmt);
  const discountOnPurchaseReturns = roundMoney(purchaseReturnDiscountAmt + greyReturnDiscountAmt);
  const discountOnSalesReturns = roundMoney(salesReturnDiscountAmt);

  const buildTrading = () => {
    const rows = [
      { side: 'debit', particular: 'To Purchases (Finish / Trading)', amount: roundMoney(purchases + purchaseDiscountAmt), drillKey: 'trading_purchases', clickable: true },
      { side: 'debit', particular: 'To Grey Purchase', amount: roundMoney(greyPurchaseAmt + greyDiscountAmt), drillKey: 'trading_grey_purchase', clickable: true },
      { side: 'debit', particular: 'To Sales Return', amount: roundMoney(salesReturn + salesReturnDiscountAmt), drillKey: 'trading_sales_return', clickable: true },
      { side: 'debit', particular: 'To Discount Allowed', amount: discountAllowed, drillKey: 'trading_discount_allowed', clickable: true },
      { side: 'debit', particular: 'To Discount (Purchase Returns)', amount: discountOnPurchaseReturns, drillKey: 'trading_discount_purchase_return', clickable: true },
      { side: 'credit', particular: 'By Sales', amount: roundMoney(sales + salesDiscountAmt), drillKey: 'trading_sales', clickable: true },
      { side: 'credit', particular: 'By Purchase Return', amount: roundMoney(purchaseReturn + purchaseReturnDiscountAmt), drillKey: 'trading_purchase_return', clickable: true },
      { side: 'credit', particular: 'By Grey Purchase Return', amount: roundMoney(greyReturnAmt + greyReturnDiscountAmt), drillKey: 'trading_grey_return', clickable: true },
      { side: 'credit', particular: 'By Discount Received', amount: discountReceived, drillKey: 'trading_discount_received', clickable: true },
      { side: 'credit', particular: 'By Discount (Sales Returns)', amount: discountOnSalesReturns, drillKey: 'trading_discount_sales_return', clickable: true }
    ];
    if (grossProfit >= 0) rows.push({ side: 'debit', particular: 'To Gross Profit c/d', amount: grossProfit, clickable: false });
    else rows.push({ side: 'credit', particular: 'By Gross Loss c/d', amount: Math.abs(grossProfit), clickable: false });
    const filtered = rows.filter(row => row.amount > 0.001);
    return {
      view: 'trading',
      rows: filtered,
      totals: {
        debit: roundMoney(filtered.filter(r => r.side === 'debit').reduce((s, r) => s + r.amount, 0)),
        credit: roundMoney(filtered.filter(r => r.side === 'credit').reduce((s, r) => s + r.amount, 0))
      }
    };
  };

  const buildPl = () => {
    const expenseRows = Array.from(expenseByAccount.values()).map(row => ({
      side: 'debit',
      particular: `To ${row.account}`,
      amount: row.debit,
      note: 'GST General Goods / Input Services',
      drillKey: 'pl_expense',
      account: row.account,
      clickable: true
    }));
    const rows = [
      ...(grossProfit >= 0
        ? [{ side: 'credit', particular: 'By Gross Profit b/d', amount: grossProfit, clickable: false }]
        : [{ side: 'debit', particular: 'To Gross Loss b/d', amount: Math.abs(grossProfit), clickable: false }]),
      ...expenseRows
    ];
    if (netProfit >= 0) {
      rows.push({ side: 'debit', particular: 'To Net Profit transferred to Capital', amount: netProfit, clickable: false });
    } else {
      rows.push({ side: 'credit', particular: 'By Net Loss transferred to Capital', amount: Math.abs(netProfit), clickable: false });
    }
    const filtered = rows.filter(row => row.amount > 0.001);
    return {
      view: 'pl',
      rows: filtered,
      expenseAccounts: mapToRows(expenseByAccount),
      totals: {
        debit: roundMoney(filtered.filter(r => r.side === 'debit').reduce((s, r) => s + r.amount, 0)),
        credit: roundMoney(filtered.filter(r => r.side === 'credit').reduce((s, r) => s + r.amount, 0))
      }
    };
  };

  const buildBalance = () => {
    const mode = String(presentation || 'normal').toLowerCase() === 'dynamic' ? 'dynamic' : 'normal';

    let debtorRows;
    let creditorRows;

    if (mode === 'dynamic') {
      const debtorGroups = [];
      const creditorGroups = [];
      for (const [partyName, row] of debtorsAsOn.entries()) {
        const net = roundMoney((row.debit || 0) - (row.credit || 0));
        if (net <= 0.001) continue;
        const accountType = resolvePartyAccountType(partyName, DEFAULT_DEBTOR_ACCOUNT_TYPE);
        const current = debtorGroups.find(g => g.accountType === accountType)
          || (() => { const g = { accountType, amount: 0 }; debtorGroups.push(g); return g; })();
        current.amount = roundMoney(current.amount + net);
      }
      for (const [partyName, row] of creditorsAsOn.entries()) {
        const net = roundMoney((row.credit || 0) - (row.debit || 0));
        if (net <= 0.001) continue;
        const accountType = resolvePartyAccountType(partyName, DEFAULT_CREDITOR_ACCOUNT_TYPE);
        const current = creditorGroups.find(g => g.accountType === accountType)
          || (() => { const g = { accountType, amount: 0 }; creditorGroups.push(g); return g; })();
        current.amount = roundMoney(current.amount + net);
      }
      debtorRows = debtorGroups
        .filter(g => g.amount > 0.001)
        .sort((a, b) => a.accountType.localeCompare(b.accountType))
        .map(g => ({
          side: 'asset',
          particular: g.accountType,
          amount: g.amount,
          note: getAccountType(g.accountType)?.effectOn || 'BALANCE SHEET',
          drillKey: 'sundry_debtors',
          accountType: g.accountType,
          clickable: true
        }));
      creditorRows = creditorGroups
        .filter(g => g.amount > 0.001)
        .sort((a, b) => a.accountType.localeCompare(b.accountType))
        .map(g => ({
          side: 'liability',
          particular: g.accountType,
          amount: g.amount,
          note: getAccountType(g.accountType)?.effectOn || 'BALANCE SHEET',
          drillKey: 'sundry_creditors',
          accountType: g.accountType,
          clickable: true
        }));
    } else {
      debtorRows = [{
        side: 'asset',
        particular: 'Sundry Debtors',
        amount: debtorTotal,
        drillKey: 'sundry_debtors',
        clickable: true
      }];
      creditorRows = [{
        side: 'liability',
        particular: 'Sundry Creditors',
        amount: creditorTotal,
        drillKey: 'sundry_creditors',
        clickable: true
      }];
    }

    const assetRows = [
      ...mapToRows(fixedAssetsAsOn).map(row => ({
        side: 'asset',
        particular: `Fixed Assets · ${row.account}`,
        amount: row.amount,
        note: 'GST Capital Goods',
        drillKey: 'fixed_asset',
        account: row.account,
        clickable: true
      })),
      ...debtorRows,
      { side: 'asset', particular: 'Cash / Bank', amount: Math.max(bankBalance, 0), clickable: false }
    ];
    const liabilityRows = [
      ...creditorRows,
      ...(bankBalance < 0
        ? [{ side: 'liability', particular: 'Bank Overdraft', amount: Math.abs(bankBalance), clickable: false }]
        : []),
      ...(netProfit >= 0
        ? [{ side: 'liability', particular: 'Net Profit', amount: netProfit, clickable: false }]
        : [{ side: 'asset', particular: 'Net Loss', amount: Math.abs(netProfit), clickable: false }])
    ];

    let assetsSum = roundMoney(assetRows.reduce((s, r) => s + r.amount, 0));
    let liabilitiesSum = roundMoney(liabilityRows.reduce((s, r) => s + r.amount, 0));
    if (assetsSum > liabilitiesSum) {
      liabilityRows.push({
        side: 'liability',
        particular: 'Capital / Balancing Figure',
        amount: roundMoney(assetsSum - liabilitiesSum)
      });
    } else if (liabilitiesSum > assetsSum) {
      assetRows.push({
        side: 'asset',
        particular: 'Drawings / Balancing Figure',
        amount: roundMoney(liabilitiesSum - assetsSum)
      });
    }
    assetsSum = roundMoney(assetRows.reduce((s, r) => s + r.amount, 0));
    liabilitiesSum = roundMoney(liabilityRows.reduce((s, r) => s + r.amount, 0));

    return {
      view: 'balance',
      presentation: mode,
      assets: assetRows.filter(r => r.amount > 0.001),
      liabilities: liabilityRows.filter(r => r.amount > 0.001),
      fixedAssetAccounts: mapToRows(fixedAssetsAsOn),
      totals: { assets: assetsSum, liabilities: liabilitiesSum }
    };
  };

  const trading = buildTrading();
  const pl = buildPl();
  const balance = buildBalance();

  if (view === 'trading') return { period, summary, ...trading };
  if (view === 'pl') return { period, summary, ...pl };
  if (view === 'balance') return { period, summary, ...balance };
  if (view === 'trial') {
    return {
      view: 'trial',
      period,
      summary,
      rows: trialRows,
      totals: trialTotals
    };
  }

  // Combined Final Accounts pack
  return {
    view: 'all',
    period,
    summary,
    trading,
    pl,
    balance,
    trial: { rows: trialRows, totals: trialTotals }
  };
}

const partyMatch = (left, right) => {
  const a = String(left || '').trim().toLowerCase();
  const b = String(right || '').trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

const purchaseEditPath = (bill) => {
  if (isCapitalGoodsPurchase(bill.transactionType) || isPlExpensePurchase(bill.transactionType)) {
    return `/erp/expenses?edit=${bill.id}`;
  }
  return `/erp/purchase?edit=${bill.id}`;
};

const salesEditPath = (order) => (
  order.manualType === 'erp_sales'
    ? `/erp/sales?edit=${order.id}&kind=bill`
    : undefined
);

/**
 * Drill: statement line → parties/accounts → bills (with editPath).
 * level: parties | accounts | bills
 */
export async function buildFinalAccountsDrill(prisma, userId, {
  drillKey,
  level = 'parties',
  partyName = null,
  account = null,
  accountType = null,
  fromDate: fromRaw,
  toDate: toRaw,
  asOnDate: asOnRaw
} = {}) {
  const key = String(drillKey || '').trim();
  if (!key) return { level: 'parties', rows: [], totals: {} };

  const asOn = optionalDate(asOnRaw) || new Date();
  asOn.setHours(23, 59, 59, 999);
  let fromDate = optionalDate(fromRaw);
  let toDate = optionalDate(toRaw);
  if (!fromDate && !toDate) {
    const year = asOn.getMonth() >= 3 ? asOn.getFullYear() : asOn.getFullYear() - 1;
    fromDate = new Date(year, 3, 1);
    toDate = asOn;
  } else {
    if (fromDate) fromDate.setHours(0, 0, 0, 0);
    if (toDate) toDate.setHours(23, 59, 59, 999);
    else toDate = asOn;
  }

  const period = {
    fromDate: fromDate ? fromDate.toISOString().slice(0, 10) : null,
    toDate: toDate ? toDate.toISOString().slice(0, 10) : null,
    asOnDate: asOn.toISOString().slice(0, 10)
  };

  const [
    orders,
    purchaseBills,
    greyPurchases,
    greyReturns,
    bankEntries,
    suppliers,
    customers
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        userId,
        status: 'completed',
        OR: [{ transactionType: null }, { transactionType: { not: 'SALES ORDERS' } }]
      },
      include: { customer: true },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.purchaseBill.findMany({
      where: { userId, status: 'posted' },
      include: { supplier: true },
      orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.greyPurchase.findMany({
      where: { userId, status: { not: 'cancelled' } },
      orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.greyPurchaseReturn.findMany({
      where: { userId, status: { not: 'cancelled' } },
      orderBy: [{ returnDate: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.bankEntry.findMany({
      where: { userId },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.supplier.findMany({ where: { userId }, select: { name: true, accountType: true } }),
    prisma.customer.findMany({ where: { userId }, select: { organizationName: true, accountType: true } })
  ]);

  const partyAccountType = new Map();
  for (const row of suppliers) {
    const name = String(row.name || '').trim().toLowerCase();
    if (name && row.accountType) partyAccountType.set(name, row.accountType);
  }
  for (const row of customers) {
    const name = String(row.organizationName || '').trim().toLowerCase();
    if (name && row.accountType) partyAccountType.set(name, row.accountType);
  }
  const postedAccountType = buildPostedAccountTypeMap({
    purchaseBills,
    greyPurchases,
    greyReturns,
    orders
  });
  const resolvePartyAccountType = makeAccountTypeResolver(partyAccountType, postedAccountType);
  const typeFilter = String(accountType || '').trim().toUpperCase();
  const matchesAccountType = (partyNameValue, fallback) => {
    if (!typeFilter) return true;
    const resolved = String(resolvePartyAccountType(partyNameValue, fallback) || '').toUpperCase();
    return resolved === typeFilter;
  };

  const creditorBalances = new Map();
  const debtorBalances = new Map();
  const bumpParty = (map, name, amount) => {
    const keyName = String(name || '').trim();
    if (!keyName) return;
    const lower = keyName.toLowerCase();
    const current = map.get(lower) || { partyName: keyName, amount: 0, billCount: 0 };
    current.amount = roundMoney(current.amount + amount);
    current.billCount += 1;
    map.set(lower, current);
  };

  for (const bill of purchaseBills) {
    const date = bill.billDate || bill.createdAt;
    if (!inRange(date, null, asOn)) continue;
    const amount = roundMoney(bill.grandTotal);
    if (amount <= 0) continue;
    const signed = isPurchaseReturn(bill.transactionType) ? -amount : amount;
    bumpParty(creditorBalances, bill.supplier?.name || 'Supplier', signed);
  }
  for (const grey of greyPurchases) {
    const date = grey.billDate || grey.createdAt;
    if (!inRange(date, null, asOn)) continue;
    const amount = roundMoney(grey.netAmount);
    if (amount <= 0) continue;
    bumpParty(creditorBalances, grey.partyName || 'Supplier', amount);
  }
  for (const ret of greyReturns) {
    const date = ret.returnDate || ret.createdAt;
    if (!inRange(date, null, asOn)) continue;
    const amount = roundMoney(ret.netAmount);
    if (amount <= 0) continue;
    bumpParty(creditorBalances, ret.partyName || 'Supplier', -amount);
  }
  for (const entry of bankEntries) {
    const date = entry.entryDate || entry.createdAt;
    if (!inRange(date, null, asOn)) continue;
    const amount = roundMoney(entry.amount);
    if (amount <= 0) continue;
    if (entry.partyType === 'supplier') {
      bumpParty(creditorBalances, entry.partyName || 'Supplier', entry.entryType === 'payment' ? -amount : amount);
    }
    if (entry.partyType === 'customer') {
      bumpParty(debtorBalances, entry.partyName || 'Customer', entry.entryType === 'receipt' ? -amount : amount);
    }
  }
  for (const order of orders) {
    const date = order.orderDate || order.createdAt;
    if (!inRange(date, null, asOn)) continue;
    const amount = roundMoney(calculateOrderGrandTotal(order));
    if (amount <= 0) continue;
    const party = (order.customer?.organizationName || order.buyerName || '').trim() || 'Customer';
    bumpParty(debtorBalances, party, isSalesGoodsReturn(order.transactionType) ? -amount : amount);
  }

  if (key === 'sundry_creditors' && level === 'parties') {
    const rows = Array.from(creditorBalances.values())
      .map(row => ({ ...row, amount: Math.max(row.amount, 0), clickable: true }))
      .filter(row => row.amount > 0.001 && matchesAccountType(row.partyName, DEFAULT_CREDITOR_ACCOUNT_TYPE))
      .sort((a, b) => a.partyName.localeCompare(b.partyName));
    return {
      drillKey: key,
      level: 'parties',
      title: typeFilter || 'Sundry Creditors',
      accountType: accountType || null,
      period,
      rows,
      totals: { amount: roundMoney(rows.reduce((s, r) => s + r.amount, 0)) }
    };
  }

  if (key === 'sundry_debtors' && level === 'parties') {
    const rows = Array.from(debtorBalances.values())
      .map(row => ({ ...row, amount: Math.max(row.amount, 0), clickable: true }))
      .filter(row => row.amount > 0.001 && matchesAccountType(row.partyName, DEFAULT_DEBTOR_ACCOUNT_TYPE))
      .sort((a, b) => a.partyName.localeCompare(b.partyName));
    return {
      drillKey: key,
      level: 'parties',
      title: typeFilter || 'Sundry Debtors',
      accountType: accountType || null,
      period,
      rows,
      totals: { amount: roundMoney(rows.reduce((s, r) => s + r.amount, 0)) }
    };
  }

  if (key === 'sundry_creditors' && level === 'bills' && partyName) {
    const rows = [];
    for (const bill of purchaseBills) {
      const date = bill.billDate || bill.createdAt;
      if (!inRange(date, null, asOn)) continue;
      if (!partyMatch(bill.supplier?.name, partyName)) continue;
      const amount = roundMoney(bill.grandTotal);
      if (amount <= 0) continue;
      rows.push({
        id: bill.id,
        date,
        billNo: formatSeriesBillNumber(bill.transactionType, bill.typeBillNumber)
          || bill.billNumber || bill.voucherNumber,
        gstDocumentType: getGstDocumentType(bill.transactionType),
        transactionType: bill.transactionType || 'Purchase',
        purchaseAccount: bill.purchaseAccount || '',
        amount: isPurchaseReturn(bill.transactionType) ? -amount : amount,
        partyName: bill.supplier?.name || partyName,
        editPath: purchaseEditPath(bill),
        clickable: true
      });
    }
    for (const grey of greyPurchases) {
      const date = grey.billDate || grey.createdAt;
      if (!inRange(date, null, asOn)) continue;
      if (!partyMatch(grey.partyName, partyName)) continue;
      const amount = roundMoney(grey.netAmount);
      if (amount <= 0) continue;
      rows.push({
        id: grey.id,
        date,
        billNo: formatSeriesBillNumber('GREY PURCHASE', grey.typeBillNumber)
          || grey.billNo || grey.id.slice(-6),
        gstDocumentType: getGstDocumentType('GREY PURCHASE'),
        transactionType: 'GREY PURCHASE',
        amount,
        partyName: grey.partyName,
        editPath: `/erp/grey-purchase?edit=${grey.id}`,
        clickable: true
      });
    }
    for (const ret of greyReturns) {
      const date = ret.returnDate || ret.createdAt;
      if (!inRange(date, null, asOn)) continue;
      if (!partyMatch(ret.partyName, partyName)) continue;
      const amount = roundMoney(ret.netAmount);
      if (amount <= 0) continue;
      rows.push({
        id: ret.id,
        date,
        billNo: ret.voucherNo || ret.billNo || ret.id.slice(-6),
        transactionType: 'GREY PURCHASE RETURN',
        amount: -amount,
        partyName: ret.partyName,
        editPath: `/erp/grey-purchase-return?edit=${ret.id}`,
        clickable: true
      });
    }
    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return {
      drillKey: key,
      level: 'bills',
      title: `Bills · ${partyName}`,
      partyName,
      period,
      rows,
      totals: { amount: roundMoney(rows.reduce((s, r) => s + Number(r.amount || 0), 0)) }
    };
  }

  if (key === 'sundry_debtors' && level === 'bills' && partyName) {
    const rows = [];
    for (const order of orders) {
      const date = order.orderDate || order.createdAt;
      if (!inRange(date, null, asOn)) continue;
      const party = (order.customer?.organizationName || order.buyerName || '').trim();
      if (!partyMatch(party, partyName)) continue;
      const amount = roundMoney(calculateOrderGrandTotal(order));
      if (amount <= 0) continue;
      const editPath = salesEditPath(order);
      rows.push({
        id: order.id,
        date,
        billNo: formatSeriesBillNumber(order.transactionType, order.typeBillNumber)
          || order.invoiceNumber || order.orderNumber,
        gstDocumentType: getGstDocumentType(order.transactionType),
        transactionType: order.transactionType || 'FINISH SALES',
        amount: isSalesGoodsReturn(order.transactionType) ? -amount : amount,
        partyName: party,
        editPath,
        clickable: Boolean(editPath)
      });
    }
    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return {
      drillKey: key,
      level: 'bills',
      title: `Bills · ${partyName}`,
      partyName,
      period,
      rows,
      totals: { amount: roundMoney(rows.reduce((s, r) => s + Number(r.amount || 0), 0)) }
    };
  }

  // Fixed asset / P&L expense account → bills
  if ((key === 'fixed_asset' || key === 'pl_expense') && (level === 'bills' || level === 'parties')) {
    const targetAccount = String(account || '').trim();
    const rows = [];
    for (const bill of purchaseBills) {
      const date = bill.billDate || bill.createdAt;
      const inWindow = key === 'fixed_asset'
        ? inRange(date, null, asOn)
        : inRange(date, fromDate, toDate);
      if (!inWindow) continue;
      const amount = roundMoney(bill.grandTotal);
      if (amount <= 0) continue;
      const billAccount = bill.purchaseAccount
        || postingSaleOrPurchaseAccount(bill.transactionType)
        || bill.transactionType
        || '';
      if (key === 'fixed_asset') {
        if (!isCapitalGoodsPurchase(bill.transactionType) || isPurchaseReturn(bill.transactionType)) continue;
      } else if (!isPlExpensePurchase(bill.transactionType) || isPurchaseReturn(bill.transactionType)) {
        continue;
      }
      if (targetAccount && !partyMatch(billAccount, targetAccount) && billAccount !== targetAccount) {
        // allow exact or loose match on Pur A/C
        if (String(billAccount).trim().toLowerCase() !== targetAccount.toLowerCase()) continue;
      }
      rows.push({
        id: bill.id,
        date,
        billNo: formatSeriesBillNumber(bill.transactionType, bill.typeBillNumber)
          || bill.billNumber || bill.voucherNumber,
        gstDocumentType: getGstDocumentType(bill.transactionType),
        transactionType: bill.transactionType || '',
        purchaseAccount: billAccount,
        amount,
        partyName: bill.supplier?.name || '',
        editPath: purchaseEditPath(bill),
        clickable: true
      });
    }
    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return {
      drillKey: key,
      level: 'bills',
      title: key === 'fixed_asset'
        ? `Fixed Assets · ${targetAccount || 'All'}`
        : `Expenses · ${targetAccount || 'All'}`,
      account: targetAccount || null,
      period,
      rows,
      totals: { amount: roundMoney(rows.reduce((s, r) => s + Number(r.amount || 0), 0)) }
    };
  }

  // Trading line → period bills
  const tradingBillRows = [];
  if (key === 'trading_purchases' || key === 'trading_purchase_return') {
    for (const bill of purchaseBills) {
      const date = bill.billDate || bill.createdAt;
      if (!inRange(date, fromDate, toDate)) continue;
      if (isCapitalGoodsPurchase(bill.transactionType) || isPlExpensePurchase(bill.transactionType)) continue;
      const isRet = isPurchaseReturn(bill.transactionType);
      if (key === 'trading_purchases' && isRet) continue;
      if (key === 'trading_purchase_return' && !isRet) continue;
      const amount = roundMoney(bill.grandTotal);
      if (amount <= 0) continue;
      tradingBillRows.push({
        id: bill.id,
        date,
        billNo: formatSeriesBillNumber(bill.transactionType, bill.typeBillNumber)
          || bill.billNumber || bill.voucherNumber,
        gstDocumentType: getGstDocumentType(bill.transactionType),
        transactionType: bill.transactionType || 'FINISH PURCHASE',
        amount: isRet ? -amount : amount,
        partyName: bill.supplier?.name || '',
        editPath: purchaseEditPath(bill),
        clickable: true
      });
    }
  }
  if (key === 'trading_sales' || key === 'trading_sales_return') {
    for (const order of orders) {
      const date = order.orderDate || order.createdAt;
      if (!inRange(date, fromDate, toDate)) continue;
      const isRet = isSalesGoodsReturn(order.transactionType);
      if (key === 'trading_sales' && isRet) continue;
      if (key === 'trading_sales_return' && !isRet) continue;
      const amount = roundMoney(calculateOrderGrandTotal(order));
      if (amount <= 0) continue;
      const editPath = salesEditPath(order);
      tradingBillRows.push({
        id: order.id,
        date,
        billNo: formatSeriesBillNumber(order.transactionType, order.typeBillNumber)
          || order.invoiceNumber || order.orderNumber,
        gstDocumentType: getGstDocumentType(order.transactionType),
        transactionType: order.transactionType || 'FINISH SALES',
        amount: isRet ? -amount : amount,
        partyName: (order.customer?.organizationName || order.buyerName || '').trim(),
        editPath,
        clickable: Boolean(editPath)
      });
    }
  }
  if (key === 'trading_grey_purchase') {
    for (const grey of greyPurchases) {
      const date = grey.billDate || grey.createdAt;
      if (!inRange(date, fromDate, toDate)) continue;
      const amount = roundMoney(grey.netAmount);
      if (amount <= 0) continue;
      tradingBillRows.push({
        id: grey.id,
        date,
        billNo: formatSeriesBillNumber('GREY PURCHASE', grey.typeBillNumber)
          || grey.billNo || grey.id.slice(-6),
        gstDocumentType: getGstDocumentType('GREY PURCHASE'),
        transactionType: 'GREY PURCHASE',
        amount,
        partyName: grey.partyName || '',
        editPath: `/erp/grey-purchase?edit=${grey.id}`,
        clickable: true
      });
    }
  }
  if (key === 'trading_grey_return') {
    for (const ret of greyReturns) {
      const date = ret.returnDate || ret.createdAt;
      if (!inRange(date, fromDate, toDate)) continue;
      const amount = roundMoney(ret.netAmount);
      if (amount <= 0) continue;
      tradingBillRows.push({
        id: ret.id,
        date,
        billNo: ret.voucherNo || ret.billNo || ret.id.slice(-6),
        transactionType: 'GREY PURCHASE RETURN',
        amount: -amount,
        partyName: ret.partyName || '',
        editPath: `/erp/grey-purchase-return?edit=${ret.id}`,
        clickable: true
      });
    }
  }

  const isDiscountReceived = key === 'trading_discount_received';
  const isDiscountAllowed = key === 'trading_discount_allowed';
  const isDiscountPurchaseReturn = key === 'trading_discount_purchase_return';
  const isDiscountSalesReturn = key === 'trading_discount_sales_return';
  if (isDiscountReceived || isDiscountAllowed || isDiscountPurchaseReturn || isDiscountSalesReturn) {
    if (isDiscountReceived || isDiscountPurchaseReturn) {
      for (const bill of purchaseBills) {
        const date = bill.billDate || bill.createdAt;
        if (!inRange(date, fromDate, toDate)) continue;
        if (isCapitalGoodsPurchase(bill.transactionType) || isPlExpensePurchase(bill.transactionType)) continue;
        const isRet = isPurchaseReturn(bill.transactionType);
        if (isDiscountReceived && isRet) continue;
        if (isDiscountPurchaseReturn && !isRet) continue;
        const disc = resolveDiscountJournal(bill.transactionType, bill.discountAmount);
        if (!disc) continue;
        tradingBillRows.push({
          id: bill.id,
          date,
          billNo: formatSeriesBillNumber(bill.transactionType, bill.typeBillNumber)
            || bill.billNumber || bill.voucherNumber,
          gstDocumentType: getGstDocumentType(bill.transactionType),
          transactionType: bill.transactionType || '',
          amount: isRet ? -disc.amount : disc.amount,
          partyName: bill.supplier?.name || '',
          editPath: purchaseEditPath(bill),
          clickable: true
        });
      }
      for (const grey of greyPurchases) {
        if (!isDiscountReceived) continue;
        const date = grey.billDate || grey.createdAt;
        if (!inRange(date, fromDate, toDate)) continue;
        const disc = resolveDiscountJournal('GREY PURCHASE', grey.discountAmount);
        if (!disc) continue;
        tradingBillRows.push({
          id: grey.id,
          date,
          billNo: formatSeriesBillNumber('GREY PURCHASE', grey.typeBillNumber)
            || grey.billNo || grey.id.slice(-6),
          gstDocumentType: getGstDocumentType('GREY PURCHASE'),
          transactionType: 'GREY PURCHASE',
          amount: disc.amount,
          partyName: grey.partyName || '',
          editPath: `/erp/grey-purchase?edit=${grey.id}`,
          clickable: true
        });
      }
      if (isDiscountPurchaseReturn) {
        for (const ret of greyReturns) {
          const date = ret.returnDate || ret.createdAt;
          if (!inRange(date, fromDate, toDate)) continue;
          const disc = resolveDiscountJournal('GREY PURCHASE RETURN', ret.discountAmount);
          if (!disc) continue;
          tradingBillRows.push({
            id: ret.id,
            date,
            billNo: ret.voucherNo || ret.billNo || ret.id.slice(-6),
            transactionType: 'GREY PURCHASE RETURN',
            amount: -disc.amount,
            partyName: ret.partyName || '',
            editPath: `/erp/grey-purchase-return?edit=${ret.id}`,
            clickable: true
          });
        }
      }
    }
    if (isDiscountAllowed || isDiscountSalesReturn) {
      for (const order of orders) {
        const date = order.orderDate || order.createdAt;
        if (!inRange(date, fromDate, toDate)) continue;
        const isRet = isSalesGoodsReturn(order.transactionType);
        if (isDiscountAllowed && isRet) continue;
        if (isDiscountSalesReturn && !isRet) continue;
        const disc = resolveDiscountJournal(order.transactionType, calculateOrderDiscountAmount(order));
        if (!disc) continue;
        const editPath = salesEditPath(order);
        tradingBillRows.push({
          id: order.id,
          date,
          billNo: formatSeriesBillNumber(order.transactionType, order.typeBillNumber)
            || order.invoiceNumber || order.orderNumber,
          gstDocumentType: getGstDocumentType(order.transactionType),
          transactionType: order.transactionType || 'FINISH SALES',
          amount: isRet ? -disc.amount : disc.amount,
          partyName: (order.customer?.organizationName || order.buyerName || '').trim(),
          editPath,
          clickable: Boolean(editPath)
        });
      }
    }
  }
  if (tradingBillRows.length || String(key).startsWith('trading_')) {
    tradingBillRows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return {
      drillKey: key,
      level: 'bills',
      title: 'Documents',
      period,
      rows: tradingBillRows,
      totals: { amount: roundMoney(tradingBillRows.reduce((s, r) => s + Number(r.amount || 0), 0)) }
    };
  }

  return { drillKey: key, level, period, rows: [], totals: { amount: 0 } };
}
