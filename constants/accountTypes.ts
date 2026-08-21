/** Party A/C TYPE master (legacy Accounts Information Manager). */

export type AccountStatementEffect = 'BALANCE SHEET' | 'TRADING A/C' | 'PROFIT & LOSS';
export type AccountBsSide = 'liability' | 'asset' | null;
export type AccountPartyRole = 'supplier' | 'customer' | 'either';

export interface ErpAccountType {
  value: string;
  label: string;
  effectOn: AccountStatementEffect;
  /** Balance Sheet side when effect is Balance Sheet */
  bsSide: AccountBsSide;
  /** Suggested master role when creating the party */
  partyRole: AccountPartyRole;
  /** Final Accounts Dynamic grouping key */
  faGroup: 'sundry_creditors' | 'sundry_debtors' | 'fixed_assets' | 'other';
}

export const ERP_ACCOUNT_TYPES: ErpAccountType[] = [
  // Creditors → Balance Sheet (liabilities)
  { value: 'CREDITORS FOR DYEING JOB CHARG', label: 'CREDITORS FOR DYEING JOB CHARG', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR EMB.JOB CHARGE', label: 'CREDITORS FOR EMB.JOB CHARGE', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR EXPENSES', label: 'CREDITORS FOR EXPENSES', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR GOODS', label: 'CREDITORS FOR GOODS', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR GREY', label: 'CREDITORS FOR GREY', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR JOBWORK', label: 'CREDITORS FOR JOBWORK', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR OTHERS', label: 'CREDITORS FOR OTHERS', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR PACKING MAT.', label: 'CREDITORS FOR PACKING MAT.', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  { value: 'CREDITORS FOR SERVICES', label: 'CREDITORS FOR SERVICES', effectOn: 'BALANCE SHEET', bsSide: 'liability', partyRole: 'supplier', faGroup: 'sundry_creditors' },
  // Debtors → Balance Sheet (assets)
  { value: 'DEBTORS FOR GOODS', label: 'DEBTORS FOR GOODS', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'customer', faGroup: 'sundry_debtors' },
  { value: 'DEBTORS FOR GREY', label: 'DEBTORS FOR GREY', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'customer', faGroup: 'sundry_debtors' },
  { value: 'DEBTORS FOR JOBWORK', label: 'DEBTORS FOR JOBWORK', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'customer', faGroup: 'sundry_debtors' },
  { value: 'DEBTORS FOR OTHERS', label: 'DEBTORS FOR OTHERS', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'customer', faGroup: 'sundry_debtors' },
  { value: 'DEBTORS FOR SERVICES', label: 'DEBTORS FOR SERVICES', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'customer', faGroup: 'sundry_debtors' },
  // Other Balance Sheet
  { value: 'FIXED ASSETS', label: 'FIXED ASSETS', effectOn: 'BALANCE SHEET', bsSide: 'asset', partyRole: 'either', faGroup: 'fixed_assets' }
];

export const DEFAULT_CREDITOR_ACCOUNT_TYPE = 'CREDITORS FOR GOODS';
export const DEFAULT_DEBTOR_ACCOUNT_TYPE = 'DEBTORS FOR GOODS';

export function getAccountType(value?: string | null): ErpAccountType | undefined {
  const key = String(value || '').trim().toUpperCase();
  if (!key) return undefined;
  return ERP_ACCOUNT_TYPES.find(row => row.value.toUpperCase() === key);
}

export function suggestedAccountTypeForContext(
  context: 'purchase' | 'expenses' | 'grey' | 'mill' | 'work' | 'sales' | 'other'
): string {
  switch (context) {
    case 'grey':
      return 'CREDITORS FOR GREY';
    case 'expenses':
      return 'CREDITORS FOR EXPENSES';
    case 'mill':
    case 'work':
      return 'CREDITORS FOR JOBWORK';
    case 'sales':
      return DEFAULT_DEBTOR_ACCOUNT_TYPE;
    case 'purchase':
    default:
      return DEFAULT_CREDITOR_ACCOUNT_TYPE;
  }
}

export function defaultAccountTypeForRole(role: 'supplier' | 'customer'): string {
  return role === 'customer' ? DEFAULT_DEBTOR_ACCOUNT_TYPE : DEFAULT_CREDITOR_ACCOUNT_TYPE;
}

export function partyRoleForAccountType(accountType?: string | null): 'supplier' | 'customer' {
  const meta = getAccountType(accountType);
  if (meta?.partyRole === 'customer') return 'customer';
  return 'supplier';
}
