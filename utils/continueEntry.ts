const KEY = 'erp_continue_entry';

export interface ContinueEntry {
  partyName?: string;
  voucher?: number;
  notice?: string;
}

export function stashContinueEntry(entry: ContinueEntry) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // the next screen still opens; the party name is the only thing lost
  }
}

export function rememberEntryType(screen: string, type: string) {
  const value = String(type || '').trim();
  if (!value) return;
  try { sessionStorage.setItem(`erp_last_type:${screen}`, value); } catch { /* the open form still keeps the series */ }
}

export function rememberedEntryType(screen: string, allowed?: readonly string[]) {
  try {
    const saved = String(sessionStorage.getItem(`erp_last_type:${screen}`) || '').trim();
    if (!saved) return '';
    if (!allowed?.length) return saved;
    return allowed.find(type => type.toLowerCase() === saved.toLowerCase()) || '';
  } catch {
    return '';
  }
}

export function takeContinueEntry(): ContinueEntry | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as ContinueEntry;
  } catch {
    return null;
  }
}
