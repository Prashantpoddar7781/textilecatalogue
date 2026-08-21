/** Party A/C TYPE master (legacy Accounts Information Manager). */

export const ERP_ACCOUNT_TYPES = [
  { value: 'CREDITORS FOR DYEING JOB CHARG', label: 'CREDITORS FOR DYEING JOB CHARG', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR EMB.JOB CHARGE', label: 'CREDITORS FOR EMB.JOB CHARGE', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR EXPENSES', label: 'CREDITORS FOR EXPENSES', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR GOODS', label: 'CREDITORS FOR GOODS', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR GREY', label: 'CREDITORS FOR GREY', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR JOBWORK', label: 'CREDITORS FOR JOBWORK', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR OTHERS', label: 'CREDITORS FOR OTHERS', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR PACKING MAT.', label: 'CREDITORS FOR PACKING MAT.', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR SERVICES', label: 'CREDITORS FOR SERVICES', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'DEBTORS FOR GOODS', label: 'DEBTORS FOR GOODS', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'customer', faGroup: 'sundry_debtors' },
  { value: 'DEBTORS FOR GREY', label: 'DEBTORS FOR GREY', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'customer', faGroup: 'sundry_debtors' },
  { value: 'DEBTORS FOR JOBWORK', label: 'DEBTORS FOR JOBWORK', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'customer', faGroup: 'sundry_debtors' },
  { value: 'DEBTORS FOR OTHERS', label: 'DEBTORS FOR OTHERS', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'customer', faGroup: 'sundry_debtors' },
  { value: 'DEBTORS FOR SERVICES', label: 'DEBTORS FOR SERVICES', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'customer', faGroup: 'sundry_debtors' },
  { value: 'FIXED ASSETS', label: 'FIXED ASSETS', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'either', faGroup: 'fixed_assets' }
];

export const DEFAULT_CREDITOR_ACCOUNT_TYPE = 'CREDITORS FOR GOODS';
export const DEFAULT_DEBTOR_ACCOUNT_TYPE = 'DEBTORS FOR GOODS';

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
