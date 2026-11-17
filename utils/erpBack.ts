const RETURN_KEY = 'erp_return_to';

function pagePath(value: string) {
  return value.split('?')[0].replace(/\/$/, '') || '/';
}

/** A different ERP page we can safely send the user back to. */
function isReturnable(value: string) {
  if (!value.startsWith('/erp') || value.startsWith('//')) return false;
  return pagePath(value) !== pagePath(window.location.pathname);
}

function labelFor(value: string) {
  const path = pagePath(value);
  if (path === '/erp') return 'Back to ERP';
  if (path.startsWith('/erp/reports') || path === '/erp/gst' || path === '/erp/ledger') return 'Back to report';
  return 'Back';
}

/** Remember this report or ledger, including its search, before opening an entry. */
export function rememberErpReturn() {
  if (typeof window === 'undefined') return;
  try {
    const path = `${window.location.pathname}${window.location.search}`;
    if (path.startsWith('/erp') && pagePath(path) !== '/erp') {
      sessionStorage.setItem(RETURN_KEY, path);
    }
  } catch { /* private mode */ }
}

/** Keep filters in the address bar so Back restores this exact step. */
export function replaceErpSearch(params: URLSearchParams) {
  if (typeof window === 'undefined') return;
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState(null, '', next);
  }
}

/**
 * Where the entry's back button should go.
 * The page you came from (a report, a ledger) wins. A refresh keeps that page.
 * Opened from the ERP home menu, there is nothing to return to.
 */
export function resolveErpBack(): { href: string; label: string } | null {
  if (typeof window === 'undefined') return null;
  let target = '';
  let openedFromHome = false;
  try {
    if (document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.origin === window.location.origin) {
        const path = ref.pathname + ref.search;
        if (pagePath(path) === '/erp') openedFromHome = true;
        if (isReturnable(path)) {
          target = path;
          sessionStorage.setItem(RETURN_KEY, path);
        }
      }
    }
  } catch { /* ignore a bad referrer */ }

  if (openedFromHome) {
    try { sessionStorage.removeItem(RETURN_KEY); } catch { /* private mode */ }
    return null;
  }

  if (!target) {
    try {
      const stored = sessionStorage.getItem(RETURN_KEY) || '';
      if (isReturnable(stored)) target = stored;
    } catch { /* private mode */ }
  }

  if (!target || pagePath(target) === '/erp') return null;
  return { href: target, label: labelFor(target) };
}
