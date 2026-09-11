import { getPostingRule } from '../constants/erpTransactionPostingRules';

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function usesZeroGraceForInterest(transactionType?: string | null) {
  return Boolean(getPostingRule(transactionType)?.zeroGraceForInterest);
}

export function toDateKey(value?: string | Date | null) {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function utcDay(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDays(value: string | Date | null | undefined, days: number) {
  const key = toDateKey(value);
  if (!key) return null;
  return new Date(utcDay(key) + (Number(days) || 0) * 86400000).toISOString().slice(0, 10);
}

export function inclusiveDays(fromValue?: string | Date | null, toValue?: string | Date | null) {
  const from = toDateKey(fromValue);
  const to = toDateKey(toValue);
  if (!from || !to) return 0;
  const diff = utcDay(to) - utcDay(from);
  if (diff < 0) return 0;
  return Math.round(diff / 86400000) + 1;
}

export function resolveGraceDays(input: {
  transactionType?: string | null;
  billGrace?: number | string | null;
  partyGraceDays?: number | null;
} = {}) {
  if (usesZeroGraceForInterest(input.transactionType)) return 0;
  const bill = Number(input.billGrace);
  if (Number.isFinite(bill) && bill > 0) return bill;
  const party = Number(input.partyGraceDays);
  return Number.isFinite(party) ? Math.max(0, party) : 0;
}

export function interestDaysAfterGrace(calendarDays: number, graceDays: number) {
  return Math.max(0, Math.trunc(Number(calendarDays) || 0) - Math.max(0, Number(graceDays) || 0));
}

export function calculateInterestAmount(
  amount: number,
  interestRate: number,
  interestDays: number,
  daysInYear = 365
) {
  const principal = Number(amount) || 0;
  const rate = Number(interestRate) || 0;
  const days = Number(interestDays) || 0;
  const yearDays = Number(daysInYear) > 0 ? Number(daysInYear) : 365;
  if (principal <= 0 || rate <= 0 || days <= 0) return 0;
  return roundMoney((principal * rate * days) / (yearDays * 100));
}

export type InterestGraceSource = 'master' | 'typed';
export type InterestViewKind = 'generate' | 'product' | 'summary';

export interface InterestReportRow {
  id: string;
  sourceType?: string | null;
  sourceId?: string | null;
  date: string;
  dueDate?: string | null;
  book?: string | null;
  billNumber?: string | null;
  grace?: number;
  amount: number;
  days: number;
  interestAmount: number;
  editPath?: string | null;
  transactionType?: string | null;
}

export interface InterestProductRow {
  id: string;
  sourceType?: string | null;
  sourceId?: string | null;
  date: string;
  billNumber?: string | null;
  book?: string | null;
  debitAmount: number;
  creditAmount: number;
  days: number;
  debitInterest: number;
  creditInterest: number;
  runningBalance: number;
  runningBalanceType: 'DR' | 'CR';
  editPath?: string | null;
  transactionType?: string | null;
}

export interface InterestSummaryRow {
  id: string;
  sourceType?: string | null;
  sourceId?: string | null;
  date?: string | null;
  billNumber?: string | null;
  currentBalance: number;
  currentBalanceType: 'DR' | 'CR';
  interestAmount: number;
  interestType: 'DR' | 'CR';
  balanceWithInterest: number;
  balanceWithInterestType: 'DR' | 'CR';
  editPath?: string | null;
}

export interface InterestReport {
  companyName?: string;
  party: {
    name: string;
    accountName: string;
    address?: string | null;
  };
  viewKind?: InterestViewKind;
  fromDate: string | null;
  toDate: string | null;
  asOnDate?: string | null;
  daysInYear: number;
  interestRate: number;
  graceSource: InterestGraceSource;
  graceDays: number;
  basedOnChequeDate?: boolean;
  debitRows: InterestReportRow[];
  creditRows: InterestReportRow[];
  productRows?: InterestProductRow[];
  summaryRows?: InterestSummaryRow[];
  debitTotal: number;
  creditTotal: number;
  debitInterest: number;
  creditInterest: number;
  grossDebitInterest?: number;
  graceBase?: number;
  graceInterest?: number;
  tdsPercent?: number;
  tdsAmount?: number;
  interestAction?: 'TO RECEIVE' | 'TO PAY';
  ledgerBalance: number;
  ledgerBalanceType: 'DR' | 'CR';
  interestAmount: number;
  interestType: 'DR' | 'CR';
  balanceWithInterest: number;
  balanceWithInterestType: 'DR' | 'CR';
  salesTotal?: number;
}
