const DEVICE_TOKEN_KEY = 'threadx_share_device_token';

function createDeviceToken() {
  const random = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(random);
    return Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

export function getShareDeviceToken(): string {
  if (typeof window === 'undefined') return createDeviceToken();

  try {
    const existing = window.localStorage.getItem(DEVICE_TOKEN_KEY);
    if (existing) return existing;
    const token = createDeviceToken();
    window.localStorage.setItem(DEVICE_TOKEN_KEY, token);
    return token;
  } catch {
    // If localStorage is blocked, sessionStorage still avoids repeated locks in one browsing session.
    const existing = window.sessionStorage.getItem(DEVICE_TOKEN_KEY);
    if (existing) return existing;
    const token = createDeviceToken();
    window.sessionStorage.setItem(DEVICE_TOKEN_KEY, token);
    return token;
  }
}
