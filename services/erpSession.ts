import { ErpAccessLevel, ErpSession } from '../types';

const ERP_SESSION_KEY = 'erp_session';

export function getCurrentAccountingYear(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function listAccountingYearOptions(aroundDate = new Date()): string[] {
  const current = getCurrentAccountingYear(aroundDate);
  const startYear = Number(current.slice(0, 4));
  const options: string[] = [];
  for (let offset = -2; offset <= 1; offset += 1) {
    const from = startYear + offset;
    options.push(`${from}-${String(from + 1).slice(-2)}`);
  }
  return options;
}

export function getErpSession(): ErpSession | null {
  try {
    const raw = sessionStorage.getItem(ERP_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ErpSession;
    if (!parsed?.ownerUserId || !parsed?.accountingYear || !parsed?.accessLevel) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setErpSession(session: ErpSession) {
  sessionStorage.setItem(ERP_SESSION_KEY, JSON.stringify(session));
}

export function clearErpSession() {
  sessionStorage.removeItem(ERP_SESSION_KEY);
}

export function hasCompleteErpAccess(session: ErpSession | null): boolean {
  if (!session) return true;
  if (session.bypass) return true;
  return session.accessLevel === 'complete_access';
}

export function accessLevelLabel(level: ErpAccessLevel): string {
  return level === 'complete_access' ? 'Complete Access' : 'Data Entry';
}
