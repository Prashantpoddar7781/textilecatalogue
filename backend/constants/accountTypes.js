/** Full Account Types Manager master (legacy AMAZE / Accounts Information Manager). */

function effectFromFlags(inBalanceSheet, inProfitLoss, inTrading) {
  if (inTrading) return 'TRADING A/C';
  if (inProfitLoss) return 'PROFIT & LOSS';
  return 'BALANCE SHEET';
}

function metaForType(code, value, trialSide, displayPos, inBalanceSheet, inProfitLoss, inTrading) {
  const upper = String(value || '').toUpperCase();
  let partyRole = 'either';
  let faGroup = 'other';
  let bsSide = null;

  if (upper.includes('CREDITOR') || upper === 'BROKER/AGENT' || upper === 'MILL-EXCISE') {
    partyRole = 'supplier';
    faGroup = 'sundry_creditors';
    bsSide = 'liability';
  } else if (upper.includes('DEBTOR') || upper === 'SUNDRY DEBTORS') {
    partyRole = 'customer';
    faGroup = 'sundry_debtors';
    bsSide = 'asset';
  } else if (
    upper === 'FIXED ASSETS'
    || upper === 'VEHICLES'
    || upper === 'FURNITURE OF OFFICE'
    || upper.includes('INVESTMENT')
  ) {
    faGroup = 'fixed_assets';
    bsSide = 'asset';
  } else if (inBalanceSheet) {
    bsSide = trialSide === 'DEBIT' ? 'asset' : 'liability';
  }

  return {
    code,
    value,
    label: value,
    trialSide,
    displayPos,
    inBalanceSheet,
    inProfitLoss,
    inTrading,
    effectOn: effectFromFlags(inBalanceSheet, inProfitLoss, inTrading),
    bsSide,
    partyRole,
    faGroup
  };
}

export const ERP_ACCOUNT_TYPES = [
  metaForType(1, 'SUNDRY DEBTORS', 'DEBIT', 9, true, false, false),
  metaForType(2, 'CREDITORS FOR GREY', 'CREDIT', 5, true, false, false),
  metaForType(3, 'TRADING INCOMES', 'CREDIT', 32, false, false, true),
  metaForType(4, 'P & L EXPENSES', 'DEBIT', 14, false, true, false),
  metaForType(5, 'BANK', 'DEBIT', 3, true, false, false),
  metaForType(6, 'CASH', 'DEBIT', 4, true, false, false),
  metaForType(7, 'SALE', 'CREDIT', 13, false, false, true),
  metaForType(8, 'PURCHASE', 'DEBIT', 11, false, false, true),
  metaForType(9, 'LOANS', 'CREDIT', 35, true, false, false),
  metaForType(10, 'TRADING EXPENSES', 'DEBIT', 12, false, false, true),
  metaForType(11, 'FIXED ASSETS', 'DEBIT', 20, true, false, false),
  metaForType(12, 'BROKER/AGENT', 'CREDIT', 19, true, false, false),
  metaForType(13, 'CAPITAL A/C', 'CREDIT', 1, true, false, false),
  metaForType(14, 'CREDITORS FOR DYEING JOB CHARG', 'CREDIT', 12, true, false, false),
  metaForType(15, 'MILL-EXCISE', 'CREDIT', 13, true, false, false),
  metaForType(17, 'STAFF', 'CREDIT', 14, true, false, false),
  metaForType(18, 'INVESTMENTS(APPLIED)', 'DEBIT', 22, true, false, false),
  metaForType(19, 'PROV. FOR TAX', 'CREDIT', 15, true, false, false),
  metaForType(20, 'LOANS AND ADVANCES', 'DEBIT', 24, true, false, false),
  metaForType(21, 'UNSECURED LOANS', 'DEBIT', 2, true, false, false),
  metaForType(22, 'RESERVES AND SURPLUS', 'CREDIT', 42, true, false, false),
  metaForType(23, 'CLOSING STOCK', 'CREDIT', 23, false, false, true),
  metaForType(98, 'STAFF ADVANCE', 'DEBIT', 15, true, false, false),
  metaForType(99, 'OTHER', 'CREDIT', 16, true, false, false),
  metaForType(100, 'PACKING MATERIAL', 'CREDIT', 16, true, false, false),
  metaForType(102, 'OPENING STOCK', 'CREDIT', 30, false, false, true),
  metaForType(103, 'VEHICLES', 'DEBIT', 22, true, false, false),
  metaForType(104, 'FURNITURE OF OFFICE', 'DEBIT', 21, true, false, false),
  metaForType(105, 'CREDITORS FOR OTHERS', 'CREDIT', 16, true, false, false),
  metaForType(106, 'CREDITORS FOR EXPENSES', 'CREDIT', 17, true, false, false),
  metaForType(107, 'P & L INCOMES', 'CREDIT', 38, false, true, false),
  metaForType(108, 'PREPAID EXPENSES', 'DEBIT', 28, true, false, false),
  metaForType(109, 'SECURED LOAN', 'CREDIT', 52, true, false, false),
  metaForType(110, 'TDS', 'CREDIT', 10, true, false, false),
  metaForType(112, 'CREDITORS FOR PACKING MAT.', 'CREDIT', 29, true, false, false),
  metaForType(113, 'CREDITORS FOR GOODS', 'CREDIT', 6, true, false, false),
  metaForType(114, 'CREDITORS FOR JOBWORK', 'CREDIT', 7, true, false, false),
  metaForType(115, 'CREDITORS FOR SERVICES', 'CREDIT', 51, true, false, false),
  metaForType(116, 'DEBTORS FOR OTHERS', 'DEBIT', 41, true, false, false),
  metaForType(117, 'SHARE APPLICATION', 'CREDIT', 31, true, false, false),
  metaForType(118, 'SHREE GANESHJI MAHARAJ', 'CREDIT', 0, true, false, false),
  metaForType(119, 'CREDITORS FOR EMB.JOB CHARGE', 'CREDIT', 8, true, false, false)
].sort((a, b) => a.code - b.code);

export const DEFAULT_CREDITOR_ACCOUNT_TYPE = 'CREDITORS FOR GOODS';
export const DEFAULT_DEBTOR_ACCOUNT_TYPE = 'SUNDRY DEBTORS';

export function getAccountType(value) {
  const key = String(value || '').trim().toUpperCase();
  if (!key) return undefined;
  return ERP_ACCOUNT_TYPES.find(row => row.value.toUpperCase() === key);
}

export function defaultAccountTypeForRole(role) {
  return role === 'customer' ? DEFAULT_DEBTOR_ACCOUNT_TYPE : DEFAULT_CREDITOR_ACCOUNT_TYPE;
}

export function partyRoleForAccountType(accountType) {
  const meta = getAccountType(accountType);
  if (meta?.partyRole === 'customer') return 'customer';
  return 'supplier';
}

export function normalizeAccountType(value, fallback = DEFAULT_CREDITOR_ACCOUNT_TYPE) {
  const meta = getAccountType(value);
  return meta?.value || fallback;
}
