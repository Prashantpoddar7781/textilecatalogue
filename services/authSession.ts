const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const REMEMBER_KEY = 'auth_remember_credentials';

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  firmName?: string | null;
  [key: string]: unknown;
};

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getCachedAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.id) return null;
    return parsed as AuthUser;
  } catch {
    return null;
  }
}

export function getRememberedCredentials(): { email: string; password: string } | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.email || typeof parsed.password !== 'string') return null;
    return {
      email: String(parsed.email),
      password: String(parsed.password)
    };
  } catch {
    return null;
  }
}

export function setRememberedCredentials(email: string, password: string) {
  localStorage.setItem(
    REMEMBER_KEY,
    JSON.stringify({
      email: email.trim().toLowerCase(),
      password
    })
  );
}

export function clearRememberedCredentials() {
  localStorage.removeItem(REMEMBER_KEY);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
